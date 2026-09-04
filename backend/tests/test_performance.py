import pytest
import time
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, TopicMastery
from backend.recommender import get_next_problem

@pytest.fixture(autouse=True)
def populate_benchmark_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Populate 100 problems
    problems = []
    for i in range(100):
        problems.append(Problem(
            id=f"prob-{i}",
            title=f"Problem {i}",
            url=f"https://leetcode.com/problems/prob-{i}",
            difficulty="Easy" if i % 3 == 0 else ("Medium" if i % 3 == 1 else "Hard"),
            topics="Arrays & Hashing" if i % 2 == 0 else "Two Pointers",
            is_premium=False
        ))
    db.add_all(problems)
    
    tm1 = TopicMastery(topic="Arrays & Hashing", level=2, rating=1280.0, attempts_count=10, success_count=8)
    tm2 = TopicMastery(topic="Two Pointers", level=1, rating=1040.0, attempts_count=5, success_count=2)
    db.add_all([tm1, tm2])
    db.commit()
    yield db
    db.close()

def test_recommendation_latency_under_50ms(populate_benchmark_db):
    """Verifies that next problem recommendation executes in under 50ms across 100 problems."""
    start_time = time.perf_counter()
    res = get_next_problem(populate_benchmark_db)
    elapsed_ms = (time.perf_counter() - start_time) * 1000
    
    assert len(res["recommendations"]) == 3
    # Ensure recommendation computation is fast (< 50ms)
    assert elapsed_ms < 50.0, f"Recommendation latency too high: {elapsed_ms:.2f}ms"
