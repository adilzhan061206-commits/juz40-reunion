"""US2QATest (degree progress analysis) and US3QATest (instant prerequisite check)."""

from conftest import (
    complete_course,
    course,
    detail,
    login,
    make_student,
    section,
    term,
    user,
)


def test_us2_audit_lists_missing_required_courses(client, db):
    login(client)
    audit = client.get("/api/degree/audit").json()
    groups = {g["name"]: g for g in audit["groups"]}
    core_missing = {c["code"] for c in groups["Core Major"]["missing_courses"]}
    assert "CSS 222" in core_missing
    assert "CSS 105" not in core_missing  # completed with A-
    statuses = {i["code"]: i["status"] for i in groups["Core Major"]["items"]}
    assert statuses["CSS 105"] == "completed"
    assert statuses["CSS 215"] == "in_progress"  # enrolled this term
    totals = audit["totals"]
    assert totals["completed"] + totals["in_progress"] + totals["missing"] == totals["required"]


def test_us2_warns_when_transcript_is_missing(client, db):
    make_student(db, "fresh@sdu.demo")
    login(client, "fresh@sdu.demo")
    audit = client.get("/api/degree/audit").json()
    assert any("incomplete" in w for w in audit["warnings"])


def test_us3_scenario1_blocks_course_with_missing_prerequisite(client, db):
    """Student without CSS 231 selects CSS 350: red warning, Add stays disabled."""
    login(client)
    check = client.post("/api/prerequisites/check",
                        json={"course_id": course(db, "CSS 350").id, "term_id": term(db).id}).json()
    assert check["blocked"] is True
    assert check["message"] == "Missing Prerequisite: CSS 231"
    response = client.post("/api/cart", json={"section_id": section(db, "CSS 350", "01-N").id})
    assert response.status_code == 409
    assert detail(response) == "Missing Prerequisite: CSS 231"


def test_us3_scenario2_allows_course_when_prerequisite_passed_with_c_or_higher(client, db):
    student = user(db, "student@sdu.demo")
    complete_course(db, student, "CSS 231", grade="C")
    login(client)
    check = client.post("/api/prerequisites/check",
                        json={"course_id": course(db, "CSS 350").id, "term_id": term(db).id}).json()
    assert check["status"] == "met" and not check["blocked"]
    assert client.post("/api/cart", json={"section_id": section(db, "CSS 350", "01-N").id}).status_code == 200


def test_us3_grade_below_c_does_not_satisfy_prerequisite(client, db):
    login(client)  # demo student has C- in MAT 152
    check = client.post("/api/prerequisites/check",
                        json={"course_id": course(db, "MAT 251").id, "term_id": term(db).id}).json()
    assert check["blocked"] and check["missing"] == ["MAT 152"]


def test_us3_completed_course_is_not_flagged(client, db):
    login(client)
    check = client.post("/api/prerequisites/check",
                        json={"course_id": course(db, "CSS 106").id, "term_id": term(db).id}).json()
    assert check["status"] == "met"


def test_us3_scenario3_corequisite_in_same_term_cart(client, db):
    """CSS 223 requires CSS 222 as a corequisite; having CSS 222 in the cart satisfies it."""
    login(client)
    lab = section(db, "CSS 223", "01-L")
    blocked = client.post("/api/cart", json={"section_id": lab.id})
    assert blocked.status_code == 409 and "Corequisite" in detail(blocked)
    assert client.post("/api/cart", json={"section_id": section(db, "CSS 222", "01-N").id}).status_code == 200
    state = client.post("/api/cart", json={"section_id": lab.id})
    assert state.status_code == 200
    assert {s["course"]["code"] for s in state.json()["cart"]} == {"CSS 222", "CSS 223"}


def test_us3_registration_rejects_unmet_prerequisite_even_if_forced(client, db):
    """The server re-checks prerequisites on submit, not only in the UI."""
    from app.models import CartItem

    student = user(db, "student@sdu.demo")
    db.add(CartItem(user_id=student.id, section_id=section(db, "CSS 350", "01-N").id))
    db.commit()
    login(client)
    result = client.post("/api/registration/submit", json={"term_id": term(db).id}).json()
    assert result["results"][0]["ok"] is False
    assert result["results"][0]["code"] == "prerequisite"
