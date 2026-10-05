"""Catalogue, schedule draft, registration, swaps, waitlists, seat alerts, generator and calendar export."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import get_current_user, get_term, require_role
from ..models import (
    CartItem,
    Course,
    Department,
    Program,
    ScheduleConfirmation,
    SeatAlert,
    Section,
    Term,
    User,
    WaitlistEntry,
)
from ..serializers import course_out, section_out, sections_out, term_out, waitlist_out
from ..services import registration as reg
from ..services.calendar import build_ics
from ..services.generator import Filters, generate

router = APIRouter(prefix="/api", tags=["registration"])
student = require_role("student")


def _section(db: Session, section_id: int) -> Section:
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found.")
    return section


# ---------------------------------------------------------------- public metadata


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    from ..deps import default_registration_term

    default = default_registration_term(db)
    return {
        "terms": [term_out(t) for t in db.scalars(select(Term).order_by(Term.start_date)).all()],
        "default_term_id": default.id if default else None,
        "departments": [{"id": d.id, "code": d.code, "name": d.name}
                        for d in db.scalars(select(Department).order_by(Department.name)).all()],
        "programs": [{"id": p.id, "code": p.code, "name": p.name, "department_id": p.department_id}
                     for p in db.scalars(select(Program).where(Program.owner_id.is_(None)).order_by(Program.name))],
        "config": {"max_ects": settings.max_ects, "max_seat_alerts": settings.max_seat_alerts,
                   "sdu_login": settings.sdu_enabled, "sdu_url": settings.sdu_base_url},
    }


# ---------------------------------------------------------------- catalogue


@router.get("/catalog")
def catalog(term_id: int | None = None, q: str = "", department: str = "", only_open: bool = False,
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    term = get_term(db, term_id)
    query = select(Section).join(Course).where(Section.term_id == term.id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Course.code.ilike(like), Course.title.ilike(like), Section.instructor.ilike(like)))
    if department:
        query = query.join(Department, Department.id == Course.department_id).where(Department.code == department)
    kind_order = {"lecture": 0, "practice": 1, "lab": 2}
    sections = sorted(db.scalars(query).all(), key=lambda s: (s.course.code, kind_order.get(s.kind, 3), s.code))
    serialized = sections_out(db, sections, include_course=False)

    history = reg.course_history(db, user.id, term) if user.role == "student" else (set(), set())
    passed = reg.passed_course_ids(db, user.id)
    enrolled = reg.enrolled_sections(db, user.id, term.id)
    cart = reg.cart_sections(db, user.id, term.id)
    same_term = {s.course_id for s in enrolled} | {s.course_id for s in cart}
    waitlisted = {w.section_id: w for w in db.scalars(select(WaitlistEntry).where(
        WaitlistEntry.user_id == user.id, WaitlistEntry.status.in_(("waiting", "held"))))}
    alerts = {a.section_id for a in db.scalars(select(SeatAlert).where(
        SeatAlert.user_id == user.id, SeatAlert.active.is_(True)))}
    enrolled_ids = {s.id for s in enrolled}
    cart_ids = {s.id for s in cart}
    context = enrolled + cart

    courses: dict[int, dict] = {}
    for section, data in zip(sections, serialized):
        course = section.course
        if course.id not in courses:
            prereq = reg.check_prerequisites(db, user, course, term, history=history, same_term_course_ids=same_term) \
                if user.role == "student" else None
            courses[course.id] = {
                **course_out(course),
                "prerequisite_check": prereq.as_dict() if prereq else None,
                "completed": course.id in passed,
                "in_progress": course.id in history[1],
                "sections": [],
            }
        clashes = reg.conflicts_with(section, [s for s in context if s.course_id != section.course_id])
        data.update({
            "in_cart": section.id in cart_ids,
            "enrolled_here": section.id in enrolled_ids,
            "waitlisted": section.id in waitlisted,
            "waitlist_position": reg.waitlist_position(db, waitlisted[section.id]) if section.id in waitlisted else None,
            "alert": section.id in alerts,
            "conflicts_with": [f"{c.course.code} {c.code}" for c in clashes],
        })
        courses[course.id]["sections"].append(data)

    items = list(courses.values())
    if only_open:
        items = [c for c in items if any(s["seats_left"] > 0 for s in c["sections"])]
    return {"term": term_out(term), "courses": items}


class CheckIn(BaseModel):
    course_id: int
    term_id: int | None = None


@router.post("/prerequisites/check")
def prerequisite_check(payload: CheckIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.get(Course, payload.course_id)
    if not course:
        raise HTTPException(404, "Course not found.")
    term = get_term(db, payload.term_id)
    return reg.check_prerequisites(db, user, course, term).as_dict()


# ---------------------------------------------------------------- schedule state


def schedule_state(db: Session, user: User, term: Term) -> dict:
    enrolled = reg.enrolled_sections(db, user.id, term.id)
    cart = reg.cart_sections(db, user.id, term.id)
    everything = enrolled + [s for s in cart if s.id not in {e.id for e in enrolled}]
    history = reg.course_history(db, user.id, term)
    same_term = {s.course_id for s in everything}
    conflicts = []
    for a, b in reg.find_conflicts(everything):
        # Suggest replacements for whichever side can move (cart items first).
        movable = [s for s in (b, a) if s in cart] or [b, a]
        suggestions = []
        for target in movable:
            for alt in reg.suggest_alternatives(db, target, everything):
                suggestions.append({"replace_id": target.id, "replace_label": reg.section_label(target),
                                    "in_cart": target in cart, "section": section_out(db, alt)})
        conflicts.append({
            "section_ids": [a.id, b.id],
            "message": f"{reg.section_label(a)} overlaps with {reg.section_label(b)}",
            "suggestions": suggestions[:8],
        })
    cart_out = sections_out(db, cart)
    for data, section in zip(cart_out, cart):
        data["prerequisite"] = reg.check_prerequisites(
            db, user, section.course, term, history=history, same_term_course_ids=same_term).as_dict()
    confirmation = reg.is_confirmed(db, user.id, term.id)
    return {
        "term": term_out(term),
        "enrolled": sections_out(db, enrolled),
        "cart": cart_out,
        "conflicts": conflicts,
        "ects": {"enrolled": reg.term_ects(enrolled), "with_cart": reg.term_ects(everything),
                 "limit": reg.ects_limit(db, user, term)},
        "confirmed_at": confirmation.confirmed_at if confirmation else None,
        "financial_hold": user.financial_hold,
    }


@router.get("/schedule")
def get_schedule(term_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return schedule_state(db, user, get_term(db, term_id))


class SectionIn(BaseModel):
    section_id: int


@router.post("/cart")
def add_to_cart(payload: SectionIn, user: User = Depends(student), db: Session = Depends(get_db)):
    section = _section(db, payload.section_id)
    term = section.term
    enrolled = reg.enrolled_sections(db, user.id, term.id)
    if any(s.id == section.id for s in enrolled):
        raise HTTPException(409, "You are already registered in this section.")
    same_enrolled = [s for s in enrolled if s.course_id == section.course_id and s.kind == section.kind]
    if same_enrolled:
        raise HTTPException(409, {"code": "duplicate", "swap_from": same_enrolled[0].id,
                                  "message": f"You are registered in {reg.section_label(same_enrolled[0])}. "
                                             "Use Swap to change sections without losing your seat."})
    prereq = reg.check_prerequisites(db, user, section.course, term)
    if prereq.blocked:
        raise HTTPException(409, {"code": "prerequisite", "message": prereq.message,
                                  "prerequisite": prereq.as_dict()})
    # Replace another draft section of the same course and kind.
    for other in reg.cart_sections(db, user.id, term.id):
        if other.course_id == section.course_id and other.kind == section.kind and other.id != section.id:
            db.query(CartItem).filter(CartItem.user_id == user.id, CartItem.section_id == other.id).delete()
    if not db.scalar(select(CartItem).where(CartItem.user_id == user.id, CartItem.section_id == section.id)):
        db.add(CartItem(user_id=user.id, section_id=section.id))
    db.commit()
    return schedule_state(db, user, term)


@router.delete("/cart/{section_id}")
def remove_from_cart(section_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    section = _section(db, section_id)
    db.query(CartItem).filter(CartItem.user_id == user.id, CartItem.section_id == section_id).delete()
    db.commit()
    return schedule_state(db, user, section.term)


class ReplaceIn(BaseModel):
    from_section_id: int
    to_section_id: int


@router.post("/cart/replace")
def replace_in_cart(payload: ReplaceIn, user: User = Depends(student), db: Session = Depends(get_db)):
    old = _section(db, payload.from_section_id)
    new = _section(db, payload.to_section_id)
    if (old.course_id, old.kind, old.term_id) != (new.course_id, new.kind, new.term_id):
        raise HTTPException(422, "Replacement must be another section of the same class.")
    db.query(CartItem).filter(CartItem.user_id == user.id, CartItem.section_id == old.id).delete()
    if not db.scalar(select(CartItem).where(CartItem.user_id == user.id, CartItem.section_id == new.id)):
        db.add(CartItem(user_id=user.id, section_id=new.id))
    db.commit()
    return schedule_state(db, user, new.term)


class ApplyIn(BaseModel):
    section_ids: list[int] = Field(min_length=1, max_length=40)


@router.post("/cart/apply")
def apply_generated(payload: ApplyIn, user: User = Depends(student), db: Session = Depends(get_db)):
    sections = [_section(db, sid) for sid in payload.section_ids]
    term = sections[0].term
    if any(s.term_id != term.id for s in sections):
        raise HTTPException(422, "All sections must belong to the same term.")
    enrolled = {(s.course_id, s.kind) for s in reg.enrolled_sections(db, user.id, term.id)}
    courses = {s.course_id for s in sections}
    for item in reg.cart_sections(db, user.id, term.id):
        if item.course_id in courses:
            db.query(CartItem).filter(CartItem.user_id == user.id, CartItem.section_id == item.id).delete()
    for section in sections:
        if (section.course_id, section.kind) not in enrolled:
            db.add(CartItem(user_id=user.id, section_id=section.id))
    db.commit()
    return schedule_state(db, user, term)


class TermIn(BaseModel):
    term_id: int | None = None


@router.post("/registration/submit")
def submit_registration(payload: TermIn, user: User = Depends(student), db: Session = Depends(get_db)):
    term = get_term(db, payload.term_id)
    results = []
    for section in reg.cart_sections(db, user.id, term.id):
        label = reg.section_label(section)
        try:
            reg.enroll(db, user, section)
            db.commit()
            results.append({"section_id": section.id, "label": label, "ok": True, "message": "Registered"})
        except reg.RegistrationError as exc:
            db.rollback()
            results.append({"section_id": section.id, "label": label, "ok": False, "code": exc.code,
                            "message": exc.message, **exc.extra})
    return {"results": results, "schedule": schedule_state(db, user, term)}


@router.post("/enrollments/{section_id}/drop")
def drop_section(section_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    section = _section(db, section_id)
    try:
        reg.drop(db, user, section)
    except reg.RegistrationError as exc:
        db.rollback()
        raise exc.http() from exc
    db.commit()
    return schedule_state(db, user, section.term)


@router.get("/enrollments/{section_id}/swap-options")
def swap_options(section_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    section = _section(db, section_id)
    others = [s for s in reg.enrolled_sections(db, user.id, section.term_id) if s.id != section.id]
    candidates = db.scalars(select(Section).where(
        Section.course_id == section.course_id, Section.term_id == section.term_id,
        Section.kind == section.kind, Section.id != section.id).order_by(Section.code)).all()
    out = sections_out(db, candidates)
    for data, candidate in zip(out, candidates):
        clashes = reg.conflicts_with(candidate, others)
        data["conflicts_with"] = [reg.section_label(c) for c in clashes]
        data["available"] = data["seats_left"] > 0 and not clashes
    return {"current": section_out(db, section), "options": out}


@router.post("/enrollments/swap")
def swap_section(payload: ReplaceIn, user: User = Depends(student), db: Session = Depends(get_db)):
    old = _section(db, payload.from_section_id)
    new = _section(db, payload.to_section_id)
    try:
        reg.swap(db, user, old, new)
    except reg.RegistrationError as exc:
        db.rollback()
        raise exc.http() from exc
    db.commit()
    return {"message": f"Swapped to {reg.section_label(new)}. Your enrollment in {new.course.code} was kept.",
            "schedule": schedule_state(db, user, new.term)}


@router.post("/schedule/confirm")
def confirm_schedule(payload: TermIn, user: User = Depends(student), db: Session = Depends(get_db)):
    term = get_term(db, payload.term_id)
    enrolled = reg.enrolled_sections(db, user.id, term.id)
    if not enrolled:
        raise HTTPException(409, "Register for at least one course before confirming your schedule.")
    if reg.find_conflicts(enrolled):
        raise HTTPException(409, "Resolve time conflicts before confirming your schedule.")
    if not reg.is_confirmed(db, user.id, term.id):
        db.add(ScheduleConfirmation(user_id=user.id, term_id=term.id))
        db.commit()
    return schedule_state(db, user, term)


@router.delete("/schedule/confirm")
def unconfirm_schedule(term_id: int | None = None, user: User = Depends(student), db: Session = Depends(get_db)):
    term = get_term(db, term_id)
    reg.clear_confirmation(db, user.id, term.id)
    db.commit()
    return schedule_state(db, user, term)


EXPORT_BLOCKED = "Schedule must be fully confirmed before export"


@router.get("/schedule/export.ics")
def export_ics(term_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    term = get_term(db, term_id)
    if not reg.is_confirmed(db, user.id, term.id):
        raise HTTPException(409, EXPORT_BLOCKED)
    body = build_ics(term, reg.enrolled_sections(db, user.id, term.id))
    filename = f"sdu-schedule-{term.code}.ics"
    return Response(body, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/calendar/subscription")
def calendar_subscription(user: User = Depends(student), db: Session = Depends(get_db)):
    if not user.calendar_token:
        user.calendar_token = secrets.token_urlsafe(24)
        db.commit()
    return {"url": f"{settings.base_url}/api/calendar/{user.calendar_token}.ics"}


@router.get("/calendar/{token}.ics")
def calendar_feed(token: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.calendar_token == token))
    if not user:
        raise HTTPException(404, "Calendar not found.")
    terms = db.scalars(select(Term).order_by(Term.start_date)).all()
    sections: list[Section] = []
    chosen = None
    for term in terms:
        if reg.is_confirmed(db, user.id, term.id):
            chosen = term
            sections = reg.enrolled_sections(db, user.id, term.id)
    if chosen is None:
        raise HTTPException(409, EXPORT_BLOCKED)
    return Response(build_ics(chosen, sections), media_type="text/calendar; charset=utf-8")


# ---------------------------------------------------------------- waitlist


@router.get("/waitlist")
def my_waitlist(user: User = Depends(student), db: Session = Depends(get_db)):
    entries = db.scalars(select(WaitlistEntry).where(WaitlistEntry.user_id == user.id)
                         .order_by(WaitlistEntry.created_at.desc())).all()
    return {"entries": [waitlist_out(db, e) for e in entries]}


@router.post("/waitlist", status_code=201)
def join_waitlist(payload: SectionIn, user: User = Depends(student), db: Session = Depends(get_db)):
    section = _section(db, payload.section_id)
    try:
        entry = reg.join_waitlist(db, user, section)
    except reg.RegistrationError as exc:
        db.rollback()
        raise exc.http() from exc
    db.commit()
    return waitlist_out(db, entry)


@router.delete("/waitlist/{entry_id}")
def leave_waitlist(entry_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    entry = db.get(WaitlistEntry, entry_id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(404, "Waitlist entry not found.")
    entry.status = "cancelled"
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- seat alerts


class AlertIn(BaseModel):
    section_id: int
    channels: list[str] = Field(default_factory=lambda: ["push"])


@router.get("/alerts")
def my_alerts(user: User = Depends(student), db: Session = Depends(get_db)):
    alerts = db.scalars(select(SeatAlert).where(SeatAlert.user_id == user.id, SeatAlert.active.is_(True))
                        .order_by(SeatAlert.created_at.desc())).all()
    return {
        "limit": settings.max_seat_alerts,
        "alerts": [{"id": a.id, "channels": a.channels.split(","), "created_at": a.created_at,
                    "last_notified_at": a.last_notified_at, "section": section_out(db, a.section)} for a in alerts],
    }


@router.post("/alerts", status_code=201)
def create_alert(payload: AlertIn, user: User = Depends(student), db: Session = Depends(get_db)):
    section = _section(db, payload.section_id)
    try:
        alert = reg.subscribe_alert(db, user, section, payload.channels)
    except reg.RegistrationError as exc:
        db.rollback()
        raise exc.http() from exc
    db.commit()
    return {"id": alert.id, "channels": alert.channels.split(",")}


@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    alert = db.get(SeatAlert, alert_id)
    if not alert or alert.user_id != user.id:
        raise HTTPException(404, "Alert not found.")
    alert.active = False
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- generator


class GeneratorIn(BaseModel):
    term_id: int | None = None
    course_ids: list[int] = Field(min_length=1, max_length=10)
    days_off: list[int] = Field(default_factory=list)
    window: str = "any"
    start_min: int | None = Field(default=None, ge=0, le=1440)
    end_min: int | None = Field(default=None, ge=0, le=1440)
    only_open: bool = True
    limit: int = Field(default=24, ge=1, le=60)


@router.post("/generator")
def run_generator(payload: GeneratorIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    term = get_term(db, payload.term_id)
    filters = Filters(days_off=[d for d in payload.days_off if 0 <= d <= 6], window=payload.window,
                      start_min=payload.start_min, end_min=payload.end_min, only_open=payload.only_open)
    result = generate(db, term, payload.course_ids, filters, limit=payload.limit)
    ids = {sid for s in result["schedules"] for sid in s["section_ids"]}
    ids |= {sid for c in result["conflicts"] for sid in c["section_ids"]}
    sections = db.scalars(select(Section).where(Section.id.in_(ids or {0}))).all()
    result["sections"] = {s["id"]: s for s in sections_out(db, sections)}
    result["term"] = term_out(term)
    return result
