import pytest
from datetime import timedelta
from backend.database import SessionLocal
from backend.models import Problem, Attempt, TopicMastery, SpacedRepetition, UserConfig, BadgeTest
from backend.recommender import (
    get_next_problem,
    update_mastery_on_submission,
    update_spaced_repetition,
    filter_problems_for_topic,
    get_utc_now,
)

@pytest.fixture(autouse=True)
def clean_db():
    db = SessionLocal()
    db.query(BadgeTest).delete()
    db.query(Attempt).delete()
    db.query(UserConfig).delete()
    db.query(SpacedRepetition).delete()
    
    # Seed test problems
    p1 = Problem(id="two-sum", title="Two Sum", url="https://leetcode.com/problems/two-sum", difficulty="Easy", topics="Arrays & Hashing", is_premium=False)
    p2 = Problem(id="group-anagrams", title="Group Anagrams", url="https://leetcode.com/problems/group-anagrams", difficulty="Medium", topics="Arrays & Hashing", is_premium=False)
    p3 = Problem(id="valid-palindrome", title="Valid Palindrome", url="https://leetcode.com/problems/valid-palindrome", difficulty="Easy", topics="Two Pointers", is_premium=False)
    p4 = Problem(id="3sum", title="3Sum", url="https://leetcode.com/problems/3sum", difficulty="Medium", topics="Two Pointers", is_premium=False)
    p5 = Problem(id="climbing-stairs", title="Climbing Stairs", url="https://leetcode.com/problems/climbing-stairs", difficulty="Easy", topics="Dynamic Programming", is_premium=False)
    p6 = Problem(id="coin-change", title="Coin Change", url="https://leetcode.com/problems/coin-change", difficulty="Medium", topics="Dynamic Programming", is_premium=False)
    
    db.merge(p1)
    db.merge(p2)
    db.merge(p3)
    db.merge(p4)
    db.merge(p5)
    db.merge(p6)
    
    # Seed topic masteries
    tm1 = TopicMastery(topic="Arrays & Hashing", level=1, rating=1040.0, attempts_count=5, success_count=4)
    tm2 = TopicMastery(topic="Two Pointers", level=0, rating=800.0, attempts_count=2, success_count=0)
    tm3 = TopicMastery(topic="Dynamic Programming", level=0, rating=800.0, attempts_count=1, success_count=0)
    db.merge(tm1)
    db.merge(tm2)
    db.merge(tm3)
    
    db.commit()
    yield db
    db.close()

def test_recommendation_enforces_topic_diversity(clean_db):
    """Verifies that the 3 problem recommendations come from distinct topics."""
    res = get_next_problem(clean_db)
    recs = res["recommendations"]
    
    assert len(recs) == 3
    topics = [r["topics"] for r in recs]
    # Check that at least 2 or 3 distinct topics are represented across the 3 recommendations
    unique_topics = set(topics)
    assert len(unique_topics) >= 2

def test_streak_ramping_upgrades_difficulty_after_2_wins(clean_db):
    """Verifies difficulty upgrades from Easy to Medium after 2 consecutive Accepted attempts."""
    now = get_utc_now()
    clean_db.add(Attempt(problem_id="two-sum", verdict="Accepted", timestamp=now - timedelta(minutes=5)))
    clean_db.add(Attempt(problem_id="two-sum", verdict="Accepted", timestamp=now - timedelta(minutes=2)))
    clean_db.commit()
    
    res = get_next_problem(clean_db, focus_topic="Arrays & Hashing")
    focus_rec = next((r for r in res["recommendations"] if "Arrays & Hashing" in r["topics"]), None)
    
    assert focus_rec is not None
    assert focus_rec["difficulty"] == "Medium"
    assert "Upgrading to Medium" in focus_rec["reason"]

def test_spaced_repetition_5_stage_progression(clean_db):
    """Verifies spaced repetition stage transitions from 1 -> 2 -> 3 -> 4 -> 5."""
    sr = update_spaced_repetition(clean_db, "two-sum")
    assert sr.stage == 1
    assert sr.next_due > get_utc_now()
    
    sr2 = update_spaced_repetition(clean_db, "two-sum")
    assert sr2.stage == 2
    
    sr3 = update_spaced_repetition(clean_db, "two-sum")
    assert sr3.stage == 3
    
    sr4 = update_spaced_repetition(clean_db, "two-sum")
    assert sr4.stage == 4
    
    sr5 = update_spaced_repetition(clean_db, "two-sum")
    assert sr5.stage == 5

def test_topic_tag_isolation_filter():
    """Verifies multi-paradigm tree/graph/DP tags are filtered out when isolating pure topic questions."""
    p_pure1 = Problem(id="contains-duplicate", title="Contains Duplicate", topics="Arrays & Hashing, Array")
    p_pure2 = Problem(id="two-sum", title="Two Sum", topics="Arrays & Hashing")
    p_mixed = Problem(id="find-duplicate-subtrees", title="Find Duplicate Subtrees", topics="Arrays & Hashing, Tree, Depth-First Search")
    
    filtered = filter_problems_for_topic([p_pure1, p_pure2, p_mixed], "Arrays & Hashing")
    assert len(filtered) == 2
    assert "find-duplicate-subtrees" not in [p.id for p in filtered]
