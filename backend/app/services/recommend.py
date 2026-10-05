"""Course recommendations for the upcoming term, ranked from degree gaps (US12, US2)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Course, Prerequisite, Section, Term, User
from .audit import build_audit
from .season import fits_term
from .registration import cart_sections, check_prerequisites, course_history, enrolled_sections, passed_course_ids

CATEGORY_WEIGHT = {"core": 40, "science": 32, "general": 22, "elective": 16}


def recommend(db: Session, user: User, term: Term, limit: int = 8) -> dict:
    audit = build_audit(db, user, upcoming=term)
    if audit["program"] is None:
        return {"recommendations": [], "locked": [], "warnings": audit["warnings"], "audit_ready": False}

    history = course_history(db, user.id, term)
    completed = history[0] | passed_course_ids(db, user.id)
    in_progress = history[1]
    this_term = {s.course_id for s in enrolled_sections(db, user.id, term.id)}
    in_cart = {s.course_id for s in cart_sections(db, user.id, term.id)}
    offered = {
        cid for (cid,) in db.execute(select(Section.course_id).where(Section.term_id == term.id).distinct()).all()
    }
    missing_ids = {i["course_id"] for g in audit["groups"] for i in g["missing_courses"]}
    unlocks: dict[int, int] = {}
    for req in db.scalars(select(Prerequisite).where(Prerequisite.course_id.in_(missing_ids or {0}))).all():
        unlocks[req.requires_id] = unlocks.get(req.requires_id, 0) + 1

    expected_semester = int(audit["totals"]["completed"] // 30) + 1
    picks: list[dict] = []
    locked: list[dict] = []
    seen: set[int] = set()
    for group in audit["groups"]:
        if group["satisfied"] or group["missing_ects"] <= 0:
            continue
        for item in group["missing_courses"]:
            cid = item["course_id"]
            if cid in seen or cid in completed or cid in in_progress or cid in this_term:
                continue
            seen.add(cid)
            course = db.get(Course, cid)
            if cid not in offered or not fits_term(term, item["semester"]):
                continue
            prereq = check_prerequisites(db, user, course, term, history=history,
                                         same_term_course_ids=this_term | in_cart)
            entry = {
                "course_id": cid,
                "code": course.code,
                "title": course.title,
                "ects": course.ects,
                "fulfills": group["name"],
                "category": group["category"],
                "semester": item["semester"],
                "has_open_seat": item["has_open_seat"],
                "in_cart": cid in in_cart,
                "prerequisite": prereq.as_dict(),
            }
            if prereq.blocked:
                locked.append(entry)
                continue
            score = CATEGORY_WEIGHT.get(group["category"], 12)
            reasons = [f"Fulfills {group['name']}"]
            if item["semester"]:
                if item["semester"] <= expected_semester:
                    score += 18
                    reasons.append(f"Planned for semester {item['semester']} — you are on semester {expected_semester}")
                elif item["semester"] == expected_semester + 1:
                    score += 8
                else:
                    score -= 4 * (item["semester"] - expected_semester - 1)
            if unlocks.get(cid):
                score += 9 * unlocks[cid]
                reasons.append(f"Unlocks {unlocks[cid]} more required course{'s' if unlocks[cid] > 1 else ''}")
            if item["has_open_seat"]:
                score += 5
            else:
                score -= 12
                reasons.append("All sections are full — consider the waitlist")
            if prereq.status == "provisional":
                score -= 3
            entry["score"] = score
            entry["reasons"] = reasons
            picks.append(entry)

    picks.sort(key=lambda e: (-e["score"], e["code"]))
    top = picks[:limit]
    max_score = max((p["score"] for p in top), default=1) or 1
    for p in top:
        p["match"] = max(5, min(99, round(100 * p["score"] / max_score)))
    return {
        "recommendations": top,
        "locked": locked[:6],
        "warnings": audit["warnings"],
        "audit_ready": True,
        "term": {"id": term.id, "name": term.name},
    }
