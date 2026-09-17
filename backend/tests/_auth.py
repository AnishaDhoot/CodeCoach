"""Test helpers for the multi-tenant auth (Phase 3).

Every scoped endpoint requires `Authorization: Bearer <token>`. Tests register a
throwaway user and pass the returned header.
"""


def register_user(client):
    """Register a fresh user; returns (token, user_id)."""
    res = client.post("/auth/register")
    assert res.status_code == 200, res.text
    body = res.json()
    return body["token"], body["user_id"]


def auth_headers(client):
    """Convenience: a bearer-auth header dict for a brand-new user."""
    token, _ = register_user(client)
    return {"Authorization": f"Bearer {token}"}
