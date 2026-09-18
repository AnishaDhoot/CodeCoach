"""Shared test fixtures for the multi-tenant backend.

Feature tests exercise per-user endpoints without juggling tokens: we override
`get_current_user` with a lazy get-or-create of a single fixed test user. The
override resolves per request, so it re-creates the user even after a test's own
fixture has dropped/recreated the schema.

Tests that must exercise REAL auth (401s, cross-user isolation) opt out with:
    pytestmark = pytest.mark.real_auth
"""
import os
# Tests seed the catalog offline (bundled fallback lists) — fast and no network.
os.environ.setdefault("SEED_SKIP_GITHUB", "1")

import pytest
from datetime import datetime, timezone
from fastapi import Depends
from sqlalchemy import event, text
from sqlalchemy.orm import Session

from backend.main import app
from backend.auth import get_current_user
from backend.database import get_db, SessionLocal
from backend.models import (
    User, TopicMastery, SpacedRepetition, DailyActivity, BadgeTest, UserConfig, Attempt, UserProblem,
)

TEST_DEVICE_TOKEN = "pytest-fixed-user"

# Test-only convenience: many legacy fixtures seed per-user rows without a user_id.
# Auto-fill it with the fixed test user so those seeds keep working after the
# multi-tenant migration, without editing every seed statement. (conftest is only
# loaded under pytest, so this never affects production.)
_SCOPED_MODELS = (TopicMastery, SpacedRepetition, DailyActivity, BadgeTest, UserConfig, Attempt, UserProblem)


@event.listens_for(SessionLocal, "before_flush")
def _autofill_test_user_id(session, flush_context, instances):
    pending = [o for o in session.new if isinstance(o, _SCOPED_MODELS) and getattr(o, "user_id", None) is None]
    if not pending:
        return
    conn = session.connection()
    row = conn.execute(text("SELECT id FROM users WHERE device_token = :t"), {"t": TEST_DEVICE_TOKEN}).fetchone()
    if row:
        uid = row[0]
    else:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        conn.execute(
            text("INSERT INTO users (device_token, created_at, last_seen) VALUES (:t, :n, :n)"),
            {"t": TEST_DEVICE_TOKEN, "n": now},
        )
        uid = conn.execute(text("SELECT id FROM users WHERE device_token = :t"), {"t": TEST_DEVICE_TOKEN}).fetchone()[0]
    for o in pending:
        o.user_id = uid


def pytest_configure(config):
    config.addinivalue_line("markers", "real_auth: use real token auth (skip the get_current_user override)")


def ensure_test_user(db: Session) -> User:
    """Get-or-create the shared test user in the given session."""
    user = db.query(User).filter(User.device_token == TEST_DEVICE_TOKEN).first()
    if not user:
        user = User(device_token=TEST_DEVICE_TOKEN)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _override_current_user(db: Session = Depends(get_db)) -> User:
    return ensure_test_user(db)


@pytest.fixture(autouse=True)
def _auth_override(request):
    """Autouse: route get_current_user to the fixed test user, unless the test
    module is marked `real_auth` (which uses real tokens)."""
    if "real_auth" in request.keywords:
        yield
        return
    app.dependency_overrides[get_current_user] = _override_current_user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def test_user_id():
    """The fixed test user's id (for tests that seed rows directly)."""
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        return ensure_test_user(db).id
    finally:
        db.close()
