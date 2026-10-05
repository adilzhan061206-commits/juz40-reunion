"""Conflict-free schedule generation from preferred time slots (US1)."""

from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Course, Section, Term
from .registration import seat_counts

WINDOWS = {
    "any": (0, 24 * 60),
    "morning": (8 * 60, 12 * 60),
    "afternoon": (12 * 60, 17 * 60),
    "evening": (17 * 60, 22 * 60),
}
NO_SCHEDULE_MESSAGE = "No conflict-free schedules could be generated with your selected courses and filters"


@dataclass
class Filters:
    days_off: list[int] = field(default_factory=list)
    window: str = "any"
    start_min: int | None = None
    end_min: int | None = None
    only_open: bool = True

    def bounds(self) -> tuple[int, int]:
        lo, hi = WINDOWS.get(self.window, WINDOWS["any"])
        if self.start_min is not None:
            lo = self.start_min
        if self.end_min is not None:
            hi = self.end_min
        return lo, hi


Block = tuple[int, int, int]  # day, start, end


def _blocks(sections: tuple[Section, ...]) -> list[Block]:
    return [(m.day, m.start_min, m.end_min) for s in sections for m in s.meetings]


def _overlap(a: list[Block], b: list[Block]) -> bool:
    for d1, s1, e1 in a:
        for d2, s2, e2 in b:
            if d1 == d2 and s1 < e2 and s2 < e1:
                return True
    return False


def _section_fits(section: Section, filters: Filters, full: bool) -> str | None:
    """Return why a section is excluded, or None if it passes the filters."""
    if filters.only_open and full:
        return "full"
    lo, hi = filters.bounds()
    for m in section.meetings:
        if m.day in filters.days_off:
            return "day"
        if m.start_min < lo or m.end_min > hi:
            return "time"
    return None


def _score(blocks: list[Block]) -> tuple[int, int, int]:
    days: dict[int, list[tuple[int, int]]] = {}
    for d, s, e in blocks:
        days.setdefault(d, []).append((s, e))
    gaps = 0
    for spans in days.values():
        spans.sort()
        for (_, end), (start, _) in zip(spans, spans[1:]):
            gaps += max(0, start - end)
    earliest = min((s for _, s, _ in blocks), default=0)
    return len(days), gaps, -earliest


def generate(db: Session, term: Term, course_ids: list[int], filters: Filters, limit: int = 24,
             time_budget: float = 6.0) -> dict:
    started = time.monotonic()
    courses = [db.get(Course, cid) for cid in dict.fromkeys(course_ids)]
    courses = [c for c in courses if c is not None]
    sections = db.scalars(
        select(Section).where(Section.term_id == term.id, Section.course_id.in_([c.id for c in courses] or [0]))
    ).all()
    taken, _ = seat_counts(db, [s.id for s in sections])

    options: dict[int, list[tuple[tuple[Section, ...], list[Block]]]] = {}
    diagnostics: list[dict] = []
    for course in courses:
        by_kind: dict[str, list[Section]] = {}
        excluded = {"full": 0, "day": 0, "time": 0}
        own = [s for s in sections if s.course_id == course.id]
        for section in own:
            reason = _section_fits(section, filters, taken.get(section.id, 0) >= section.capacity)
            if reason:
                excluded[reason] += 1
            else:
                by_kind.setdefault(section.kind, []).append(section)
        kinds_needed = sorted({s.kind for s in own})
        combos = []
        if own and all(k in by_kind for k in kinds_needed):
            for combo in itertools.product(*(by_kind[k] for k in kinds_needed)):
                blocks = _blocks(combo)
                if any(_overlap([b], blocks[i + 1:]) for i, b in enumerate(blocks)):
                    continue
                combos.append((combo, blocks))
        options[course.id] = combos
        if not own:
            diagnostics.append({"course": course.code, "reason": "not_offered",
                                "message": f"{course.code} is not offered in {term.name}."})
        elif not combos:
            parts = []
            if excluded["day"]:
                parts.append("meet on your days off")
            if excluded["time"]:
                parts.append("fall outside your time window")
            if excluded["full"]:
                parts.append("are full")
            diagnostics.append({
                "course": course.code,
                "reason": "filtered",
                "message": f"Every section of {course.code} would {' or '.join(parts) or 'clash with itself'}.",
            })

    order = sorted(courses, key=lambda c: len(options[c.id]))
    found: list[tuple[tuple[int, int, int], list[Section]]] = []
    seen: set[frozenset[int]] = set()
    nodes = 0
    truncated = False

    def backtrack(index: int, chosen: list[Section], blocks: list[Block]) -> bool:
        nonlocal nodes, truncated
        nodes += 1
        if nodes % 2000 == 0 and time.monotonic() - started > time_budget:
            truncated = True
            return False
        if index == len(order):
            key = frozenset(s.id for s in chosen)
            if key not in seen:
                seen.add(key)
                found.append((_score(blocks), list(chosen)))
            return len(found) < 400
        for combo, combo_blocks in options[order[index].id]:
            if _overlap(combo_blocks, blocks):
                continue
            if not backtrack(index + 1, chosen + list(combo), blocks + combo_blocks):
                return False
        return True

    if courses and not diagnostics:
        backtrack(0, [], [])

    found.sort(key=lambda item: item[0])
    schedules = [
        {
            "id": "-".join(str(s.id) for s in sorted(chosen, key=lambda s: s.id)),
            "section_ids": [s.id for s in chosen],
            "days_used": score[0],
            "gap_minutes": score[1],
        }
        for score, chosen in found[:limit]
    ]

    conflicts: list[dict] = []
    if not schedules and courses and not diagnostics:
        for a, b in itertools.combinations(courses, 2):
            if options[a.id] and options[b.id] and all(
                _overlap(x[1], y[1]) for x in options[a.id] for y in options[b.id]
            ):
                involved = {s.id for opt in options[a.id] + options[b.id] for s in opt[0]}
                conflicts.append({
                    "courses": [a.code, b.code],
                    "section_ids": sorted(involved),
                    "message": f"Every option of {a.code} overlaps with every option of {b.code}.",
                })

    return {
        "schedules": schedules,
        "total_found": len(found),
        "truncated": truncated,
        "elapsed_ms": round(1000 * (time.monotonic() - started)),
        "message": None if schedules else NO_SCHEDULE_MESSAGE,
        "diagnostics": diagnostics,
        "conflicts": conflicts,
    }
