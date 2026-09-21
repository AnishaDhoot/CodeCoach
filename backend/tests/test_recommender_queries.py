import pytest
from sqlalchemy import event
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, TopicMastery, Attempt
from backend.recommender import get_next_problem
from backend.conftest import ensure_test_user


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    for i in range(60):
        session.add(Problem(
            id=f"p{i}", title=f"P{i}", url=f"https://leetcode.com/problems/p{i}/",
            difficulty="Easy" if i % 2 else "Medium",
            topics="Arrays" if i % 3 else "Strings",
            companies="Google" if i % 2 else "Amazon",
            is_premium=False,
        ))
    for t in ("Arrays", "Strings", "Trees"):
        session.add(TopicMastery(topic=t, level=1, rating=1100.0, attempts_count=2, success_count=1))
    session.commit()
    yield session
    session.close()


def _count_queries(fn):
    n = [0]

    def on_exec(*_a, **_k):
        n[0] += 1

    event.listen(engine, "before_cursor_execute", on_exec)
    try:
        result = fn()
    finally:
        event.remove(engine, "before_cursor_execute", on_exec)
    return result, n[0]


def test_recommendation_uses_a_constant_number_of_queries(db):
    uid = ensure_test_user(db).id
    for i in range(20):  # many attempts must not add per-topic/per-problem queries
        db.add(Attempt(user_id=uid, problem_id=f"p{i}", verdict="Accepted" if i % 2 else "Wrong Answer",
                       root_cause_category="none", explanation_text="x"))
    db.commit()
    res, n = _count_queries(lambda: get_next_problem(db, uid))
    assert len(res["recommendations"]) == 3
    assert n <= 6, f"expected a handful of queries, got {n}"


def test_company_filter_returns_only_that_company(db):
    uid = ensure_test_user(db).id
    res = get_next_problem(db, uid, company="Google")
    assert len(res["recommendations"]) == 3
    assert all("Google" in (r["companies"] or "") for r in res["recommendations"])
