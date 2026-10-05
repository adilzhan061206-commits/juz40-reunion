"""iCalendar (.ics) export of a confirmed schedule (US10)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from ..models import Section, Term
from .registration import fmt_time

TZID = "Asia/Almaty"  # Kazakhstan uses UTC+05:00 all year (no DST)


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    raw = line.encode()
    if len(raw) <= 75:
        return line
    parts, current = [], b""
    for char in line:
        encoded = char.encode()
        if len(current) + len(encoded) > (75 if not parts else 74):
            parts.append(current.decode())
            current = b""
        current += encoded
    parts.append(current.decode())
    return "\r\n ".join(parts)


def _first_date(term_start: date, weekday: int) -> date:
    return term_start + timedelta(days=(weekday - term_start.weekday()) % 7)


def build_ics(term: Term, sections: list[Section], calendar_name: str = "SDU classes") -> str:
    start = date.fromisoformat(term.start_date)
    end = date.fromisoformat(term.end_date)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SDU Registration Assistant//Schedule Export//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(calendar_name)} · {_escape(term.name)}",
        f"X-WR-TIMEZONE:{TZID}",
        "BEGIN:VTIMEZONE",
        f"TZID:{TZID}",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0500",
        "TZOFFSETTO:+0500",
        "TZNAME:+05",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]
    for section in sections:
        course = section.course
        for meeting in section.meetings:
            day = _first_date(start, meeting.day)
            if day > end:
                continue
            dt_start = f"{day:%Y%m%d}T{fmt_time(meeting.start_min).replace(':', '')}00"
            dt_end = f"{day:%Y%m%d}T{fmt_time(meeting.end_min).replace(':', '')}00"
            location = f"SDU University, room {meeting.room}" if meeting.room else "SDU University"
            details = [f"{section.kind.title()} · Section {section.code}"]
            if section.instructor:
                details.append(f"Instructor: {section.instructor}")
            details.append(f"{course.ects:g} ECTS")
            lines += [
                "BEGIN:VEVENT",
                f"UID:sdu-{term.code}-{section.id}-{meeting.id}@registration-assistant",
                f"DTSTAMP:{stamp}",
                f"DTSTART;TZID={TZID}:{dt_start}",
                f"DTEND;TZID={TZID}:{dt_end}",
                f"RRULE:FREQ=WEEKLY;UNTIL={end:%Y%m%d}T235959",
                f"SUMMARY:{_escape(f'{course.code} {course.title} ({section.kind.title()})')}",
                f"LOCATION:{_escape(location)}",
                f"DESCRIPTION:{_escape(chr(10).join(details))}",
                "CATEGORIES:SDU,Class",
                "END:VEVENT",
            ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
