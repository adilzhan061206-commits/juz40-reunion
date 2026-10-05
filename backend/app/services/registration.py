"""Registration rules: seats, conflicts, prerequisites, credit limits, waitlists, swaps and alerts."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    CartItem,
    Course,
    Enrollment,
    OverrideRequest,
    Prerequisite,
    ScheduleConfirmation,
    SeatAlert,
    Section,
    Term,
    TranscriptEntry,
    User,
    WaitlistEntry,
    now,
)
from .notify import notify

GRADE_ORDER = ["F", "FX", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A"]
MIN_PREREQ_GRADE = "C"
DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def fmt_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def section_label(section: Section) -> str:
    return f"{section.course.code} · Section {section.code}"


def meeting_label(section: Section) -> str:
    return ", ".join(
        f"{DAY_LABELS[m.day]} {fmt_time(m.start_min)}–{fmt_time(m.end_min)}" for m in section.meetings
    ) or "time TBA"


# ---------------------------------------------------------------- seats


def seats_taken(db: Session, section_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Enrollment).where(
            Enrollment.section_id == section_id, Enrollment.status == "enrolled"
        )
    ) or 0


def seats_left(db: Session, section: Section) -> int:
    return max(0, section.capacity - seats_taken(db, section.id))


def seat_counts(db: Session, section_ids: Iterable[int]) -> tuple[dict[int, int], dict[int, int]]:
    ids = list(set(section_ids))
    if not ids:
        return {}, {}
    taken = dict(
        db.execute(
            select(Enrollment.section_id, func.count())
            .where(Enrollment.section_id.in_(ids), Enrollment.status == "enrolled")
            .group_by(Enrollment.section_id)
        ).all()
    )
    waiting = dict(
        db.execute(
            select(WaitlistEntry.section_id, func.count())
            .where(WaitlistEntry.section_id.in_(ids), WaitlistEntry.status.in_(("waiting", "held")))
            .group_by(WaitlistEntry.section_id)
        ).all()
    )
    return taken, waiting


# ---------------------------------------------------------------- student state


def enrolled_sections(db: Session, user_id: int, term_id: int) -> list[Section]:
    return list(
        db.scalars(
            select(Section).join(Enrollment).where(
                Enrollment.user_id == user_id, Enrollment.status == "enrolled", Section.term_id == term_id
            ).order_by(Section.id)
        ).all()
    )


def cart_sections(db: Session, user_id: int, term_id: int) -> list[Section]:
    return list(
        db.scalars(
            select(Section).join(CartItem).where(CartItem.user_id == user_id, Section.term_id == term_id)
            .order_by(CartItem.created_at, CartItem.id)
        ).all()
    )


def clear_confirmation(db: Session, user_id: int, term_id: int) -> None:
    db.execute(
        delete(ScheduleConfirmation).where(
            ScheduleConfirmation.user_id == user_id, ScheduleConfirmation.term_id == term_id
        )
    )


def is_confirmed(db: Session, user_id: int, term_id: int) -> ScheduleConfirmation | None:
    return db.scalar(
        select(ScheduleConfirmation).where(
            ScheduleConfirmation.user_id == user_id, ScheduleConfirmation.term_id == term_id
        )
    )


# ---------------------------------------------------------------- conflicts


def sections_overlap(a: Section, b: Section) -> bool:
    for m in a.meetings:
        for n in b.meetings:
            if m.day == n.day and m.start_min < n.end_min and n.start_min < m.end_min:
                return True
    return False


def find_conflicts(sections: list[Section]) -> list[tuple[Section, Section]]:
    pairs = []
    for i, a in enumerate(sections):
        for b in sections[i + 1:]:
            if a.id != b.id and sections_overlap(a, b):
                pairs.append((a, b))
    return pairs


def conflicts_with(section: Section, others: Iterable[Section]) -> list[Section]:
    return [o for o in others if o.id != section.id and sections_overlap(section, o)]


def suggest_alternatives(db: Session, section: Section, context: list[Section], limit: int = 6) -> list[Section]:
    """Open sections of the same course and kind that fit with the rest of ``context``."""
    rest = [s for s in context if s.id != section.id]
    candidates = db.scalars(
        select(Section).where(
            Section.course_id == section.course_id,
            Section.term_id == section.term_id,
            Section.kind == section.kind,
            Section.id != section.id,
        ).order_by(Section.code)
    ).all()
    out = []
    for candidate in candidates:
        if seats_left(db, candidate) <= 0:
            continue
        if conflicts_with(candidate, rest):
            continue
        out.append(candidate)
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------- prerequisites


def grade_at_least(grade: str | None, minimum: str = MIN_PREREQ_GRADE) -> bool:
    if not grade:
        return True  # completed without a recorded letter grade (e.g. pass/transfer)
    grade = grade.upper()
    if grade == "P":
        return True
    if grade not in GRADE_ORDER:
        return False
    return GRADE_ORDER.index(grade) >= GRADE_ORDER.index(minimum)


def course_history(db: Session, user_id: int, term: Term | None = None) -> tuple[set[int], set[int]]:
    """Return (completed course ids, in-progress course ids before ``term``)."""
    completed: set[int] = set()
    in_progress: set[int] = set()
    for entry in db.scalars(select(TranscriptEntry).where(TranscriptEntry.user_id == user_id)).all():
        if entry.status == "completed" and grade_at_least(entry.grade):
            completed.add(entry.course_id)
        elif entry.status == "in_progress":
            in_progress.add(entry.course_id)
    # Courses a student is enrolled in during an earlier (current) term count as in progress.
    rows = db.execute(
        select(Section.course_id, Term.start_date).join(Enrollment, Enrollment.section_id == Section.id)
        .join(Term, Term.id == Section.term_id)
        .where(Enrollment.user_id == user_id, Enrollment.status == "enrolled")
    ).all()
    for course_id, start in rows:
        if term is None or start < term.start_date:
            in_progress.add(course_id)
    in_progress -= completed
    return completed, in_progress


def passed_course_ids(db: Session, user_id: int) -> set[int]:
    """Courses completed with any passing grade (they count toward the degree even below C)."""
    return set(db.scalars(select(TranscriptEntry.course_id).where(
        TranscriptEntry.user_id == user_id, TranscriptEntry.status == "completed")).all())


def approved_override(db: Session, user_id: int, term_id: int, kind: str, course_id: int | None = None):
    query = select(OverrideRequest).where(
        OverrideRequest.student_id == user_id,
        OverrideRequest.term_id == term_id,
        OverrideRequest.kind == kind,
        OverrideRequest.status == "approved",
    )
    if course_id is not None:
        query = query.where(OverrideRequest.course_id == course_id)
    return db.scalars(query.order_by(OverrideRequest.decided_at.desc())).first()


@dataclass
class PrereqCheck:
    status: str  # met | provisional | missing | waived | none
    missing: list[str] = field(default_factory=list)
    provisional: list[str] = field(default_factory=list)
    corequisites: list[str] = field(default_factory=list)
    missing_corequisites: list[str] = field(default_factory=list)

    @property
    def blocked(self) -> bool:
        return self.status == "missing"

    @property
    def message(self) -> str:
        if self.missing:
            return "Missing Prerequisite: " + ", ".join(self.missing)
        if self.missing_corequisites:
            return "Missing Corequisite: " + ", ".join(self.missing_corequisites) + " (add it to the same term)"
        if self.status == "waived":
            return "Prerequisite waived by your advisor"
        if self.provisional:
            return "Prerequisites met provisionally (in progress: " + ", ".join(self.provisional) + ")"
        if self.status == "met":
            return "All prerequisites met"
        return "No prerequisites"

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "blocked": self.blocked,
            "message": self.message,
            "missing": self.missing,
            "provisional": self.provisional,
            "corequisites": self.corequisites,
            "missing_corequisites": self.missing_corequisites,
        }


def check_prerequisites(
    db: Session,
    user: User,
    course: Course,
    term: Term,
    history: tuple[set[int], set[int]] | None = None,
    same_term_course_ids: set[int] | None = None,
) -> PrereqCheck:
    completed, in_progress = history or course_history(db, user.id, term)
    if same_term_course_ids is None:
        same_term_course_ids = {s.course_id for s in enrolled_sections(db, user.id, term.id)}
        same_term_course_ids |= {s.course_id for s in cart_sections(db, user.id, term.id)}
    requisites = db.scalars(select(Prerequisite).where(Prerequisite.course_id == course.id)).all()
    if not requisites:
        return PrereqCheck(status="none")
    check = PrereqCheck(status="met")
    for req in requisites:
        code = req.requires.code
        if req.kind == "co":
            check.corequisites.append(code)
            if req.requires_id not in completed | in_progress | same_term_course_ids:
                check.missing_corequisites.append(code)
            continue
        if req.requires_id in completed:
            continue
        if req.requires_id in in_progress:
            check.provisional.append(code)
            continue
        check.missing.append(code)
    if check.missing or check.missing_corequisites:
        if approved_override(db, user.id, term.id, "prerequisite_waiver", course.id):
            check.status = "waived"
        else:
            check.status = "missing"
    elif check.provisional:
        check.status = "provisional"
    return check


# ---------------------------------------------------------------- credit limit


def term_ects(sections: Iterable[Section]) -> float:
    seen: dict[int, float] = {}
    for section in sections:
        seen[section.course_id] = section.course.ects or 0
    return round(sum(seen.values()), 2)


def ects_limit(db: Session, user: User, term: Term) -> float:
    override = approved_override(db, user.id, term.id, "credit_overload")
    if override and override.requested_ects:
        return max(settings.max_ects, override.requested_ects)
    return settings.max_ects


# ---------------------------------------------------------------- enrolment


class RegistrationError(Exception):
    def __init__(self, code: str, message: str, status: int = 409, extra: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra or {}

    def http(self) -> HTTPException:
        return HTTPException(status_code=self.status, detail={"code": self.code, "message": self.message, **self.extra})


def validate_enrollment(db: Session, user: User, section: Section, *, ignore: Iterable[int] = (),
                        check_capacity: bool = True) -> None:
    """Raise ``RegistrationError`` when ``user`` may not enroll in ``section``."""
    term = section.term
    if not term.registration_open:
        raise RegistrationError("closed", f"Registration for {term.name} is closed.")
    if user.financial_hold:
        raise RegistrationError(
            "hold", "Your account has an active financial hold. Resolve it with the Finance Office to register."
        )
    ignore = set(ignore)
    enrolled = [s for s in enrolled_sections(db, user.id, term.id) if s.id not in ignore]
    if any(s.id == section.id for s in enrolled):
        raise RegistrationError("duplicate", f"You are already registered in {section_label(section)}.")
    same = [s for s in enrolled if s.course_id == section.course_id and s.kind == section.kind]
    if same:
        raise RegistrationError(
            "duplicate",
            f"You are already in {section.course.code} {section.kind} section {same[0].code}. Use Swap to change it.",
            extra={"swap_from": same[0].id},
        )
    prereq = check_prerequisites(db, user, section.course, term)
    if prereq.blocked:
        raise RegistrationError("prerequisite", prereq.message, extra={"prerequisite": prereq.as_dict()})
    clashes = conflicts_with(section, enrolled)
    if clashes:
        raise RegistrationError(
            "conflict",
            f"Time conflict with {section_label(clashes[0])} ({meeting_label(clashes[0])}).",
            extra={"conflicts": [c.id for c in clashes]},
        )
    total = term_ects([*enrolled, section])
    limit = ects_limit(db, user, term)
    if total > limit:
        raise RegistrationError(
            "credit_limit",
            f"Credit limit exceeded: {total:g} of {limit:g} ECTS. Request a credit overload from your advisor.",
            extra={"requested_ects": total, "limit": limit},
        )
    if check_capacity and seats_left(db, section) <= 0:
        raise RegistrationError("full", f"{section_label(section)} is full. Join the waitlist to get the next seat.")


def enroll(db: Session, user: User, section: Section, source: str = "portal") -> Enrollment:
    validate_enrollment(db, user, section)
    enrollment = Enrollment(user_id=user.id, section_id=section.id, status="enrolled", source=source)
    db.add(enrollment)
    db.execute(delete(CartItem).where(CartItem.user_id == user.id, CartItem.section_id == section.id))
    for entry in db.scalars(
        select(WaitlistEntry).where(
            WaitlistEntry.user_id == user.id,
            WaitlistEntry.section_id == section.id,
            WaitlistEntry.status.in_(("waiting", "held")),
        )
    ):
        entry.status = "cancelled"
        entry.note = "Registered directly."
    clear_confirmation(db, user.id, section.term_id)
    db.flush()
    if seats_taken(db, section.id) > section.capacity:
        db.rollback()
        raise RegistrationError("full", f"{section_label(section)} just filled up. Join the waitlist.")
    return enrollment


def drop(db: Session, user: User, section: Section) -> None:
    enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.section_id == section.id, Enrollment.status == "enrolled"
        )
    )
    if not enrollment:
        raise RegistrationError("not_enrolled", "You are not registered in this section.", status=404)
    if not section.term.registration_open:
        raise RegistrationError("closed", f"Registration for {section.term.name} is closed.")
    was_full = seats_left(db, section) == 0
    enrollment.status = "dropped"
    clear_confirmation(db, user.id, section.term_id)
    db.flush()
    seat_released(db, section, was_full)


def swap(db: Session, user: User, from_section: Section, to_section: Section) -> Enrollment:
    """Atomically move ``user`` from one section of a course to another."""
    current = db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.section_id == from_section.id, Enrollment.status == "enrolled"
        )
    )
    if not current:
        raise RegistrationError("not_enrolled", "You are not registered in the section you want to swap from.", 404)
    if (to_section.course_id, to_section.term_id, to_section.kind) != (
        from_section.course_id, from_section.term_id, from_section.kind
    ) or to_section.id == from_section.id:
        raise RegistrationError("invalid_swap", "You can only swap to another section of the same class.", 422)
    if seats_left(db, to_section) <= 0:
        raise RegistrationError("full", "Target section is now full")
    try:
        validate_enrollment(db, user, to_section, ignore=[from_section.id], check_capacity=False)
    except RegistrationError as exc:
        raise RegistrationError(exc.code, f"Swap cancelled: {exc.message}", exc.status, exc.extra) from exc

    was_full = seats_left(db, from_section) == 0
    current.status = "dropped"
    new = Enrollment(user_id=user.id, section_id=to_section.id, status="enrolled", source="swap")
    db.add(new)
    db.flush()
    if seats_taken(db, to_section.id) > to_section.capacity:
        # Somebody took the last seat while we were working: undo both halves.
        db.rollback()
        raise RegistrationError("full", "Target section is now full")
    clear_confirmation(db, user.id, to_section.term_id)
    db.flush()
    seat_released(db, from_section, was_full)
    return new


# ---------------------------------------------------------------- waitlist & alerts


def join_waitlist(db: Session, user: User, section: Section) -> WaitlistEntry:
    if seats_left(db, section) > 0:
        raise RegistrationError("open", "This section still has open seats — register directly.", 400)
    existing = db.scalar(
        select(WaitlistEntry).where(
            WaitlistEntry.user_id == user.id,
            WaitlistEntry.section_id == section.id,
            WaitlistEntry.status.in_(("waiting", "held")),
        )
    )
    if existing:
        raise RegistrationError("duplicate", "You are already on this waitlist.", 400)
    if any(s.id == section.id for s in enrolled_sections(db, user.id, section.term_id)):
        raise RegistrationError("duplicate", "You are already registered in this section.", 400)
    prereq = check_prerequisites(db, user, section.course, section.term)
    if prereq.blocked:
        raise RegistrationError("prerequisite", prereq.message, 409, {"prerequisite": prereq.as_dict()})
    entry = WaitlistEntry(user_id=user.id, section_id=section.id, status="waiting")
    db.add(entry)
    db.flush()
    return entry


def waitlist_position(db: Session, entry: WaitlistEntry) -> int | None:
    if entry.status not in ("waiting", "held"):
        return None
    ahead = db.scalar(
        select(func.count()).select_from(WaitlistEntry).where(
            WaitlistEntry.section_id == entry.section_id,
            WaitlistEntry.status.in_(("waiting", "held")),
            (WaitlistEntry.created_at < entry.created_at)
            | ((WaitlistEntry.created_at == entry.created_at) & (WaitlistEntry.id < entry.id)),
        )
    ) or 0
    return ahead + 1


def seat_released(db: Session, section: Section, was_full: bool) -> list[dict]:
    """Called after a seat opens: fill it from the waitlist, then alert subscribers."""
    events = process_waitlist(db, section)
    if was_full and seats_left(db, section) > 0:
        send_seat_alerts(db, section)
    return events


def process_waitlist(db: Session, section: Section) -> list[dict]:
    events: list[dict] = []
    current = now()
    link = f"/registration?term={section.term_id}&course={section.course.code}"
    while seats_left(db, section) > 0:
        queue = db.scalars(
            select(WaitlistEntry).where(
                WaitlistEntry.section_id == section.id, WaitlistEntry.status.in_(("waiting", "held"))
            ).order_by(WaitlistEntry.created_at, WaitlistEntry.id)
        ).all()
        enrolled_someone = False
        for entry in queue:
            student = entry.user
            if entry.status == "held" and entry.hold_deadline and entry.hold_deadline < current:
                entry.status = "expired"
                entry.note = "Financial hold was not resolved in time; waitlist priority released."
                notify(db, student, "waitlist", f"Waitlist priority released for {section.course.code}",
                       entry.note, link, email=True)
                events.append({"user_id": student.id, "result": "expired"})
                continue
            if student.financial_hold:
                if entry.status != "held":
                    entry.status = "held"
                    entry.hold_deadline = current + settings.hold_grace_hours * 3600
                    entry.note = "Account hold: ineligible for registration."
                    notify(
                        db, student, "waitlist",
                        f"Action needed: financial hold blocks {section.course.code}",
                        f"A seat opened in {section_label(section)}, but your account has an active financial hold. "
                        f"Resolve the hold within {settings.hold_grace_hours} hours to retain your waitlist priority.",
                        link, email=True,
                    )
                    events.append({"user_id": student.id, "result": "held"})
                continue
            try:
                validate_enrollment(db, student, section, check_capacity=False)
            except RegistrationError as exc:
                entry.status = "skipped"
                entry.note = exc.message
                entry.updated_at = current
                notify(
                    db, student, "waitlist", f"Skipped on the {section.course.code} waitlist",
                    f"A seat opened in {section_label(section)} ({meeting_label(section)}), but you were skipped: "
                    f"{exc.message}",
                    link, email=True,
                )
                events.append({"user_id": student.id, "result": "skipped", "reason": exc.code})
                continue
            db.add(Enrollment(user_id=student.id, section_id=section.id, status="enrolled", source="waitlist"))
            entry.status = "enrolled"
            entry.note = "Automatically enrolled from the waitlist."
            entry.updated_at = current
            db.execute(delete(CartItem).where(CartItem.user_id == student.id, CartItem.section_id == section.id))
            clear_confirmation(db, student.id, section.term_id)
            notify(
                db, student, "enrolled", f"You're in! Enrolled in {section.course.code}",
                f"A seat opened and you were automatically enrolled from the waitlist into {section_label(section)} "
                f"({meeting_label(section)}).",
                "/schedule", email=True,
            )
            db.flush()
            events.append({"user_id": student.id, "result": "enrolled"})
            enrolled_someone = True
            break
        if not enrolled_someone:
            break
    db.flush()
    return events


def subscribe_alert(db: Session, user: User, section: Section, channels: list[str]) -> SeatAlert:
    channels = [c for c in channels if c in {"push", "email", "sms"}] or ["push"]
    existing = db.scalar(select(SeatAlert).where(SeatAlert.user_id == user.id, SeatAlert.section_id == section.id))
    if existing and existing.active:
        existing.channels = ",".join(channels)
        return existing
    active = db.scalar(
        select(func.count()).select_from(SeatAlert).where(SeatAlert.user_id == user.id, SeatAlert.active.is_(True))
    ) or 0
    if active >= settings.max_seat_alerts:
        raise RegistrationError(
            "alert_limit", f"Maximum seat alert limit of {settings.max_seat_alerts} courses reached", 400
        )
    if seats_left(db, section) > 0:
        raise RegistrationError("open", "This section has open seats right now — register instead.", 400)
    if existing:
        existing.active = True
        existing.channels = ",".join(channels)
        existing.created_at = now()
        return existing
    alert = SeatAlert(user_id=user.id, section_id=section.id, channels=",".join(channels))
    db.add(alert)
    db.flush()
    return alert


def send_seat_alerts(db: Session, section: Section) -> int:
    alerts = db.scalars(
        select(SeatAlert).where(SeatAlert.section_id == section.id, SeatAlert.active.is_(True))
    ).all()
    left = seats_left(db, section)
    for alert in alerts:
        student = db.get(User, alert.user_id)
        notify(
            db, student, "seat_alert", f"Seat open: {section_label(section)}",
            f"{left} seat{'s' if left != 1 else ''} just opened in {section_label(section)} ({meeting_label(section)}). "
            "Register now before it fills up.",
            f"/registration?term={section.term_id}&course={section.course.code.replace(' ', '%20')}",
            email="email" in alert.channels.split(","),
        )
        alert.last_notified_at = now()
    db.flush()
    return len(alerts)
