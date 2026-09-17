"""Per-user problem-state helpers (Phase 3).

`problems` is a shared catalog; `user_problems` holds the per-user bits
(solved status, notes, personal difficulty). These helpers are the canonical
pattern every scoped endpoint reuses when reading/writing per-user problem state.
"""
from typing import Optional

from sqlalchemy.orm import Session

from backend.models import Problem, UserProblem, get_utc_now


def get_or_create_problem(db: Session, problem_id: str, *, title: str = None,
                          difficulty: str = "Medium", topics: str = "Arrays & Hashing") -> Problem:
    """Fetch the shared catalog row, creating a minimal one if the slug is unknown."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        problem = Problem(
            id=problem_id,
            title=title or problem_id,
            url=f"https://leetcode.com/problems/{problem_id}/",
            difficulty=difficulty,
            topics=topics,
        )
        db.add(problem)
        db.flush()
    return problem


def get_user_problem(db: Session, user_id: int, problem_id: str) -> Optional[UserProblem]:
    return (
        db.query(UserProblem)
        .filter(UserProblem.user_id == user_id, UserProblem.problem_id == problem_id)
        .first()
    )


def get_or_create_user_problem(db: Session, user_id: int, problem_id: str) -> UserProblem:
    up = get_user_problem(db, user_id, problem_id)
    if not up:
        up = UserProblem(user_id=user_id, problem_id=problem_id)
        db.add(up)
        db.flush()
    up.updated_at = get_utc_now()
    return up
