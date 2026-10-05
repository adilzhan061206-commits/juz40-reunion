"""US5QATest (advisor approval routing) and US8QATest (degree audit gap visualizer)."""

from sqlalchemy import select

from conftest import detail, login, make_course, make_section, make_student, term, user
from app.models import Notification


def _overload_setup(client, db):
    """A student who already has 40 ECTS and wants one more course (41+ ECTS)."""
    student = make_student(db, "heavy@sdu.demo", "Heavy Load")
    for i in range(8):
        make_course(db, f"LOD {100 + i}", f"Load {i}", ects=5)
        make_section(db, f"LOD {100 + i}", "2026-2", "01-N", "lecture", [(i % 5, f"{8 + 2 * (i // 5)}:30",
                                                                          f"{9 + 2 * (i // 5)}:20")])
    make_course(db, "LOD 200", "One Too Many", ects=5)
    extra = make_section(db, "LOD 200", "2026-2", "01-N", "lecture", [(5, "08:30", "09:20")])
    login(client, student.email)
    from app.models import Course, Section

    ids = [s.id for s in db.scalars(select(Section).join(Course).where(Course.code.like("LOD 1%"))).all()]
    for sid in ids:
        assert client.post("/api/cart", json={"section_id": sid}).status_code == 200
    result = client.post("/api/registration/submit", json={"term_id": term(db).id}).json()
    assert all(r["ok"] for r in result["results"]), result
    assert client.post("/api/cart", json={"section_id": extra.id}).status_code == 200
    blocked = client.post("/api/registration/submit", json={"term_id": term(db).id}).json()["results"][0]
    assert blocked["code"] == "credit_limit"
    return student, extra


def test_us5_scenario1_approved_overload_unlocks_registration(client, db):
    student, extra = _overload_setup(client, db)
    response = client.post("/api/requests", json={"kind": "credit_overload", "term_id": term(db).id,
                                                  "requested_ects": 45, "reason": "Need to graduate on time."})
    assert response.status_code == 201
    request_id = response.json()["id"]

    login(client, "advisor.cs@sdu.demo", "advisor2026")
    pending = client.get("/api/advisor/requests").json()["requests"]
    assert request_id in [r["id"] for r in pending]
    approved = client.post(f"/api/advisor/requests/{request_id}/approve", json={"feedback": ""}).json()
    assert approved["status"] == "approved"

    login(client, student.email)
    result = client.post("/api/registration/submit", json={"term_id": term(db).id}).json()["results"][0]
    assert result["ok"] is True


def test_us5_scenario2_reject_requires_feedback_and_keeps_course_locked(client, db):
    student, extra = _overload_setup(client, db)
    request_id = client.post("/api/requests", json={"kind": "credit_overload", "term_id": term(db).id,
                                                    "requested_ects": 45, "reason": "Please let me add it."}).json()["id"]
    login(client, "advisor.cs@sdu.demo", "advisor2026")
    assert client.post(f"/api/advisor/requests/{request_id}/reject", json={"feedback": ""}).status_code == 422
    rejected = client.post(f"/api/advisor/requests/{request_id}/reject",
                           json={"feedback": "Your GPA is below the overload threshold."}).json()
    assert rejected["status"] == "rejected"
    note = db.scalar(select(Notification).where(Notification.user_id == student.id,
                                                Notification.title.like("Override rejected%")))
    assert "GPA" in note.body
    login(client, student.email)
    result = client.post("/api/registration/submit", json={"term_id": term(db).id}).json()["results"][0]
    assert result["ok"] is False and result["code"] == "credit_limit"


def test_us5_scenario3_cross_department_access_is_denied(client, db):
    login(client, "business@sdu.demo")
    from app.models import Course

    request_id = client.post("/api/requests", json={
        "kind": "prerequisite_waiver", "term_id": term(db).id,
        "course_id": db.scalar(select(Course.id).where(Course.code == "FIN 301")),
        "reason": "I studied accounting at college."}).json()["id"]
    login(client, "advisor.cs@sdu.demo", "advisor2026")
    assert request_id not in [r["id"] for r in client.get("/api/advisor/requests").json()["requests"]]
    response = client.post(f"/api/advisor/requests/{request_id}/approve", json={})
    assert response.status_code == 403
    assert detail(response) == "Unauthorized: Student belongs to another department"
    bus = user(db, "business@sdu.demo")
    assert client.get(f"/api/advisor/students/{bus.id}").status_code == 403


def test_us5_prerequisite_waiver_unlocks_course(client, db):
    login(client)
    from app.models import Course

    css302 = db.scalar(select(Course).where(Course.code == "CSS 302"))
    request_id = client.post("/api/requests", json={"kind": "prerequisite_waiver", "term_id": term(db).id,
                                                    "course_id": css302.id,
                                                    "reason": "I took operating systems abroad."}).json()["id"]
    login(client, "advisor.cs@sdu.demo", "advisor2026")
    client.post(f"/api/advisor/requests/{request_id}/approve", json={"feedback": "Approved, syllabus matches."})
    login(client)
    check = client.post("/api/prerequisites/check", json={"course_id": css302.id, "term_id": term(db).id}).json()
    assert check["status"] == "waived" and not check["blocked"]


def test_us8_gap_visualizer_categorises_missing_credits(client, db):
    student = user(db, "student@sdu.demo")
    login(client, "advisor.cs@sdu.demo", "advisor2026")
    data = client.get(f"/api/advisor/students/{student.id}").json()
    groups = {g["category"]: g for g in data["audit"]["groups"]}
    assert {"core", "general", "science", "elective"} <= set(groups)
    for g in groups.values():
        assert g["completed_ects"] + g["in_progress_ects"] + g["missing_ects"] == g["required_ects"]
    core_missing = {c["course_id"] for c in groups["core"]["missing_courses"]}
    # Interactive filter: offered sections correspond to missing requirements in the upcoming term.
    assert data["offered_sections"]
    assert {s["course"]["id"] for s in data["offered_sections"]} <= {
        c["course_id"] for g in groups.values() for c in g["missing_courses"]}
    assert core_missing
    # Completed courses are never shown as unfulfilled.
    completed_codes = {i["code"] for g in groups.values() for i in g["items"] if i["status"] == "completed"}
    assert "CSS 105" in completed_codes
