import pytest
import threading
from starlette.testclient import TestClient
from backend.main import app, check_and_increment_ai_quota, AI_DAILY_QUOTA_LIMIT, get_utc_now
from backend.database import Base, engine, SessionLocal
from backend.models import UserConfig, BadgeTest, Problem

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    today_str = get_utc_now().strftime("%Y-%m-%d")
    # Reset quota to 0
    db.add(UserConfig(key=f"ai_limit_{today_str}", value="0"))
    db.add(Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum", difficulty="Easy", topics="Arrays & Hashing", is_premium=False))
    db.commit()
    yield db
    db.close()

def test_atomic_quota_increment_under_concurrency(setup_db):
    """Simulates concurrent threads incrementing the AI quota atomically."""
    errors = []
    
    def worker():
        local_db = SessionLocal()
        try:
            for _ in range(3):
                check_and_increment_ai_quota(local_db)
        except Exception as e:
            errors.append(e)
        finally:
            local_db.close()

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    today_str = get_utc_now().strftime("%Y-%m-%d")
    config = setup_db.query(UserConfig).filter(UserConfig.key == f"ai_limit_{today_str}").first()
    assert config is not None
    # 5 threads * 3 increments = 15 total used
    assert int(config.value) == 15
    assert len(errors) == 0

def test_fairplay_lock_blocks_hints_during_active_badge_test(setup_db):
    """Verifies that hint endpoints reject requests with HTTP 403 when a Badge Test is active."""
    setup_db.add(BadgeTest(
        topic="Arrays & Hashing",
        level=1,
        status="active",
        start_time=get_utc_now(),
        problem1_id="two-sum",
        problem2_id="group-anagrams",
        problem1_solved=False,
        problem2_solved=False,
    ))
    setup_db.commit()

    res = client.post("/hints/get", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "class Solution {}",
        "language": "python3"
    })
    assert res.status_code == 403
    assert "locked during an active Badge Test" in res.json()["detail"]

def test_security_sql_injection_defense():
    """Verifies SQL injection attempts in problem paths and filters are safely parameterized without crashing."""
    malicious_slug = "two-sum' OR '1'='1"
    res = client.get(f"/problems/{malicious_slug}")
    assert res.status_code == 200
    assert res.json()["problem_id"] == malicious_slug

def test_security_xss_in_notes_sanitization(setup_db):
    """Verifies storing and retrieving HTML/script payloads in notes does not cause server corruption."""
    xss_note = "<script>alert('XSS')</script><b>Valid note</b>"
    res = client.post("/problems/two-sum/notes", json={"user_notes": xss_note})
    assert res.status_code == 200
    
    get_res = client.get("/problems/two-sum")
    assert get_res.status_code == 200
    assert get_res.json()["user_notes"] == xss_note
