"""Authentication (local and SDU account) and the my.sdu.edu.kz importer, against a fake portal."""

import json
from urllib.parse import parse_qs

import httpx
import pytest
from sqlalchemy import select

from conftest import login
from app.models import Enrollment, Section, Term, TranscriptEntry, User
from app.sdu import client as sdu_client
from app.sdu import parsers

LOGIN_PAGE = """<html><body><form action="loginAuth.php" method="post">
<input name="username"><input type="password" name="password"><input type="submit" name="LogIn" value="Log in">
</form></body></html>"""
HOME = """<html><body><a href="index.php?mod=schedule">Schedule</a><a href="logout.php">Logout</a>
<div>Name Surname : Aliya Sarsenova Advisor : S. Akhmetova Major Program : BSc Computer Science
Last Login : 05.10.2026</div></body></html>"""
OTP_PAGE = """<html><body><p>We sent a 6-digit verification code to your e-mail.</p>
<form action="verify.php" method="post"><input type="hidden" name="token" value="abc">
<input type="text" name="otp_code" maxlength="6"><input type="submit" value="Verify"></form></body></html>"""
SCHEDULE_PAGE = """<html><body><select name="yt"><option value="2025#2">2025-2026 Spring</option>
<option value="2026#1" selected>2026-2027 Fall</option></select></body></html>"""
GRID = """<table class="clTbl">
<tr><td>Day/Hour</td><td>Mon</td><td>Tue</td><td>Wed</td><td>Thu</td><td>Fri</td><td>Sat</td></tr>
<tr><td>08:30<br>09:20</td>
    <td>CSS 222 Алгоритмы 1 (2+2+0) [4cr / 5ECTS] [02-N] Маматнабиев : E221</td>
    <td rowspan="2">CSS 225 Database Management Systems (2+0+2) [4cr / 6ECTS] [01-P] Seitkali : F105</td>
    <td></td><td></td><td></td><td></td></tr>
<tr><td>09:30<br>10:20</td>
    <td>CSS 222 Алгоритмы 1 (2+2+0) [4cr / 5ECTS] [02-N] Маматнабиев : E221</td>
    <td></td><td></td><td>CSS 222 Алгоритмы 1 (2+2+0) [4cr / 5ECTS] [03-P] Abenov : G301</td><td></td></tr>
</table>"""
TRANSCRIPT = """<h3>2025-2026 Fall</h3><table>
<tr><th>Code</th><th>Course</th><th>Cr</th><th>ECTS</th><th>Grade</th></tr>
<tr><td>CSS 105</td><td>Fundamentals of Programming</td><td>4</td><td>6</td><td>A-</td></tr>
<tr><td>MAT 151</td><td>Calculus I</td><td>4</td><td>6</td><td>F</td></tr></table>"""
GRADES = {"CODE": "1", "DATA": "<table><tr><td>1</td><td>CSS 222</td><td>Algorithms 1</td><td>4</td><td>5</td>"
                               "<td>45%</td><td>IP</td></tr></table>"}


def fake_portal(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    form = parse_qs(request.content.decode()) if request.method == "POST" else {}
    first = {k: v[0] for k, v in form.items()}
    authed = "sid=authenticated" in request.headers.get("cookie", "")
    signed_in = {"set-cookie": "sid=authenticated; Path=/"}
    if path == "/" or path == "/logout.php":
        return httpx.Response(200, text=LOGIN_PAGE)
    if path == "/loginAuth.php":
        if first.get("username") == "230107777" and first.get("password") == "right":
            return httpx.Response(200, text=HOME, headers=signed_in)
        if first.get("username") == "230100999" and first.get("password") == "right":
            return httpx.Response(200, text=OTP_PAGE)
        return httpx.Response(200, text=LOGIN_PAGE)
    if path == "/verify.php":
        ok = first.get("otp_code") == "123456" and first.get("token") == "abc"
        return httpx.Response(200, text=HOME, headers=signed_in) if ok else httpx.Response(200, text=OTP_PAGE)
    if path == "/index.php" and not authed:
        return httpx.Response(200, text=LOGIN_PAGE)
    if path == "/index.php" and request.method == "GET":
        module = request.url.params.get("mod", "")
        pages = {"": HOME, "schedule": SCHEDULE_PAGE, "grades": SCHEDULE_PAGE, "transkript": TRANSCRIPT}
        return httpx.Response(200, text=pages.get(module, HOME))
    if path == "/index.php":
        if first.get("action") == "showSchedule":
            assert first["year"] == "2026" and first["term"] == "1"
            return httpx.Response(200, text=GRID)
        if first.get("action") == "GetGrades":
            return httpx.Response(200, text=json.dumps(GRADES))
    return httpx.Response(404, text="not found")


@pytest.fixture()
def portal(monkeypatch):
    monkeypatch.setattr(
        sdu_client, "client_factory",
        lambda: sdu_client.SduClient(base_url="https://my.sdu.test", transport=httpx.MockTransport(fake_portal)),
    )


# ---------------------------------------------------------------- parsers


def test_parse_schedule_cell():
    [item] = parsers.parse_schedule_cell("CSS 222 Алгоритмы 1 (2+2+0) [4cr / 5ECTS] [02-N] Маматнабиев : E221")
    assert item == {"code": "CSS 222", "title": "Алгоритмы 1", "section": "02-N", "kind": "lecture",
                    "instructor": "Маматнабиев", "room": "E221", "credits": 4.0, "ects": 5.0, "hours": "2+2+0"}


def test_parse_schedule_grid_merges_hours_and_rowspans():
    classes = parsers.parse_schedule(GRID)
    summary = [(c.code, c.section, c.day, c.start_min, c.end_min, c.room) for c in classes]
    assert ("CSS 222", "02-N", 0, 510, 620, "E221") in summary  # 08:30–10:20, two rows merged
    assert ("CSS 225", "01-P", 1, 510, 620, "F105") in summary  # rowspan=2
    assert ("CSS 222", "03-P", 4, 570, 620, "G301") in summary
    assert len(classes) == 3


def test_parse_terms_and_grades():
    terms = parsers.parse_terms(SCHEDULE_PAGE)
    assert parsers.selected_term(terms).code == "2026-1"
    rows = parsers.parse_grade_rows(TRANSCRIPT)
    assert [(r.code, r.grade, r.term_code, r.ects) for r in rows] == [
        ("CSS 105", "A-", "2025-1", 6.0), ("MAT 151", "F", "2025-1", 6.0)]
    [ip] = parsers.parse_grade_rows(json.dumps(GRADES), term_code="2026-1")
    assert (ip.code, ip.grade) == ("CSS 222", "IP")


def test_detect_login_stage():
    assert parsers.detect_login_stage(HOME) == "ok"
    assert parsers.detect_login_stage(OTP_PAGE) == "otp"
    assert parsers.detect_login_stage(LOGIN_PAGE) == "invalid"


# ---------------------------------------------------------------- SDU sign-in


def test_sdu_login_creates_account_and_imports_courses(client, db, portal):
    response = client.post("/api/auth/sdu/login", json={"student_id": "230107777", "password": "right"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "ok" and data["created"] is True
    assert data["user"]["name"] == "Aliya Sarsenova"
    assert data["user"]["program"]["name"] == "BSc Computer Science"
    assert data["sync"]["term"] == "Fall 2026"

    student = db.scalar(select(User).where(User.sdu_id == "230107777"))
    fall = db.scalar(select(Term).where(Term.code == "2026-1"))
    enrolled = db.scalars(select(Section).join(Enrollment).where(
        Enrollment.user_id == student.id, Enrollment.status == "enrolled", Section.term_id == fall.id)).all()
    assert sorted((s.course.code, s.code) for s in enrolled) == [
        ("CSS 222", "02-N"), ("CSS 222", "03-P"), ("CSS 225", "01-P")]
    transcript = {(e.course.code, e.status) for e in db.scalars(
        select(TranscriptEntry).where(TranscriptEntry.user_id == student.id))}
    assert ("CSS 105", "completed") in transcript
    assert ("MAT 151", "failed") in transcript
    assert ("CSS 222", "in_progress") in transcript

    # The session works and the schedule is visible right away.
    schedule = client.get(f"/api/schedule?term_id={fall.id}").json()
    assert len(schedule["enrolled"]) == 3

    # Signing in again re-uses the same account.
    client.cookies.clear()
    again = client.post("/api/auth/sdu/login", json={"student_id": "230107777", "password": "right"}).json()
    assert again["created"] is False and again["user"]["id"] == student.id


def test_sdu_login_wrong_password(client, portal):
    response = client.post("/api/auth/sdu/login", json={"student_id": "230107777", "password": "wrong"})
    assert response.status_code == 401


def test_sdu_login_with_two_factor_code(client, db, portal):
    first = client.post("/api/auth/sdu/login", json={"student_id": "230100999", "password": "right"}).json()
    assert first["status"] == "otp"
    bad = client.post("/api/auth/sdu/otp", json={"challenge_id": first["challenge_id"], "code": "000000"})
    assert bad.status_code == 401
    first = client.post("/api/auth/sdu/login", json={"student_id": "230100999", "password": "right"}).json()
    ok = client.post("/api/auth/sdu/otp", json={"challenge_id": first["challenge_id"], "code": "123456"})
    assert ok.status_code == 200 and ok.json()["status"] == "ok"
    assert client.get("/api/auth/me").json()["user"]["sdu_id"] == "230100999"


def test_sdu_unreachable_returns_friendly_error(client, monkeypatch):
    def offline(request):
        raise httpx.ConnectError("blocked", request=request)

    monkeypatch.setattr(sdu_client, "client_factory",
                        lambda: sdu_client.SduClient(base_url="https://my.sdu.test",
                                                     transport=httpx.MockTransport(offline)))
    response = client.post("/api/auth/sdu/login", json={"student_id": "230107777", "password": "right"})
    assert response.status_code == 502
    assert "not reachable" in response.json()["detail"]


def test_local_account_can_link_sdu(client, db, portal):
    client.post("/api/auth/register", json={"name": "Linker", "email": "link@sdu.demo", "password": "linker2026"})
    result = client.post("/api/auth/sdu/sync", json={"student_id": "230107777", "password": "right"}).json()
    assert result["status"] == "ok" and result["user"]["sdu_id"] == "230107777"
    assert result["user"]["email"] == "link@sdu.demo"


def test_paste_schedule_html_import(client, db):
    login(client)
    response = client.post("/api/sdu/import-html", json={"kind": "schedule", "html": SCHEDULE_PAGE + GRID})
    assert response.status_code == 200, response.text
    assert response.json()["term"] == "Fall 2026"


# ---------------------------------------------------------------- local accounts


def test_register_login_logout(client):
    response = client.post("/api/auth/register", json={"name": "New Student", "email": "New@Example.com",
                                                       "password": "longpassword"})
    assert response.status_code == 201
    assert response.json()["user"]["email"] == "new@example.com"
    assert client.post("/api/auth/register", json={"name": "Dup", "email": "new@example.com",
                                                   "password": "longpassword"}).status_code == 409
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "new@example.com", "password": "nope-nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "new@example.com",
                                                "password": "longpassword"}).status_code == 200


def test_password_rules_and_reset(client):
    assert client.post("/api/auth/register", json={"name": "Short", "email": "s@example.com",
                                                   "password": "123"}).status_code == 422
    token = client.post("/api/auth/forgot-password", json={"email": "student@sdu.demo"}).json()[
        "development_reset_token"]
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "brand-new-pass"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "again-again"}).status_code == 400
    login(client, "student@sdu.demo", "brand-new-pass")


def test_role_guards(client):
    login(client)
    assert client.get("/api/advisor/requests").status_code == 403
    assert client.get("/api/admin/overview").status_code == 403
    login(client, "advisor.cs@sdu.demo", "advisor2026")
    assert client.get("/api/advisor/requests").status_code == 200
    assert client.get("/api/admin/overview").status_code == 403
