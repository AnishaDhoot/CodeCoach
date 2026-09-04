"""
recommender.py — Test-driven topic mastery scoring & next-problem selection.
Badges and topic mastery levels (0-5) are unlocked strictly via Badge Tests.
"""

import random
import time
from datetime import datetime, timedelta, timezone

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.models import Problem, Attempt, TopicMastery, SpacedRepetition, KNOWN_PREMIUM_SLUGS

# ---------------------------------------------------------------------------
# Canonical Topic Map & Normalization Helper
# ---------------------------------------------------------------------------
CANONICAL_TOPIC_MAP = {
    # Arrays
    "array": "Arrays",
    "arrays": "Arrays",
    "arrays & hashing": "Arrays",
    "matrix": "Arrays",
    "sorting": "Arrays",

    # Strings
    "string": "Strings",
    "strings": "Strings",
    "string matching": "Strings",

    # Sliding Window & Two Pointers
    "two pointers": "Sliding Window & Two Pointers",
    "sliding window": "Sliding Window & Two Pointers",
    "sliding window & two pointers": "Sliding Window & Two Pointers",

    # Binary Search
    "binary search": "Binary Search",

    # Linked List
    "linked list": "Linked List",
    "linked lists": "Linked List",
    "doubly-linked list": "Linked List",

    # Stack & Queue
    "stack": "Stack & Queue",
    "stacks": "Stack & Queue",
    "queue": "Stack & Queue",
    "queues": "Stack & Queue",
    "monotonic stack": "Stack & Queue",
    "monotonic queue": "Stack & Queue",
    "stack & queue": "Stack & Queue",

    # Hashing
    "hash table": "Hashing",
    "hash function": "Hashing",
    "hashing": "Hashing",
    "hashmap": "Hashing",

    # Recursion & Backtracking
    "recursion": "Recursion & Backtracking",
    "backtracking": "Recursion & Backtracking",
    "recursion & backtracking": "Recursion & Backtracking",

    # Trees & BST
    "tree": "Trees & BST",
    "trees": "Trees & BST",
    "trees & bst": "Trees & BST",
    "binary tree": "Trees & BST",
    "binary search tree": "Trees & BST",

    # Heaps / Priority Queue
    "heap (priority queue)": "Heaps / Priority Queue",
    "heap": "Heaps / Priority Queue",
    "heaps": "Heaps / Priority Queue",
    "priority queue": "Heaps / Priority Queue",
    "heaps / priority queue": "Heaps / Priority Queue",

    # Graphs
    "graph": "Graphs",
    "graphs": "Graphs",
    "depth-first search": "Graphs",
    "breadth-first search": "Graphs",
    "union find": "Graphs",
    "topological sort": "Graphs",
    "shortest path": "Graphs",
    "minimum spanning tree": "Graphs",

    # Dynamic Programming
    "dynamic programming": "Dynamic Programming",
    "dp": "Dynamic Programming",
    "memoization": "Dynamic Programming",

    # Greedy
    "greedy": "Greedy",

    # Trie & Bit Manipulation
    "trie": "Trie & Bit Manipulation",
    "bit manipulation": "Trie & Bit Manipulation",
    "bitmask": "Trie & Bit Manipulation",
    "trie & bit manipulation": "Trie & Bit Manipulation",
}

def normalize_topic(topic_str: str) -> str:
    """Maps raw LeetCode or scraped tags into one of the 14 standard DSA categories."""
    if not topic_str:
        return "Arrays"
    clean = topic_str.strip().lower()
    return CANONICAL_TOPIC_MAP.get(clean, topic_str.strip())


# ---------------------------------------------------------------------------
# Topic Tag Isolation Helper
# ---------------------------------------------------------------------------
EXCLUDED_TAGS_FOR_TOPIC = {
    "Arrays": ["tree", "graph", "depth-first search", "breadth-first search", "trie", "dynamic programming", "backtracking", "union-find"],
    "Arrays & Hashing": ["tree", "graph", "depth-first search", "breadth-first search", "trie", "dynamic programming", "backtracking", "union-find"],
    "Two Pointers": ["tree", "graph", "trie"],
    "Sliding Window": ["tree", "graph", "trie"],
    "Sliding Window & Two Pointers": ["tree", "graph", "trie"],
    "Stack": ["tree", "graph"],
    "Stack & Queue": ["tree", "graph"],
    "Binary Search": ["tree", "graph"],
    "Linked List": ["tree", "graph"],
    "Trees & BST": ["graph"],
}

def filter_problems_for_topic(problems: list, target_topic: str) -> list:
    """
    Filters out problems whose secondary metadata tags conflict with the primary target topic.
    For example, excludes Tree/Graph/DP/Backtracking problems when selecting pure 'Arrays & Hashing' questions.
    """
    excluded = EXCLUDED_TAGS_FOR_TOPIC.get(target_topic, [])
    if not excluded:
        t_low = (target_topic or "").lower()
        if "array" in t_low or "hash" in t_low:
            excluded = ["tree", "graph", "depth-first search", "breadth-first search", "trie", "dynamic programming", "backtracking"]

    if not excluded:
        return problems

    valid = []
    for p in problems:
        t_str = (p.topics or "").lower()
        if not any(ex in t_str for ex in excluded):
            valid.append(p)
    return valid if len(valid) >= 2 else problems


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------
RAMP_THRESHOLD = 3
EPSILON = 0.15

# Weak-pair detection: min co-occurrence count and max badge level for "weak"
WEAK_PAIR_MIN_COOCCUR = 2
WEAK_PAIR_MAX_LEVEL = 2  # Level 0 or 1 (< 40% mastery)

# Module-level cache for weak pairs {result: list, computed_at: float}
_weak_pair_cache: dict = {"result": [], "computed_at": 0.0}
_WEAK_PAIR_TTL = 3600  # seconds


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def update_mastery_on_submission(
    db: Session,
    topic_name: str,
    is_success: bool,
    difficulty: str = "Medium",
) -> TopicMastery:
    """
    Updates TopicMastery attempt/success metrics and reschedules spaced-repetition
    review dates. Badge levels advance exclusively via Badge Tests.
    """
    canonical_name = normalize_topic(topic_name)
    mastery = db.query(TopicMastery).filter(TopicMastery.topic == canonical_name).first()
    if not mastery:
        mastery = TopicMastery(
            topic=canonical_name,
            rating=1200.0,
            attempts_count=0,
            success_count=0,
            level=0
        )
        db.add(mastery)
        db.flush()

    now = get_utc_now()

    # --- Bookkeeping ---
    mastery.attempts_count += 1
    if is_success:
        mastery.success_count += 1
    mastery.last_updated = get_utc_now()

    # Keep rating column synchronized with level (800 + level * 240)
    mastery.rating = 800.0 + (mastery.level or 0) * 240.0

    # --- Spaced-repetition scheduling ---
    score = mastery.mastery_score  # derived 0-1 from level property
    if is_success:
        if score < 0.3:
            interval_days = 1
        elif score < 0.5:
            interval_days = 3
        elif score < 0.7:
            interval_days = 7
        else:
            interval_days = 14
        mastery.next_review_date = now + timedelta(days=interval_days)
    else:
        # Failed: needs immediate review
        mastery.next_review_date = now
    db.commit()
    db.refresh(mastery)
    return mastery


def filter_problems_for_topic(problems: list, topic: str) -> list:
    """Helper to match problems that belong to the specified topic, isolating pure topic questions."""
    if not topic:
        return problems
    t_lower = topic.lower()
    matches = []
    for p in problems:
        p_topics = (p.topics or "").lower()
        if "arrays" in t_lower or "hashing" in t_lower:
            if ("tree" in p_topics or "graph" in p_topics or "dynamic programming" in p_topics) and "tree" not in t_lower and "graph" not in t_lower:
                continue
        if t_lower in p_topics:
            matches.append(p)
        elif "two pointers" in t_lower and ("two pointers" in p_topics or "two pointer" in p_topics or "array" in p_topics):
            matches.append(p)
        elif "sliding window" in t_lower and ("sliding window" in p_topics or "two pointers" in p_topics or "array" in p_topics):
            matches.append(p)
        elif "binary search" in t_lower and "binary search" in p_topics:
            matches.append(p)
        elif "tree" in t_lower and ("tree" in p_topics or "bst" in p_topics):
            matches.append(p)
        elif "graph" in t_lower and "graph" in p_topics:
            matches.append(p)
        elif "heap" in t_lower and ("heap" in p_topics or "priority queue" in p_topics):
            matches.append(p)
        elif "dp" in t_lower or "dynamic programming" in t_lower:
            if "dynamic programming" in p_topics or "dp" in p_topics:
                matches.append(p)
    return matches if matches else [p for p in problems if t_lower in (p.topics or "").lower()]


def update_spaced_repetition(db: Session, problem_id: str) -> SpacedRepetition:
    """
    Saves or advances the spaced-repetition schedule for a solved problem.

    Stages
    ------
    1 → review in  3 days (Short term)
    2 → review in  7 days (1 week)
    3 → review in 14 days (2 weeks)
    4 → review in 30 days (1 month review)
    5 → completed / mastered, far-future date
    """
    now = get_utc_now()
    sr = db.query(SpacedRepetition).filter(SpacedRepetition.problem_id == problem_id).first()

    if not sr:
        sr = SpacedRepetition(
            problem_id=problem_id,
            stage=1,
            last_solved=now,
            next_due=now + timedelta(days=3),
        )
        db.add(sr)
    else:
        if sr.stage == 1:
            sr.stage = 2
            sr.next_due = now + timedelta(days=7)
        elif sr.stage == 2:
            sr.stage = 3
            sr.next_due = now + timedelta(days=14)
        elif sr.stage == 3:
            sr.stage = 4
            sr.next_due = now + timedelta(days=30)  # Monthly review!
        elif sr.stage >= 4:
            sr.stage = 5
            sr.next_due = now + timedelta(days=3650)  # effectively "done / mastered"
        sr.last_solved = now

    db.commit()
    db.refresh(sr)
    return sr


# ---------------------------------------------------------------------------
# Tier 2.1 — Weak-pair detection
# ---------------------------------------------------------------------------

def compute_weak_pairs(db: Session) -> list:
    """
    Finds pairs of topics that are both weak (rating < WEAK_PAIR_MAX_RATING)
    and frequently co-occur in the same problem.

    Returns a list of dicts: [{topic_a, topic_b, co_occurrence}]
    Sorted by co_occurrence descending.  Results are cached for TTL seconds.
    """
    global _weak_pair_cache
    now_ts = time.time()
    if now_ts - _weak_pair_cache["computed_at"] < _WEAK_PAIR_TTL:
        return _weak_pair_cache["result"]

    weak_masteries = (
        db.query(TopicMastery)
        .filter(TopicMastery.level < WEAK_PAIR_MAX_LEVEL)
        .all()
    )
    weak_topics = [m.topic for m in weak_masteries]

    if len(weak_topics) < 2:
        _weak_pair_cache = {"result": [], "computed_at": now_ts}
        return []

    # Count co-occurrences in the Problem table
    all_problems = db.query(Problem).all()
    pair_counts: dict = {}

    for i in range(len(weak_topics)):
        for j in range(i + 1, len(weak_topics)):
            ta, tb = weak_topics[i], weak_topics[j]
            count = sum(
                1 for p in all_problems
                if ta in (p.topics or "") and tb in (p.topics or "")
            )
            if count >= WEAK_PAIR_MIN_COOCCUR:
                pair_counts[(ta, tb)] = count

    result = [
        {"topic_a": a, "topic_b": b, "co_occurrence": c}
        for (a, b), c in sorted(pair_counts.items(), key=lambda x: -x[1])
    ]

    _weak_pair_cache = {"result": result, "computed_at": now_ts}
    return result


def get_topic_time_trend(db: Session, topic_name: str) -> list:
    """
    Returns recent attempts for problems tagged with topic_name containing
    timestamp and time_spent_seconds (Tier 1.3).
    """
    problems = db.query(Problem).filter(Problem.topics.like(f"%{topic_name}%")).all()
    if not problems:
        return []
    prob_ids = [p.id for p in problems]
    attempts = (
        db.query(Attempt)
        .filter(Attempt.problem_id.in_(prob_ids), Attempt.time_spent_seconds.isnot(None))
        .order_by(desc(Attempt.timestamp))
        .limit(10)
        .all()
    )
    return [
        {
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            "time_spent_seconds": a.time_spent_seconds,
            "verdict": a.verdict,
            "problem_id": a.problem_id
        }
        for a in reversed(attempts)
    ]


# ---------------------------------------------------------------------------
# Tier 2.2 + 2.3 — Main recommender
# ---------------------------------------------------------------------------

def get_next_problem(db: Session, focus_topic=None, company: str = None) -> dict:
    """
    Determines recommended problems and spaced-repetition review items.

    Returns at least 3 unique problem recommendations plus all active reviews
    that are currently due.

    Supports up to 3 focus topics (focus_topic can be a list or comma-separated string).
    """
    now = get_utc_now()

    # Normalize focus_topics list (up to 3)
    focus_list = []
    if isinstance(focus_topic, str) and focus_topic.strip():
        focus_list = [t.strip() for t in focus_topic.split(',') if t.strip()]
    elif isinstance(focus_topic, (list, tuple)):
        focus_list = [str(t).strip() for t in focus_topic if str(t).strip()]
    focus_list = focus_list[:3]

    # 1. Gather active spaced-repetition reviews that are due
    reviews_due = db.query(SpacedRepetition).filter(
        SpacedRepetition.next_due <= now,
        SpacedRepetition.stage < 5,
    ).all()

    reviews = []
    due_problem_ids = set()
    for r in reviews_due:
        prob = db.query(Problem).filter(
            Problem.id == r.problem_id,
            Problem.is_premium == False,
            Problem.id.notin_(KNOWN_PREMIUM_SLUGS)
        ).first()
        if prob:
            reviews.append({
                "problem_id": prob.id,
                "title": prob.title,
                "url": prob.url,
                "difficulty": prob.difficulty,
                "due_date": r.next_due,
                "stage": r.stage,
                "topics": prob.topics,
                "companies": prob.companies,
            })
            due_problem_ids.add(prob.id)

    # Sort reviews by urgency (earliest due date first) and cap to top 10 to avoid queue overload
    reviews.sort(key=lambda x: x["due_date"] if x.get("due_date") else now)
    reviews = reviews[:10]

    # 2. Build base problem pool (strictly non-premium — Tier 1.1)
    def _pool_query():
        q = db.query(Problem).filter(
            Problem.is_premium == False,
            Problem.id.notin_(KNOWN_PREMIUM_SLUGS)
        )
        if company:
            q = q.filter(Problem.companies.like(f"%{company}%"))
        return q.all()

    base_pool = _pool_query()
    base_pool_ids = {p.id for p in base_pool}

    # 3. Build a prioritized list of topics
    masteries = db.query(TopicMastery).all()
    mastery_by_topic = {m.topic: m for m in masteries}

    focus_topic_records = []
    for f_topic in focus_list:
        rec = mastery_by_topic.get(f_topic)
        if not rec:
            # Create a transient record for unseeded/unattempted focus topic
            rec = TopicMastery(
                topic=f_topic,
                level=0,
                rating=1200.0,
                attempts_count=0,
                success_count=0
            )
        if rec not in focus_topic_records:
            focus_topic_records.append(rec)

    overdue_topics = []
    other_topics = []

    for m in masteries:
        if m.topic in focus_list:
            continue  # already in focus_topic_records

        has_problems = any(
            m.topic in (p.topics or "") for p in base_pool
        )
        if not has_problems:
            continue

        if m.next_review_date and m.next_review_date <= now:
            overdue_topics.append(m)
        else:
            other_topics.append(m)

    # Sort by mastery_score ascending so weakest topics come first
    overdue_topics.sort(key=lambda x: x.mastery_score)
    other_topics.sort(key=lambda x: x.mastery_score)

    prioritized_topics = list(focus_topic_records) + overdue_topics + other_topics

    recommendations = []
    recommended_ids = set()

    def add_recommendation(p, reason):
        if p.id not in recommended_ids and p.id not in due_problem_ids and p.id in base_pool_ids:
            recommendations.append({
                "problem_id": p.id,
                "title": p.title,
                "url": p.url,
                "difficulty": p.difficulty,
                "reason": reason,
                "topics": p.topics,
                "companies": p.companies,
            })
            recommended_ids.add(p.id)
            return True
        return False

    _topic_stats_cache = {}

    def get_topic_target_difficulty_and_reason(topic_record):
        if topic_record.topic in _topic_stats_cache:
            return _topic_stats_cache[topic_record.topic]

        topic = topic_record.topic
        level = topic_record.level or 0
        badge = topic_record.badge

        if level == 0:
            target_difficulty = "Easy"
            difficulty_reason = f"Locked badge for {topic}. Try Easy questions to build foundation and start a test!"
        elif level == 1:
            target_difficulty = "Easy"
            difficulty_reason = f"You have the Bronze badge for {topic}. Try Easy questions to practice!"
        elif level in [2, 3]:
            target_difficulty = "Medium"
            difficulty_reason = f"You have the {badge} badge for {topic}. Recommending Medium difficulty."
        else:
            target_difficulty = "Hard"
            difficulty_reason = f"You have the {badge} badge for {topic}. Challenging you with Hard questions!"

        # Adjust for recent streaks
        topic_problems = [p for p in base_pool if topic in (p.topics or "")]
        topic_problems = filter_problems_for_topic(topic_problems, topic)
        topic_prob_ids = [p.id for p in topic_problems]
        
        recent_attempts = []
        if topic_prob_ids:
            recent_attempts = (
                db.query(Attempt)
                .filter(Attempt.problem_id.in_(topic_prob_ids))
                .order_by(desc(Attempt.timestamp))
                .limit(3)
                .all()
            )

        if len(recent_attempts) >= 2:
            last_verdicts = [a.verdict for a in recent_attempts[:2]]
            if all(v == "Accepted" for v in last_verdicts):
                if target_difficulty == "Easy":
                    target_difficulty = "Medium"
                    difficulty_reason = f"You solved the last 2 {topic} problems! Upgrading to Medium."
                elif target_difficulty == "Medium":
                    target_difficulty = "Hard"
                    difficulty_reason = f"You solved the last 2 {topic} problems! Upgrading to Hard."
            elif all(v != "Accepted" for v in last_verdicts):
                if target_difficulty == "Hard":
                    target_difficulty = "Medium"
                    difficulty_reason = f"Let's try Medium difficulty in {topic} to rebuild confidence."
                elif target_difficulty == "Medium":
                    target_difficulty = "Easy"
                    difficulty_reason = f"Let's build core concepts in {topic} with an Easy problem."

        result = (target_difficulty, difficulty_reason, recent_attempts, topic_problems)
        _topic_stats_cache[topic_record.topic] = result
        return result

    # 4. Strategy for recommendations:
    # If user selected focus topics, allocate slots to focus topics first!
    if focus_topic_records:
        # Pass A: Round-robin across focus topics to add problems
        max_per_focus = 3 if len(focus_topic_records) == 1 else 2
        for _ in range(max_per_focus):
            if len(recommendations) >= 3:
                break
            for topic_record in focus_topic_records:
                if len(recommendations) >= 3:
                    break
                topic = topic_record.topic
                target_diff, diff_reason, recent_attempts, topic_problems = get_topic_target_difficulty_and_reason(topic_record)
                full_reason = f"Focus topic suggestion: {topic}. {diff_reason}"

                # 1. Retry failed problem first if any
                added = False
                if recent_attempts and recent_attempts[0].verdict != "Accepted":
                    failed_prob = db.query(Problem).filter(Problem.id == recent_attempts[0].problem_id).first()
                    if failed_prob and failed_prob.id in base_pool_ids:
                        if add_recommendation(
                            failed_prob,
                            f"Focus topic retry for {topic}: resolve last failure ({recent_attempts[0].root_cause_category or 'bug'})."
                        ):
                            added = True

                # 2. Target difficulty problems (never solved / not solved recently)
                if not added:
                    cand_probs = [p for p in topic_problems if p.difficulty == target_diff and p.id not in recommended_ids]
                    for p in cand_probs:
                        if add_recommendation(p, full_reason):
                            added = True
                            break

                # 3. Any difficulty in focus topic
                if not added:
                    cand_probs = [p for p in topic_problems if p.id not in recommended_ids]
                    for p in cand_probs:
                        if add_recommendation(p, f"Focus topic practice: {topic} ({p.difficulty})."):
                            added = True
                            break

    # Pass B: Fill remaining recommendations from general prioritized topics (overdue -> lowest mastery)
    for topic_record in prioritized_topics:
        if len(recommendations) >= 3:
            break

        topic = topic_record.topic
        target_diff, diff_reason, recent_attempts, topic_problems = get_topic_target_difficulty_and_reason(topic_record)

        if focus_list and topic in focus_list:
            reason_prefix = f"Focus topic suggestion: {topic}."
        elif topic_record in overdue_topics:
            reason_prefix = f"Review due for {topic}."
        else:
            reason_prefix = f"Mastery focus: {topic}."

        full_reason = f"{reason_prefix} {diff_reason}"

        # Retry failed problem
        added_for_topic = False
        if recent_attempts and recent_attempts[0].verdict != "Accepted":
            failed_prob = db.query(Problem).filter(Problem.id == recent_attempts[0].problem_id).first()
            if failed_prob and failed_prob.id in base_pool_ids:
                if add_recommendation(
                    failed_prob,
                    f"Retry {failed_prob.title} to resolve your last failure: {recent_attempts[0].root_cause_category or 'implementation bug'}."
                ):
                    added_for_topic = True

        if not added_for_topic:
            fourteen_days_ago = get_utc_now() - timedelta(days=14)
            problems = [p for p in topic_problems if p.difficulty == target_diff]

            # Batch query accepted attempts for these problems to avoid N queries in sort
            p_ids = [p.id for p in problems]
            accepted_map = {}
            if p_ids:
                acc_records = (
                    db.query(Attempt.problem_id, Attempt.timestamp)
                    .filter(Attempt.problem_id.in_(p_ids), Attempt.verdict == "Accepted")
                    .all()
                )
                for pid, ts in acc_records:
                    if pid not in accepted_map or (ts and accepted_map[pid] and ts > accepted_map[pid]):
                        accepted_map[pid] = ts

            def _solve_recency_score(prob):
                last_ts = accepted_map.get(prob.id)
                if not last_ts:
                    return 0
                if last_ts < fourteen_days_ago:
                    return 1
                return 2

            problems.sort(key=_solve_recency_score)
            for p in problems:
                if add_recommendation(p, full_reason):
                    added_for_topic = True
                    break

    # Pass C: Fallback to base pool or focused topics if company-specific pool is exhausted or empty
    if len(recommendations) < 3:
        for p in base_pool:
            if len(recommendations) >= 3:
                break
            add_recommendation(p, f"Company practice recommendation for {company}." if company else "General practice recommendation.")

    # Pass D: If company filter was applied and still fewer than 3 recommendations, fallback to all non-premium problems prioritized by focus/weak topics
    if len(recommendations) < 3 and company:
        all_non_prem = db.query(Problem).filter(
            Problem.is_premium == False,
            Problem.id.notin_(KNOWN_PREMIUM_SLUGS)
        ).all()
        all_non_prem_map = {p.id: p for p in all_non_prem}
        
        # Try focus topics first
        for topic_record in prioritized_topics:
            if len(recommendations) >= 3:
                break
            topic = topic_record.topic
            topic_probs = [p for p in all_non_prem if topic in (p.topics or "")]
            for p in topic_probs:
                if p.id not in recommended_ids and p.id not in due_problem_ids:
                    reason = f"Focused Practice: No direct {company} questions found; recommending this {p.difficulty} {topic} problem based on your focus profile."
                    recommendations.append({
                        "problem_id": p.id,
                        "title": p.title,
                        "url": p.url,
                        "difficulty": p.difficulty,
                        "reason": reason,
                        "topics": p.topics,
                        "companies": p.companies,
                    })
                    recommended_ids.add(p.id)
                    if len(recommendations) >= 3:
                        break

        # Final fill from all problems if still needed
        for p in all_non_prem:
            if len(recommendations) >= 3:
                break
            if p.id not in recommended_ids and p.id not in due_problem_ids:
                recommendations.append({
                    "problem_id": p.id,
                    "title": p.title,
                    "url": p.url,
                    "difficulty": p.difficulty,
                    "reason": f"Focused Practice: General recommendation based on topic mastery (no additional questions for {company}).",
                    "topics": p.topics,
                    "companies": p.companies,
                })
                recommended_ids.add(p.id)

    # --- Tier 2.2: epsilon-greedy exploration (only if no focus list is set and no company filter) ---
    if not focus_list and not company and recommendations and random.random() < EPSILON:
        exploration_topics = [
            m for m in masteries
            if not (0.40 <= m.mastery_score <= 0.65)
        ]
        if exploration_topics:
            exp_topic = random.choice(exploration_topics)
            exp_probs = [
                p for p in base_pool
                if exp_topic.topic in (p.topics or "")
                and p.id not in recommended_ids
                and p.id not in due_problem_ids
                and not p.is_premium
                and p.id not in KNOWN_PREMIUM_SLUGS
            ]
            if exp_probs:
                ep = random.choice(exp_probs)
                recommendations[-1] = {
                    "problem_id": ep.id,
                    "title": ep.title,
                    "url": ep.url,
                    "difficulty": ep.difficulty,
                    "topics": ep.topics,
                    "companies": ep.companies,
                    "reason": f"Exploration: trying {exp_topic.topic} to broaden your skills.",
                }

    return {"recommendations": recommendations, "reviews": reviews}
