"""Plain-dict representations returned by the API."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy.orm import Session

from .models import Course, Notification, OverrideRequest, Section, Term, User, WaitlistEntry
from .services.registration import seat_counts, waitlist_position


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "sdu_id": user.sdu_id,
        "department": {"id": user.department.id, "code": user.department.code, "name": user.department.name}
        if user.department
        else None,
        "program": {"id": user.program.id, "name": user.program.name, "personal": user.program.owner_id is not None}
        if user.program
        else None,
        "financial_hold": user.financial_hold,
        "last_sdu_sync": user.last_sdu_sync,
        "has_password": bool(user.password_hash),
    }


def term_out(term: Term) -> dict:
    return {
        "id": term.id,
        "code": term.code,
        "name": term.name,
        "start_date": term.start_date,
        "end_date": term.end_date,
        "is_current": term.is_current,
        "registration_open": term.registration_open,
    }


def course_out(course: Course) -> dict:
    return {
        "id": course.id,
        "code": course.code,
        "title": course.title,
        "credits": course.credits,
        "ects": course.ects,
        "hours": course.hours,
        "description": course.description,
        "department": course.department.code if course.department else None,
        "source": course.source,
        "prerequisites": [
            {"code": r.requires.code, "title": r.requires.title, "kind": r.kind} for r in course.requisites
        ],
    }


def sections_out(db: Session, sections: Iterable[Section], include_course: bool = True) -> list[dict]:
    sections = list(sections)
    taken, waiting = seat_counts(db, [s.id for s in sections])
    out = []
    for s in sections:
        enrolled = taken.get(s.id, 0)
        item = {
            "id": s.id,
            "code": s.code,
            "kind": s.kind,
            "instructor": s.instructor,
            "capacity": s.capacity,
            "enrolled": enrolled,
            "seats_left": max(0, s.capacity - enrolled),
            "waitlist": waiting.get(s.id, 0),
            "term_id": s.term_id,
            "source": s.source,
            "meetings": [
                {"day": m.day, "start": m.start_min, "end": m.end_min, "room": m.room} for m in s.meetings
            ],
        }
        if include_course:
            item["course"] = {
                "id": s.course.id,
                "code": s.course.code,
                "title": s.course.title,
                "ects": s.course.ects,
                "credits": s.course.credits,
            }
        out.append(item)
    return out


def section_out(db: Session, section: Section) -> dict:
    return sections_out(db, [section])[0]


def request_out(req: OverrideRequest) -> dict:
    student = req.student
    return {
        "id": req.id,
        "kind": req.kind,
        "status": req.status,
        "reason": req.reason,
        "feedback": req.feedback,
        "requested_ects": req.requested_ects,
        "course": {"id": req.course.id, "code": req.course.code, "title": req.course.title} if req.course else None,
        "term": {"id": req.term.id, "name": req.term.name},
        "student": {
            "id": student.id,
            "name": student.name,
            "sdu_id": student.sdu_id,
            "email": student.email,
            "department": student.department.code if student.department else None,
            "program": student.program.name if student.program else None,
        },
        "advisor": {"id": req.advisor.id, "name": req.advisor.name} if req.advisor else None,
        "created_at": req.created_at,
        "decided_at": req.decided_at,
    }


def waitlist_out(db: Session, entry: WaitlistEntry) -> dict:
    return {
        "id": entry.id,
        "status": entry.status,
        "note": entry.note,
        "position": waitlist_position(db, entry),
        "hold_deadline": entry.hold_deadline,
        "created_at": entry.created_at,
        "section": section_out(db, entry.section),
    }


def notification_out(item: Notification) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "body": item.body,
        "link": item.link,
        "read": item.read_at is not None,
        "created_at": item.created_at,
    }
