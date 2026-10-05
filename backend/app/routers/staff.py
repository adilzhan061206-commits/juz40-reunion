"""Advisor workspace (US5, US8) and administration (catalogue import, terms, sections, users)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import default_registration_term, require_role
from ..models import (
    Course,
    Department,
    Enrollment,
    OverrideRequest,
    Program,
    Section,
    Term,
    User,
    WaitlistEntry,
    now,
)
from ..sdu import parsers
from ..sdu.sync import ImportSummary, ensure_term, import_schedule
from ..serializers import request_out, sections_out, term_out, user_out
from ..services import registration as reg
from ..services.audit import build_audit
from ..services.notify import notify

router = APIRouter(prefix="/api", tags=["staff"])
advisor_only = require_role("advisor")
admin_only = require_role("admin")
CROSS_DEPARTMENT = "Unauthorized: Student belongs to another department"


# ---------------------------------------------------------------- advisor


def _ensure_same_department(advisor: User, student: User) -> None:
    if advisor.department_id is None or student.department_id != advisor.department_id:
        raise HTTPException(403, CROSS_DEPARTMENT)


@router.get("/advisor/requests")
def advisor_requests(status: str = "pending", advisor: User = Depends(advisor_only), db: Session = Depends(get_db)):
    query = select(OverrideRequest).join(User, User.id == OverrideRequest.student_id).where(
        User.department_id == advisor.department_id)
    if status != "all":
        query = query.where(OverrideRequest.status == status)
    items = db.scalars(query.order_by(OverrideRequest.created_at.desc())).all()
    counts = dict(db.execute(
        select(OverrideRequest.status, func.count()).join(User, User.id == OverrideRequest.student_id)
        .where(User.department_id == advisor.department_id).group_by(OverrideRequest.status)).all())
    out = []
    for item in items:
        data = request_out(item)
        term_sections = reg.enrolled_sections(db, item.student_id, item.term_id)
        data["current_ects"] = reg.term_ects(term_sections)
        if item.course:
            data["prerequisite"] = reg.check_prerequisites(db, item.student, item.course, item.term).as_dict()
        out.append(data)
    return {"requests": out, "counts": counts}


def _request_for_advisor(db: Session, advisor: User, request_id: int) -> OverrideRequest:
    req = db.get(OverrideRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found.")
    _ensure_same_department(advisor, req.student)
    if req.status != "pending":
        raise HTTPException(409, f"This request was already {req.status}.")
    return req


class DecisionIn(BaseModel):
    feedback: str = Field(default="", max_length=2000)


@router.post("/advisor/requests/{request_id}/approve")
def approve_request(request_id: int, payload: DecisionIn, advisor: User = Depends(advisor_only),
                    db: Session = Depends(get_db)):
    req = _request_for_advisor(db, advisor, request_id)
    req.status = "approved"
    req.advisor_id = advisor.id
    req.feedback = payload.feedback.strip() or None
    req.decided_at = now()
    what = (f"Your prerequisite waiver for {req.course.code} was approved. Registration for the course is unlocked."
            if req.kind == "prerequisite_waiver"
            else f"Your credit overload to {req.requested_ects:g} ECTS for {req.term.name} was approved.")
    notify(db, req.student, "request", "Override approved", what + (f"\n\nAdvisor note: {req.feedback}"
                                                                    if req.feedback else ""),
           "/registration", email=True)
    db.commit()
    return request_out(req)


@router.post("/advisor/requests/{request_id}/reject")
def reject_request(request_id: int, payload: DecisionIn, advisor: User = Depends(advisor_only),
                   db: Session = Depends(get_db)):
    feedback = payload.feedback.strip()
    if len(feedback) < 5:
        raise HTTPException(422, "Feedback is required when rejecting a request.")
    req = _request_for_advisor(db, advisor, request_id)
    req.status = "rejected"
    req.advisor_id = advisor.id
    req.feedback = feedback
    req.decided_at = now()
    subject = req.course.code if req.course else f"{req.requested_ects:g} ECTS overload"
    notify(db, req.student, "request", f"Override rejected: {subject}",
           f"Your advisor rejected the request.\n\nFeedback: {feedback}", "/requests", email=True)
    db.commit()
    return request_out(req)


@router.get("/advisor/students")
def advisor_students(q: str = "", advisor: User = Depends(advisor_only), db: Session = Depends(get_db)):
    query = select(User).where(User.role == "student", User.department_id == advisor.department_id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(like), User.email.ilike(like), User.sdu_id.ilike(like)))
    students = db.scalars(query.order_by(User.name).limit(200)).all()
    upcoming = default_registration_term(db)
    out = []
    for s in students:
        audit = build_audit(db, s, upcoming=upcoming)
        pending = db.scalar(select(func.count()).select_from(OverrideRequest).where(
            OverrideRequest.student_id == s.id, OverrideRequest.status == "pending")) or 0
        out.append({**user_out(s), "audit": audit["totals"], "pending_requests": pending})
    return {"students": out, "department": advisor.department.name if advisor.department else None}


@router.get("/advisor/students/{student_id}")
def advisor_student(student_id: int, advisor: User = Depends(advisor_only), db: Session = Depends(get_db)):
    student = db.get(User, student_id)
    if not student or student.role != "student":
        raise HTTPException(404, "Student not found.")
    _ensure_same_department(advisor, student)
    upcoming = default_registration_term(db)
    audit = build_audit(db, student, upcoming=upcoming)
    # Sections of missing courses offered in the upcoming term, for the interactive gap filter.
    missing_ids = {i["course_id"] for g in audit["groups"] for i in g["missing_courses"]}
    offered = []
    if upcoming and missing_ids:
        sections = db.scalars(select(Section).where(Section.term_id == upcoming.id,
                                                    Section.course_id.in_(missing_ids))).all()
        offered = sections_out(db, sections)
    requests = db.scalars(select(OverrideRequest).where(OverrideRequest.student_id == student.id)
                          .order_by(OverrideRequest.created_at.desc())).all()
    return {
        "student": user_out(student),
        "audit": audit,
        "offered_sections": offered,
        "requests": [request_out(r) for r in requests],
        "schedule": sections_out(db, reg.enrolled_sections(db, student.id, upcoming.id)) if upcoming else [],
    }


# ---------------------------------------------------------------- admin


@router.get("/admin/overview")
def admin_overview(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    def count(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    return {
        "users": count(User),
        "students": count(User, User.role == "student"),
        "advisors": count(User, User.role == "advisor"),
        "sdu_linked": count(User, User.sdu_id.is_not(None)),
        "courses": count(Course),
        "sections": count(Section),
        "enrollments": count(Enrollment, Enrollment.status == "enrolled"),
        "waitlisted": count(WaitlistEntry, WaitlistEntry.status.in_(("waiting", "held"))),
        "pending_requests": count(OverrideRequest, OverrideRequest.status == "pending"),
        "terms": [term_out(t) for t in db.scalars(select(Term).order_by(Term.start_date))],
    }


class TermPatch(BaseModel):
    registration_open: bool | None = None
    is_current: bool | None = None
    start_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


@router.patch("/admin/terms/{term_id}")
def patch_term(term_id: int, payload: TermPatch, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    term = db.get(Term, term_id)
    if not term:
        raise HTTPException(404, "Term not found.")
    if payload.is_current:
        for other in db.scalars(select(Term).where(Term.id != term.id)):
            other.is_current = False
    for field in ("registration_open", "is_current", "start_date", "end_date"):
        value = getattr(payload, field)
        if value is not None:
            setattr(term, field, value)
    db.commit()
    return term_out(term)


@router.get("/admin/sections")
def admin_sections(term_id: int | None = None, q: str = "", _: User = Depends(admin_only),
                   db: Session = Depends(get_db)):
    term = db.get(Term, term_id) if term_id else default_registration_term(db)
    query = select(Section).join(Course).where(Section.term_id == term.id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Course.code.ilike(like), Course.title.ilike(like)))
    sections = db.scalars(query.order_by(Course.code, Section.code).limit(400)).all()
    return {"term": term_out(term), "sections": sections_out(db, sections)}


class SectionPatch(BaseModel):
    capacity: int | None = Field(default=None, ge=0, le=1000)
    instructor: str | None = Field(default=None, max_length=120)


@router.patch("/admin/sections/{section_id}")
def patch_section(section_id: int, payload: SectionPatch, _: User = Depends(admin_only),
                  db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found.")
    events = []
    if payload.capacity is not None:
        was_full = reg.seats_left(db, section) == 0
        section.capacity = payload.capacity
        db.flush()
        if reg.seats_left(db, section) > 0:
            events = reg.seat_released(db, section, was_full)
    if payload.instructor is not None:
        section.instructor = payload.instructor.strip() or None
    db.commit()
    return {"section": sections_out(db, [section])[0], "waitlist_events": events}


@router.get("/admin/users")
def admin_users(q: str = "", role: str = "", _: User = Depends(admin_only), db: Session = Depends(get_db)):
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(like), User.email.ilike(like), User.sdu_id.ilike(like)))
    users = db.scalars(query.order_by(User.role, User.name).limit(300)).all()
    return {"users": [user_out(u) for u in users]}


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(student|advisor|admin)$")
    department_id: int | None = None
    program_id: int | None = None
    financial_hold: bool | None = None


@router.patch("/admin/users/{user_id}")
def patch_user(user_id: int, payload: UserPatch, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    if payload.role is not None:
        if user.id == admin.id and payload.role != "admin":
            raise HTTPException(409, "You cannot remove your own admin role.")
        user.role = payload.role
    if payload.department_id is not None:
        if not db.get(Department, payload.department_id):
            raise HTTPException(422, "Unknown department.")
        user.department_id = payload.department_id
    if payload.program_id is not None:
        program = db.get(Program, payload.program_id)
        if not program:
            raise HTTPException(422, "Unknown programme.")
        user.program_id = program.id
        user.department_id = program.department_id or user.department_id
    released = []
    if payload.financial_hold is not None:
        was_held = user.financial_hold
        user.financial_hold = payload.financial_hold
        if was_held and not payload.financial_hold:
            # Hold resolved: held waitlist entries regain their place and are processed again.
            held = db.scalars(select(WaitlistEntry).where(WaitlistEntry.user_id == user.id,
                                                          WaitlistEntry.status == "held")).all()
            db.flush()
            for entry in held:
                released += reg.process_waitlist(db, entry.section)
    db.commit()
    return {"user": user_out(user), "waitlist_events": released}


class ImportHtmlIn(BaseModel):
    html: str = Field(min_length=20, max_length=5_000_000)
    term_code: str | None = Field(default=None, pattern=r"^\d{4}-[123]$")
    department_id: int | None = None
    capacity: int = Field(default=30, ge=1, le=500)


@router.post("/admin/import/schedule")
def admin_import_schedule(payload: ImportHtmlIn, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Import a schedule grid saved from my.sdu.edu.kz into the shared catalogue (no enrollments)."""
    classes = parsers.parse_schedule(payload.html)
    if not classes:
        raise HTTPException(422, "No classes were found. Paste the HTML of a my.sdu.edu.kz schedule grid.")
    code = payload.term_code
    if not code:
        option = parsers.selected_term(parsers.parse_terms(payload.html))
        code = option.code if option else None
    if not code:
        raise HTTPException(422, "Choose the term this schedule belongs to.")
    term = ensure_term(db, code)
    summary = ImportSummary(term=term.name)
    sections = import_schedule(db, None, term, classes, summary)
    for section in sections:
        if section.source == "sdu" and section.capacity == 30:
            section.capacity = payload.capacity
        if payload.department_id and section.course.department_id is None:
            section.course.department_id = payload.department_id
    db.commit()
    return summary.as_dict()
