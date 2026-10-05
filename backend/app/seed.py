"""Demo catalogue in the my.sdu.edu.kz format, so the app is usable before anybody syncs.

Real data replaces it as students sign in with their SDU accounts (their own schedule, grades
and courses are imported) and as admins import schedule grids saved from the portal.
"""

from __future__ import annotations

import logging
import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import (
    Course,
    Department,
    Enrollment,
    Meeting,
    Notification,
    OverrideRequest,
    Prerequisite,
    Program,
    RequirementCourse,
    RequirementGroup,
    SeatAlert,
    Section,
    Term,
    TranscriptEntry,
    User,
    WaitlistEntry,
    now,
)
from .security import hash_password
from .services.season import semester_season, term_season

log = logging.getLogger("registration.seed")

DEPARTMENTS = [
    ("CSS", "Computer Sciences"),
    ("MAT", "Mathematics and Natural Sciences"),
    ("GEN", "Humanities and Languages"),
    ("BUS", "SDU Business School"),
]

TERMS = [
    ("2025-1", "Fall 2025", "2025-09-01", "2025-12-25", False, False),
    ("2025-2", "Spring 2026", "2026-01-19", "2026-05-23", False, False),
    ("2026-1", "Fall 2026", "2026-09-01", "2026-12-25", True, True),
    ("2026-2", "Spring 2027", "2027-01-18", "2027-05-22", False, True),
    ("2027-1", "Fall 2027", "2027-09-01", "2027-12-24", False, False),
]

# code, title, dept, ects, credits, hours (lecture+practice+lab), prerequisites, corequisites
COURSES = [
    ("HIS 100", "Modern History of Kazakhstan", "GEN", 5, 3, "2+1+0", [], []),
    ("PHL 101", "Philosophy", "GEN", 5, 3, "2+1+0", [], []),
    ("KAZ 101", "Kazakh Language I", "GEN", 5, 3, "0+3+0", [], []),
    ("KAZ 102", "Kazakh Language II", "GEN", 5, 3, "0+3+0", ["KAZ 101"], []),
    ("ENG 101", "Academic English", "GEN", 5, 3, "0+3+0", [], []),
    ("ENG 102", "Professional English", "GEN", 5, 3, "0+3+0", ["ENG 101"], []),
    ("INF 106", "Information and Communication Technologies", "CSS", 5, 3, "1+0+2", [], []),
    ("SOC 101", "Social Sciences Module", "GEN", 5, 3, "2+1+0", [], []),
    ("MAT 151", "Calculus I", "MAT", 6, 4, "2+2+0", [], []),
    ("MAT 152", "Calculus II", "MAT", 6, 4, "2+2+0", ["MAT 151"], []),
    ("MAT 201", "Linear Algebra", "MAT", 5, 3, "2+1+0", ["MAT 151"], []),
    ("MAT 220", "Discrete Mathematics", "MAT", 5, 3, "2+1+0", [], []),
    ("MAT 251", "Probability and Statistics", "MAT", 5, 3, "2+1+0", ["MAT 152"], []),
    ("PHY 151", "Physics I", "MAT", 6, 4, "2+1+1", [], ["MAT 151"]),
    ("CSS 105", "Fundamentals of Programming", "CSS", 6, 4, "2+0+2", [], []),
    ("CSS 106", "Object-Oriented Programming", "CSS", 6, 4, "2+0+2", ["CSS 105"], []),
    ("CSS 215", "Data Structures", "CSS", 6, 4, "2+0+2", ["CSS 106"], []),
    ("CSS 222", "Algorithms 1", "CSS", 5, 3, "2+2+0", ["CSS 215", "MAT 220"], []),
    ("CSS 223", "Algorithms Laboratory", "CSS", 2, 1, "0+0+2", [], ["CSS 222"]),
    ("CSS 225", "Database Management Systems", "CSS", 6, 4, "2+0+2", ["CSS 105"], []),
    ("CSS 231", "Operating Systems", "CSS", 5, 3, "2+0+2", ["CSS 215"], []),
    ("CSS 217", "Software Architecture and Design Patterns", "CSS", 5, 3, "2+1+0", ["CSS 106"], []),
    ("CSS 302", "Computer Networks", "CSS", 5, 3, "2+0+2", ["CSS 231"], []),
    ("CSS 309", "Software Engineering", "CSS", 5, 3, "2+1+0", ["CSS 217"], []),
    ("CSS 311", "Web Development", "CSS", 5, 3, "1+0+2", ["CSS 225"], []),
    ("CSS 401", "Senior Project I", "CSS", 6, 4, "0+2+0", ["CSS 309"], []),
    ("CSS 318", "Machine Learning", "CSS", 6, 4, "2+0+2", ["MAT 251", "CSS 215"], []),
    ("CSS 324", "Mobile Application Development", "CSS", 5, 3, "1+0+2", ["CSS 106"], []),
    ("CSS 342", "Computer Graphics", "CSS", 5, 3, "2+0+1", ["MAT 201", "CSS 106"], []),
    ("CSS 350", "Information Security", "CSS", 5, 3, "2+1+0", ["CSS 231"], []),
    ("CSS 356", "Cloud Computing", "CSS", 5, 3, "2+0+1", ["CSS 225"], []),
    ("CSS 361", "Human-Computer Interaction", "CSS", 5, 3, "2+1+0", ["CSS 105"], []),
    ("BUS 101", "Principles of Management", "BUS", 5, 3, "2+1+0", [], []),
    ("ECO 101", "Microeconomics", "BUS", 5, 3, "2+1+0", [], []),
    ("ACC 201", "Financial Accounting", "BUS", 6, 4, "2+2+0", ["BUS 101"], []),
    ("MKT 202", "Principles of Marketing", "BUS", 5, 3, "2+1+0", ["BUS 101"], []),
    ("FIN 301", "Corporate Finance", "BUS", 6, 4, "2+2+0", ["ACC 201"], []),
    ("MGT 305", "Organizational Behaviour", "BUS", 5, 3, "2+1+0", ["BUS 101"], []),
    ("BUS 320", "Entrepreneurship", "BUS", 5, 3, "2+1+0", ["BUS 101"], []),
    ("BUS 330", "Business Analytics", "BUS", 5, 3, "2+0+1", ["MAT 251"], []),
]

DESCRIPTIONS = {
    "CSS 105": "Problem solving with a modern programming language: variables, control flow, functions, arrays.",
    "CSS 215": "Lists, stacks, queues, trees, heaps, hashing and graphs, with complexity analysis.",
    "CSS 222": "Design and analysis of algorithms: divide and conquer, greedy methods, dynamic programming.",
    "CSS 318": "Supervised and unsupervised learning, model evaluation, and practical ML pipelines.",
}

CS_PROGRAM = [
    ("General Education", "general", "required", 0,
     [("ENG 101", 1), ("KAZ 101", 1), ("INF 106", 1), ("HIS 100", 1), ("ENG 102", 2), ("KAZ 102", 2),
      ("PHL 101", 2), ("SOC 101", 3)]),
    ("Mathematics & Science", "science", "required", 0,
     [("MAT 151", 1), ("PHY 151", 1), ("MAT 152", 2), ("MAT 220", 2), ("MAT 201", 3), ("MAT 251", 4)]),
    ("Core Major", "core", "required", 0,
     [("CSS 105", 1), ("CSS 106", 2), ("CSS 215", 3), ("CSS 225", 3), ("CSS 222", 4), ("CSS 223", 4),
      ("CSS 231", 4), ("CSS 217", 4), ("CSS 302", 5), ("CSS 309", 5), ("CSS 311", 5), ("CSS 401", 7)]),
    ("Major Electives", "elective", "elective", 20,
     [("CSS 318", 5), ("CSS 324", 5), ("CSS 342", 6), ("CSS 350", 6), ("CSS 356", 6), ("CSS 361", 5)]),
]

BUS_PROGRAM = [
    ("General Education", "general", "required", 0,
     [("ENG 101", 1), ("KAZ 101", 1), ("HIS 100", 1), ("ENG 102", 2), ("PHL 101", 2), ("SOC 101", 3)]),
    ("Business Core", "core", "required", 0,
     [("BUS 101", 1), ("ECO 101", 1), ("ACC 201", 2), ("MKT 202", 3), ("MGT 305", 3), ("FIN 301", 4)]),
    ("Business Electives", "elective", "elective", 10, [("BUS 320", 4), ("BUS 330", 5)]),
]

INSTRUCTORS = {
    "CSS": ["A. Seitkali", "D. Nurlanuly", "M. Zhaksylykova", "T. Abenov", "G. Kairatkyzy", "R. Sultanov"],
    "MAT": ["B. Yerzhanov", "S. Temirova", "K. Mukanov", "L. Ospanova"],
    "GEN": ["J. Miller", "A. Dzhumabayeva", "N. Kassymova", "E. Bolatov", "H. Carter"],
    "BUS": ["Z. Tulegenova", "F. Amanov", "P. Novak"],
}
ROOMS = ["A101", "A204", "B112", "B305", "C210", "D102", "E221", "E305", "F105", "F201", "G301", "G304"]
SLOTS = [8 * 60 + 30 + 60 * i for i in range(10)]  # 08:30 .. 17:30, 50-minute periods
FULL_SECTIONS_2027 = {("CSS 342", "01-N"), ("CSS 342", "02-N"), ("CSS 342", "01-L"), ("CSS 342", "02-L"),
                      ("CSS 222", "01-P")}

FIRST_NAMES = ["Aibek", "Aizere", "Alikhan", "Amina", "Arman", "Aruzhan", "Asel", "Bekzat", "Dana", "Daniyar",
               "Dilnaz", "Erlan", "Inkar", "Kamila", "Madi", "Madina", "Nurlan", "Sanzhar", "Tomiris", "Zhansaya"]
LAST_NAMES = ["Abdrakhmanov", "Bekov", "Dauletov", "Ermekov", "Iskakov", "Kenzhebekov", "Mukhtarov", "Nurpeisov",
              "Omarov", "Sadykov", "Tokhtarov", "Zhumabekov"]


def _meetings(rng: random.Random, hours: int, used: set[tuple[int, int]]) -> list[tuple[int, int, int, str]]:
    """Place ``hours`` weekly periods as 1–2 meetings that avoid already used (day, slot) pairs."""
    room = rng.choice(ROOMS)
    blocks = [2] * (hours // 2) + [1] * (hours % 2)
    out = []
    for length in blocks:
        for _ in range(60):
            day = rng.randrange(0, 5) if rng.random() > 0.08 else 5
            slot = rng.randrange(0, len(SLOTS) - length + 1)
            cells = {(day, slot + k) for k in range(length)}
            if cells & used:
                continue
            used |= cells
            start = SLOTS[slot]
            out.append((day, start, start + 60 * length - 10, room))
            break
    return out


def _make_sections(db: Session, rng: random.Random, course: Course, term: Term, scale: int = 1) -> list[Section]:
    lecture, practice, lab = (int(x) for x in (course.hours or "2+1+0").split("+"))
    dept = course.department.code if course.department else "GEN"
    plan = []
    big = course.code.startswith(("ENG", "KAZ", "HIS", "PHL", "SOC", "MAT 151", "CSS 105"))
    if lecture:
        plan += [("lecture", f"{i:02d}-N", lecture, rng.choice([60, 75, 90])) for i in range(1, (3 if big else 2) + 1)]
    if practice:
        plan += [("practice", f"{i:02d}-P", practice, rng.choice([25, 28, 30])) for i in range(1, (4 if big else 3) + 1)]
    if lab:
        plan += [("lab", f"{i:02d}-L", lab, rng.choice([18, 20, 24])) for i in range(1, 3)]
    sections = []
    for kind, code, hours, capacity in plan:
        used: set[tuple[int, int]] = set()
        section = Section(course_id=course.id, term_id=term.id, code=code, kind=kind,
                          instructor=rng.choice(INSTRUCTORS[dept]), capacity=capacity * scale, source="catalog")
        for day, start, end, room in _meetings(rng, hours, used):
            section.meetings.append(Meeting(day=day, start_min=start, end_min=end, room=room))
        db.add(section)
        sections.append(section)
    return sections


def seed(db: Session) -> None:
    ensure_admin(db)
    if not settings.seed_demo or db.scalar(select(Term.id).limit(1)) is not None:
        db.commit()
        return
    log.info("Seeding demo catalogue")
    depts = {code: Department(code=code, name=name) for code, name in DEPARTMENTS}
    db.add_all(depts.values())
    terms = {code: Term(code=code, name=name, start_date=s, end_date=e, is_current=cur, registration_open=open_)
             for code, name, s, e, cur, open_ in TERMS}
    db.add_all(terms.values())
    db.flush()

    courses: dict[str, Course] = {}
    for code, title, dept, ects, credits, hours, _, _ in COURSES:
        courses[code] = Course(code=code, title=title, department_id=depts[dept].id, ects=ects, credits=credits,
                               hours=hours, description=DESCRIPTIONS.get(code), source="catalog")
    db.add_all(courses.values())
    db.flush()
    for code, *_, pre, co in COURSES:
        for req in pre:
            db.add(Prerequisite(course_id=courses[code].id, requires_id=courses[req].id, kind="pre"))
        for req in co:
            db.add(Prerequisite(course_id=courses[code].id, requires_id=courses[req].id, kind="co"))

    programs = {}
    for pcode, name, dept, groups in [("CS-BSC", "BSc Computer Science", "CSS", CS_PROGRAM),
                                      ("BA-BUS", "BA Business Administration", "BUS", BUS_PROGRAM)]:
        program = Program(code=pcode, name=name, department_id=depts[dept].id, total_ects=240)
        db.add(program)
        db.flush()
        for sort, (gname, category, kind, ects_required, items) in enumerate(groups):
            group = RequirementGroup(program_id=program.id, name=gname, category=category, kind=kind,
                                     ects_required=ects_required, sort=sort)
            db.add(group)
            db.flush()
            for code, semester in items:
                db.add(RequirementCourse(group_id=group.id, course_id=courses[code].id, semester=semester))
        programs[pcode] = program
    db.flush()

    rng = random.Random(2026)
    sections_by_term: dict[str, list[Section]] = {}
    # Fall terms (code "-1") offer odd-semester courses, spring terms ("-2") even-semester ones.
    semester_of: dict[str, int] = {}
    for groups in (CS_PROGRAM, BUS_PROGRAM):
        for *_, items in groups:
            for code, semester in items:
                semester_of[code] = min(semester, semester_of.get(code, semester))
    for tcode in ("2025-1", "2025-2", "2026-1", "2026-2", "2027-1"):
        sections_by_term[tcode] = []
        for code, course in courses.items():
            semester = semester_of.get(code)
            if semester and semester_season(semester) != term_season(terms[tcode]):
                continue
            if tcode.startswith("2025") and code.startswith(("CSS 3", "CSS 4")):
                continue
            sections_by_term[tcode] += _make_sections(db, rng, course, terms[tcode])
    db.flush()

    # --- people -------------------------------------------------------------------------------------------
    demo_pw = hash_password("student2026")
    advisor_pw = hash_password("advisor2026")
    student = User(name="Aigerim Bekova", email="student@sdu.demo", password_hash=demo_pw, role="student",
                   department_id=depts["CSS"].id, program_id=programs["CS-BSC"].id, sdu_id="230107001")
    bus_student = User(name="Dias Nurlanov", email="business@sdu.demo", password_hash=demo_pw, role="student",
                       department_id=depts["BUS"].id, program_id=programs["BA-BUS"].id, sdu_id="230305002")
    cs_advisor = User(name="Dr. Saule Akhmetova", email="advisor.cs@sdu.demo", password_hash=advisor_pw,
                      role="advisor", department_id=depts["CSS"].id)
    bus_advisor = User(name="Dr. Nurlan Omarov", email="advisor.bus@sdu.demo", password_hash=advisor_pw,
                       role="advisor", department_id=depts["BUS"].id)
    db.add_all([student, bus_student, cs_advisor, bus_advisor])
    db.flush()

    history = {
        "2025-1": [("CSS 105", "A-"), ("MAT 151", "B+"), ("ENG 101", "A"), ("INF 106", "A"), ("HIS 100", "B"),
                   ("KAZ 101", "A-"), ("PHY 151", "B-")],
        "2025-2": [("CSS 106", "B+"), ("MAT 152", "C-"), ("MAT 220", "B"), ("ENG 102", "A-"), ("KAZ 102", "B+"),
                   ("PHL 101", "B")],
    }
    for tcode, rows in history.items():
        for code, grade in rows:
            db.add(TranscriptEntry(user_id=student.id, course_id=courses[code].id, term_code=tcode, grade=grade,
                                   status="completed", source="sdu"))
    for code, grade in [("BUS 101", "A"), ("ECO 101", "B+"), ("ENG 101", "B"), ("HIS 100", "A-"), ("KAZ 101", "B")]:
        db.add(TranscriptEntry(user_id=bus_student.id, course_id=courses[code].id, term_code="2025-1", grade=grade,
                               status="completed", source="sdu"))

    def pick(tcode: str, code: str, kind: str, index: int = 0) -> Section:
        options = [s for s in sections_by_term[tcode] if s.course_id == courses[code].id and s.kind == kind]
        return options[index % len(options)]

    load: dict[int, int] = {}
    chosen: dict[int, list[Section]] = {}

    def enroll_course(user: User, tcode: str, code: str) -> None:
        taken = chosen.setdefault(user.id, [])
        for kind in ("lecture", "practice", "lab"):
            options = [s for s in sections_by_term[tcode] if s.course_id == courses[code].id and s.kind == kind]
            rng.shuffle(options)
            for option in options:
                if load.get(option.id, 0) < option.capacity - 2 and not any(_overlaps(option, t) for t in taken):
                    db.add(Enrollment(user_id=user.id, section_id=option.id, source="sdu"))
                    load[option.id] = load.get(option.id, 0) + 1
                    taken.append(option)
                    break

    for code in ("CSS 215", "CSS 225", "MAT 201", "SOC 101"):
        enroll_course(student, "2026-1", code)
    for code in ("MKT 202", "MGT 305", "SOC 101"):
        enroll_course(bus_student, "2026-1", code)
    db.flush()

    # Classmates fill seats so availability, waitlists and alerts are realistic.
    classmates = []
    for i in range(36):
        name = f"{FIRST_NAMES[i % len(FIRST_NAMES)]} {LAST_NAMES[(i * 7) % len(LAST_NAMES)]}"
        classmate = User(name=name, role="student", department_id=depts["CSS"].id, program_id=programs["CS-BSC"].id,
                         sdu_id=f"2401{i:05d}")
        classmates.append(classmate)
    db.add_all(classmates)
    db.flush()
    for i, classmate in enumerate(classmates):
        for code in rng.sample(["CSS 215", "CSS 225", "MAT 201", "SOC 101", "CSS 361", "CSS 324"], 3):
            enroll_course(classmate, "2026-1", code)
        db.add(TranscriptEntry(user_id=classmate.id, course_id=courses["CSS 105"].id, term_code="2025-1",
                               grade="B", status="completed"))
    db.flush()

    for code, section_code in FULL_SECTIONS_2027:
        section = next(s for s in sections_by_term["2026-2"]
                       if s.course_id == courses[code].id and s.code == section_code)
        section.capacity = 6 if section.kind != "lecture" else 8
        for classmate in classmates[: section.capacity]:
            db.add(Enrollment(user_id=classmate.id, section_id=section.id, source="portal"))
    db.flush()
    ml_lecture = pick("2026-2", "CSS 342", "lecture")
    for offset, classmate in enumerate(classmates[10:12]):
        db.add(WaitlistEntry(user_id=classmate.id, section_id=ml_lecture.id, created_at=now() - 3600 * (5 - offset)))
    db.add(SeatAlert(user_id=classmates[13].id, section_id=ml_lecture.id, channels="push,email"))

    db.add(OverrideRequest(student_id=classmates[3].id, term_id=terms["2026-2"].id, kind="prerequisite_waiver",
                           course_id=courses["CSS 350"].id,
                           reason="I completed an operating systems course during my exchange semester at TU Berlin "
                                  "and attached the syllabus. Requesting a waiver for CSS 231."))
    db.add(OverrideRequest(student_id=classmates[5].id, term_id=terms["2026-2"].id, kind="credit_overload",
                           requested_ects=43,
                           reason="I need one extra course to graduate on time; my GPA last term was 3.8."))
    db.add(OverrideRequest(student_id=bus_student.id, term_id=terms["2026-2"].id, kind="credit_overload",
                           requested_ects=41, reason="Planning to take Business Analytics together with my core load."))

    db.add(Notification(user_id=student.id, kind="welcome", title="Welcome to the SDU Registration Assistant",
                        body="Spring 2027 registration is open. Start with Recommendations or the Auto Scheduler.",
                        link="/recommendations"))
    db.commit()
    log.info("Demo catalogue ready")


def _overlaps(a: Section, b: Section) -> bool:
    return any(m.day == n.day and m.start_min < n.end_min and n.start_min < m.end_min
               for m in a.meetings for n in b.meetings)


def ensure_admin(db: Session) -> None:
    if not settings.admin_email or not settings.admin_password:
        return
    if settings.is_production and settings.admin_password == "admin2026":
        log.warning("Set ADMIN_PASSWORD to create the administrator account in production.")
        return
    if db.scalar(select(User.id).where(User.email == settings.admin_email.lower())):
        return
    db.add(User(name="Registrar Office", email=settings.admin_email.lower(),
                password_hash=hash_password(settings.admin_password), role="admin"))
    db.flush()
