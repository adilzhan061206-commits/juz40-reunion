"""Fall/spring semester rule, the "My courses" overview and the my.sdu "My Curriculum" importer."""

from sqlalchemy import select

from conftest import login, make_student, term, user
from app.models import Section, Term
from app.sdu import parsers
from app.services.season import fits_term, term_season

CURRICULUM_HTML = """<div>My Curriculum</div><div><b>2024-Information Systems (EN)</b></div>
<table><tr><th>№</th><th>course code</th><th>name</th><th></th><th>teor</th><th>pr</th><th>cr</th><th>ects</th>
<th>grade</th><th>requisites</th><th>status</th><th>Syllabus</th></tr>
<tr><td>1</td><td>CSS 105</td><td>Fundamentals of Programming</td><td></td><td>2</td><td>0+2</td><td>3</td><td>5</td><td>B</td><td></td><td></td><td>EN</td></tr>
<tr><td>2</td><td>MAT 156</td><td>Discrete Mathematics</td><td></td><td>2</td><td>2+0</td><td>4</td><td>5</td><td>A-</td><td></td><td></td><td>EN</td></tr>
<tr><td>3</td><td>MDE 160</td><td>Community engagement and value based Society 1</td><td></td><td>0</td><td>1+0</td><td>1</td><td>0</td><td>P</td><td></td><td></td><td></td></tr>
<tr><td>7</td><td>XXX 10X<br>MDE 192</td><td>* [ NAE ] Foreign language 1 (MDE 103, MDE 104, MDE 192)</td><td></td><td>0</td><td>3+0</td><td>3</td><td>5</td><td>IP</td><td></td><td></td><td></td></tr>
</table>
<table><tr><th>№</th><th>course code</th><th>name</th><th></th><th>teor</th><th>pr</th><th>cr</th><th>ects</th>
<th>grade</th><th>requisites</th><th>status</th><th>Syllabus</th></tr>
<tr><td>1*</td><td>CSS 108</td><td>Programming Technologies and Educational Practice</td><td></td><td>2</td><td>0+2</td><td>3</td><td>5</td><td></td><td>PR</td><td>Available</td><td>EN</td></tr>
<tr><td>2</td><td>MAT 151</td><td>Linear Algebra</td><td></td><td>2</td><td>1+0</td><td>3</td><td>5</td><td></td><td></td><td>Available</td><td>EN</td></tr>
<tr><td>7</td><td>XXX 10X</td><td>* [ NAE ] Foreign language 2 (MDE 002, MDE 191, MDE 194)</td><td></td><td>0</td><td>3+0</td><td>3</td><td>5</td><td></td><td></td><td>Available</td><td></td></tr>
</table>"""


def test_season_rule():
    fall, spring, summer = Term(code="2026-1"), Term(code="2026-2"), Term(code="2026-3")
    assert term_season(fall) == "fall" and term_season(spring) == "spring" and term_season(summer) is None
    assert fits_term(fall, 3) and not fits_term(fall, 4)
    assert fits_term(spring, 4) and not fits_term(spring, 5)
    assert fits_term(summer, 5) and fits_term(spring, None)


def test_seed_offers_only_matching_semesters(client, db):
    from app.models import Course

    spring = term(db, "2026-2")
    codes = {c for (c,) in db.execute(select(Course.code).join(Section).where(Section.term_id == spring.id)).all()}
    assert {"CSS 222", "CSS 231", "CSS 342"} <= codes  # semesters 4 and 6
    assert not codes & {"CSS 105", "CSS 215", "CSS 302", "CSS 318"}  # semesters 1, 3, 5


def test_my_courses_overview(client, db):
    login(client)
    data = client.get(f"/api/my-courses?term_id={term(db).id}").json()
    assert data["season"] == "spring" and data["allowed_semesters"] == [2, 4, 6, 8]
    assert "CSS 105" in {c["code"] for c in data["completed"]}
    assert "CSS 215" in {c["code"] for c in data["in_progress"]}
    next_codes = {c["code"] for c in data["next"]}
    assert {"CSS 222", "CSS 231", "CSS 217"} <= next_codes
    assert all(c["semester"] % 2 == 0 for c in data["next"] if c["semester"])
    assert not next_codes & {c["code"] for c in data["completed"]}
    assert {"CSS 302", "CSS 309"} <= {c["code"] for c in data["later"]}  # semester 5 → fall only
    suggested = {c["code"] for c in data["next"] if c["suggested"]}
    assert "CSS 222" in suggested and "MAT 251" not in suggested  # MAT 251 is blocked by the C- in MAT 152
    assert data["electives"] and all(o["semester"] % 2 == 0 for e in data["electives"] for o in e["options"])


def test_parse_my_curriculum_page():
    parsed = parsers.parse_curriculum(CURRICULUM_HTML)
    assert parsed.program == "2024-Information Systems (EN)"
    rows = {(r.semester, r.code or r.title): r for r in parsed.rows}
    assert rows[(1, "CSS 105")].status == "completed" and rows[(1, "CSS 105")].grade == "B"
    assert rows[(1, "MDE 192")].status == "in_progress" and rows[(1, "MDE 192")].elective_type == "NAE"
    assert rows[(2, "CSS 108")].status == "not_taken" and rows[(2, "CSS 108")].has_requisites
    slot = rows[(2, "Foreign language 2")]
    assert slot.code == "" and slot.options == ["MDE 002", "MDE 191", "MDE 194"]
    assert rows[(1, "MDE 160")].ects == 0


def test_paste_curriculum_builds_personal_programme(client, db):
    make_student(db, "is@sdu.demo")
    login(client, "is@sdu.demo")
    result = client.post("/api/sdu/import-html", json={"kind": "curriculum", "html": CURRICULUM_HTML})
    assert result.status_code == 200, result.text
    audit = client.get("/api/degree/audit").json()
    assert audit["program"]["name"] == "2024-Information Systems (EN)" and audit["program"]["personal"]
    names = [g["name"] for g in audit["groups"]]
    assert names[:2] == ["Semester 1", "Semester 2"]
    assert any("Foreign language 2" in n for n in names)
    sem1 = next(g for g in audit["groups"] if g["name"] == "Semester 1")
    assert {i["code"]: i["status"] for i in sem1["items"]}["CSS 105"] == "completed"
    assert user(db, "is@sdu.demo").program.owner_id is not None
