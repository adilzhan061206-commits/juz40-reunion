import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("SEED_DEMO", "true")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import db as database  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Course, Section, Term, User  # noqa: E402
from app.security import login_limiter  # noqa: E402


@pytest.fixture()
def client(tmp_path):
    database.configure(f"sqlite:///{tmp_path / 'test.db'}")
    login_limiter.reset()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def db(client):
    session = database.SessionLocal()
    yield session
    session.close()


def login(client, email="student@sdu.demo", password="student2026"):
    client.cookies.clear()
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["user"]


def term(db, code="2026-2") -> Term:
    return db.scalar(select(Term).where(Term.code == code))


def course(db, code) -> Course:
    return db.scalar(select(Course).where(Course.code == code))


def section(db, code, section_code, term_code="2026-2") -> Section:
    return db.scalar(
        select(Section).join(Course).join(Term).where(
            Course.code == code, Section.code == section_code, Term.code == term_code
        )
    )


def user(db, email) -> User:
    return db.scalar(select(User).where(User.email == email))


def detail(response):
    data = response.json().get("detail")
    return data.get("message") if isinstance(data, dict) else data


def make_section(db, course_code, term_code, code, kind, meetings, capacity=30):
    """Create a section with meetings given as (day, "HH:MM", "HH:MM")."""
    from app.models import Meeting

    def minutes(value):
        hh, mm = value.split(":")
        return int(hh) * 60 + int(mm)

    sec = Section(course_id=course(db, course_code).id, term_id=term(db, term_code).id, code=code, kind=kind,
                  capacity=capacity, instructor="Test Instructor")
    for day, start, end in meetings:
        sec.meetings.append(Meeting(day=day, start_min=minutes(start), end_min=minutes(end), room="T100"))
    db.add(sec)
    db.commit()
    return sec


def make_course(db, code, title="Test Course", ects=5):
    db.add(Course(code=code, title=title, ects=ects, credits=3))
    db.commit()
    return course(db, code)


def make_student(db, email, name="Test Student", department="CSS", program="CS-BSC", password="student2026"):
    from app.models import Department, Program
    from app.security import hash_password

    dept = db.scalar(select(Department).where(Department.code == department))
    prog = db.scalar(select(Program).where(Program.code == program))
    student = User(name=name, email=email, password_hash=hash_password(password), role="student",
                   department_id=dept.id, program_id=prog.id)
    db.add(student)
    db.commit()
    return student


def enroll_direct(db, user_obj, sec):
    from app.models import Enrollment

    db.add(Enrollment(user_id=user_obj.id, section_id=sec.id, status="enrolled"))
    db.commit()


def complete_course(db, user_obj, code, grade="B"):
    from app.models import TranscriptEntry

    db.add(TranscriptEntry(user_id=user_obj.id, course_id=course(db, code).id, term_code="2025-2", grade=grade,
                           status="completed"))
    db.commit()
