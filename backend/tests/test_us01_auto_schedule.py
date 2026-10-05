"""US1QATest — Automated Schedule Generator."""

from conftest import course, login, make_course, make_section, term


def _ids(db, *codes):
    return [course(db, c).id for c in codes]


def _overlap(meetings):
    for i, a in enumerate(meetings):
        for b in meetings[i + 1:]:
            if a["day"] == b["day"] and a["start"] < b["end"] and b["start"] < a["end"]:
                return True
    return False


def test_scenario1_conflict_free_options_without_friday(client, db):
    """Given 4 required courses and "No Friday Classes", Generate returns multiple valid combinations."""
    login(client)
    payload = {"term_id": term(db).id, "course_ids": _ids(db, "CSS 217", "CSS 231", "ENG 101", "CSS 361"),
               "days_off": [4]}
    result = client.post("/api/generator", json=payload).json()
    assert result["message"] is None
    assert len(result["schedules"]) >= 3
    for schedule in result["schedules"]:
        meetings = [m for sid in schedule["section_ids"] for m in result["sections"][str(sid)]["meetings"]]
        assert not _overlap(meetings), "generated schedule contains overlapping classes"
        assert all(m["day"] != 4 for m in meetings)
        # every course is fully covered: one section of each kind it offers
        codes = {result["sections"][str(sid)]["course"]["code"] for sid in schedule["section_ids"]}
        assert codes == {"CSS 217", "CSS 231", "ENG 101", "CSS 361"}


def test_scenario2_no_conflict_free_options(client, db):
    """Courses whose only sections overlap produce the warning and highlight the conflicting sections."""
    login(client)
    make_course(db, "TST 101", "Test Core A")
    make_course(db, "TST 102", "Test Core B")
    a = make_section(db, "TST 101", "2026-2", "01-N", "lecture", [(0, "10:30", "12:20")])
    b = make_section(db, "TST 102", "2026-2", "01-N", "lecture", [(0, "11:30", "12:20")])
    result = client.post("/api/generator", json={"term_id": term(db).id,
                                                 "course_ids": _ids(db, "TST 101", "TST 102")}).json()
    assert result["schedules"] == []
    assert result["message"] == (
        "No conflict-free schedules could be generated with your selected courses and filters"
    )
    assert result["conflicts"][0]["courses"] == ["TST 101", "TST 102"]
    assert {a.id, b.id} <= set(result["conflicts"][0]["section_ids"])


def test_scenario3_afternoon_filter_updates_results(client, db):
    """Switching to "Afternoon Only (12:00–17:00)" keeps only combinations inside that window."""
    login(client)
    ids = _ids(db, "CSS 217", "ENG 101")
    morning = client.post("/api/generator", json={"term_id": term(db).id, "course_ids": ids, "window": "any"}).json()
    afternoon = client.post("/api/generator", json={"term_id": term(db).id, "course_ids": ids,
                                                    "window": "afternoon"}).json()
    assert morning["schedules"]
    for schedule in afternoon["schedules"]:
        for sid in schedule["section_ids"]:
            for m in afternoon["sections"][str(sid)]["meetings"]:
                assert m["start"] >= 12 * 60 and m["end"] <= 17 * 60
    if not afternoon["schedules"]:
        assert afternoon["message"] and afternoon["diagnostics"]


def test_generator_is_fast_for_many_courses(client, db):
    login(client)
    ids = _ids(db, "CSS 217", "CSS 231", "ENG 101", "CSS 361", "SOC 101", "HIS 100", "PHL 101")
    result = client.post("/api/generator", json={"term_id": term(db).id, "course_ids": ids}).json()
    assert result["elapsed_ms"] < 8000


def test_apply_generated_schedule_to_draft(client, db):
    login(client)
    ids = _ids(db, "CSS 217", "ENG 101")
    result = client.post("/api/generator", json={"term_id": term(db).id, "course_ids": ids}).json()
    chosen = result["schedules"][0]["section_ids"]
    state = client.post("/api/cart/apply", json={"section_ids": chosen}).json()
    assert sorted(s["id"] for s in state["cart"]) == sorted(chosen)
    assert state["conflicts"] == []
