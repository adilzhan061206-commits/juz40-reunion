"""US10QATest (calendar export), US11QATest (multi-term planner), US12QATest (AI suggestions)."""

from sqlalchemy import select

from conftest import course, detail, enroll_direct, login, make_course, make_section, make_student, term, user
from app.models import Enrollment, Program, RequirementCourse, RequirementGroup


def _student_with_schedule(db):
    student = make_student(db, "calendar@sdu.demo")
    make_course(db, "CAL 101", "Calendar Course")
    sec = make_section(db, "CAL 101", "2026-2", "01-N", "lecture", [(0, "10:30", "12:20"), (3, "10:30", "11:20")])
    enroll_direct(db, student, sec)
    return student, sec


def test_us10_scenario2_export_blocked_for_unconfirmed_schedule(client, db):
    student, _ = _student_with_schedule(db)
    login(client, student.email)
    response = client.get(f"/api/schedule/export.ics?term_id={term(db).id}")
    assert response.status_code == 409
    assert detail(response) == "Schedule must be fully confirmed before export"


def test_us10_scenario1_export_confirmed_schedule(client, db):
    student, sec = _student_with_schedule(db)
    login(client, student.email)
    assert client.post("/api/schedule/confirm", json={"term_id": term(db).id}).json()["confirmed_at"]
    response = client.get(f"/api/schedule/export.ics?term_id={term(db).id}")
    assert response.status_code == 200
    body = response.text
    assert body.startswith("BEGIN:VCALENDAR")
    assert body.count("BEGIN:VEVENT") == 2
    assert "CAL 101 Calendar Course" in body
    assert "DTSTART;TZID=Asia/Almaty:20270118T103000" in body  # first Monday of the term
    assert "RRULE:FREQ=WEEKLY;UNTIL=20270522T235959" in body
    assert "room T100" in body
    # Subscription feed works without a session once confirmed.
    url = client.post("/api/calendar/subscription").json()["url"]
    client.cookies.clear()
    assert client.get(url.split("8000", 1)[-1]).status_code == 200


def test_us10_any_enrollment_change_requires_reconfirmation(client, db):
    student, sec = _student_with_schedule(db)
    login(client, student.email)
    client.post("/api/schedule/confirm", json={"term_id": term(db).id})
    client.post(f"/api/enrollments/{sec.id}/drop")
    assert client.get(f"/api/schedule?term_id={term(db).id}").json()["confirmed_at"] is None


def test_us11_tentative_plan_does_not_change_enrollment(client, db):
    login(client)
    student = user(db, "student@sdu.demo")
    before = sorted(e.section_id for e in db.scalars(select(Enrollment).where(
        Enrollment.user_id == student.id, Enrollment.status == "enrolled")))
    future = term(db, "2027-1")
    plan = client.post("/api/plans", json={"term_id": future.id, "name": "Fall 2027 draft"}).json()
    saved = client.put(f"/api/plans/{plan['id']}/items", json={"items": [
        {"course_id": course(db, "CSS 302").id}, {"course_id": course(db, "CSS 309").id}]}).json()
    assert [i["course"]["code"] for i in saved["items"]] == ["CSS 302", "CSS 309"]
    assert all(i["offered"] for i in saved["items"])  # projected offerings exist for Fall 2027
    renamed = client.patch(f"/api/plans/{plan['id']}", json={"name": "Plan B"}).json()
    assert renamed["name"] == "Plan B"
    assert [p["name"] for p in client.get("/api/plans").json()["plans"]] == ["Plan B"]
    db.expire_all()
    after = sorted(e.section_id for e in db.scalars(select(Enrollment).where(
        Enrollment.user_id == student.id, Enrollment.status == "enrolled")))
    assert before == after


def test_us12_scenario1_recommendations_address_degree_gaps(client, db):
    login(client)
    data = client.get(f"/api/recommendations?term_id={term(db).id}").json()
    assert data["recommendations"]
    student = user(db, "student@sdu.demo")
    program = db.get(Program, student.program_id)
    required = {rc.course.code for g in program.groups for rc in g.items}
    for rec in data["recommendations"]:
        assert rec["code"] in required
        assert rec["fulfills"]
        assert not rec["prerequisite"]["blocked"]


def test_us12_never_recommends_completed_or_unrelated_courses(client, db):
    login(client)
    codes = {r["code"] for r in client.get(f"/api/recommendations?term_id={term(db).id}").json()["recommendations"]}
    for completed in ("CSS 105", "CSS 106", "MAT 151", "MAT 152", "ENG 101"):
        assert completed not in codes
    assert not codes & {"BUS 101", "ACC 201", "FIN 301"}  # business courses are not in the CS degree


def test_us12_recommendations_follow_personal_requirements(client, db):
    student = make_student(db, "custom@sdu.demo")
    make_course(db, "ONL 101", "Only Course")
    make_section(db, "ONL 101", "2026-2", "01-N", "lecture", [(1, "13:30", "14:20")])
    program = Program(code="CUSTOM", name="Custom", owner_id=student.id, total_ects=5)
    db.add(program)
    db.flush()
    group = RequirementGroup(program_id=program.id, name="Core", category="core", kind="required")
    db.add(group)
    db.flush()
    db.add(RequirementCourse(group_id=group.id, course_id=course(db, "ONL 101").id))
    student.program_id = program.id
    db.commit()
    login(client, student.email)
    codes = [r["code"] for r in client.get(f"/api/recommendations?term_id={term(db).id}").json()["recommendations"]]
    assert codes == ["ONL 101"]
