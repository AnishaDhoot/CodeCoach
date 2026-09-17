"""
Authentication for the multi-tenant backend (Phase 1 foundation).

Identity model: the extension mints a random device token on first run and
sends it as `Authorization: Bearer <token>`. The backend maps token -> User.

Two dependencies are exposed:
  * get_current_user            — strict; 401 if no/invalid token. Use when
                                  scoping endpoints in Phase 3.
  * get_current_user_optional   — returns the User or None; never raises. Lets
                                  us thread identity through today WITHOUT breaking
                                  the still-open endpoints and their tests.

A Google Sign-In (chrome.identity) linking flow will attach to the same User
rows in Phase 2 via the reserved `google_sub` / `email` columns.
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, get_utc_now


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Resolve the caller from a bearer token, or None. Never raises.

    Also refreshes `last_seen` so we can measure active users without a separate
    heartbeat endpoint.
    """
    token = _extract_bearer(authorization)
    if not token:
        return None
    user = db.query(User).filter(User.device_token == token).first()
    if user:
        user.last_seen = get_utc_now()
        db.commit()
    return user


def get_current_user(
    user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    """Strict variant: 401 unless a valid token resolves to a user.

    Phase 3 swaps the domain endpoints over to this dependency.
    """
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required. Missing or invalid bearer token.")
    return user
