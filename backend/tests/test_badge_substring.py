"""Regression: solving one badge-test problem must not mark the other solved
when one slug is a substring of the other (e.g. two-sum vs two-sum-ii)."""
import pytest
from starlette.testclient import TestClient

from backend.main import app
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, BadgeTest, Attempt, get_utc_now

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.add(Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum/", difficulty="Easy", topics="Arrays", is_premium=False))
    db.add(Problem(id="two-sum-ii", title="Two Sum II", url="https://leetcode.com/problems/two-sum-ii/", difficulty="Medium", topics="Arrays", is_premium=False))
    db.commit()
    db.close()
    yield


def test_substring_slug_does_not_cross_mark_solved():
    now = get_utc_now()
    db = SessionLocal()
    # Active test where p2's slug ("two-sum") is a substring of p1's ("two-sum-ii").
    db.add(BadgeTest(
        topic="Arrays", level=1, status="active",
        problem1_id="two-sum-ii", problem2_id="two-sum",
        problem1_solved=False, problem2_solved=False, start_time=now,
    ))
    # Only problem 1 ("two-sum-ii") was solved.
    db.add(Attempt(problem_id="two-sum-ii", verdict="Accepted", timestamp=now))
    db.commit()
    db.close()

    res = client.get("/badge-test/active")
    assert res.status_code == 200
    body = res.json()
    assert body is not None, "active test should still be returned"
    assert body["problem1_solved"] is True
    # The bug: substring ilike("%two-sum%") matched the "two-sum-ii" attempt, marking
    # problem 2 ("two-sum") solved too -> both solved -> premature pass -> UI reverts.
    assert body["problem2_solved"] is False, "solving two-sum-ii must NOT mark two-sum solved"
    assert body["status"] == "active", "test must stay active, not prematurely pass"
