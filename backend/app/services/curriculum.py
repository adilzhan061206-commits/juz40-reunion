"""Import a personal curriculum file (the CSV/JSON formats supported by the original demo)."""

from __future__ import annotations

import csv
import io
import json
import re

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import Prerequisite, Program, RequirementCourse, RequirementGroup, TranscriptEntry, User
from ..sdu.parsers import normalize_code
from ..sdu.sync import ensure_course

ELECTIVE_LABELS = {"AE": "Area Electives (AE)", "NAE": "Non-Area Electives (NAE)", "NTE": "Final Electives (NTE)"}
KEY_ALIASES = {
    "category": {"category", "категория", "section", "раздел"},
    "code": {"code", "coursecode", "код", "коддисциплины"},
    "name": {"name", "coursename", "title", "название", "дисциплина", "наименованиедисциплины"},
    "credits": {"credits", "credit", "ects", "кредиты", "кредит"},
}


def _key(value: str) -> str:
    return re.sub(r"[\s_.\-/]+", "", str(value or "").replace("﻿", "").strip().lower())


def _get(row: dict, field: str):
    for key, value in row.items():
        if _key(key) in KEY_ALIASES[field]:
            return value
    return None


def _number(value, default: float = 0) -> float:
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return default


def _category_kind(name: str) -> tuple[str, str]:
    low = name.lower()
    if any(t in low for t in ("elective", "электив", "ae)", "nae", "nte")):
        return "elective", "elective"
    if any(t in low for t in ("general", "gen ed", "общ", "жалпы")):
        return "general", "required"
    if any(t in low for t in ("math", "science", "матем", "естеств")):
        return "science", "required"
    return "core", "required"


def _parse(text: str, filename: str) -> dict:
    """Return {"name", "groups": [{"name","category","kind","courses":[...]}]}."""
    name = re.sub(r"\.[^.]+$", "", filename or "") or "My curriculum"
    stripped = text.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise HTTPException(422, f"The JSON file is invalid: {exc.msg} (line {exc.lineno}).") from exc
        if isinstance(data, dict) and any(k in data for k in ("subjects", "electives", "requisite_courses")):
            return _parse_subjects(data, name)
        if isinstance(data, dict) and isinstance(data.get("categories"), list):
            groups = []
            for category in data["categories"]:
                cname = str(category.get("category") or "Courses")
                cat, kind = _category_kind(cname)
                groups.append({"name": cname, "category": cat, "kind": kind,
                               "courses": category.get("required") or category.get("courses") or []})
            return {"name": str(data.get("name") or name), "groups": groups}
        rows = data if isinstance(data, list) else data.get("courses", []) if isinstance(data, dict) else []
        return _rows_to_groups(rows, name)
    delimiter = ";" if stripped.split("\n", 1)[0].count(";") > stripped.split("\n", 1)[0].count(",") else ","
    rows = list(csv.DictReader(io.StringIO(stripped), delimiter=delimiter))
    return _rows_to_groups(rows, name)


def _rows_to_groups(rows: list, name: str) -> dict:
    groups: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        cname = str(_get(row, "category") or "Courses").strip() or "Courses"
        if cname not in groups:
            cat, kind = _category_kind(cname)
            groups[cname] = {"name": cname, "category": cat, "kind": kind, "courses": []}
        groups[cname]["courses"].append(row)
    return {"name": name, "groups": list(groups.values())}


def _parse_subjects(data: dict, name: str) -> dict:
    groups: dict[str, dict] = {}
    for raw in data.get("subjects") or []:
        semester = int(_number(raw.get("semester") or raw.get("recommended_semester"), 0)) or None
        gname = f"Semester {semester}" if semester else "Required courses"
        groups.setdefault(gname, {"name": gname, "category": "core", "kind": "required", "courses": [],
                                  "sort": semester or 99})
        groups[gname]["courses"].append({**raw, "semester": semester})
    for raw in data.get("electives") or []:
        etype = str(raw.get("type") or raw.get("type_name") or "OTHER").strip().upper()
        gname = ELECTIVE_LABELS.get(etype, f"Electives — {raw.get('type_name') or etype.title()}")
        groups.setdefault(gname, {"name": gname, "category": "elective", "kind": "elective", "courses": [],
                                  "sort": 100})
        groups[gname]["courses"].append(raw)
    if data.get("requisite_courses"):
        groups["Preparatory courses (RC)"] = {"name": "Preparatory courses (RC)", "category": "general",
                                              "kind": "required", "courses": data["requisite_courses"], "sort": 0}
    source = (data.get("metadata") or {}).get("source") if isinstance(data.get("metadata"), dict) else None
    ordered = sorted(groups.values(), key=lambda g: g.get("sort", 50))
    return {"name": str(source or name), "groups": ordered}


def import_curriculum(db: Session, user: User, text: str, filename: str) -> dict:
    if len(text.encode()) > 1_000_000:
        raise HTTPException(413, "Curriculum files must be smaller than 1 MB.")
    parsed = _parse(text, filename)
    if not parsed["groups"] or not any(g["courses"] for g in parsed["groups"]):
        raise HTTPException(422, "No courses were found. CSV files need the columns category, code, name, credits.")
    return import_parsed(db, user, parsed)


def sdu_curriculum_groups(curriculum) -> dict:
    """Turn a parsed my.sdu "My Curriculum" page into the generic group structure.

    Every semester becomes a required group. An elective slot nobody has filled yet becomes its own
    elective group whose options are the course codes listed on the portal.
    """
    semesters: dict[int, dict] = {}
    slots: list[dict] = []
    for row in curriculum.rows:
        raw = {"code": row.code, "name": row.title, "ects": row.ects or 0, "credits": row.credits,
               "semester": row.semester, "grade": row.grade or None,
               "completion_status": row.status if row.status in {"completed", "in_progress"} else None}
        if row.code:
            group = semesters.setdefault(row.semester, {"name": f"Semester {row.semester}", "category": "core",
                                                        "kind": "required", "courses": [], "sort": row.semester})
            group["courses"].append(raw)
        elif row.options:
            label = f"{row.title} [{row.elective_type}]" if row.elective_type else row.title
            slots.append({"name": f"Semester {row.semester} · {label}"[:160], "category": "elective",
                          "kind": "elective", "ects_required": int(row.ects or 0), "sort": row.semester,
                          "courses": [{"code": c, "name": row.title, "ects": row.ects or 0, "semester": row.semester}
                                      for c in row.options]})
    groups = sorted([*semesters.values(), *slots], key=lambda g: (g["sort"], g["kind"] == "elective"))
    return {"name": curriculum.program or "My SDU curriculum", "groups": groups}


def import_parsed(db: Session, user: User, parsed: dict, commit: bool = True) -> dict:

    old = db.scalars(select(Program).where(Program.owner_id == user.id)).all()
    for program in old:
        if user.program_id == program.id:
            user.program_id = None
        db.delete(program)
    db.flush()

    program = Program(code="PERSONAL", name=parsed["name"][:200], owner_id=user.id,
                      department_id=user.department_id, total_ects=240)
    db.add(program)
    db.flush()

    course_count = 0
    transcript = 0
    pending_prereqs: list[tuple[int, list]] = []
    for sort, group in enumerate(parsed["groups"]):
        rg = RequirementGroup(program_id=program.id, name=group["name"][:160], category=group["category"],
                              kind=group["kind"], sort=sort)
        db.add(rg)
        db.flush()
        selected_ects = 0.0
        seen: set[int] = set()
        for raw in group["courses"]:
            if not isinstance(raw, dict):
                continue
            code = str(_get(raw, "code") or "").strip()
            title = str(_get(raw, "name") or "").strip()
            if not code or not title:
                continue
            ects = _number(raw["ects"], 0) if raw.get("ects") is not None else _number(_get(raw, "credits"), 5)
            course, _ = ensure_course(db, normalize_code(code), title, ects=ects, source="curriculum")
            if course.id in seen:
                continue
            seen.add(course.id)
            course_count += 1
            semester = int(_number(raw.get("semester"), 0)) or None
            db.add(RequirementCourse(group_id=rg.id, course_id=course.id, semester=semester))
            if isinstance(raw.get("prerequisites"), list) and raw["prerequisites"]:
                pending_prereqs.append((course.id, raw["prerequisites"]))

            status = str(raw.get("completion_status") or "").lower().replace("-", "_")
            if raw.get("completed") is True:
                status = "completed"
            elif raw.get("in_progress") is True and status != "completed":
                status = "in_progress"
            selected = raw.get("selected_in_curriculum") is True or status in {"completed", "in_progress"}
            if group["kind"] == "elective" and selected:
                selected_ects += ects
            if status in {"completed", "in_progress"}:
                entry = db.scalar(select(TranscriptEntry).where(
                    TranscriptEntry.user_id == user.id, TranscriptEntry.course_id == course.id))
                if entry is None:
                    entry = TranscriptEntry(user_id=user.id, course_id=course.id, term_code="", source="curriculum")
                    db.add(entry)
                    transcript += 1
                if entry.source == "curriculum":
                    entry.status = status
                    entry.grade = (str(raw.get("grade")).strip()[:8] or None) if raw.get("grade") else entry.grade
        if group.get("ects_required"):
            rg.ects_required = int(group["ects_required"])
        elif group["kind"] == "elective":
            rg.ects_required = int(selected_ects)

    db.flush()
    for course_id, reqs in pending_prereqs:
        for req in reqs[:25]:
            code = normalize_code(str(req.get("code") or "")) if isinstance(req, dict) else normalize_code(str(req))
            if not code:
                continue
            required, _ = ensure_course(db, code, (req.get("name") if isinstance(req, dict) else "") or code,
                                        source="curriculum")
            if required.id == course_id:
                continue
            exists = db.scalar(select(Prerequisite).where(
                Prerequisite.course_id == course_id, Prerequisite.requires_id == required.id))
            if not exists:
                db.add(Prerequisite(course_id=course_id, requires_id=required.id, kind="pre"))

    user.program_id = program.id
    if commit:
        db.commit()
    else:
        db.flush()
    return {"program_id": program.id, "name": program.name, "groups": len(parsed["groups"]),
            "courses": course_count, "transcript": transcript}


def remove_personal_curriculum(db: Session, user: User) -> None:
    db.execute(delete(Program).where(Program.owner_id == user.id))
    db.commit()
