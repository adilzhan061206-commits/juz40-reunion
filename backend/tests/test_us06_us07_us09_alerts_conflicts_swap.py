"""US6QATest (seat alerts), US7QATest (conflict resolver), US9QATest (section swap)."""

from sqlalchemy import select

from conftest import detail, enroll_direct, login, make_course, make_section, make_student, section, term
from app.models import Enrollment, Notification


# ---------------------------------------------------------------- US6


def _full_section(db, code, holder_email):
    make_course(db, code, f"Popular {code}")
    sec = make_section(db, code, "2026-2", "01-N", "lecture", [(3, "14:30", "16:20")], capacity=1)
    holder = make_student(db, holder_email)
    enroll_direct(db, holder, sec)
    return sec, holder


def test_us6_scenario1_alert_sent_when_seat_opens(client, db):
    sec, holder = _full_section(db, "ALR 101", "alr-holder@sdu.demo")
    watcher = make_student(db, "watcher@sdu.demo")
    login(client, watcher.email)
    assert client.post("/api/alerts", json={"section_id": sec.id, "channels": ["push", "email"]}).status_code == 201
    login(client, holder.email)
    client.post(f"/api/enrollments/{sec.id}/drop")
    note = db.scalar(select(Notification).where(Notification.user_id == watcher.id,
                                                Notification.kind == "seat_alert"))
    assert note is not None
    assert note.link.startswith("/registration")  # direct link to the registration page


def test_us6_no_alert_for_section_still_full(client, db):
    sec, holder = _full_section(db, "ALR 102", "alr-holder2@sdu.demo")
    waiting = make_student(db, "waiting@sdu.demo")
    watcher = make_student(db, "watcher2@sdu.demo")
    login(client, waiting.email)
    client.post("/api/waitlist", json={"section_id": sec.id})
    login(client, watcher.email)
    client.post("/api/alerts", json={"section_id": sec.id})
    login(client, holder.email)
    client.post(f"/api/enrollments/{sec.id}/drop")  # the waitlisted student takes the seat at once
    assert db.scalar(select(Notification).where(Notification.user_id == watcher.id,
                                                Notification.kind == "seat_alert")) is None


def test_us6_scenario2_subscription_limit_of_five(client, db):
    watcher = make_student(db, "limit@sdu.demo")
    sections = [_full_section(db, f"ALR {200 + i}", f"h{i}@sdu.demo")[0] for i in range(6)]
    login(client, watcher.email)
    for sec in sections[:5]:
        assert client.post("/api/alerts", json={"section_id": sec.id}).status_code == 201
    response = client.post("/api/alerts", json={"section_id": sections[5].id})
    assert response.status_code == 400
    assert detail(response) == "Maximum seat alert limit of 5 courses reached"


# ---------------------------------------------------------------- US7


def test_us7_scenario1_conflict_flagged_with_open_alternatives(client, db):
    login(client)
    first = section(db, "CSS 217", "01-N")
    clash = first.meetings[0]
    make_course(db, "MDE 102", "Media Design")
    conflicting = make_section(db, "MDE 102", "2026-2", "01-N", "lecture",
                               [(clash.day, f"{clash.start_min // 60:02d}:{clash.start_min % 60:02d}",
                                 f"{clash.end_min // 60:02d}:{clash.end_min % 60:02d}")])
    make_section(db, "MDE 102", "2026-2", "04-N", "lecture", [(5, "14:30", "16:20")])
    make_section(db, "MDE 102", "2026-2", "05-N", "lecture", [(5, "14:30", "16:20")], capacity=0)  # full
    client.post("/api/cart", json={"section_id": first.id})
    state = client.post("/api/cart", json={"section_id": conflicting.id}).json()
    assert state["conflicts"], "time overlap must be flagged"
    suggestions = state["conflicts"][0]["suggestions"]
    codes = {(s["section"]["course"]["code"], s["section"]["code"]) for s in suggestions}
    assert ("MDE 102", "04-N") in codes
    assert ("MDE 102", "05-N") not in codes  # never suggest full sections
    assert all(s["section"]["seats_left"] > 0 for s in suggestions)


def test_us7_scenario2_one_click_replace_clears_conflict(client, db):
    login(client)
    first = section(db, "CSS 217", "01-N")
    clash = first.meetings[0]
    make_course(db, "MDE 103", "Media Lab")
    conflicting = make_section(db, "MDE 103", "2026-2", "01-N", "lecture",
                               [(clash.day, f"{clash.start_min // 60:02d}:{clash.start_min % 60:02d}",
                                 f"{clash.end_min // 60:02d}:{clash.end_min % 60:02d}")])
    alternative = make_section(db, "MDE 103", "2026-2", "04-N", "lecture", [(5, "14:30", "16:20")])
    client.post("/api/cart", json={"section_id": first.id})
    client.post("/api/cart", json={"section_id": conflicting.id})
    state = client.post("/api/cart/replace", json={"from_section_id": conflicting.id,
                                                   "to_section_id": alternative.id}).json()
    assert state["conflicts"] == []
    assert alternative.id in [s["id"] for s in state["cart"]]


# ---------------------------------------------------------------- US9


def _enrolled_in(db, student, sec):
    db.expire_all()
    return db.scalar(select(Enrollment).where(Enrollment.user_id == student.id, Enrollment.section_id == sec.id,
                                              Enrollment.status == "enrolled")) is not None


def test_us9_scenario1_atomic_swap(client, db):
    student = make_student(db, "swapper@sdu.demo")
    make_course(db, "MAT 101", "College Algebra")
    s1 = make_section(db, "MAT 101", "2026-2", "01-N", "lecture", [(0, "08:30", "09:20")])
    s3 = make_section(db, "MAT 101", "2026-2", "03-N", "lecture", [(2, "15:30", "16:20")])
    enroll_direct(db, student, s1)
    login(client, student.email)
    response = client.post("/api/enrollments/swap", json={"from_section_id": s1.id, "to_section_id": s3.id})
    assert response.status_code == 200, response.text
    assert _enrolled_in(db, student, s3) and not _enrolled_in(db, student, s1)


def test_us9_scenario2_full_target_rolls_back(client, db):
    student = make_student(db, "swapper2@sdu.demo")
    other = make_student(db, "fast@sdu.demo")
    make_course(db, "MAT 102", "Pre-Calculus")
    s1 = make_section(db, "MAT 102", "2026-2", "01-N", "lecture", [(0, "08:30", "09:20")])
    s2 = make_section(db, "MAT 102", "2026-2", "02-N", "lecture", [(1, "08:30", "09:20")], capacity=1)
    enroll_direct(db, student, s1)
    enroll_direct(db, other, s2)  # the last seat was just taken by another user
    login(client, student.email)
    response = client.post("/api/enrollments/swap", json={"from_section_id": s1.id, "to_section_id": s2.id})
    assert response.status_code == 409
    assert detail(response) == "Target section is now full"
    assert _enrolled_in(db, student, s1)


def test_us9_swap_only_between_sections_of_same_class(client, db):
    student = make_student(db, "swapper3@sdu.demo")
    make_course(db, "MAT 103", "Trigonometry")
    s1 = make_section(db, "MAT 103", "2026-2", "01-N", "lecture", [(0, "08:30", "09:20")])
    other = section(db, "CSS 217", "01-N")
    enroll_direct(db, student, s1)
    login(client, student.email)
    response = client.post("/api/enrollments/swap", json={"from_section_id": s1.id, "to_section_id": other.id})
    assert response.status_code == 422
    assert _enrolled_in(db, student, s1)
    assert term(db).registration_open
