import pytest
from starlette.testclient import TestClient
from backend.main import app, get_utc_now, AI_DAILY_QUOTA_LIMIT
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, TopicMastery, UserConfig, BadgeTest, DailyActivity, Attempt

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    db = SessionLocal()
    db.query(BadgeTest).delete()
    db.query(Attempt).delete()
    db.query(UserConfig).delete()
    
    # 1. Populate test problems with company tags
    p1 = Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum", difficulty="Easy", topics="Arrays", companies="Google, Meta", is_premium=False)
    p1_2 = Problem(id="best-time-to-buy-and-sell-stock", title="Best Time to Buy and Sell Stock", url="https://leetcode.com/problems/best-time-to-buy-and-sell-stock", difficulty="Easy", topics="Arrays", companies="Google", is_premium=False)
    p2 = Problem(id="3sum", title="3Sum", url="https://leetcode.com/problems/3sum", difficulty="Medium", topics="Two Pointers", companies="Amazon", is_premium=False)
    p3 = Problem(id="lru-cache", title="LRU Cache", url="https://leetcode.com/problems/lru-cache", difficulty="Medium", topics="Hash Table", companies="Google, Amazon", is_premium=False)
    db.merge(p1)
    db.merge(p1_2)
    db.merge(p2)
    db.merge(p3)

    # 2. Add attempts (1 solved, 1 failed)
    now = get_utc_now()
    att_solved = Attempt(problem_id="two-sum", verdict="Accepted", root_cause_category="none", explanation_text="Solved", timestamp=now)
    att_failed = Attempt(problem_id="3sum", verdict="Wrong Answer", root_cause_category="edge_case_miss", explanation_text="Missed negative numbers", timestamp=now)
    db.add_all([att_solved, att_failed])

    db.commit()
    db.close()
    yield

def test_company_filter_in_recommendations():
    """Verifies /problems/next filters problems by company query parameter."""
    res_google = client.get("/problems/next?company=Google")
    assert res_google.status_code == 200
    data_g = res_google.json()
    assert "recommendations" in data_g
    g_titles = [r["title"] for r in data_g["recommendations"]]
    assert any(t in ["Two Sum", "LRU Cache"] for t in g_titles)

def test_complete_dsa_topics_in_mastery():
    """Verifies /topics/mastery returns all 14+ standard DSA topics even if DB was unseeded."""
    res = client.get("/topics/mastery")
    assert res.status_code == 200
    data = res.json()
    returned_topics = {item["topic"] for item in data}
    expected_topics = {
        "Arrays", "Strings", "Sliding Window & Two Pointers", "Binary Search",
        "Linked List", "Stack & Queue", "Hashing", "Recursion & Backtracking",
        "Trees & BST", "Heaps / Priority Queue", "Graphs", "Dynamic Programming",
        "Greedy", "Trie & Bit Manipulation"
    }
    for t in expected_topics:
        assert t in returned_topics

def test_focus_topics_multi_select():
    """Verifies /topics/focus correctly handles multi-topic updates."""
    post_res = client.post("/topics/focus", json={"topics": ["Arrays", "Two Pointers", "Binary Search"]})
    assert post_res.status_code == 200
    data = post_res.json()
    assert len(data["focus_topics"]) == 3
    assert "Arrays" in data["focus_topics"]
    assert "Binary Search" in data["focus_topics"]

def test_badge_test_submit_lifecycle():
    """Verifies /badge-test/submit evaluates passing vs failing test states."""
    start_res = client.post("/badge-test/start", json={"topic": "Arrays"})
    assert start_res.status_code == 200
    
    submit_res = client.post("/badge-test/submit")
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    assert sub_data["passed"] is False
    assert sub_data["test_status"] == "failed"

def test_weekly_journal_includes_solved_dates():
    """Verifies /journal/weekly markdown output contains Solved Problems with dates."""
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
        assert "markdown_text" in data
        md = data["markdown_text"]
        assert "Solved Problems Journal" in md
        assert "Two Sum" in md
        assert "Solved on" in md

def test_ai_quota_default_is_50():
    """Verifies default AI daily quota limit is set to 50."""
    assert AI_DAILY_QUOTA_LIMIT == 50
    res = client.get("/ai/quota")
    assert res.status_code == 200
    assert res.json()["limit"] == 50
