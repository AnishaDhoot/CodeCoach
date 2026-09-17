"""Phase 3 — representative scoped-endpoint slice.

Proves the per-user pattern on the notes vertical (GET /problems/{id},
POST /problems/{id}/notes): identity is required, and one user's notes are
invisible to another. This is the template every scoped endpoint follows.
"""
import pytest
from starlette.testclient import TestClient

from backend.main import app
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, UserProblem
from backend.tests._auth import register_user

client = TestClient(app)

# This module exercises real token auth + cross-user isolation; opt out of the
# shared get_current_user override in conftest.
pytestmark = pytest.mark.real_auth


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.add(Problem(id="two-sum", title="Two Sum",
                   url="https://leetcode.com/problems/two-sum",
                   difficulty="Easy", topics="Arrays & Hashing", is_premium=False))
    db.commit()
    yield
    db.close()


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def test_notes_require_authentication():
    """Scoped endpoints reject anonymous callers with 401."""
    assert client.get("/problems/two-sum").status_code == 401
    assert client.post("/problems/two-sum/notes", json={"user_notes": "x"}).status_code == 401


def test_notes_are_isolated_per_user():
    """User A's notes never leak to User B; each reads back only their own."""
    token_a, _ = register_user(client)
    token_b, _ = register_user(client)

    # User A writes notes.
    r = client.post("/problems/two-sum/notes",
                    json={"user_notes": "A: use a hashmap", "personal_difficulty": "Easy"},
                    headers=_hdr(token_a))
    assert r.status_code == 200
    assert r.json()["user_notes"] == "A: use a hashmap"

    # User A reads their own note back.
    ra = client.get("/problems/two-sum", headers=_hdr(token_a))
    assert ra.json()["user_notes"] == "A: use a hashmap"
    assert ra.json()["personal_difficulty"] == "Easy"

    # User B sees NOTHING of user A's note.
    rb = client.get("/problems/two-sum", headers=_hdr(token_b))
    assert rb.status_code == 200
    assert rb.json()["user_notes"] == ""
    assert rb.json()["personal_difficulty"] == ""

    # User B writes their own; A's is unchanged.
    client.post("/problems/two-sum/notes", json={"user_notes": "B: sort first"}, headers=_hdr(token_b))
    assert client.get("/problems/two-sum", headers=_hdr(token_a)).json()["user_notes"] == "A: use a hashmap"
    assert client.get("/problems/two-sum", headers=_hdr(token_b)).json()["user_notes"] == "B: sort first"

    # Two distinct per-user rows, one shared catalog row.
    db = SessionLocal()
    try:
        assert db.query(UserProblem).filter(UserProblem.problem_id == "two-sum").count() == 2
        assert db.query(Problem).filter(Problem.id == "two-sum").count() == 1
    finally:
        db.close()


def test_notes_on_unknown_slug_autocreates_catalog_row():
    """Saving notes for an unseen slug creates the shared catalog row once."""
    token, _ = register_user(client)
    r = client.post("/problems/brand-new-problem/notes",
                    json={"user_notes": "note", "problem_title": "Brand New"},
                    headers=_hdr(token))
    assert r.status_code == 200
    db = SessionLocal()
    try:
        assert db.query(Problem).filter(Problem.id == "brand-new-problem").count() == 1
    finally:
        db.close()
