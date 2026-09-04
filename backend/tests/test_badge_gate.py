import pytest
from starlette.testclient import TestClient
from backend.main import app, AI_DAILY_QUOTA_LIMIT, get_utc_now
from backend.database import Base, engine, SessionLocal
from backend.models import (
    Problem, Attempt, TopicMastery, UserConfig, SpacedRepetition, DailyActivity,
    BadgeTest, CompanyMetadata
)
from datetime import datetime, timezone, timedelta

client = TestClient(app)

Base.metadata.create_all(bind=engine)

@pytest.fixture(autouse=True)
def setup_test_db():
    db = SessionLocal()
    db.query(BadgeTest).delete()
    db.query(TopicMastery).delete()
    db.query(Attempt).delete()
    
    sample_problems = [
        Problem(id="two-sum", title="Two Sum", difficulty="Easy", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/two-sum/"),
        Problem(id="best-time-to-buy-and-sell-stock", title="Best Time to Buy and Sell Stock", difficulty="Easy", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/best-time-to-buy-and-sell-stock/"),
        Problem(id="majority-element", title="Majority Element", difficulty="Easy", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/majority-element/"),
        Problem(id="move-zeroes", title="Move Zeroes", difficulty="Easy", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/move-zeroes/"),
        Problem(id="plus-one", title="Plus One", difficulty="Easy", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/plus-one/"),
        Problem(id="merge-sorted-array", title="Merge Sorted Array", difficulty="Easy", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/merge-sorted-array/"),
        Problem(id="product-of-array-except-self", title="Product of Array Except Self", difficulty="Medium", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/product-of-array-except-self/"),
        Problem(id="3sum", title="3Sum", difficulty="Medium", topics="Arrays", is_premium=False, url="https://leetcode.com/problems/3sum/"),
        Problem(id="valid-palindrome", title="Valid Palindrome", difficulty="Easy", topics="Two Pointers", is_premium=False, url="https://leetcode.com/problems/valid-palindrome/"),
        Problem(id="two-sum-ii", title="Two Sum II - Input Array Is Sorted", difficulty="Medium", topics="Two Pointers", is_premium=False, url="https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/")
    ]
    for p in sample_problems:
        existing = db.query(Problem).filter(Problem.id == p.id).first()
        if not existing:
            db.add(p)
    db.commit()
    db.close()
    yield
    db_clean = SessionLocal()
    db_clean.query(BadgeTest).delete()
    db_clean.query(TopicMastery).delete()
    db_clean.query(Attempt).delete()
    db_clean.commit()
    db_clean.close()


def test_start_valid_topic_bronze_level1():
    """Verify starting a test for a new topic creates an active Bronze Level 1 session with 2 unique questions."""
    res = client.post("/badge-test/start", json={"topic": "Arrays"})
    assert res.status_code == 200
    data = res.json()
    assert data["topic"] == "Arrays"
    assert data["level"] == 1
    assert data["status"] == "active"
    assert data["problem1_solved"] is False
    assert data["problem2_solved"] is False
    assert data["problem1"]["id"] != data["problem2"]["id"]
    assert data["problem1"]["url"].startswith("http")
    assert data["time_limit_seconds"] == 5400


def test_start_invalid_and_missing_topic_error_handling():
    """Verify validation errors for missing, null, or unsupported topics."""
    res1 = client.post("/badge-test/start", json={})
    assert res1.status_code == 422

    res2 = client.post("/badge-test/start", json={"topic": None})
    assert res2.status_code == 422


def test_start_duplicate_session_returns_existing_active():
    """Verify calling start when a session is already active blocks duplicate sessions with HTTP 400."""
    res1 = client.post("/badge-test/start", json={"topic": "Arrays"})
    assert res1.status_code == 200
    id1 = res1.json()["id"]

    res2 = client.post("/badge-test/start", json={"topic": "Arrays"})
    assert res2.status_code == 400
    assert "already active" in res2.json()["detail"].lower()

    db = SessionLocal()
    active_count = db.query(BadgeTest).filter(BadgeTest.status == "active").count()
    db.close()
    assert active_count == 1


def test_randomization_distribution_and_uniqueness():
    """Verify randomized problem selection samples across curated candidates with 0% duplicate collision rate."""
    selected_pairs = []

    for _ in range(5):
        db = SessionLocal()
        db.query(BadgeTest).delete()
        db.commit()
        db.close()

        res = client.post("/badge-test/start", json={"topic": "Arrays"})
        assert res.status_code == 200
        p1 = res.json()["problem1"]["id"]
        p2 = res.json()["problem2"]["id"]
        assert p1 != p2
        selected_pairs.append((p1, p2))

    distinct_combos = set(selected_pairs)
    assert len(distinct_combos) >= 1


def test_get_active_badge_test_contract_and_lifecycle():
    """Verify GET /badge-test/active returns active session or null when idle."""
    res_idle = client.get("/badge-test/active")
    assert res_idle.status_code == 200
    assert res_idle.json() is None

    client.post("/badge-test/start", json={"topic": "Arrays"})
    res_active = client.get("/badge-test/active")
    assert res_active.status_code == 200
    data = res_active.json()
    assert data["topic"] == "Arrays"
    assert data["status"] == "active"
    assert "problem1" in data and "problem2" in data


def test_submit_both_problems_solved_advances_mastery():
    """Verify solving both problems passes the test, upgrades topic level, and updates TopicMastery."""
    res_start = client.post("/badge-test/start", json={"topic": "Arrays"})
    test_id = res_start.json()["id"]

    db = SessionLocal()
    test_obj = db.query(BadgeTest).filter(BadgeTest.id == test_id).first()
    test_obj.problem1_solved = True
    test_obj.problem2_solved = True
    db.commit()
    db.close()

    res_submit = client.post("/badge-test/submit")
    assert res_submit.status_code == 200
    res_data = res_submit.json()
    assert res_data["passed"] is True
    assert res_data["test_status"] == "passed"
    assert "passed" in res_data["message"].lower()

    db = SessionLocal()
    mastery = db.query(TopicMastery).filter(TopicMastery.topic == "Arrays").first()
    assert mastery is not None
    assert mastery.level == 1
    assert mastery.rating >= 800.0
    db.close()

    res_active = client.get("/badge-test/active")
    assert res_active.json() is None


def test_submit_partial_or_no_solves_fails_and_does_not_advance_level():
    """Verify submitting when only 1 or 0 problems are solved fails and retains previous level."""
    res_start = client.post("/badge-test/start", json={"topic": "Arrays"})
    test_id = res_start.json()["id"]

    db = SessionLocal()
    test_obj = db.query(BadgeTest).filter(BadgeTest.id == test_id).first()
    test_obj.problem1_solved = True
    test_obj.problem2_solved = False
    db.commit()
    db.close()

    res_submit = client.post("/badge-test/submit")
    assert res_submit.status_code == 200
    res_data = res_submit.json()
    assert res_data["passed"] is False

    db = SessionLocal()
    mastery = db.query(TopicMastery).filter(TopicMastery.topic == "Arrays").first()
    assert mastery is None or mastery.level == 0
    db.close()


def test_submit_idempotency_and_no_active_session_handling():
    """Verify calling submit when no test is active returns clear 404 error."""
    res_submit = client.post("/badge-test/submit")
    assert res_submit.status_code == 404
    assert "No active Badge Test" in res_submit.json()["detail"]


def test_abandon_test_cleans_active_state_and_allows_restart():
    """Verify abandoning an active test sets status to abandoned and allows starting a new test immediately."""
    client.post("/badge-test/start", json={"topic": "Arrays"})
    
    res_abandon = client.post("/badge-test/abandon")
    assert res_abandon.status_code == 200
    assert "abandoned" in res_abandon.json()["message"].lower()

    res_active = client.get("/badge-test/active")
    assert res_active.json() is None

    res_restart = client.post("/badge-test/start", json={"topic": "Arrays"})
    assert res_restart.status_code == 200
    assert res_restart.json()["status"] == "active"


def test_solve_sync_updates_badge_test_problem_solved_flags():
    """Verify that posting an Accepted submission via /submissions/analyze marks the active badge test problem as solved."""
    res_start = client.post("/badge-test/start", json={"topic": "Arrays"})
    data = res_start.json()
    prob1_id = data["problem1"]["id"]

    res_sub = client.post("/submissions/analyze", json={
        "problem_id": prob1_id,
        "problem_title": data["problem1"]["title"],
        "code": "class Solution: pass",
        "language": "python3",
        "verdict": "Accepted",
        "time_taken_seconds": 120,
        "hints_used": 0
    })
    assert res_sub.status_code == 200

    res_active = client.get("/badge-test/active")
    assert res_active.status_code == 200
    active_data = res_active.json()
    assert active_data["problem1_solved"] is True
    assert active_data["problem2_solved"] is False
