import pytest
from starlette.testclient import TestClient
from backend.main import app, get_utc_now
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, UserConfig, BadgeTest

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    today_str = get_utc_now().strftime("%Y-%m-%d")
    db.add(UserConfig(key=f"ai_limit_{today_str}", value="0"))
    db.add(Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum", difficulty="Easy", topics="Arrays & Hashing", is_premium=False))
    db.commit()
    yield db
    db.close()

def test_health_check_endpoint():
    """Verifies lightweight health probe responds with 200 OK."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

def test_ai_quota_endpoint_returns_accurate_contract():
    """Verifies /ai/quota matches schema {used: int, limit: int}."""
    res = client.get("/ai/quota")
    assert res.status_code == 200
    data = res.json()
    assert "used" in data and isinstance(data["used"], int)
    assert "limit" in data and isinstance(data["limit"], int)
    assert data["limit"] == 50

def test_missing_required_fields_returns_422_validation_error():
    """Verifies FastAPI pydantic validation catches missing required fields."""
    res = client.post("/approach/check", json={"invalid_field": "test"})
    assert res.status_code == 422
    errors = res.json()["detail"]
    assert any("problem_title" in str(e) for e in errors)
    assert any("code" in str(e) for e in errors)

def test_badge_test_active_status_and_lifecycle(setup_test_db):
    """Verifies /badge-test/active returns None when no test is active and active schema when active."""
    res_none = client.get("/badge-test/active")
    assert res_none.status_code == 200
    assert res_none.json() is None

    # Start a test
    p2 = Problem(id="group-anagrams", title="Group Anagrams", url="https://leetcode.com/problems/group-anagrams", difficulty="Medium", topics="Arrays & Hashing", is_premium=False)
    setup_test_db.add(p2)
    setup_test_db.add(BadgeTest(
        topic="Arrays & Hashing",
        level=1,
        status="active",
        problem1_id="two-sum",
        problem2_id="group-anagrams",
        start_time=get_utc_now()
    ))
    setup_test_db.commit()

    res_active = client.get("/badge-test/active")
    assert res_active.status_code == 200
    data = res_active.json()
    assert data["topic"] == "Arrays & Hashing"
    assert data["status"] == "active"
    assert data["problem1"]["id"] == "two-sum"

