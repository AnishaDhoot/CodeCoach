import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy.exc import IntegrityError
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, Attempt, TopicMastery, UserConfig, SpacedRepetition, DailyActivity, BadgeTest

@pytest.fixture(autouse=True)
def isolated_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.rollback()
    db.close()

def test_database_schema_creation_and_tables():
    """Verifies all required database tables exist in metadata."""
    expected_tables = {
        "problems",
        "attempts",
        "topic_mastery",
        "user_config",
        "spaced_repetition",
        "daily_activity",
        "badge_tests",
        "company_metadata",
    }
    created_tables = set(Base.metadata.tables.keys())
    assert expected_tables.issubset(created_tables)

def test_foreign_key_and_not_null_integrity(isolated_db):
    """Verifies NOT NULL constraints trigger database IntegrityError on missing required fields."""
    with pytest.raises(IntegrityError):
        invalid_prob = Problem(id="bad-prob", title="Bad Problem", difficulty="Easy")
        isolated_db.add(invalid_prob)
        isolated_db.commit()
    isolated_db.rollback()

def test_transaction_rollback_preserves_db_consistency(isolated_db):
    """Verifies transaction rollback on failure does not leave orphan records."""
    valid_prob = Problem(id="p1", title="Problem 1", url="https://leetcode.com/problems/p1", topics="Arrays & Hashing", difficulty="Easy", is_premium=False)
    isolated_db.add(valid_prob)
    isolated_db.commit()

    try:
        isolated_db.add(Problem(id="p2", title="Problem 2", url="https://leetcode.com/problems/p2", topics="Two Pointers", difficulty="Medium", is_premium=False))
        # Intentionally trigger an error by violating NOT NULL url constraint
        isolated_db.add(Problem(id="p3", title="Problem 3", url=None, difficulty="Hard"))
        isolated_db.commit()
    except Exception:
        isolated_db.rollback()

    assert isolated_db.query(Problem).filter(Problem.id == "p1").first() is not None
    assert isolated_db.query(Problem).filter(Problem.id == "p2").first() is None

def test_daily_activity_upsert_streak_tracking(isolated_db):
    """Verifies daily activity attempts and solves update properly."""
    today = "2026-08-22"
    act = DailyActivity(date=today, problems_attempted=1, problems_solved=0)
    isolated_db.add(act)
    isolated_db.commit()

    act_db = isolated_db.query(DailyActivity).filter(DailyActivity.date == today).first()
    act_db.problems_attempted += 1
    act_db.problems_solved += 1
    isolated_db.commit()

    refreshed = isolated_db.query(DailyActivity).filter(DailyActivity.date == today).first()
    assert refreshed.problems_attempted == 2
    assert refreshed.problems_solved == 1
