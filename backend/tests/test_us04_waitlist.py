"""US4QATest — Waitlist Auto-Enrollment."""

import pytest
from sqlalchemy import select

from conftest import enroll_direct, login, make_course, make_section, make_student
from app.models import Enrollment, Notification, WaitlistEntry


@pytest.fixture()
def full_section(client, db):
    make_course(db, "TST 201", "Waitlisted Course")
    sec = make_section(db, "TST 201", "2026-2", "01-N", "lecture", [(1, "09:30", "11:20")], capacity=1)
    holder = make_student(db, "holder@sdu.demo", "Seat Holder")
    enroll_direct(db, holder, sec)
    first = make_student(db, "first@sdu.demo", "First In Line")
    second = make_student(db, "second@sdu.demo", "Second In Line")
    for student in (first, second):
        login(client, student.email)
        assert client.post("/api/waitlist", json={"section_id": sec.id}).status_code == 201
    return sec, holder, first, second


def _status(db, student, sec):
    db.expire_all()
    return db.scalar(select(WaitlistEntry.status).where(WaitlistEntry.user_id == student.id,
                                                        WaitlistEntry.section_id == sec.id))


def _enrolled(db, student, sec):
    db.expire_all()
    return db.scalar(select(Enrollment).where(Enrollment.user_id == student.id, Enrollment.section_id == sec.id,
                                              Enrollment.status == "enrolled")) is not None


def _drop_holder(client, sec, holder):
    login(client, holder.email)
    assert client.post(f"/api/enrollments/{sec.id}/drop").status_code == 200


def test_scenario1_first_in_line_is_enrolled_and_notified(client, db, full_section):
    sec, holder, first, second = full_section
    _drop_holder(client, sec, holder)
    assert _enrolled(db, first, sec)
    assert _status(db, first, sec) == "enrolled"
    assert not _enrolled(db, second, sec)
    note = db.scalar(select(Notification).where(Notification.user_id == first.id, Notification.kind == "enrolled"))
    assert note is not None and "TST 201" in note.title


def test_scenario2_conflict_skips_to_next_eligible_student(client, db, full_section):
    sec, holder, first, second = full_section
    make_course(db, "TST 202", "Clashing Course")
    clash = make_section(db, "TST 202", "2026-2", "01-N", "lecture", [(1, "10:30", "11:20")])
    enroll_direct(db, first, clash)
    _drop_holder(client, sec, holder)
    assert _status(db, first, sec) == "skipped"
    assert _enrolled(db, second, sec)
    note = db.scalar(select(Notification).where(Notification.user_id == first.id, Notification.kind == "waitlist"))
    assert "conflict" in note.body.lower()


def test_scenario3_financial_hold_flags_account_and_keeps_priority(client, db, full_section):
    sec, holder, first, second = full_section
    first.financial_hold = True
    db.commit()
    _drop_holder(client, sec, holder)
    assert _status(db, first, sec) == "held"
    note = db.scalar(select(Notification).where(Notification.user_id == first.id, Notification.kind == "waitlist"))
    assert "24 hours" in note.body
    assert _enrolled(db, second, sec)  # the seat is not wasted

    # The hold is resolved within 24 hours and another seat opens: the student is still first in line.
    login(client, "admin@sdu.demo", "admin2026")
    assert client.patch(f"/api/admin/users/{first.id}", json={"financial_hold": False}).status_code == 200
    assert client.patch(f"/api/admin/sections/{sec.id}", json={"capacity": 2}).status_code == 200
    assert _enrolled(db, first, sec)


def test_cannot_join_waitlist_for_open_section(client, db):
    make_course(db, "TST 203", "Open Course")
    sec = make_section(db, "TST 203", "2026-2", "01-N", "lecture", [(2, "09:30", "10:20")], capacity=5)
    login(client)
    assert client.post("/api/waitlist", json={"section_id": sec.id}).status_code == 400
