"""Fall/spring rule: odd curriculum semesters (1, 3, 5, 7) run in fall, even ones (2, 4, 6, 8) in spring."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Program, RequirementCourse, RequirementGroup, Term, User

SEASON_SEMESTERS = {"fall": [1, 3, 5, 7], "spring": [2, 4, 6, 8]}


def term_season(term: Term | None) -> str | None:
    """SDU term codes are "<year>-<n>": 1 = fall, 2 = spring, 3 = summer (no restriction)."""
    if term is None:
        return None
    number = term.code.rsplit("-", 1)[-1]
    return {"1": "fall", "2": "spring"}.get(number)


def semester_season(semester: int | None) -> str | None:
    if not semester:
        return None
    return "fall" if semester % 2 == 1 else "spring"


def fits_term(term: Term | None, semester: int | None) -> bool:
    season = term_season(term)
    return season is None or semester is None or semester_season(semester) == season


def curriculum_semesters(db: Session, user: User | None) -> dict[int, int]:
    """Course id -> curriculum semester, from the user's programme (falling back to official programmes)."""
    out: dict[int, int] = {}
    rows = db.execute(
        select(RequirementCourse.course_id, RequirementCourse.semester, Program.id, Program.owner_id)
        .join(RequirementGroup, RequirementGroup.id == RequirementCourse.group_id)
        .join(Program, Program.id == RequirementGroup.program_id)
        .where(RequirementCourse.semester.is_not(None))
    ).all()
    mine = user.program_id if user else None
    for course_id, semester, program_id, owner_id in rows:
        if program_id == mine:
            out[course_id] = semester
    for course_id, semester, program_id, owner_id in rows:
        if owner_id is None and course_id not in out:
            out[course_id] = min(semester, out.get(course_id, semester))
    return out
