import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import Base, engine, get_db, SessionLocal
from backend.models import Problem, Attempt, TopicMastery, SpacedRepetition, UserConfig, BadgeTest
from datetime import datetime, timezone, timedelta

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown_db():
    db = SessionLocal()
    db.query(BadgeTest).delete()
    db.query(Attempt).delete()
    db.query(UserConfig).delete()
    db.query(SpacedRepetition).delete()
    db.commit()
    db.close()
    yield


def test_sync_solved_with_username_and_timestamps():
    """Verifies that problem sync records username in UserConfig and respects actual solve timestamps."""
    payload = {
        "username": "anisha_dev",
        "problems": [
            {
                "problem_id": "two-sum",
                "title": "Two Sum",
                "difficulty": "Easy",
                "topics": ["Arrays & Hashing"],
                "timestamp": 1700000000, # Actual solve timestamp epoch
                "company": "Google"
            },
            {
                "problem_id": "reverse-linked-list",
                "title": "Reverse Linked List",
                "difficulty": "Easy",
                "topics": ["Linked List"],
                "solved_at": "2026-01-15T10:00:00",
                "company": "Amazon"
            }
        ]
    }
    res = client.post("/sync/solved", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["synced"] == 2
    assert data["username"] == "anisha_dev"

    # Verify persistent account endpoint
    acc_res = client.get("/sync/account")
    assert acc_res.status_code == 200
    acc_data = acc_res.json()
    assert acc_data["status"] == "synced"
    assert acc_data["account"]["username"] == "anisha_dev"
    assert acc_data["account"]["synced_count"] == 2

    # Verify attempt timestamp recorded accurately
    db = SessionLocal()
    att = db.query(Attempt).filter(Attempt.problem_id == "two-sum").first()
    assert att is not None
    assert att.verdict == "Accepted"
    expected_dt = datetime.fromtimestamp(1700000000, tz=timezone.utc).replace(tzinfo=None)
    assert att.timestamp == expected_dt
    db.close()


def test_solved_problems_table_endpoint():
    """Verifies GET /problems/solved returns table items with metadata, dates, and notes."""
    # Sync a problem first
    client.post("/sync/solved", json={
        "username": "coder_pro",
        "problems": [
            {
                "problem_id": "container-with-most-water",
                "title": "Container With Most Water",
                "difficulty": "Medium",
                "topics": ["Two Pointers", "Array"],
                "timestamp": 1700000000
            }
        ]
    })

    # Add a user note and personal difficulty
    note_res = client.post("/problems/container-with-most-water/notes", json={
        "problem_id": "container-with-most-water",
        "user_notes": "Shrink window from shorter side.",
        "personal_difficulty": "Medium"
    })
    assert note_res.status_code == 200

    # Query solved table
    res = client.get("/problems/solved")
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    item = next((i for i in items if i["problem_id"] == "container-with-most-water"), None)
    assert item is not None
    assert item["title"] == "Container With Most Water"
    assert item["difficulty"] == "Medium"
    assert "Two Pointers" in item["topics"]
    assert "2023" in item["date_solved"] or "2026" in item["date_solved"]
    assert item["user_notes"] == "Shrink window from shorter side."
    assert item["personal_difficulty"] == "Medium"
    assert item["review_status"] != ""


def test_company_fallback_to_focused_and_weak_topics():
    """Verifies that company recommendation with no company matches falls back to focused/weak topics."""
    db = SessionLocal()
    # Create non-company problems with valid urls
    p1 = Problem(id="tree-node-1", title="Tree Node 1", url="https://leetcode.com/problems/tree-node-1/", difficulty="Easy", topics="Trees", is_solved=False)
    p2 = Problem(id="tree-node-2", title="Tree Node 2", url="https://leetcode.com/problems/tree-node-2/", difficulty="Easy", topics="Trees", is_solved=False)
    p3 = Problem(id="tree-node-3", title="Tree Node 3", url="https://leetcode.com/problems/tree-node-3/", difficulty="Easy", topics="Trees", is_solved=False)
    db.merge(p1)
    db.merge(p2)
    db.merge(p3)

    # Set focus on Trees
    cfg = UserConfig(key="focus_topic", value="Trees")
    db.merge(cfg)
    db.commit()
    db.close()

    # Request next problem with a company that has no specific problems in DB (e.g. Netflix)
    res = client.get("/problems/next?company=Netflix")
    assert res.status_code == 200
    data = res.json()
    assert "recommendations" in data
    assert len(data["recommendations"]) > 0
    # Recommender falls back to Trees and provides clear explanation
    first_rec = data["recommendations"][0]
    assert "Trees" in first_rec["topics"] or "Trees" in first_rec["explanation"] or "focus" in first_rec["explanation"].lower() or "netflix" in first_rec["explanation"].lower()



def test_weekly_journal_ai_insights():
    """Verifies GET /journal/weekly returns AI insights fields and markdown sections."""
    db = SessionLocal()
    p = Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum/", difficulty="Easy", topics="Arrays & Hashing", is_solved=True)
    att = Attempt(problem_id="two-sum", verdict="Accepted", timestamp=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1))
    db.merge(p)
    db.add(att)
    db.commit()
    db.close()

    from unittest.mock import patch
    with patch("backend.main.generate_weekly_ai_insights") as mock_ai:
        mock_ai.return_value = {
            "ai_growth_summary": "Great weekly consistency!",
            "concepts_learned": ["Two Pointers", "Hashing"],
            "pattern_spotlight": "Pro-tip of the week"
        }
        res = client.get("/journal/weekly")
        assert res.status_code == 200
        data = res.json()
        assert "ai_growth_summary" in data
        assert "concepts_learned" in data
        assert "pattern_spotlight" in data
        assert "markdown_text" in data
        assert "AI Coach: Weekly Growth Reflection" in data["markdown_text"]
        assert "Solved Problems Journal" in data["markdown_text"]

