"""Degree audit: completed, in-progress and missing requirements (US2, US8)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Program, Section, Term, TranscriptEntry, User, now
from .registration import course_history, passed_course_ids, seat_counts

CATEGORY_LABELS = {
    "core": "Core Major",
    "science": "Mathematics & Science",
    "general": "General Education",
    "elective": "Electives",
    "other": "Other",
}


def offered_course_ids(db: Session, term: Term | None) -> dict[int, bool]:
    """Course id -> True if a section in ``term`` has an open seat (False when all are full)."""
    if term is None:
        return {}
    sections = db.scalars(select(Section).where(Section.term_id == term.id)).all()
    taken, _ = seat_counts(db, [s.id for s in sections])
    out: dict[int, bool] = {}
    for section in sections:
        has_seat = taken.get(section.id, 0) < section.capacity
        out[section.course_id] = out.get(section.course_id, False) or has_seat
    return out


def build_audit(db: Session, user: User, program: Program | None = None, upcoming: Term | None = None) -> dict:
    program = program or user.program
    transcript_count = len(db.scalars(select(TranscriptEntry.id).where(TranscriptEntry.user_id == user.id)).all())
    warnings: list[str] = []
    if transcript_count == 0:
        warnings.append(
            "Degree audit data is incomplete: no academic transcript is loaded yet. Sync with my.sdu.edu.kz to import it."
        )
    elif user.sdu_id and user.last_sdu_sync and now() - user.last_sdu_sync > 30 * 24 * 3600:
        warnings.append("Your transcript was last synced more than 30 days ago and may be outdated.")

    if program is None:
        return {
            "program": None,
            "groups": [],
            "totals": {"required": 0, "completed": 0, "in_progress": 0, "missing": 0, "percent": 0},
            "warnings": warnings + ["Choose your degree programme in Profile to run a degree audit."],
            "other_completed": [],
        }

    completed = passed_course_ids(db, user.id)
    in_progress = course_history(db, user.id, None)[1] - completed
    grades = {
        e.course_id: e.grade
        for e in db.scalars(select(TranscriptEntry).where(TranscriptEntry.user_id == user.id)).all()
        if e.status == "completed"
    }
    offered = offered_course_ids(db, upcoming)

    groups_out = []
    counted: set[int] = set()
    totals = {"required": 0.0, "completed": 0.0, "in_progress": 0.0, "missing": 0.0}
    for group in program.groups:
        items = []
        done_ects = progress_ects = pool_ects = 0.0
        for item in group.items:
            course = item.course
            if course.id in completed:
                status = "completed"
                done_ects += course.ects
            elif course.id in in_progress:
                status = "in_progress"
                progress_ects += course.ects
            else:
                status = "missing"
            pool_ects += course.ects
            counted.add(course.id)
            items.append(
                {
                    "course_id": course.id,
                    "code": course.code,
                    "title": course.title,
                    "ects": course.ects,
                    "credits": course.credits,
                    "semester": item.semester,
                    "status": status,
                    "grade": grades.get(course.id),
                    "offered": course.id in offered,
                    "has_open_seat": offered.get(course.id, False),
                }
            )
        required = float(group.ects_required or (pool_ects if group.kind == "required" else 0))
        done = min(done_ects, required) if required else done_ects
        progress = min(progress_ects, max(0.0, required - done)) if required else progress_ects
        missing = max(0.0, required - done - progress)
        totals["required"] += required
        totals["completed"] += done
        totals["in_progress"] += progress
        totals["missing"] += missing
        groups_out.append(
            {
                "id": group.id,
                "name": group.name,
                "category": group.category,
                "category_label": CATEGORY_LABELS.get(group.category, group.category.title()),
                "kind": group.kind,
                "required_ects": round(required, 2),
                "completed_ects": round(done, 2),
                "in_progress_ects": round(progress, 2),
                "missing_ects": round(missing, 2),
                "satisfied": missing <= 0 and progress <= 0,
                "items": items,
                "missing_courses": [i for i in items if i["status"] == "missing"],
            }
        )

    other = []
    for entry in db.scalars(select(TranscriptEntry).where(TranscriptEntry.user_id == user.id)).all():
        if entry.course_id not in counted and entry.status == "completed":
            other.append({"code": entry.course.code, "title": entry.course.title, "ects": entry.course.ects,
                          "grade": entry.grade})

    percent = round(100 * totals["completed"] / totals["required"], 1) if totals["required"] else 0
    return {
        "program": {"id": program.id, "code": program.code, "name": program.name, "total_ects": program.total_ects,
                    "personal": program.owner_id is not None},
        "groups": groups_out,
        "totals": {k: round(v, 2) for k, v in totals.items()} | {"percent": percent},
        "warnings": warnings,
        "other_completed": other,
        "upcoming_term": {"id": upcoming.id, "name": upcoming.name} if upcoming else None,
    }
