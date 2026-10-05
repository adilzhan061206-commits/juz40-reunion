"""HTML parsers for pages of the SDU student portal (my.sdu.edu.kz).

The portal renders server-side HTML; the schedule grid and grade tables are loaded by AJAX
POSTs to ``index.php``. A schedule cell looks like::

    CSS 222 Алгоритмы 1 (2+2+0) [4cr / 5ECTS] [02-N] Маматнабиев : E221
    code    title       hours   credits       section instructor  room

Parsers are written defensively: unknown layouts produce empty results, never exceptions.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

CODE_RE = re.compile(r"\b([A-Z]{2,4})\s?(\d{3}[A-Z]?)\b")
TIME_RE = re.compile(r"(\d{1,2}):(\d{2})")
SECTION_RE = re.compile(r"\[(\d{1,2}-[A-Za-z]{1,2})\]")
CREDITS_RE = re.compile(r"\[\s*(\d+(?:[.,]\d+)?)\s*cr\s*/\s*(\d+(?:[.,]\d+)?)\s*ECTS\s*\]", re.I)
HOURS_RE = re.compile(r"\((\d+\+\d+\+\d+)\)")
GRADE_RE = re.compile(r"^(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|F|FX|IP|W|P|AU|I|NP)$")
TERM_VALUE_RE = re.compile(r"^(\d{4})#(\d)$")

DAY_NAMES = {
    # English, Russian and Kazakh short and long names.
    "mon": 0, "monday": 0, "пн": 0, "понедельник": 0, "дс": 0, "дүйсенбі": 0,
    "tue": 1, "tuesday": 1, "вт": 1, "вторник": 1, "сс": 1, "сейсенбі": 1,
    "wed": 2, "wednesday": 2, "ср": 2, "среда": 2, "ср.": 2, "сәрсенбі": 2,
    "thu": 3, "thursday": 3, "чт": 3, "четверг": 3, "бс": 3, "бейсенбі": 3,
    "fri": 4, "friday": 4, "пт": 4, "пятница": 4, "жм": 4, "жұма": 4,
    "sat": 5, "saturday": 5, "сб": 5, "суббота": 5, "сн": 5, "сенбі": 5,
}


def _text(node: Tag | None) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", node.get_text(" ").replace("\xa0", " ")).strip()


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "html.parser")


def normalize_code(raw: str) -> str:
    match = CODE_RE.search((raw or "").upper())
    if not match:
        return (raw or "").strip().upper()
    return f"{match.group(1)} {match.group(2)}"


def section_kind(section_code: str) -> str:
    suffix = section_code.split("-")[-1].upper() if "-" in section_code else ""
    if suffix.startswith("P"):
        return "practice"
    if suffix.startswith("L"):
        return "lab"
    return "lecture"


# ---------------------------------------------------------------- login stages


def looks_authenticated(html: str) -> bool:
    low = (html or "").lower()
    authed = "last login" in low or "mod=schedule" in low or "mod=transkript" in low or "logout" in low
    is_login_page = "loginauth.php" in low and 'name="password"' in low
    return authed and not is_login_page


def detect_login_stage(html: str) -> str:
    """Classify a response of ``loginAuth.php`` as ``ok``, ``otp`` or ``invalid``."""
    if looks_authenticated(html):
        return "ok"
    low = (html or "").lower()
    has_password = 'type="password"' in low or 'name="password"' in low
    mentions_code = any(
        token in low
        for token in ("verif", "otp", "one-time", "код", "e-mail", "authenticat", "6-digit", "6 digit")
    )
    if mentions_code and not has_password:
        return "otp"
    return "invalid"


@dataclass
class OtpForm:
    action: str
    fields: list[tuple[str, str]]
    code_field: str


def parse_otp_form(html: str, base_url: str) -> OtpForm | None:
    soup = _soup(html)
    for form in soup.find_all("form"):
        inputs = form.find_all("input")
        code_input = None
        for candidate in inputs:
            kind = (candidate.get("type") or "text").lower()
            if kind not in {"text", "number", "tel", "password"}:
                continue
            name = (candidate.get("name") or "").lower()
            meta = " ".join([name, candidate.get("id") or "", candidate.get("placeholder") or ""]).lower()
            if re.search(r"code|otp|pin|token|verif|sms|digit|код", meta) or candidate.get("maxlength") == "6":
                code_input = candidate
                break
            if name and name not in {"username", "password"} and code_input is None:
                code_input = candidate
        if code_input is None or not code_input.get("name"):
            continue
        code_field = code_input["name"]
        fields = [
            (i["name"], i.get("value") or "")
            for i in inputs
            if i.get("name") and i.get("name") != code_field and (i.get("type") or "").lower() != "submit"
        ]
        action = urljoin(base_url.rstrip("/") + "/", form.get("action") or "")
        return OtpForm(action=action, fields=fields, code_field=code_field)
    return None


# ---------------------------------------------------------------- profile


@dataclass
class Profile:
    name: str = ""
    advisor: str = ""
    program: str = ""


def parse_profile(html: str) -> Profile:
    body = _text(_soup(html).body or _soup(html))
    labels = ["Name Surname", "Advisor", "Major Program", "Last Login", "System Date"]

    def grab(label: str) -> str:
        stops = "|".join(re.escape(x) for x in labels if x != label)
        match = re.search(rf"{re.escape(label)}\s*:\s*(.+?)\s*(?:{stops}|$)", body)
        return match.group(1).strip() if match else ""

    return Profile(name=grab("Name Surname"), advisor=grab("Advisor"), program=grab("Major Program"))


# ---------------------------------------------------------------- terms


@dataclass
class TermOption:
    year: int
    number: int
    label: str
    selected: bool

    @property
    def code(self) -> str:
        return f"{self.year}-{self.number}"


def parse_terms(html: str) -> list[TermOption]:
    soup = _soup(html)
    found: list[TermOption] = []
    for option in soup.find_all("option"):
        match = TERM_VALUE_RE.match((option.get("value") or "").strip())
        if not match:
            continue
        found.append(
            TermOption(
                year=int(match.group(1)),
                number=int(match.group(2)),
                label=_text(option) or option["value"],
                selected=option.has_attr("selected"),
            )
        )
    if not found:
        match = re.search(r"(\d{4})#(\d)", html or "")
        if match:
            found.append(TermOption(int(match.group(1)), int(match.group(2)), match.group(0), True))
    return found


def selected_term(options: list[TermOption]) -> TermOption | None:
    return next((o for o in options if o.selected), options[0] if options else None)


# ---------------------------------------------------------------- schedule grid


@dataclass
class ScheduleClass:
    code: str
    title: str
    section: str
    kind: str
    day: int
    start_min: int
    end_min: int
    instructor: str = ""
    room: str = ""
    credits: float | None = None
    ects: float | None = None
    hours: str | None = None


def _minutes(hh: str, mm: str) -> int:
    return int(hh) * 60 + int(mm)


def parse_schedule_cell(raw: str) -> list[dict]:
    """Split one grid cell into class descriptions (a cell can hold more than one class)."""
    raw = re.sub(r"\s+", " ", raw or "").strip()
    starts = [m.start() for m in CODE_RE.finditer(raw)]
    chunks: list[str] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(raw)
        chunk = raw[start:end].strip()
        # A code without its own section bracket is part of the previous class's text.
        if chunks and not SECTION_RE.search(chunk):
            chunks[-1] = f"{chunks[-1]} {chunk}"
        else:
            chunks.append(chunk)
    out = []
    for chunk in chunks:
        code_match = CODE_RE.search(chunk)
        if not code_match:
            continue
        after = chunk[code_match.end():]
        title_match = re.match(r"\s*([^(\[]+?)\s*(?:[(\[]|$)", after)
        title = title_match.group(1).strip(" -:") if title_match else ""
        section_match = SECTION_RE.search(chunk)
        section = section_match.group(1).upper() if section_match else "01-N"
        instructor = ""
        room = ""
        if section_match:
            tail = chunk[section_match.end():]
            if ":" in tail:
                instructor, room = (part.strip() for part in tail.split(":", 1))
            else:
                instructor = tail.strip()
        else:
            room_match = re.search(r":\s*([A-Za-z]?-?\d{2,4}[A-Za-z]?)\b", chunk)
            room = room_match.group(1) if room_match else ""
        room = room.split(" ")[0] if room else ""
        credits_match = CREDITS_RE.search(chunk)
        hours_match = HOURS_RE.search(chunk)
        out.append(
            {
                "code": f"{code_match.group(1)} {code_match.group(2)}",
                "title": title or f"{code_match.group(1)} {code_match.group(2)}",
                "section": section,
                "kind": section_kind(section),
                "instructor": instructor[:120],
                "room": room[:40],
                "credits": float(credits_match.group(1).replace(",", ".")) if credits_match else None,
                "ects": float(credits_match.group(2).replace(",", ".")) if credits_match else None,
                "hours": hours_match.group(1) if hours_match else None,
            }
        )
    return out


def _find_schedule_table(soup: BeautifulSoup) -> Tag | None:
    table = soup.select_one("table.clTbl")
    if table:
        return table
    best, best_hits = None, 0
    for candidate in soup.find_all("table"):
        text = _text(candidate)
        hits = len(TIME_RE.findall(text)) + 3 * len(CODE_RE.findall(text))
        if hits > best_hits and CODE_RE.search(text) and TIME_RE.search(text):
            best, best_hits = candidate, hits
    return best


def _table_rows(table: Tag) -> list[Tag]:
    rows: list[Tag] = []
    for row in table.find_all("tr"):
        if row.find_parent("table") is table:
            rows.append(row)
    return rows


def parse_schedule(html: str) -> list[ScheduleClass]:
    """Parse the weekly grid (``table.clTbl``) into merged class meetings."""
    soup = _soup(html)
    table = _find_schedule_table(soup)
    if table is None:
        return []
    rows = _table_rows(table)
    if not rows:
        return []

    # Map columns to week days from the header when possible (default: col 1..6 = Mon..Sat).
    day_for_col: dict[int, int] = {}
    header_cells = rows[0].find_all(["td", "th"], recursive=False)
    for col, cell in enumerate(header_cells):
        name = _text(cell).lower().strip(". ")
        if name in DAY_NAMES:
            day_for_col[col] = DAY_NAMES[name]
        else:
            for token, day in DAY_NAMES.items():
                if len(token) > 3 and name.startswith(token):
                    day_for_col[col] = day
                    break

    # Expand rowspans into a grid of (row, col) -> (cell, origin_row).
    grid: dict[tuple[int, int], tuple[Tag, int]] = {}
    row_times: dict[int, tuple[int, int]] = {}
    for r, row in enumerate(rows):
        col = 0
        for cell in row.find_all(["td", "th"], recursive=False):
            while (r, col) in grid:
                col += 1
            span = max(1, int(cell.get("rowspan", 1) or 1))
            colspan = max(1, int(cell.get("colspan", 1) or 1))
            for dr in range(span):
                for dc in range(colspan):
                    grid[(r + dr, col + dc)] = (cell, r)
            col += colspan
        first = grid.get((r, 0))
        if first:
            times = TIME_RE.findall(_text(first[0]))
            if times:
                start = _minutes(*times[0])
                end = _minutes(*times[1]) if len(times) > 1 else start + 50
                row_times[r] = (start, end)

    if not day_for_col:
        width = max((c for (_, c) in grid), default=0)
        day_for_col = {col: col - 1 for col in range(1, min(width, 6) + 1)}

    seen_cells: set[int] = set()
    slots: list[ScheduleClass] = []
    for (r, col), (cell, origin) in sorted(grid.items()):
        if col not in day_for_col or r != origin or id(cell) in seen_cells:
            continue
        seen_cells.add(id(cell))
        if r not in row_times:
            continue
        span = max(1, int(cell.get("rowspan", 1) or 1))
        last_row = r + span - 1
        while last_row > r and last_row not in row_times:
            last_row -= 1
        start, _ = row_times[r]
        _, end = row_times[last_row]
        for item in parse_schedule_cell(_text(cell)):
            slots.append(ScheduleClass(day=day_for_col[col], start_min=start, end_min=end, **item))

    return merge_consecutive(slots)


def merge_consecutive(slots: list[ScheduleClass], max_gap: int = 15) -> list[ScheduleClass]:
    """Join hourly grid slots of the same class into a single meeting."""
    slots = sorted(slots, key=lambda s: (s.code, s.section, s.day, s.room, s.start_min))
    merged: list[ScheduleClass] = []
    for slot in slots:
        previous = merged[-1] if merged else None
        if (
            previous
            and previous.code == slot.code
            and previous.section == slot.section
            and previous.day == slot.day
            and previous.room == slot.room
            and 0 <= slot.start_min - previous.end_min <= max_gap
        ):
            previous.end_min = max(previous.end_min, slot.end_min)
            continue
        if previous and (previous.code, previous.section, previous.day, previous.start_min) == (
            slot.code,
            slot.section,
            slot.day,
            slot.start_min,
        ):
            continue
        merged.append(slot)
    return sorted(merged, key=lambda s: (s.day, s.start_min, s.code))


# ---------------------------------------------------------------- grades / transcript


@dataclass
class GradeRow:
    code: str
    title: str
    credits: float | None = None
    ects: float | None = None
    grade: str = ""
    term_code: str = ""
    extra: dict = field(default_factory=dict)


def unwrap_ajax(payload: str) -> str:
    """Grade responses are ``{"CODE": "1", "DATA": "<html>"}``; return the HTML part."""
    text = (payload or "").strip()
    if text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict) and isinstance(data.get("DATA"), str):
                return data["DATA"]
        except json.JSONDecodeError:
            pass
    return text


def _number(value: str) -> float | None:
    match = re.search(r"\d+(?:[.,]\d+)?", value or "")
    return float(match.group(0).replace(",", ".")) if match else None


TERM_HEADING_RE = re.compile(r"(\d{4})\s*[-/–]\s*(\d{4})\D{0,40}?([12]|fall|spring|осен|весен|күз|көктем)", re.I)


def _term_from_heading(text: str) -> str:
    match = TERM_HEADING_RE.search(text or "")
    if not match:
        return ""
    year = int(match.group(1))
    token = match.group(3).lower()
    number = 2 if token in {"2"} or token.startswith(("spring", "весен", "көктем")) else 1
    return f"{year}-{number}"


def parse_grade_rows(html: str, term_code: str = "") -> list[GradeRow]:
    """Parse grade/transcript tables: any row with a course-code cell followed by a title."""
    soup = _soup(unwrap_ajax(html))
    rows: list[GradeRow] = []
    seen: set[tuple[str, str]] = set()
    current_term = term_code
    for element in soup.find_all(["tr", "h1", "h2", "h3", "h4", "caption", "th"]):
        if element.name != "tr":
            detected = _term_from_heading(_text(element))
            if detected and not term_code:
                current_term = detected
            continue
        cells = [_text(c) for c in element.find_all(["td", "th"], recursive=False)]
        if not cells:
            continue
        joined = " ".join(cells)
        if len(cells) <= 2:
            detected = _term_from_heading(joined)
            if detected and not term_code:
                current_term = detected
            continue
        code_index = next((i for i, c in enumerate(cells) if re.fullmatch(r"[A-Z]{2,4}\s?\d{3}[A-Z]?", c)), -1)
        if code_index < 0:
            continue
        code = normalize_code(cells[code_index])
        title = cells[code_index + 1] if code_index + 1 < len(cells) else code
        rest = cells[code_index + 2:]
        numbers = [_number(c) for c in rest if re.fullmatch(r"\d+(?:[.,]\d+)?", c)]
        grade = next((c for c in reversed(rest) if GRADE_RE.match(c)), "")
        key = (code, current_term)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            GradeRow(
                code=code,
                title=title,
                credits=numbers[0] if numbers else None,
                ects=numbers[1] if len(numbers) > 1 else None,
                grade=grade,
                term_code=current_term,
            )
        )
    return rows


# ---------------------------------------------------------------- curriculum ("My Curriculum" page)

ELECTIVE_TAG_RE = re.compile(r"\[\s*([A-Z]{1,4})\s*\]")


@dataclass
class CurriculumRow:
    semester: int
    code: str  # real course code, or "" for an elective slot nobody has chosen yet
    title: str
    ects: float | None = None
    credits: float | None = None
    grade: str = ""
    status: str = "not_taken"  # completed | in_progress | failed | not_taken
    elective_type: str | None = None  # NAE, AE, NTE … for elective slots
    options: list[str] = field(default_factory=list)  # course codes allowed in an elective slot
    has_requisites: bool = False


@dataclass
class Curriculum:
    program: str = ""
    rows: list[CurriculumRow] = field(default_factory=list)


def find_menu_link(html: str, *labels: str) -> str | None:
    """Return the href of the portal menu entry whose text matches one of ``labels``."""
    soup = _soup(html)
    wanted = [label.lower() for label in labels]
    for anchor in soup.find_all("a", href=True):
        text = _text(anchor).lower()
        if any(text == w or text.startswith(w) for w in wanted):
            return anchor["href"]
    return None


def _row_status(grade: str, status_text: str) -> str:
    grade = grade.upper()
    if grade in {"F", "FX", "NP"}:
        return "failed"
    if grade == "IP":
        return "in_progress"
    if GRADE_RE.match(grade) and grade not in {"W", "I", "AU"}:
        return "completed"
    if "taken" in status_text.lower() and "not" not in status_text.lower():
        return "in_progress"
    return "not_taken"


def parse_curriculum(html: str) -> Curriculum:
    """Parse my.sdu "My Curriculum": one table per semester (in order), columns
    № · course code · name · teor · pr · cr · ects · grade · requisites · status · Syllabus."""
    soup = _soup(html)
    result = Curriculum()
    for candidate in soup.find_all(["h1", "h2", "h3", "h4", "div", "span", "b", "font", "td"]):
        text = _text(candidate)
        if re.fullmatch(r"\d{4}\s*-\s*.{3,80}", text) and re.search(r"[A-Za-z]{3}", text) and len(text) < 90:
            result.program = text
            break

    semester = 0
    for table in soup.find_all("table"):
        rows = _table_rows(table)
        if not rows:
            continue
        header = [_text(c).lower() for c in rows[0].find_all(["td", "th"], recursive=False)]
        if not any("course code" in h or h == "code" for h in header) or "ects" not in header:
            continue
        semester += 1

        def col(*names: str) -> int:
            return next((i for i, h in enumerate(header) if h in names), -1)

        c_code, c_name = col("course code", "code"), col("name", "course name")
        c_cr, c_ects, c_grade = col("cr", "credits"), col("ects"), col("grade")
        c_req, c_status = col("requisites", "prerequisites"), col("status")
        for row in rows[1:]:
            cells = row.find_all(["td", "th"], recursive=False)
            if len(cells) < max(c_code, c_name, c_ects) + 1:
                continue

            def cell(i: int) -> str:
                return _text(cells[i]) if 0 <= i < len(cells) else ""

            code_text, name_text = cell(c_code), cell(c_name)
            if not code_text and not name_text:
                continue
            codes = [f"{a} {b}" for a, b in CODE_RE.findall(code_text.upper())]
            is_slot = code_text.upper().startswith("XXX") or "[" in name_text
            tag = ELECTIVE_TAG_RE.search(name_text)
            title = ELECTIVE_TAG_RE.sub("", name_text).replace("*", "").strip(" -")
            options: list[str] = []
            if is_slot:
                inside = re.search(r"\(([^)]*)\)\s*$", title)
                if inside:
                    options = [f"{a} {b}" for a, b in CODE_RE.findall(inside.group(1).upper())]
                    title = title[: inside.start()].strip()
            grade = cell(c_grade).upper()
            result.rows.append(CurriculumRow(
                semester=semester,
                code=codes[0] if codes else "",
                title=title or code_text,
                ects=_number(cell(c_ects)),
                credits=_number(cell(c_cr)),
                grade=grade if GRADE_RE.match(grade) else "",
                status=_row_status(grade, cell(c_status)),
                elective_type=tag.group(1) if tag else ("ELECTIVE" if is_slot else None),
                options=options,
                has_requisites=bool(cell(c_req)),
            ))
    return result
