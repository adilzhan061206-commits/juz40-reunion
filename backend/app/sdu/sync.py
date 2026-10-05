"""Import data fetched from my.sdu.edu.kz into the local database."""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    Course,
    Enrollment,
    Meeting,
    Program,
    Section,
    Term,
    TranscriptEntry,
    User,
    now,
)
from ..services import registration
from . import parsers
from .client import SduSnapshot

PASSING = {"A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "P"}
FAILING = {"F", "FX", "NP"}


@dataclass
class ImportSummary:
    term: str | None = None
    courses: int = 0
    sections: int = 0
    enrollments: int = 0
    transcript: int = 0
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "term": self.term,
            "courses": self.courses,
            "sections": self.sections,
            "enrollments": self.enrollments,
            "transcript": self.transcript,
            "warnings": self.warnings,
        }


def term_name(year: int, number: int) -> str:
    return f"Fall {year}" if number == 1 else f"Spring {year + 1}" if number == 2 else f"Summer {year + 1}"


def term_dates(year: int, number: int) -> tuple[str, str]:
    if number == 1:
        return f"{year}-09-01", f"{year}-12-25"
    if number == 2:
        return f"{year + 1}-01-19", f"{year + 1}-05-23"
    return f"{year + 1}-06-08", f"{year + 1}-07-31"


def ensure_term(db: Session, code: str) -> Term:
    term = db.scalar(select(Term).where(Term.code == code))
    if term:
        return term
    year, number = (int(x) for x in code.split("-"))
    start, end = term_dates(year, number)
    has_current = db.scalar(select(Term.id).where(Term.is_current.is_(True))) is not None
    term = Term(code=code, name=term_name(year, number), start_date=start, end_date=end, is_current=not has_current)
    db.add(term)
    db.flush()
    return term


def ensure_course(db: Session, code: str, title: str, ects: float | None = None, credits: float | None = None,
                  hours: str | None = None, source: str = "sdu") -> tuple[Course, bool]:
    code = parsers.normalize_code(code)
    course = db.scalar(select(Course).where(Course.code == code))
    created = False
    if course is None:
        course = Course(code=code, title=title or code, source=source, ects=ects or 5, credits=int(credits or 3))
        db.add(course)
        db.flush()
        created = True
    else:
        if title and (course.title == course.code or course.source != "catalog"):
            course.title = title
    if ects:
        course.ects = ects
    if credits:
        course.credits = int(credits)
    if hours:
        course.hours = hours
    return course, created


def import_schedule(db: Session, user: User | None, term: Term, classes: list[parsers.ScheduleClass],
                    summary: ImportSummary) -> list[Section]:
    """Upsert courses/sections/meetings for ``term``; enroll ``user`` in them when given."""
    by_section: dict[tuple[str, str], list[parsers.ScheduleClass]] = {}
    for item in classes:
        by_section.setdefault((item.code, item.section), []).append(item)

    sections: list[Section] = []
    for (code, section_code), meetings in by_section.items():
        first = meetings[0]
        course, created = ensure_course(db, code, first.title, first.ects, first.credits, first.hours)
        summary.courses += int(created)
        section = db.scalar(
            select(Section).where(Section.course_id == course.id, Section.term_id == term.id, Section.code == section_code)
        )
        if section is None:
            section = Section(course_id=course.id, term_id=term.id, code=section_code, kind=first.kind,
                              instructor=first.instructor or None, capacity=30, source="sdu")
            db.add(section)
            db.flush()
            summary.sections += 1
        elif first.instructor:
            section.instructor = first.instructor
        section.meetings.clear()
        db.flush()
        for m in meetings:
            section.meetings.append(Meeting(day=m.day, start_min=m.start_min, end_min=m.end_min, room=m.room or None))
        sections.append(section)

    if user is not None:
        keep = {s.id for s in sections}
        existing = db.scalars(
            select(Enrollment).join(Section).where(
                Enrollment.user_id == user.id, Section.term_id == term.id, Enrollment.status == "enrolled"
            )
        ).all()
        enrolled_ids = {e.section_id for e in existing}
        for enrollment in existing:
            if enrollment.source == "sdu" and enrollment.section_id not in keep:
                enrollment.status = "dropped"
        for section in sections:
            if section.id not in enrolled_ids:
                db.add(Enrollment(user_id=user.id, section_id=section.id, status="enrolled", source="sdu"))
                summary.enrollments += 1
            # Make sure imported sections always have room for the students SDU says are enrolled.
            taken = registration.seats_taken(db, section.id) + (0 if section.id in enrolled_ids else 1)
            if taken > section.capacity:
                section.capacity = taken
        registration.clear_confirmation(db, user.id, term.id)
    db.flush()
    return sections


def import_grades(db: Session, user: User, rows: list[parsers.GradeRow], current_code: str | None,
                  summary: ImportSummary) -> None:
    for row in rows:
        grade = (row.grade or "").upper()
        if grade in {"W", "AU", "I"}:
            continue
        course, created = ensure_course(db, row.code, row.title, row.ects, row.credits)
        summary.courses += int(created)
        term_code = row.term_code or ""
        if grade in PASSING:
            status = "completed"
        elif grade in FAILING:
            status = "failed"
        else:
            status = "in_progress"
            term_code = term_code or (current_code or "")
        entry = db.scalar(
            select(TranscriptEntry).where(
                TranscriptEntry.user_id == user.id,
                TranscriptEntry.course_id == course.id,
                TranscriptEntry.term_code == term_code,
            )
        )
        if entry is None:
            entry = TranscriptEntry(user_id=user.id, course_id=course.id, term_code=term_code, source="sdu")
            db.add(entry)
            summary.transcript += 1
        entry.grade = grade or None
        entry.status = status
    db.flush()


def match_program(db: Session, label: str) -> Program | None:
    label = (label or "").lower()
    if not label:
        return None
    for program in db.scalars(select(Program).where(Program.owner_id.is_(None))).all():
        name = program.name.lower()
        if name in label or label in name or program.code.lower() in label:
            return program
    return None


def import_snapshot(db: Session, user: User, snapshot: SduSnapshot) -> ImportSummary:
    summary = ImportSummary(warnings=list(snapshot.warnings))
    if snapshot.profile.name:
        user.name = snapshot.profile.name[:120]
    if user.program_id is None:
        program = match_program(db, snapshot.profile.program)
        if program:
            user.program_id = program.id
            user.department_id = program.department_id
    term = None
    if snapshot.term is not None:
        term = ensure_term(db, snapshot.term.code)
        summary.term = term.name
        import_schedule(db, user, term, snapshot.classes, summary)
    import_grades(db, user, snapshot.grades, term.code if term else None, summary)
    user.last_sdu_sync = now()
    db.commit()
    return summary
