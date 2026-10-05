"""Degree audit, recommendations, curriculum import, override requests, planner, notifications."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_term, default_registration_term, get_current_user, get_term, require_role
from ..models import (
    Course,
    Notification,
    OverrideRequest,
    Plan,
    PlanItem,
    Section,
    Term,
    TranscriptEntry,
    User,
    WaitlistEntry,
    now,
)
from ..sdu import parsers
from ..sdu.sync import ImportSummary, ensure_term, import_grades, import_schedule
from ..serializers import notification_out, request_out, sections_out, term_out
from ..services import registration as reg
from ..services.audit import build_audit
from ..services.curriculum import import_curriculum, remove_personal_curriculum
from ..services.notify import notify
from ..services.recommend import recommend

router = APIRouter(prefix="/api", tags=["academics"])
student = require_role("student")


# ---------------------------------------------------------------- dashboard


@router.get("/dashboard")
def dashboard(user: User = Depends(student), db: Session = Depends(get_db)):
    term = current_term(db)
    upcoming = default_registration_term(db)
    today = date.today().weekday()
    current_sections = reg.enrolled_sections(db, user.id, term.id) if term else []
    audit = build_audit(db, user, upcoming=upcoming)
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    pending = db.scalar(select(func.count()).select_from(OverrideRequest).where(
        OverrideRequest.student_id == user.id, OverrideRequest.status == "pending")) or 0
    waiting = db.scalar(select(func.count()).select_from(WaitlistEntry).where(
        WaitlistEntry.user_id == user.id, WaitlistEntry.status.in_(("waiting", "held")))) or 0
    upcoming_state = None
    if upcoming:
        enrolled = reg.enrolled_sections(db, user.id, upcoming.id)
        upcoming_state = {
            "term": term_out(upcoming),
            "enrolled_ects": reg.term_ects(enrolled),
            "courses": len({s.course_id for s in enrolled}),
            "cart": len(reg.cart_sections(db, user.id, upcoming.id)),
            "confirmed": reg.is_confirmed(db, user.id, upcoming.id) is not None,
        }
    return {
        "current_term": term_out(term) if term else None,
        "today": today,
        "current_schedule": sections_out(db, current_sections),
        "current_ects": reg.term_ects(current_sections),
        "upcoming": upcoming_state,
        "audit": {"totals": audit["totals"], "program": audit["program"], "warnings": audit["warnings"],
                  "groups": [{k: g[k] for k in ("name", "category", "required_ects", "completed_ects",
                                                 "in_progress_ects", "missing_ects")} for g in audit["groups"]]},
        "unread": unread,
        "pending_requests": pending,
        "waitlists": waiting,
    }


# ---------------------------------------------------------------- audit & recommendations


@router.get("/degree/audit")
def degree_audit(user: User = Depends(student), db: Session = Depends(get_db)):
    return build_audit(db, user, upcoming=default_registration_term(db))


@router.get("/recommendations")
def recommendations(term_id: int | None = None, user: User = Depends(student), db: Session = Depends(get_db)):
    return recommend(db, user, get_term(db, term_id))


@router.get("/transcript")
def transcript(user: User = Depends(student), db: Session = Depends(get_db)):
    entries = db.scalars(select(TranscriptEntry).where(TranscriptEntry.user_id == user.id)).all()
    entries = sorted(entries, key=lambda e: (e.term_code or "9999", e.course.code))
    return {"entries": [{"id": e.id, "code": e.course.code, "title": e.course.title, "ects": e.course.ects,
                         "credits": e.course.credits, "grade": e.grade, "status": e.status, "term": e.term_code,
                         "source": e.source} for e in entries]}


class CurriculumIn(BaseModel):
    filename: str = Field(default="curriculum.json", max_length=200)
    content: str


@router.post("/curriculum/import")
def curriculum_import(payload: CurriculumIn, user: User = Depends(student), db: Session = Depends(get_db)):
    return import_curriculum(db, user, payload.content, payload.filename)


@router.delete("/curriculum")
def curriculum_delete(user: User = Depends(student), db: Session = Depends(get_db)):
    remove_personal_curriculum(db, user)
    return {"ok": True}


class SduHtmlIn(BaseModel):
    kind: str = Field(pattern="^(schedule|grades)$")
    html: str = Field(min_length=20, max_length=3_000_000)
    term_code: str | None = Field(default=None, pattern=r"^\d{4}-[123]$")


@router.post("/sdu/import-html")
def sdu_import_html(payload: SduHtmlIn, user: User = Depends(student), db: Session = Depends(get_db)):
    """Fallback when the server cannot log in to SDU: paste the HTML of your my.sdu page."""
    summary = ImportSummary()
    if payload.kind == "schedule":
        classes = parsers.parse_schedule(payload.html)
        if not classes:
            raise HTTPException(422, "No classes were found in the pasted schedule. Copy the whole schedule page.")
        code = payload.term_code
        if not code:
            option = parsers.selected_term(parsers.parse_terms(payload.html))
            code = option.code if option else None
        term = ensure_term(db, code) if code else current_term(db)
        if term is None:
            raise HTTPException(422, "Choose the term this schedule belongs to.")
        summary.term = term.name
        import_schedule(db, user, term, classes, summary)
    else:
        rows = parsers.parse_grade_rows(payload.html, term_code=payload.term_code or "")
        if not rows:
            raise HTTPException(422, "No courses were found in the pasted grades or transcript.")
        import_grades(db, user, rows, payload.term_code, summary)
    user.last_sdu_sync = now()
    db.commit()
    return summary.as_dict()


# ---------------------------------------------------------------- override requests (student side)


class RequestIn(BaseModel):
    kind: str = Field(pattern="^(credit_overload|prerequisite_waiver)$")
    term_id: int | None = None
    course_id: int | None = None
    requested_ects: float | None = Field(default=None, gt=0, le=80)
    reason: str = Field(min_length=10, max_length=2000)


@router.get("/requests")
def my_requests(user: User = Depends(student), db: Session = Depends(get_db)):
    items = db.scalars(select(OverrideRequest).where(OverrideRequest.student_id == user.id)
                       .order_by(OverrideRequest.created_at.desc())).all()
    return {"requests": [request_out(r) for r in items]}


@router.post("/requests", status_code=201)
def create_request(payload: RequestIn, user: User = Depends(student), db: Session = Depends(get_db)):
    term = get_term(db, payload.term_id)
    if user.department_id is None:
        raise HTTPException(422, "Choose your degree programme in Profile so we can route the request to your advisor.")
    course = None
    if payload.kind == "prerequisite_waiver":
        course = db.get(Course, payload.course_id or 0)
        if not course:
            raise HTTPException(422, "Choose the course you need a prerequisite waiver for.")
    elif not payload.requested_ects:
        raise HTTPException(422, "Enter the total ECTS you want to take this term.")
    elif payload.requested_ects <= reg.ects_limit(db, user, term):
        raise HTTPException(422, f"You can already take up to {reg.ects_limit(db, user, term):g} ECTS without approval.")
    duplicate = db.scalar(select(OverrideRequest).where(
        OverrideRequest.student_id == user.id, OverrideRequest.term_id == term.id,
        OverrideRequest.kind == payload.kind, OverrideRequest.status == "pending",
        OverrideRequest.course_id == (course.id if course else None)))
    if duplicate:
        raise HTTPException(409, "You already have a pending request of this type.")
    req = OverrideRequest(student_id=user.id, term_id=term.id, kind=payload.kind,
                          course_id=course.id if course else None,
                          requested_ects=payload.requested_ects if payload.kind == "credit_overload" else None,
                          reason=payload.reason.strip())
    db.add(req)
    db.flush()
    advisors = db.scalars(select(User).where(User.role == "advisor", User.department_id == user.department_id)).all()
    what = f"prerequisite waiver for {course.code}" if course else f"credit overload to {payload.requested_ects:g} ECTS"
    for advisor in advisors:
        notify(db, advisor, "request", f"New request from {user.name}", f"{user.name} asked for a {what}.",
               f"/advisor?request={req.id}", email=True)
    db.commit()
    return request_out(req)


@router.delete("/requests/{request_id}")
def cancel_request(request_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    req = db.get(OverrideRequest, request_id)
    if not req or req.student_id != user.id:
        raise HTTPException(404, "Request not found.")
    if req.status != "pending":
        raise HTTPException(409, "Only pending requests can be cancelled.")
    db.delete(req)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- planner (US11)


class PlanIn(BaseModel):
    term_id: int
    name: str = Field(min_length=1, max_length=120)
    notes: str = Field(default="", max_length=4000)


class PlanPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=4000)


class PlanItemIn(BaseModel):
    course_id: int
    section_ids: list[int] = Field(default_factory=list, max_length=6)


class PlanItemsIn(BaseModel):
    items: list[PlanItemIn] = Field(max_length=15)


def _plan(db: Session, user: User, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if not plan or plan.user_id != user.id:
        raise HTTPException(404, "Plan not found.")
    return plan


def plan_out(db: Session, user: User, plan: Plan) -> dict:
    completed, in_progress = reg.course_history(db, user.id, plan.term)
    # Courses planned in earlier saved plans count as "planned before" for prerequisite projection.
    earlier = db.scalars(select(Plan).join(Term).where(Plan.user_id == user.id,
                                                       Term.start_date < plan.term.start_date)).all()
    planned_before = {i.course_id for p in earlier for i in p.items}
    in_plan = {i.course_id for i in plan.items}
    items = []
    all_sections: list[Section] = []
    for item in plan.items:
        course = item.course
        missing = []
        for req in course.requisites:
            pool = completed | in_progress | planned_before | (in_plan if req.kind == "co" else set())
            if req.requires_id not in pool:
                missing.append(req.requires.code)
        ids = [int(x) for x in item.section_ids.split(",") if x]
        sections = [s for s in (db.get(Section, i) for i in ids) if s is not None]
        all_sections += sections
        offered = db.scalar(select(func.count()).select_from(Section).where(
            Section.course_id == course.id, Section.term_id == plan.term_id)) or 0
        items.append({"course": {"id": course.id, "code": course.code, "title": course.title, "ects": course.ects},
                      "sections": sections_out(db, sections), "missing_prerequisites": missing,
                      "offered": offered > 0, "completed": course.id in completed})
    return {
        "id": plan.id, "name": plan.name, "notes": plan.notes, "term": term_out(plan.term),
        "items": items, "ects": round(sum(i["course"]["ects"] for i in items), 2),
        "conflicts": [[a.id, b.id] for a, b in reg.find_conflicts(all_sections)],
        "created_at": plan.created_at, "updated_at": plan.updated_at,
    }


@router.get("/plans")
def list_plans(user: User = Depends(student), db: Session = Depends(get_db)):
    plans = db.scalars(select(Plan).join(Term).where(Plan.user_id == user.id).order_by(Term.start_date, Plan.id)).all()
    return {"plans": [plan_out(db, user, p) for p in plans]}


@router.post("/plans", status_code=201)
def create_plan(payload: PlanIn, user: User = Depends(student), db: Session = Depends(get_db)):
    term = db.get(Term, payload.term_id)
    if not term:
        raise HTTPException(404, "Term not found.")
    plan = Plan(user_id=user.id, term_id=term.id, name=payload.name.strip(), notes=payload.notes)
    db.add(plan)
    db.commit()
    return plan_out(db, user, plan)


@router.get("/plans/{plan_id}")
def get_plan(plan_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    return plan_out(db, user, _plan(db, user, plan_id))


@router.patch("/plans/{plan_id}")
def patch_plan(plan_id: int, payload: PlanPatch, user: User = Depends(student), db: Session = Depends(get_db)):
    plan = _plan(db, user, plan_id)
    if payload.name is not None:
        plan.name = payload.name.strip()
    if payload.notes is not None:
        plan.notes = payload.notes
    plan.updated_at = now()
    db.commit()
    return plan_out(db, user, plan)


@router.put("/plans/{plan_id}/items")
def set_plan_items(plan_id: int, payload: PlanItemsIn, user: User = Depends(student), db: Session = Depends(get_db)):
    plan = _plan(db, user, plan_id)
    plan.items.clear()
    db.flush()
    seen = set()
    for item in payload.items:
        course = db.get(Course, item.course_id)
        if not course or course.id in seen:
            continue
        seen.add(course.id)
        valid = [sid for sid in item.section_ids
                 if (s := db.get(Section, sid)) and s.course_id == course.id and s.term_id == plan.term_id]
        plan.items.append(PlanItem(course_id=course.id, section_ids=",".join(str(v) for v in valid)))
    plan.updated_at = now()
    db.commit()
    return plan_out(db, user, plan)


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, user: User = Depends(student), db: Session = Depends(get_db)):
    db.delete(_plan(db, user, plan_id))
    db.commit()
    return {"ok": True}


@router.get("/courses")
def search_courses(q: str = "", term_id: int | None = None, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    query = select(Course)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(Course.code.ilike(like) | Course.title.ilike(like))
    if term_id:
        query = query.where(Course.id.in_(select(Section.course_id).where(Section.term_id == term_id)))
    courses = db.scalars(query.order_by(Course.code).limit(60)).all()
    return {"courses": [{"id": c.id, "code": c.code, "title": c.title, "ects": c.ects} for c in courses]}


# ---------------------------------------------------------------- notifications


@router.get("/notifications")
def notifications(since: int = 0, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.id > since)
                       .order_by(Notification.id.desc()).limit(60)).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0
    return {"notifications": [notification_out(n) for n in items], "unread": unread}


class ReadIn(BaseModel):
    ids: list[int] = Field(default_factory=list)
    all: bool = False


@router.post("/notifications/read")
def mark_read(payload: ReadIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if not payload.all:
        query = query.where(Notification.id.in_(payload.ids or [0]))
    db.execute(query.values(read_at=now()))
    db.commit()
    return {"ok": True}
