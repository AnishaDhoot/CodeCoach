import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, Base, engine, SessionLocal
from backend.models import Problem, TopicMastery, Attempt, SpacedRepetition, BadgeTest, UserConfig

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    db = SessionLocal()
    db.query(BadgeTest).delete()
    db.query(Attempt).delete()
    db.query(UserConfig).delete()
    
    # Seed problems with specific topics and companies
    p1 = Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum", difficulty="Easy", topics="Arrays", companies="Cisco,Google", is_premium=False)
    p2 = Problem(id="course-schedule", title="Course Schedule", url="https://leetcode.com/problems/course-schedule", difficulty="Medium", topics="Graphs", companies="Cisco,Meta", is_premium=False)
    p3 = Problem(id="coin-change", title="Coin Change", url="https://leetcode.com/problems/coin-change", difficulty="Medium", topics="Dynamic Programming", companies="Cisco,Amazon", is_premium=False)
    p4 = Problem(id="invert-binary-tree", title="Invert Binary Tree", url="https://leetcode.com/problems/invert-binary-tree", difficulty="Easy", topics="Trees", companies="Google", is_premium=False)
    
    db.merge(p1)
    db.merge(p2)
    db.merge(p3)
    db.merge(p4)
    
    tm1 = TopicMastery(topic="Arrays", level=0, rating=1200.0, attempts_count=1, success_count=0)
    tm2 = TopicMastery(topic="Dynamic Programming", level=0, rating=1100.0, attempts_count=1, success_count=0)
    tm3 = TopicMastery(topic="Graphs", level=0, rating=1250.0, attempts_count=1, success_count=0)
    db.merge(tm1)
    db.merge(tm2)
    db.merge(tm3)
    db.commit()
    db.close()
    yield


def test_progressive_hints_level_1_2_3_strictly_returned():
    """Verifies that progressive hints strictly return Level 1, then Level 2, then Level 3."""
    with patch("backend.agent.query_llm_json") as mock_llm:
        # Request Level 1
        mock_llm.return_value = {"hint": "Level 1 core concept: Use a Hash Map.", "level": 1, "has_next": True}
        res1 = client.post("/hints/reveal", json={
            "problem_id": "two-sum",
            "problem_title": "Two Sum",
            "code": "def twoSum(nums, target): pass",
            "language": "python3",
            "level": 1
        })
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["level"] == 1
        assert data1["has_next"] is True
        assert "Level 1" in data1["hint"]

        # Request Level 2
        mock_llm.return_value = {"hint": "Level 2 algorithm strategy: Store complement in dict.", "level": 2, "has_next": True}
        res2 = client.post("/hints/reveal", json={
            "problem_id": "two-sum",
            "problem_title": "Two Sum",
            "code": "def twoSum(nums, target): pass",
            "language": "python3",
            "level": 2
        })
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["level"] == 2
        assert data2["has_next"] is True
        assert "Level 2" in data2["hint"]

        # Request Level 3
        mock_llm.return_value = {"hint": "Level 3 pseudocode breakdown: seen = {}; for i, n in enumerate(nums): ...", "level": 3, "has_next": False}
        res3 = client.post("/hints/reveal", json={
            "problem_id": "two-sum",
            "problem_title": "Two Sum",
            "code": "def twoSum(nums, target): pass",
            "language": "python3",
            "level": 3
        })
        assert res3.status_code == 200
        data3 = res3.json()
        assert data3["level"] == 3
        assert data3["has_next"] is False
        assert "Level 3" in data3["hint"]


def test_recommendations_with_company_and_focus_topics():
    """Verifies that selecting a company respects active focus topics and topic mastery."""
    # Set focus topics to Dynamic Programming
    client.post("/topics/focus", json={"topics": ["Dynamic Programming"]})
    
    # Request recommendations for Cisco
    res = client.get("/problems/next?company=Cisco")
    assert res.status_code == 200
    data = res.json()
    recs = data["recommendations"]
    assert len(recs) > 0
    
    # First recommendation should be the focused topic for Cisco (Coin Change)
    first_rec = recs[0]
    assert first_rec["problem_id"] == "coin-change"
    assert "Cisco" in first_rec["companies"]
    assert "Dynamic Programming" in first_rec["topics"]
