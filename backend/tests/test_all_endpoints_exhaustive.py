import pytest
from starlette.testclient import TestClient
from backend.main import app, get_utc_now
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, TopicMastery, UserConfig, BadgeTest, DailyActivity

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_exhaustive_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Populate problems and topic masteries
    p1 = Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum", difficulty="Easy", topics="Arrays & Hashing", companies="Google, Meta", is_premium=False)
    p2 = Problem(id="3sum", title="3Sum", url="https://leetcode.com/problems/3sum", difficulty="Medium", topics="Two Pointers", companies="Amazon", is_premium=False)
    db.add_all([p1, p2])

    tm1 = TopicMastery(topic="Arrays & Hashing", level=2, rating=1280.0, attempts_count=10, success_count=8)
    tm2 = TopicMastery(topic="Two Pointers", level=1, rating=1040.0, attempts_count=4, success_count=2)
    db.add_all([tm1, tm2])

    today_str = get_utc_now().strftime("%Y-%m-%d")
    db.add(DailyActivity(date=today_str, problems_attempted=5, problems_solved=4))
    db.add(UserConfig(key=f"ai_limit_{today_str}", value="0"))

    db.commit()
    yield db
    db.close()

def test_topics_mastery_endpoint_schema():
    """Verifies /topics/mastery returns full schema list with badges and progress."""
    res = client.get("/topics/mastery")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    item = data[0]
    assert "topic" in item
    assert "level" in item
    assert "badge" in item
    assert "mastery_score" in item

def test_focus_topic_get_and_set_lifecycle():
    """Verifies /topics/focus GET and POST update workflow."""
    # Set focus topic using SetFocusRequest schema
    post_res = client.post("/topics/focus", json={"topic": "Two Pointers"})
    assert post_res.status_code == 200
    assert post_res.json()["focus_topic"] == "Two Pointers"

    # Get current focus topic
    get_res = client.get("/topics/focus")
    assert get_res.status_code == 200
    assert get_res.json()["focus_topic"] == "Two Pointers"

def test_activity_streak_calculation():
    """Verifies /activity/streak returns current streak and calendar metrics."""
    res = client.get("/activity/streak")
    assert res.status_code == 200
    data = res.json()
    assert "current_streak_days" in data
    assert "problems_today" in data
    assert "solved_today" in data
    assert data["problems_today"] == 5
    assert data["solved_today"] == 4

def test_companies_metadata_endpoint():
    """Verifies /companies/metadata returns indexed company dictionary."""
    res = client.get("/companies/metadata")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, dict)

def test_weekly_journal_generation():
    """Verifies /journal/weekly returns markdown executive recap."""
    res = client.get("/journal/weekly")
    assert res.status_code == 200
    data = res.json()
    assert "markdown_text" in data
    assert len(data["markdown_text"]) > 0

def test_abandon_badge_test_behavior(setup_exhaustive_db):
    """Verifies abandon endpoint safely transitions active tests."""
    setup_exhaustive_db.add(BadgeTest(
        topic="Arrays & Hashing",
        level=1,
        status="active",
        problem1_id="two-sum",
        problem2_id="3sum",
        start_time=get_utc_now()
    ))
    setup_exhaustive_db.commit()

    res = client.post("/badge-test/abandon")
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Second call when none active returns 404
    res_second = client.post("/badge-test/abandon")
    assert res_second.status_code == 404
