from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

AI_DAILY_QUOTA_LIMIT = int(os.getenv("AI_DAILY_QUOTA_LIMIT", "50"))

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

import math
from collections import Counter

from backend.database import get_db, engine, Base, IS_SQLITE
from backend.auth import get_current_user, get_current_user_optional
from backend.models import (
    User,
    Problem, Attempt, TopicMastery, UserConfig, SpacedRepetition, DailyActivity,
    BadgeTest, BadgeTestStartRequest, BadgeTestProblemSchema, BadgeTestSchema, CompanyMetadata,
    SubmissionAnalyzeRequest, SubmissionAnalyzeResponse, KNOWN_PREMIUM_SLUGS,
    ProblemRecommendResponse, TopicMasterySchema,
    CheckApproachRequest, CheckApproachResponse,
    GetHintRequest, GetHintResponse,
    HintRevealRequest, HintRevealResponse,
    GetEdgeCasesRequest, GetEdgeCasesResponse,
    AskHelpRequest, AskHelpResponse,
    SyncSolvedRequest, SolvedProblemSyncSchema,
    TopicAnalysisResponse, TopicStatItem, FocusResponse, SetFocusRequest,
    ExplainBackRequest, ExplainBackResponse,
    ComplexityEstimateRequest, ComplexityRevealRequest, ComplexityRevealResponse,
    StreakResponse, WeeklyJournalResponse,
    
    WeakPairItem, SolvedProblemTableItem
)
from backend.agent import (
    generate_diagnosis,
    generate_approach_critique,
    generate_hint,
    generate_levelled_hint,
    analyze_edge_cases,
    answer_custom_question,
    generate_explain_back_check,
    generate_weekly_ai_insights
)
from backend.recommender import (
    update_mastery_on_submission,
    get_next_problem,
    update_spaced_repetition,
    compute_weak_pairs,
    get_topic_time_trend,
    filter_problems_for_topic,
    normalize_topic
)
from backend.seed import seed_db, SEED_DATA

# Ensure tables are created (just in case)
Base.metadata.create_all(bind=engine)


# --- Lightweight in-place schema migration ---------------------------------
# Handles two generations of the topic_mastery schema:
#   Old: mastery_score, success_rate, last_attempted, next_due_date  (flat score)
#   New: rating, success_count, last_updated, next_review_date       (Elo)
#
# SQLite doesn't support ALTER COLUMN / DROP COLUMN with constraints, so when
# the old mastery_score NOT NULL column is present we do the rename-recreate-
# copy-drop dance instead.
def _ensure_schema():
    # The in-place column/table rewrites below are SQLite-specific DDL used to
    # upgrade an existing local dev DB. On Postgres (hosted), Base.metadata.create_all
    # already builds the current schema for a fresh database, and real column
    # alterations are handled by Alembic migrations (Phase 2). So no-op off SQLite.
    if not IS_SQLITE:
        return
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    table_names = insp.get_table_names()

    # -- problems columns --
    if "problems" in table_names:
        prob_cols = [c["name"] for c in insp.get_columns("problems")]
        if "is_solved" not in prob_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE problems ADD COLUMN is_solved BOOLEAN DEFAULT 0 NOT NULL"))
        if "companies" not in prob_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE problems ADD COLUMN companies TEXT"))
        if "user_notes" not in prob_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE problems ADD COLUMN user_notes TEXT"))
        if "personal_difficulty" not in prob_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE problems ADD COLUMN personal_difficulty TEXT"))
        if "solved_live" not in prob_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE problems ADD COLUMN solved_live BOOLEAN DEFAULT 0 NOT NULL"))

    # -- attempts columns --
    if "attempts" in table_names:
        att_cols = [c["name"] for c in insp.get_columns("attempts")]
        if "time_spent_seconds" not in att_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE attempts ADD COLUMN time_spent_seconds INTEGER"))

    # -- topic_mastery Elo migration --
    if "topic_mastery" in table_names:
        tm_cols = {c["name"] for c in insp.get_columns("topic_mastery")}
        if "level" not in tm_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE topic_mastery ADD COLUMN level INTEGER DEFAULT 0 NOT NULL"))

        if "mastery_score" in tm_cols:
            # Old flat-score schema → Elo schema via table reconstruction.
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE topic_mastery RENAME TO _topic_mastery_old"))
                conn.execute(text("""
                    CREATE TABLE topic_mastery (
                        topic            TEXT     PRIMARY KEY NOT NULL,
                        rating           REAL     NOT NULL DEFAULT 1200.0,
                        attempts_count   INTEGER  NOT NULL DEFAULT 0,
                        success_count    INTEGER  NOT NULL DEFAULT 0,
                        level            INTEGER  NOT NULL DEFAULT 0,
                        last_updated     DATETIME,
                        next_review_date DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO topic_mastery
                        (topic, rating, attempts_count, success_count, level,
                         last_updated, next_review_date)
                    SELECT
                        topic,
                        CASE
                            WHEN rating IS NOT NULL AND rating != 1200.0
                            THEN rating
                            ELSE COALESCE(mastery_score, 0.0) * 1200.0 + 800.0
                        END,
                        COALESCE(attempts_count, 0),
                        COALESCE(
                            success_count,
                            CAST(COALESCE(attempts_count,0)*COALESCE(success_rate,0.0) AS INTEGER)
                        ),
                        0,
                        COALESCE(last_updated, last_attempted, DATETIME('now')),
                        COALESCE(next_review_date, next_due_date)
                    FROM _topic_mastery_old
                """))
                conn.execute(text("DROP TABLE _topic_mastery_old"))

        elif "rating" not in tm_cols:
            # Fresh install lacking all Elo columns — add them individually.
            elo_additions = [
                ("rating",           "ALTER TABLE topic_mastery ADD COLUMN rating REAL DEFAULT 1200.0 NOT NULL"),
                ("success_count",    "ALTER TABLE topic_mastery ADD COLUMN success_count INTEGER DEFAULT 0 NOT NULL"),
                ("level",            "ALTER TABLE topic_mastery ADD COLUMN level INTEGER DEFAULT 0 NOT NULL"),
                ("last_updated",     "ALTER TABLE topic_mastery ADD COLUMN last_updated DATETIME"),
                ("next_review_date", "ALTER TABLE topic_mastery ADD COLUMN next_review_date DATETIME"),
            ]
            for col_name, ddl in elo_additions:
                if col_name not in tm_cols:
                    with engine.begin() as conn:
                        conn.execute(text(ddl))

    # -- problems columns --
    if "problems" in table_names:
        prob_cols = [c["name"] for c in insp.get_columns("problems")]
        if "is_premium" not in prob_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE problems ADD COLUMN is_premium BOOLEAN DEFAULT 0 NOT NULL"))


    # -- badge_tests columns --
    if "badge_tests" in table_names:
        bt_cols = [c["name"] for c in insp.get_columns("badge_tests")]
        if "time_limit_seconds" not in bt_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE badge_tests ADD COLUMN time_limit_seconds INTEGER DEFAULT 5400 NOT NULL"))

    # -- Sync premium status for all known premium problem slugs --
    if "problems" in table_names and KNOWN_PREMIUM_SLUGS:
        with engine.begin() as conn:
            slugs_str = ",".join([f"'{s}'" for s in KNOWN_PREMIUM_SLUGS])
            conn.execute(text(f"UPDATE problems SET is_premium = 1 WHERE id IN ({slugs_str})"))

    # Check if database is empty and warn developer
    from backend.database import SessionLocal
    db_conn = SessionLocal()
    try:
        if db_conn.query(Problem).count() == 0:
            print("[Warning] Problems table is empty! Please run 'python backend/seed.py' to seed the database.")
        
        # Smoothly redistribute clumped Stage 1 reviews if a massive batch shares the exact same timestamp
        sr_count = db_conn.query(SpacedRepetition).count()
        if sr_count > 20:
            clumped = db_conn.query(SpacedRepetition).filter(SpacedRepetition.stage == 1).all()
            # If > 50 stage 1 items are identical/overdue from initial batch import, stagger them
            if len(clumped) > 50:
                now_val = get_utc_now()
                # Check if > 50 items share identical minute
                time_groups = Counter([str(sr.next_due)[:16] for sr in clumped])
                most_common_count = time_groups.most_common(1)[0][1] if time_groups else 0
                if most_common_count > 50:
                    for i, sr in enumerate(clumped):
                        stagger_offset = 1 + (abs(hash(sr.problem_id or str(i))) % 14)
                        sr.next_due = now_val + timedelta(days=stagger_offset)
                    db_conn.commit()
    except Exception as e:
        print(f"Database check warning: {e}")
    finally:
        db_conn.close()


_ensure_schema()


# Focus-topic key used inside the UserConfig key/value store.
FOCUS_KEY = "focus_topic"


def _seed_elo_rating(solved_count: int) -> float:
    """Log-scaled Elo seed so synced history yields meaningful ratings.

    rating = 800 + min(1200, 1200 * log(solved + 1) / log(51))
      0  ->  800,  1 ->  ~800,  5 -> ~1136,  10 -> ~1316,
      25 -> ~1556, 50 ->  2000
    """
    if solved_count <= 0:
        return 1200.0  # start at default Elo for new topics
    mastery_fraction = min(1.0, math.log(solved_count + 1) / math.log(51))
    return 800.0 + 1200.0 * mastery_fraction

def normalize_problem_id(pid: Optional[str]) -> str:
    """Normalizes problem identifiers and slugs into consistent lower-case hyphenated format."""
    if not pid:
        return ""
    s = str(pid).strip().rstrip("/").split("/")[-1]
    return s.strip().lower().replace("_", "-").replace(" ", "-")


app = FastAPI(title="Autonomous DSA Tutor Agent Backend")

ALLOWED_ORIGINS = [
    "https://leetcode.com",
    "https://www.leetcode.com",
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Auth (Phase 1 foundation) — device-token identity.
# The extension calls POST /auth/register once, stores the token, and sends it
# as `Authorization: Bearer <token>` thereafter. Domain endpoints stay open until
# Phase 3 scopes them to the authenticated user.
# ---------------------------------------------------------------------------
import secrets


class RegisterResponse(BaseModel):
    token: str
    user_id: int


@app.post("/auth/register", response_model=RegisterResponse)
def register_device(db: Session = Depends(get_db)):
    """Mints a new anonymous account and returns its bearer token."""
    token = secrets.token_urlsafe(32)  # 256 bits of entropy
    user = User(device_token=token)
    db.add(user)
    db.commit()
    db.refresh(user)
    return RegisterResponse(token=token, user_id=user.id)


@app.get("/auth/me")
def whoami(user: User = Depends(get_current_user)):
    """Validates a token and echoes the account. Extensions use this to confirm
    a stored token is still good before trusting it."""
    return {
        "user_id": user.id,
        "email": user.email,
        "linked": user.google_sub is not None,
        "created_at": user.created_at,
    }


def _record_daily_activity(db: Session, is_success: bool):
    today = get_utc_now().strftime("%Y-%m-%d")
    act = db.query(DailyActivity).filter(DailyActivity.date == today).first()
    if not act:
        act = DailyActivity(date=today, problems_attempted=1, problems_solved=1 if is_success else 0)
        db.add(act)
    else:
        act.problems_attempted += 1
        if is_success:
            act.problems_solved += 1


def check_active_test_lock(db: Session, is_contest: bool = False):
    if is_contest:
        raise HTTPException(
            status_code=403,
            detail="AI features and hints are strictly disabled during LeetCode contests to ensure fair play."
        )

    # 1. Check Badge Test lock
    active = db.query(BadgeTest).filter(BadgeTest.status == "active").first()
    if active:
        raise HTTPException(
            status_code=403,
            detail="Hints and AI assistance are locked during an active Badge Test."
        )


def check_and_increment_ai_quota(db: Session, increment: bool = True):
    from sqlalchemy import text
    today_str = get_utc_now().strftime("%Y-%m-%d")
    key = f"ai_limit_{today_str}"
    
    # 1. Ensure the row exists for today (insert 0 if ignore)
    db.execute(
        text("INSERT OR IGNORE INTO user_config (key, value) VALUES (:key, '0')"),
        {"key": key}
    )
    db.commit()
    
    if increment:
        # Atomic update and fetch new value
        res = db.execute(
            text(
                "UPDATE user_config "
                "SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) "
                "WHERE key = :key AND CAST(value AS INTEGER) < :limit "
                "RETURNING value"
            ),
            {"key": key, "limit": AI_DAILY_QUOTA_LIMIT}
        )
        row = res.fetchone()
        db.commit()
        
        if not row:
            # If no row returned, it means value >= limit
            current_val_res = db.execute(
                text("SELECT value FROM user_config WHERE key = :key"),
                {"key": key}
            )
            val_row = current_val_res.fetchone()
            used = int(val_row[0]) if val_row else AI_DAILY_QUOTA_LIMIT
            raise HTTPException(
                status_code=429,
                detail=f"Daily AI request limit reached ({used}/{AI_DAILY_QUOTA_LIMIT}). Please try again tomorrow to avoid excessive API costs."
            )
    else:
        # Just check current value
        res = db.execute(
            text("SELECT value FROM user_config WHERE key = :key"),
            {"key": key}
        )
        row = res.fetchone()
        used = int(row[0]) if row else 0
        if used >= AI_DAILY_QUOTA_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily AI request limit reached ({used}/{AI_DAILY_QUOTA_LIMIT}). Please try again tomorrow to avoid excessive API costs."
            )


@app.get("/ai/quota")
def get_ai_quota(db: Session = Depends(get_db)):
    """Returns the daily AI quota usage and limit."""
    today_str = get_utc_now().strftime("%Y-%m-%d")
    key = f"ai_limit_{today_str}"
    config = db.query(UserConfig).filter(UserConfig.key == key).first()
    used = 0
    if config:
        try:
            used = int(config.value)
        except ValueError:
            used = 0
    return {"used": used, "limit": AI_DAILY_QUOTA_LIMIT}


@app.post("/submissions/analyze", response_model=SubmissionAnalyzeResponse)
def analyze_submission(req: SubmissionAnalyzeRequest, db: Session = Depends(get_db)):
    """
    Analyzes a failed submission or registers a successful one.
    Triggers LLM diagnosis for failures and updates mastery tracking.
    """
    # 1. Fetch or dynamically create the problem in the DB
    problem = db.query(Problem).filter(Problem.id == req.problem_id).first()
    if not problem:
        # Dynamically register the problem if not seeded
        problem = Problem(
            id=req.problem_id,
            title=req.problem_title,
            url=f"https://leetcode.com/problems/{req.problem_id}/",
            difficulty="Medium", # Default
            topics="Arrays & Hashing" # Fallback topic
        )
        db.add(problem)
        db.commit()
        db.refresh(problem)

    is_success = (req.verdict.lower() in ["accepted", "success"])

    # If successful, set is_solved and solved_live in problem
    if is_success:
        problem.is_solved = True
        problem.solved_live = True

    badge_award_payload = None
    # Check badge test progress before modifying TopicMastery rating
    active_test = db.query(BadgeTest).filter(BadgeTest.status == "active").first()
    
    p_id_norm = normalize_problem_id(problem.id)
    p_req_norm = normalize_problem_id(req.problem_id)
    p1_id_norm = normalize_problem_id(active_test.problem1_id) if active_test else ""
    p2_id_norm = normalize_problem_id(active_test.problem2_id) if active_test else ""

    is_p1_match = (p_id_norm == p1_id_norm or p_req_norm == p1_id_norm or (problem.title and active_test and problem.title.lower() == (db.query(Problem).filter(Problem.id == active_test.problem1_id).first().title.lower() if db.query(Problem).filter(Problem.id == active_test.problem1_id).first() else "")))
    is_p2_match = (p_id_norm == p2_id_norm or p_req_norm == p2_id_norm or (problem.title and active_test and problem.title.lower() == (db.query(Problem).filter(Problem.id == active_test.problem2_id).first().title.lower() if db.query(Problem).filter(Problem.id == active_test.problem2_id).first() else "")))

    if active_test and (is_p1_match or is_p2_match) and is_success:
        updated = False
        if is_p1_match and not active_test.problem1_solved:
            active_test.problem1_solved = True
            updated = True
        elif is_p2_match and not active_test.problem2_solved:
            active_test.problem2_solved = True
            updated = True

        if updated:
            if active_test.problem1_solved and active_test.problem2_solved:
                active_test.status = "passed"
                active_test.end_time = get_utc_now()
                # Award badge!
                mastery = db.query(TopicMastery).filter(TopicMastery.topic == active_test.topic).first()
                if mastery:
                    mastery.level = active_test.level
                    mastery.rating = max(mastery.rating, 800.0 + active_test.level * 240.0)
                    b_name = mastery.badge
                    r_val = mastery.rating
                else:
                    badge_map = {1: "Bronze", 2: "Silver", 3: "Gold", 4: "Platinum", 5: "Diamond"}
                    b_name = badge_map.get(active_test.level, "Bronze")
                    r_val = 800.0 + active_test.level * 240.0
                badge_award_payload = {
                    "topic": active_test.topic,
                    "level": active_test.level,
                    "badge": b_name,
                    "rating": r_val,
                    "message": f"Badge Test passed! Congratulations, you earned the {b_name} Badge for {active_test.topic}."
                }
            db.commit()

    # 2. Update topic mastery & daily streak activity for each individual topic
    topic_list = [t.strip() for t in (problem.topics or "Arrays & Hashing").split(",") if t.strip()]
    if not topic_list:
        topic_list = ["Arrays & Hashing"]
    for t in topic_list:
        update_mastery_on_submission(db, t, is_success=is_success, difficulty=problem.difficulty)
    _record_daily_activity(db, is_success=is_success)

    # 3. Deduplicate rapid duplicate submission calls within 15 seconds for the same problem & code
    recent_attempt = db.query(Attempt).filter(
        Attempt.problem_id == problem.id,
        Attempt.verdict == req.verdict
    ).order_by(Attempt.id.desc()).first()

    if recent_attempt and (get_utc_now() - recent_attempt.timestamp).total_seconds() < 15 and (recent_attempt.explanation_text and not req.code):
        return SubmissionAnalyzeResponse(
            root_cause_category=recent_attempt.root_cause_category or "none",
            explanation=recent_attempt.explanation_text or "Submission recorded.",
            suggested_action="Proceed to your next recommended problem.",
            badge_test_result=badge_award_payload
        )

    # 4. Handle success vs failure
    if is_success:
        # Save success attempt
        attempt = Attempt(
            problem_id=problem.id,
            verdict=req.verdict,
            root_cause_category="none",
            explanation_text="Submission succeeded! No diagnosis required.",
            time_taken_seconds=req.time_taken_seconds,
            time_spent_seconds=req.time_taken_seconds,
            hints_used=req.hints_used
        )
        db.add(attempt)
        update_spaced_repetition(db, problem.id)
        db.commit()
        return SubmissionAnalyzeResponse(
            root_cause_category="none",
            explanation="Submission succeeded! Great job on solving this problem.",
            suggested_action="View the recommendation tab for your next challenge!" if not badge_award_payload else "You unlocked a new badge! Check the celebration in your panel.",
            badge_test_result=badge_award_payload
        )

    # For failures, check if an assessment (Badge Test) is active
    active_test = db.query(BadgeTest).filter(BadgeTest.status == "active").first()
    if active_test:
        diagnosis = {
            "root_cause_category": "assessment_locked",
            "explanation": "AI failure diagnosis is disabled during active Badge Tests to maintain test integrity.",
            "suggested_action": "Focus on debugging your solution directly in the code editor."
        }
    else:
        # Run the LLM diagnosis if within quota
        has_quota = True
        try:
            check_and_increment_ai_quota(db, increment=True)
        except HTTPException as e:
            if e.status_code == 429:
                has_quota = False
            else:
                raise e

        if has_quota:
            diagnosis = generate_diagnosis(
                problem_title=problem.title,
                code=req.code,
                language=req.language,
                verdict=req.verdict,
                error_details=req.error_details,
                test_cases=req.test_cases
            )
        else:
            diagnosis = {
                "root_cause_category": "quota_exceeded",
                "explanation": "Daily AI request limit reached. Failure diagnostics are locked until tomorrow.",
                "suggested_action": "Keep practicing! You can still submit attempts, but AI diagnosis is currently disabled."
            }

    # Save failed attempt
    attempt = Attempt(
        problem_id=problem.id,
        verdict=req.verdict,
        root_cause_category=diagnosis["root_cause_category"],
        explanation_text=diagnosis["explanation"],
        time_taken_seconds=req.time_taken_seconds,
        time_spent_seconds=req.time_taken_seconds,
        hints_used=req.hints_used
    )
    db.add(attempt)
    db.commit()

    return SubmissionAnalyzeResponse(
        root_cause_category=diagnosis["root_cause_category"],
        explanation=diagnosis["explanation"],
        suggested_action=diagnosis["suggested_action"]
    )


@app.post("/submissions/success")
def record_success(problem_id: str, topic: str, time_taken_seconds: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Direct endpoint to log a success event and update mastery.
    """
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found in database. Analyze first.")

    problem.is_solved = True
    problem.solved_live = True

    topics_to_update = [t.strip() for t in (topic or problem.topics or "Arrays & Hashing").split(",") if t.strip()]
    for t in topics_to_update:
        # Check badge test progress
        active_test = db.query(BadgeTest).filter(BadgeTest.status == "active").first()
        if active_test and active_test.topic == t:
            updated = False
            if active_test.problem1_id == problem.id and not active_test.problem1_solved:
                active_test.problem1_solved = True
                updated = True
            elif active_test.problem2_id == problem.id and not active_test.problem2_solved:
                active_test.problem2_solved = True
                updated = True

            if updated:
                if active_test.problem1_solved and active_test.problem2_solved:
                    active_test.status = "passed"
                    active_test.end_time = get_utc_now()
                    mastery = db.query(TopicMastery).filter(TopicMastery.topic == active_test.topic).first()
                    if mastery:
                        mastery.level = active_test.level
                    db.flush()

        update_mastery_on_submission(db, t, is_success=True, difficulty=problem.difficulty)

    attempt = Attempt(
        problem_id=problem.id,
        verdict="Accepted",
        root_cause_category="none",
        explanation_text="Submission succeeded!",
        time_taken_seconds=time_taken_seconds
    )
    db.add(attempt)
    update_spaced_repetition(db, problem.id)
    db.commit()
    return {"status": "success", "message": "Success logged and mastery updated."}


STANDARD_DSA_TOPICS = [
    "Arrays",
    "Strings",
    "Sliding Window & Two Pointers",
    "Binary Search",
    "Linked List",
    "Stack & Queue",
    "Hashing",
    "Recursion & Backtracking",
    "Trees & BST",
    "Heaps / Priority Queue",
    "Graphs",
    "Dynamic Programming",
    "Greedy",
    "Trie & Bit Manipulation"
]

@app.get("/topics/mastery", response_model=List[TopicMasterySchema])
def get_mastery(db: Session = Depends(get_db)):
    """
    Returns the current mastery data for all 14 standard DSA topics,
    consolidating and merging any non-canonical variant topics (e.g. 'Array' -> 'Arrays').
    """
    all_masteries = db.query(TopicMastery).all()
    canonical_set = set(STANDARD_DSA_TOPICS)

    # 1. First ensure all 14 standard topics exist in DB
    existing_canonical = {m.topic: m for m in all_masteries if m.topic in canonical_set}
    newly_added = False
    for topic_name in STANDARD_DSA_TOPICS:
        if topic_name not in existing_canonical:
            new_m = TopicMastery(
                topic=topic_name,
                level=0,
                rating=1200.0,
                attempts_count=0,
                success_count=0
            )
            db.add(new_m)
            existing_canonical[topic_name] = new_m
            newly_added = True

    # 2. Merge non-canonical topics into canonical ones and delete non-canonical rows
    for m in all_masteries:
        if m.topic not in canonical_set:
            target_topic = normalize_topic(m.topic)
            if target_topic in existing_canonical:
                target_m = existing_canonical[target_topic]
                target_m.attempts_count += m.attempts_count
                target_m.success_count += m.success_count
                if (m.level or 0) > (target_m.level or 0):
                    target_m.level = m.level
                    target_m.rating = m.rating
                # Update any badge tests referencing this old topic name
                db.query(BadgeTest).filter(BadgeTest.topic == m.topic).update({"topic": target_topic})
            db.delete(m)
            newly_added = True

    if newly_added:
        db.commit()

    result = []
    for topic_name in STANDARD_DSA_TOPICS:
        m = existing_canonical.get(topic_name)
        if m:
            result.append(TopicMasterySchema(
                topic=m.topic,
                mastery_score=m.mastery_score,
                attempts_count=m.attempts_count,
                success_rate=m.success_rate,
                rating=m.rating,
                level=m.level,
                badge=m.badge,
                next_questions=[],
                last_attempted=m.last_attempted,
                next_due_date=m.next_due_date
            ))
    return result


@app.post("/badge-test/start", response_model=BadgeTestSchema)
def start_badge_test(req: BadgeTestStartRequest, db: Session = Depends(get_db)):

    # Check if there is already an active test
    active = db.query(BadgeTest).filter(BadgeTest.status == "active").first()
    if active:
        elapsed = (get_utc_now() - active.start_time).total_seconds()
        time_limit = getattr(active, 'time_limit_seconds', 5400) or 5400
        if elapsed > time_limit:
            active.status = "failed"
            db.commit()
        else:
            raise HTTPException(status_code=400, detail="A Badge Test is already active.")

    canonical_topic = normalize_topic(req.topic)
    mastery = db.query(TopicMastery).filter(TopicMastery.topic == canonical_topic).first()
    if not mastery:
        mastery = TopicMastery(topic=canonical_topic, level=0, rating=1200.0)
        db.add(mastery)
        db.flush()

    target_level = mastery.level + 1
    if target_level > 5:
        raise HTTPException(status_code=400, detail="Maximum badge level (Diamond) already achieved.")

    import random

    # Select 2 random non-premium problems from the curated list for this topic and target level
    curated_candidates = []
    for t in SEED_DATA.get("topics", []):
        if t["name"].lower() == req.topic.lower():
            for b in t.get("badges", []):
                if b["level"] == target_level:
                    slugs = [q["slug"] for q in b.get("questions", []) if q["slug"] not in KNOWN_PREMIUM_SLUGS]
                    curated_candidates = db.query(Problem).filter(
                        Problem.id.in_(slugs),
                        Problem.id.notin_(KNOWN_PREMIUM_SLUGS),
                        Problem.is_premium == False
                    ).all()
                    break
            break

    if len(curated_candidates) >= 2:
        selected = random.sample(curated_candidates, 2)
    else:
        # Fallback to database topic filtering
        topic_clean = req.topic.replace("Arrays & Hashing", "Array").replace("Trees & BST", "Tree").replace("Graphs", "Graph")
        raw_problems = db.query(Problem).filter(
            Problem.topics.like(f"%{topic_clean}%"),
            Problem.id.notin_(KNOWN_PREMIUM_SLUGS),
            Problem.is_premium == False
        ).all()
        if not raw_problems:
            raw_problems = db.query(Problem).filter(
                Problem.topics.like(f"%{req.topic}%"),
                Problem.id.notin_(KNOWN_PREMIUM_SLUGS),
                Problem.is_premium == False
            ).all()

        problems = filter_problems_for_topic(raw_problems, req.topic)

        if target_level == 1:
            targets = ["Easy"]
        elif target_level in [2, 3]:
            targets = ["Medium"]
        elif target_level == 4:
            targets = ["Medium", "Hard"]
        else:
            targets = ["Hard"]

        candidates = [p for p in problems if p.difficulty in targets and not p.is_premium and p.id not in KNOWN_PREMIUM_SLUGS]
        if len(candidates) < 2:
            candidates = [p for p in problems if not p.is_premium and p.id not in KNOWN_PREMIUM_SLUGS]
        if len(candidates) < 2:
            candidates = db.query(Problem).filter(Problem.is_premium == False, Problem.id.notin_(KNOWN_PREMIUM_SLUGS)).all()
        selected = random.sample(candidates, 2) if len(candidates) >= 2 else candidates[:2]

    if len(selected) < 2:
        raise HTTPException(status_code=500, detail="Not enough problems in database to start test.")

    test = BadgeTest(
        topic=req.topic,
        level=target_level,
        problem1_id=normalize_problem_id(selected[0].id),
        problem2_id=normalize_problem_id(selected[1].id),
        problem1_solved=False,
        problem2_solved=False,
        time_limit_seconds=5400,
        start_time=get_utc_now()
    )
    db.add(test)
    db.commit()
    db.refresh(test)

    now = get_utc_now()
    time_limit = getattr(test, 'time_limit_seconds', 5400) or 5400
    elapsed = int((now - test.start_time).total_seconds())

    return BadgeTestSchema(
        id=test.id,
        topic=test.topic,
        level=test.level,
        status=test.status,
        problem1=BadgeTestProblemSchema(id=selected[0].id, title=selected[0].title, url=selected[0].url, difficulty=selected[0].difficulty),
        problem2=BadgeTestProblemSchema(id=selected[1].id, title=selected[1].title, url=selected[1].url, difficulty=selected[1].difficulty),
        problem1_solved=test.problem1_solved,
        problem2_solved=test.problem2_solved,
        time_limit_seconds=time_limit,
        elapsed_seconds=elapsed,
        start_time=test.start_time,
        end_time=test.end_time
    )


@app.get("/badge-test/active", response_model=Optional[BadgeTestSchema])
def get_active_badge_test(db: Session = Depends(get_db)):
    test = db.query(BadgeTest).filter(BadgeTest.status == "active").first()
    if not test:
        return None

    now = get_utc_now()
    time_limit = getattr(test, 'time_limit_seconds', 5400) or 5400
    elapsed = int((now - test.start_time).total_seconds())

    if elapsed > time_limit:
        test.status = "expired"
        test.end_time = now
        db.commit()
        return None

    p1_norm = normalize_problem_id(test.problem1_id)
    p2_norm = normalize_problem_id(test.problem2_id)
    p1 = db.query(Problem).filter((Problem.id == test.problem1_id) | (Problem.id == p1_norm)).first()
    p2 = db.query(Problem).filter((Problem.id == test.problem2_id) | (Problem.id == p2_norm)).first()

    # Sync solved status only from Accepted attempts made during this active test session
    grace_start = (test.start_time - timedelta(seconds=120)) if test.start_time else now
    p1_accepted = db.query(Attempt).filter(
        (Attempt.problem_id.ilike(test.problem1_id) | Attempt.problem_id.ilike(p1_norm) | Attempt.problem_id.ilike(f"%{p1_norm}%")),
        Attempt.verdict.in_(["Accepted", "accepted", "success", "Success"]),
        Attempt.timestamp >= grace_start
    ).first()
    p2_accepted = db.query(Attempt).filter(
        (Attempt.problem_id.ilike(test.problem2_id) | Attempt.problem_id.ilike(p2_norm) | Attempt.problem_id.ilike(f"%{p2_norm}%")),
        Attempt.verdict.in_(["Accepted", "accepted", "success", "Success"]),
        Attempt.timestamp >= grace_start
    ).first()

    p1_solved_now = bool(test.problem1_solved or p1_accepted)
    p2_solved_now = bool(test.problem2_solved or p2_accepted)

    if test.problem1_solved != p1_solved_now or test.problem2_solved != p2_solved_now:
        test.problem1_solved = p1_solved_now
        test.problem2_solved = p2_solved_now
        if test.problem1_solved and test.problem2_solved:
            test.status = "passed"
            test.end_time = now
            mastery = db.query(TopicMastery).filter(TopicMastery.topic == test.topic).first()
            if mastery:
                mastery.level = test.level
                mastery.rating = max(mastery.rating, 800.0 + test.level * 240.0)
        db.commit()

    return BadgeTestSchema(
        id=test.id,
        topic=test.topic,
        level=test.level,
        status=test.status,
        problem1=BadgeTestProblemSchema(id=p1.id, title=p1.title, url=p1.url, difficulty=p1.difficulty) if p1 else None,
        problem2=BadgeTestProblemSchema(id=p2.id, title=p2.title, url=p2.url, difficulty=p2.difficulty) if p2 else None,
        problem1_solved=test.problem1_solved,
        problem2_solved=test.problem2_solved,
        time_limit_seconds=time_limit,
        elapsed_seconds=elapsed,
        start_time=test.start_time,
        end_time=test.end_time
    )


@app.post("/badge-test/abandon")
def abandon_badge_test(db: Session = Depends(get_db)):
    tests = db.query(BadgeTest).filter(BadgeTest.status == "active").all()
    if not tests:
        raise HTTPException(status_code=404, detail="No active Badge Test found.")
    for test in tests:
        test.status = "abandoned"
        test.end_time = get_utc_now()
    db.commit()
    return {"status": "success", "message": "Test abandoned."}


@app.post("/badge-test/reset-questions", response_model=BadgeTestSchema)
def reset_badge_test_questions(db: Session = Depends(get_db)):
    test = db.query(BadgeTest).filter(BadgeTest.status == "active").order_by(BadgeTest.id.desc()).first()
    if not test:
        raise HTTPException(status_code=404, detail="No active Badge Test found to reset.")

    import random

    curated_candidates = []
    for t in SEED_DATA.get("topics", []):
        if t["name"].lower() == test.topic.lower():
            for b in t.get("badges", []):
                if b["level"] == test.level:
                    slugs = [q["slug"] for q in b.get("questions", []) if q["slug"] not in KNOWN_PREMIUM_SLUGS]
                    curated_candidates = db.query(Problem).filter(
                        Problem.id.in_(slugs),
                        Problem.id.notin_(KNOWN_PREMIUM_SLUGS),
                        Problem.is_premium == False
                    ).all()
                    break
            break

    # Exclude current problems if other candidates exist
    other_candidates = [p for p in curated_candidates if p.id not in [test.problem1_id, test.problem2_id]]
    if len(other_candidates) >= 2:
        selected = random.sample(other_candidates, 2)
    elif len(curated_candidates) >= 2:
        selected = random.sample(curated_candidates, 2)
    else:
        topic_clean = test.topic.replace("Arrays & Hashing", "Array").replace("Trees & BST", "Tree").replace("Graphs", "Graph")
        raw_problems = db.query(Problem).filter(
            Problem.topics.like(f"%{topic_clean}%"),
            Problem.id.notin_(KNOWN_PREMIUM_SLUGS),
            Problem.is_premium == False
        ).all()
        problems = filter_problems_for_topic(raw_problems, test.topic)
        target_diffs = ["Easy"] if test.level == 1 else ["Medium"] if test.level in [2, 3] else ["Medium", "Hard"] if test.level == 4 else ["Hard"]
        pool = [p for p in problems if p.difficulty in target_diffs and not p.is_premium and p.id not in KNOWN_PREMIUM_SLUGS]
        other_pool = [p for p in pool if p.id not in [test.problem1_id, test.problem2_id]]
        if len(other_pool) >= 2:
            selected = random.sample(other_pool, 2)
        elif len(pool) >= 2:
            selected = random.sample(pool, 2)
        else:
            all_prob = db.query(Problem).filter(Problem.is_premium == False, Problem.id.notin_(KNOWN_PREMIUM_SLUGS)).all()
            selected = random.sample(all_prob, 2) if len(all_prob) >= 2 else all_prob[:2]

    if len(selected) < 2:
        raise HTTPException(status_code=500, detail="Not enough candidate problems to reset test.")

    test.problem1_id = normalize_problem_id(selected[0].id)
    test.problem2_id = normalize_problem_id(selected[1].id)
    test.problem1_solved = False
    test.problem2_solved = False
    test.start_time = get_utc_now()
    db.commit()
    db.refresh(test)

    now = get_utc_now()
    time_limit = getattr(test, 'time_limit_seconds', 5400) or 5400
    elapsed = int((now - test.start_time).total_seconds())

    return BadgeTestSchema(
        id=test.id,
        topic=test.topic,
        level=test.level,
        status=test.status,
        problem1=BadgeTestProblemSchema(id=selected[0].id, title=selected[0].title, url=selected[0].url, difficulty=selected[0].difficulty),
        problem2=BadgeTestProblemSchema(id=selected[1].id, title=selected[1].title, url=selected[1].url, difficulty=selected[1].difficulty),
        problem1_solved=test.problem1_solved,
        problem2_solved=test.problem2_solved,
        time_limit_seconds=time_limit,
        elapsed_seconds=elapsed,
        start_time=test.start_time,
        end_time=test.end_time
    )


@app.post("/badge-test/submit")
def submit_badge_test(db: Session = Depends(get_db)):
    test = db.query(BadgeTest).filter(BadgeTest.status.in_(["active", "passed"])).order_by(BadgeTest.id.desc()).first()
    if not test:
        raise HTTPException(status_code=404, detail="No active Badge Test found.")
    
    test.end_time = get_utc_now()
    if test.problem1_solved and test.problem2_solved:
        test.status = "passed"
        mastery = db.query(TopicMastery).filter(TopicMastery.topic == test.topic).first()
        if mastery:
            mastery.level = test.level
            mastery.rating = max(mastery.rating, 800.0 + test.level * 240.0)
            badge_name = mastery.badge
            rating_val = mastery.rating
        else:
            badge_map = {1: "Bronze", 2: "Silver", 3: "Gold", 4: "Platinum", 5: "Diamond"}
            badge_name = badge_map.get(test.level, "Bronze")
            rating_val = 800.0 + test.level * 240.0
        message = f"Badge Test passed! Congratulations, you earned the {badge_name} Badge for {test.topic}."
        passed = True
    else:
        test.status = "failed"
        badge_name = None
        rating_val = None
        message = "Badge Test submitted. Both problems must be solved correctly to earn the badge."
        passed = False
    
    db.commit()
    return {
        "status": "success",
        "test_status": test.status,
        "passed": passed,
        "topic": test.topic,
        "level": test.level,
        "badge": badge_name,
        "rating": rating_val,
        "message": message,
        "problem1_solved": test.problem1_solved,
        "problem2_solved": test.problem2_solved
    }


@app.get("/problems/next", response_model=ProblemRecommendResponse)
def get_recommendation(company: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns recommended problems (at least 3) and spaced repetition reviews.
    If a focus topic is saved in UserConfig, recommendations prioritize that topic.
    If a company is provided, recommendations prioritize that company.
    """
    cfg = db.query(UserConfig).filter(UserConfig.key == FOCUS_KEY).first()
    focus_topic = cfg.value if cfg else None
    result = get_next_problem(db, focus_topic=focus_topic, company=company)
    return ProblemRecommendResponse(
        recommendations=result["recommendations"],
        reviews=result["reviews"]
    )


@app.get("/health")
def health():
    """Lightweight liveness probe used by the extension footer."""
    return {"status": "ok"}


@app.post("/approach/check", response_model=CheckApproachResponse)
def check_approach(req: CheckApproachRequest, db: Session = Depends(get_db)):
    """Critiques the user's approach and suggests optimizations."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    result = generate_approach_critique(
        problem_title=req.problem_title,
        code=req.code,
        language=req.language,
        constraints=req.constraints
    )
    return CheckApproachResponse(
        is_optimal=result.get("is_optimal", False),
        current_complexity=result.get("current_complexity", "O(N)"),
        optimal_complexity=result.get("optimal_complexity", "O(N)"),
        feedback=result.get("feedback") or result.get("explanation", ""),
        alternative_approach=result.get("alternative_approach") or result.get("suggested_action", ""),
        verdict=result.get("verdict", "Critique complete"),
        explanation=result.get("explanation") or result.get("feedback", ""),
        suggested_action=result.get("suggested_action") or result.get("alternative_approach", "")
    )


@app.post("/hints/get", response_model=GetHintResponse)
def get_hint(req: GetHintRequest, db: Session = Depends(get_db)):
    """Provides a progressive, conceptual hint without revealing the solution."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    result = generate_hint(
        problem_title=req.problem_title,
        code=req.code,
        language=req.language,
        constraints=req.constraints
    )
    return GetHintResponse(hint=result.get("hint", ""), level=req.level or 1, has_next=(req.level or 1) < 3)


@app.post("/hints/reveal", response_model=HintRevealResponse)
def reveal_hint(req: HintRevealRequest, db: Session = Depends(get_db)):
    """Provides a progressive, conceptual hint at the requested level (1, 2, or 3)."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    result = generate_levelled_hint(
        problem_title=req.problem_title,
        code=req.code,
        language=req.language,
        level=req.level,
        constraints=req.constraints
    )
    return HintRevealResponse(
        hint=result.get("hint", ""),
        level=req.level or 1,
        has_next=(req.level or 1) < 3
    )


@app.post("/edge-cases/get", response_model=GetEdgeCasesResponse)
def get_edge_cases(req: GetEdgeCasesRequest, db: Session = Depends(get_db)):
    """Identifies potential edge cases and critiques the problem constraints."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    result = analyze_edge_cases(
        problem_title=req.problem_title,
        code=req.code,
        language=req.language,
        constraints=req.constraints
    )
    return GetEdgeCasesResponse(
        edge_cases=result.get("edge_cases", []),
        constraints_critique=result.get("constraints_critique", "")
    )


@app.post("/help/ask", response_model=AskHelpResponse)
def ask_help(req: AskHelpRequest, db: Session = Depends(get_db)):
    """Answers a user's custom question about their code or the problem."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    result = answer_custom_question(
        problem_title=req.problem_title,
        code=req.code,
        language=req.language,
        constraints=req.constraints,
        question=req.question
    )
    return AskHelpResponse(answer=result.get("answer", ""))


@app.post("/sync/solved")
def sync_solved(req: SyncSolvedRequest, db: Session = Depends(get_db)):
    """
    Imports already-solved LeetCode problems from the user's history.
    Preserves actual solve timestamps when provided, associates synced account,
    and updates TopicMastery baselines and Spaced Repetition queues.
    """
    import json
    topics_seen = set()
    solved_per_topic = Counter()

    prob_ids = [p.problem_id for p in req.problems if p.problem_id]
    existing_problems = {
        p.id: p for p in db.query(Problem).filter(Problem.id.in_(prob_ids)).all()
    } if prob_ids else {}

    existing_srs = {
        sr.problem_id: sr for sr in db.query(SpacedRepetition).filter(SpacedRepetition.problem_id.in_(prob_ids)).all()
    } if prob_ids else {}

    existing_attempts = {
        a[0] for a in db.query(Attempt.problem_id).filter(Attempt.problem_id.in_(prob_ids), Attempt.verdict == "Accepted").all()
    } if prob_ids else set()

    now_utc = get_utc_now()

    # 1. Upsert each problem (mark solved) and collect per-topic solved counts.
    for prob in req.problems:
        raw_topics = prob.topics if prob.topics else ["Arrays"]
        normalized_topics_list = []
        for t in raw_topics:
            norm = normalize_topic(t)
            if norm and norm not in normalized_topics_list:
                normalized_topics_list.append(norm)
        if not normalized_topics_list:
            normalized_topics_list = ["Arrays"]

        topics_csv = ", ".join(normalized_topics_list)
        for t in normalized_topics_list:
            topics_seen.add(t)
            solved_per_topic[t] += 1

        # Determine actual solve datetime if provided
        actual_solve_dt = None
        if prob.timestamp:
            try:
                actual_solve_dt = datetime.fromtimestamp(prob.timestamp, tz=timezone.utc).replace(tzinfo=None)
            except Exception:
                actual_solve_dt = None
        elif prob.solved_at:
            try:
                actual_solve_dt = datetime.fromisoformat(prob.solved_at.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                actual_solve_dt = None

        has_explicit_date = actual_solve_dt is not None
        if not actual_solve_dt:
            # Fallback to an earlier date (60 days ago) so bulk lifetime sync doesn't count as current week solves
            actual_solve_dt = now_utc - timedelta(days=60)
            expl_text = "Synced from LeetCode solved history (historical baseline)."
        else:
            expl_text = "Synced from LeetCode solved history."

        url = f"https://leetcode.com/problems/{prob.problem_id}/"
        problem = existing_problems.get(prob.problem_id)
        if problem:
            problem.title = prob.title or problem.title
            problem.url = url
            problem.difficulty = prob.difficulty or problem.difficulty
            problem.topics = topics_csv
            problem.is_solved = True
            if prob.company and not problem.companies:
                problem.companies = prob.company
        else:
            problem = Problem(
                id=prob.problem_id,
                title=prob.title or prob.problem_id,
                url=url,
                difficulty=prob.difficulty or "Medium",
                topics=topics_csv,
                companies=prob.company,
                is_solved=True
            )
            db.add(problem)

        # Record accepted attempt with actual solve timestamp if not already present
        if prob.problem_id not in existing_attempts:
            att = Attempt(
                problem_id=prob.problem_id,
                verdict="Accepted",
                root_cause_category="none",
                explanation_text=expl_text,
                timestamp=actual_solve_dt
            )
            db.add(att)
            existing_attempts.add(prob.problem_id)

        # Seed initial spaced repetition schedule for solved problem
        if prob.problem_id not in existing_srs:
            # Stagger initial due dates for bulk imports across 3..25 days so reviews don't clump on one day
            stagger_days = 3 if len(req.problems) == 1 else (3 + (abs(hash(prob.problem_id)) % 22))
            sr = SpacedRepetition(
                problem_id=prob.problem_id,
                stage=1,
                last_solved=actual_solve_dt,
                next_due=now_utc + timedelta(days=stagger_days)
            )
            db.add(sr)

    # 2. Seed per-topic mastery from solved counts (never clobber live test badges).
    existing_masteries = {
        tm.topic: tm for tm in db.query(TopicMastery).filter(TopicMastery.topic.in_(list(topics_seen))).all()
    } if topics_seen else {}

    new_topics = 0
    seeded_topics = 0
    for topic in topics_seen:
        solved_count = solved_per_topic[topic]
        mastery = existing_masteries.get(topic)
        if not mastery:
            # Brand-new topic: seed with level 0 (Locked badge), attempts = solved_count, success_count = 0
            mastery = TopicMastery(
                topic=topic,
                rating=800.0,
                attempts_count=solved_count,
                success_count=0,
                level=0
            )
            db.add(mastery)
            new_topics += 1
            seeded_topics += 1
        else:
            if solved_count > mastery.attempts_count:
                mastery.attempts_count = solved_count
                seeded_topics += 1

    # 3. Store persistent account sync metadata in UserConfig
    username = req.username or "LeetCode User"
    sync_meta = {
        "username": username,
        "synced_count": len(req.problems),
        "topics_count": len(topics_seen),
        "last_synced": now_utc.strftime("%Y-%m-%d %H:%M:%S")
    }
    cfg_account = db.query(UserConfig).filter(UserConfig.key == "synced_account").first()
    if cfg_account:
        cfg_account.value = json.dumps(sync_meta)
    else:
        cfg_account = UserConfig(key="synced_account", value=json.dumps(sync_meta))
        db.add(cfg_account)

    db.commit()
    synced = len(req.problems)
    return {
        "synced": synced,
        "topics": len(topics_seen),
        "new_topics": new_topics,
        "seeded_topics": seeded_topics,
        "username": username,
        "message": f"Synced {synced} problem(s) across {len(topics_seen)} topic(s) for {username}; seeded {seeded_topics} topic(s)."
    }


@app.get("/sync/account")
def get_synced_account(db: Session = Depends(get_db)):
    """Returns persistent account sync metadata stored in the database."""
    import json
    cfg = db.query(UserConfig).filter(UserConfig.key == "synced_account").first()
    if cfg and cfg.value:
        try:
            return {"status": "synced", "account": json.loads(cfg.value)}
        except Exception:
            pass
    total_solved = db.query(Problem).filter(Problem.is_solved == True).count()
    return {
        "status": "ready",
        "account": {
            "username": "LeetCode User",
            "synced_count": total_solved,
            "topics_count": 0,
            "last_synced": None
        }
    }


@app.get("/problems/solved", response_model=List[SolvedProblemTableItem])
def get_solved_problems_table(db: Session = Depends(get_db)):
    """
    Returns all solved problems with metadata, actual solve dates, user notes,
    personal difficulty rating, attempt counts, and spaced repetition review schedules for the interactive table.
    """
    now = get_utc_now()
    solved_problems = db.query(Problem).filter(Problem.is_solved == True).all()

    sr_records = {sr.problem_id: sr for sr in db.query(SpacedRepetition).all()}

    attempts_all = db.query(Attempt).all()
    attempts_by_problem = {}
    for a in attempts_all:
        attempts_by_problem.setdefault(a.problem_id, []).append(a)

    items = []
    for p in solved_problems:
        p_attempts = attempts_by_problem.get(p.id, [])
        accepted_attempts = [a for a in p_attempts if a.verdict == "Accepted"]

        # Accurate date solved determination
        if accepted_attempts:
            # Pick earliest or latest accepted attempt timestamp
            date_solved_ts = min(accepted_attempts, key=lambda a: a.timestamp).timestamp
        elif p_attempts:
            date_solved_ts = min(p_attempts, key=lambda a: a.timestamp).timestamp
        else:
            date_solved_ts = now

        date_solved_str = date_solved_ts.strftime("%Y-%m-%d")

        # Spaced Repetition status
        sr = sr_records.get(p.id)
        if sr:
            next_due_str = sr.next_due.strftime("%Y-%m-%d")
            stage_names = {1: "Stage 1 (3d)", 2: "Stage 2 (7d)", 3: "Stage 3 (14d)", 4: "Stage 4 (30d)", 5: "Mastered"}
            schedule_str = stage_names.get(sr.stage, f"Stage {sr.stage}")
            if sr.stage >= 5:
                status_str = "Mastered"
            elif sr.next_due <= now:
                status_str = "Due Today"
            else:
                days_left = (sr.next_due.date() - now.date()).days
                status_str = f"In {days_left}d"
        else:
            next_due_str = "—"
            schedule_str = "Unscheduled"
            status_str = "—"

        max_hints = max([a.hints_used for a in p_attempts], default=0)

        items.append(SolvedProblemTableItem(
            problem_id=p.id,
            title=p.title,
            url=p.url,
            difficulty=p.difficulty or "Medium",
            topics=p.topics or "",
            companies=p.companies or "",
            date_solved=date_solved_str,
            next_review_due=next_due_str,
            review_schedule=schedule_str,
            review_status=status_str,
            attempts_count=len(p_attempts),
            user_notes=p.user_notes or "",
            personal_difficulty=p.personal_difficulty or "",
            hints_used=max_hints
        ))

    # Sort descending by date solved
    items.sort(key=lambda x: x.date_solved, reverse=True)
    return items


@app.get("/reviews/count")
def get_reviews_count(db: Session = Depends(get_db)):
    """Returns count of active spaced repetition reviews due today (Tier 1.2)."""
    now = get_utc_now()
    due_count = db.query(SpacedRepetition).filter(
        SpacedRepetition.next_due <= now,
        SpacedRepetition.stage < 5
    ).count()
    return {"due_count": due_count}


@app.post("/reviews/clear")
def clear_reviews(db: Session = Depends(get_db)):
    """Clears all spaced repetition review records from the database."""
    deleted = db.query(SpacedRepetition).delete()
    db.commit()
    return {"deleted": deleted, "message": f"Cleared {deleted} review records."}


# NOTE: GET /reviews/count is defined once above (near the badge/streak routes).
# A second duplicate definition previously lived here and was unreachable; removed.


@app.get("/topics/analysis", response_model=TopicAnalysisResponse)
def get_topic_analysis(db: Session = Depends(get_db)):
    """Full breakdown of solved problems: difficulty + per-topic counts + weakest topics."""
    solved_problems = db.query(Problem).filter(Problem.is_solved == True).all()  # noqa: E712

    # Difficulty breakdown
    difficulty_counts = {"Easy": 0, "Medium": 0, "Hard": 0}
    for p in solved_problems:
        diff = (p.difficulty or "").capitalize()
        if diff in difficulty_counts:
            difficulty_counts[diff] += 1

    # Per-topic solved counts
    topic_solved = Counter()
    for p in solved_problems:
        for t in [x.strip() for x in (p.topics or "").split(",") if x.strip()]:
            topic_solved[t] += 1

    # Join with mastery scores
    mastery_rows = {m.topic: m for m in db.query(TopicMastery).all()}
    items = []
    for topic, count in topic_solved.items():
        score = mastery_rows.get(topic).mastery_score if topic in mastery_rows else 0.0
        badge = mastery_rows.get(topic).badge if topic in mastery_rows else "None"
        items.append(TopicStatItem(topic=topic, solved_count=count, mastery_score=score or 0.0, badge=badge))

    top_topics = sorted(items, key=lambda x: x.solved_count, reverse=True)

    # Weakest topics: lowest mastery among all known topics, capped at 5
    all_items = []
    for topic, m in mastery_rows.items():
        all_items.append(TopicStatItem(
            topic=topic,
            solved_count=topic_solved.get(topic, 0),
            mastery_score=m.mastery_score or 0.0,
            badge=m.badge
        ))
    weak_topics = sorted(all_items, key=lambda x: x.mastery_score)[:5]

    return TopicAnalysisResponse(
        total_solved=len(solved_problems),
        difficulty_breakdown=difficulty_counts,
        top_topics=top_topics,
        weak_topics=weak_topics
    )


@app.get("/topics/focus", response_model=FocusResponse)
def get_focus(db: Session = Depends(get_db)):
    """Returns the saved focus topics (up to 3)."""
    cfg = db.query(UserConfig).filter(UserConfig.key == FOCUS_KEY).first()
    val = cfg.value if cfg else ""
    topics = [t.strip() for t in val.split(",") if t.strip()] if val else []
    return FocusResponse(focus_topic=val if val else None, focus_topics=topics)


@app.post("/topics/focus", response_model=FocusResponse)
def set_focus(req: Optional[SetFocusRequest] = None, topic: Optional[str] = None, db: Session = Depends(get_db)):
    """Saves (or clears) focus topics (up to 3)."""
    val_to_save = []
    if req and req.topics is not None:
        val_to_save = [t.strip() for t in req.topics if t and t.strip()][:3]
    elif req and req.topic is not None:
        val_to_save = [t.strip() for t in req.topic.split(",") if t and t.strip()][:3]
    elif topic is not None:
        val_to_save = [t.strip() for t in topic.split(",") if t and t.strip()][:3]

    cfg = db.query(UserConfig).filter(UserConfig.key == FOCUS_KEY).first()
    if not val_to_save:
        if cfg:
            db.delete(cfg)
        saved_str = None
        topics_out = []
    else:
        saved_str = ",".join(val_to_save)
        if cfg:
            cfg.value = saved_str
        else:
            cfg = UserConfig(key=FOCUS_KEY, value=saved_str)
            db.add(cfg)
        topics_out = val_to_save

    db.commit()
    return FocusResponse(focus_topic=saved_str, focus_topics=topics_out)


@app.get("/companies")
def get_companies(db: Session = Depends(get_db)):
    """Returns distinct list of company tags from all registered problems (Tier 1.1)."""
    problems = db.query(Problem).filter(Problem.companies.isnot(None)).all()
    companies = set()
    for p in problems:
        if p.companies:
            for c in [x.strip() for x in p.companies.split(",") if x.strip()]:
                companies.add(c)
    return sorted(list(companies))


@app.get("/companies/metadata")
def get_companies_metadata(db: Session = Depends(get_db)):
    """Returns a dictionary mapping company names to their focus notes."""
    meta = db.query(CompanyMetadata).all()
    return {m.name: m.focus_note for m in meta}


@app.get("/activity/streak", response_model=StreakResponse)
def get_streak(db: Session = Depends(get_db)):
    """Returns current streak days and today's activity counts (Tier 1.4)."""
    today_str = get_utc_now().strftime("%Y-%m-%d")
    today_act = db.query(DailyActivity).filter(DailyActivity.date == today_str).first()
    problems_today = today_act.problems_attempted if today_act else 0
    solved_today = today_act.problems_solved if today_act else 0

    # Calculate streak walking backwards
    streak = 0
    curr_date = get_utc_now().date()
    while True:
        d_str = curr_date.strftime("%Y-%m-%d")
        act = db.query(DailyActivity).filter(DailyActivity.date == d_str).first()
        if act and act.problems_solved > 0:
            streak += 1
            curr_date -= timedelta(days=1)
        elif d_str == today_str:
            # If today hasn't solved anything yet, check yesterday
            curr_date -= timedelta(days=1)
        else:
            break

    return StreakResponse(
        current_streak_days=streak,
        problems_today=problems_today,
        solved_today=solved_today
    )


@app.get("/topics/weak-pairs", response_model=List[WeakPairItem])
def get_weak_pairs(db: Session = Depends(get_db)):
    """Returns co-occurring weak topic pairs (Tier 2.1)."""
    return compute_weak_pairs(db)


@app.get("/topics/time-trend")
def get_time_trend(topic: str, db: Session = Depends(get_db)):
    """Returns recent time-spent attempts for a topic (Tier 1.3)."""
    return get_topic_time_trend(db, topic)


@app.post("/submissions/explain-back", response_model=ExplainBackResponse)
def explain_back(req: ExplainBackRequest, db: Session = Depends(get_db)):
    """Verifies user's self-explanation against their submitted code (Tier 3.2)."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    res = generate_explain_back_check(
        code=req.code,
        language=req.language,
        user_explanation=req.user_explanation
    )
    return ExplainBackResponse(
        matches=bool(res.get("matches", True)),
        discrepancy_note=res.get("discrepancy_note")
    )


@app.post("/critique/estimate")
def store_complexity_estimate(req: ComplexityEstimateRequest, db: Session = Depends(get_db)):
    """Stores the user's complexity guess before revealing critique (Tier 3.3)."""
    check_active_test_lock(db, is_contest=req.is_contest)
    import json
    t_comp = req.time_complexity or req.user_time or "O(N)"
    s_comp = req.space_complexity or req.user_space or "O(1)"
    key = f"estimate_{req.problem_id}"
    value = json.dumps({"time_complexity": t_comp, "space_complexity": s_comp})
    cfg = db.query(UserConfig).filter(UserConfig.key == key).first()
    if cfg:
        cfg.value = value
    else:
        cfg = UserConfig(key=key, value=value)
        db.add(cfg)
    db.commit()
    return {"status": "stored"}


@app.post("/critique/reveal", response_model=ComplexityRevealResponse)
def reveal_complexity_critique(req: ComplexityRevealRequest, db: Session = Depends(get_db)):
    """Runs LLM approach critique and compares with stored self-estimate (Tier 3.3)."""
    check_active_test_lock(db, is_contest=req.is_contest)
    check_and_increment_ai_quota(db)
    import json
    key = f"estimate_{req.problem_id}"
    cfg = db.query(UserConfig).filter(UserConfig.key == key).first()
    estimate = json.loads(cfg.value) if cfg and cfg.value else None

    result = generate_approach_critique(
        problem_title=req.problem_title,
        code=req.code,
        language=req.language,
        constraints=req.constraints
    )

    return ComplexityRevealResponse(
        estimate=estimate,
        is_optimal=bool(result.get("is_optimal", False)),
        current_complexity=result.get("current_complexity", "Unknown"),
        optimal_complexity=result.get("optimal_complexity", "Unknown"),
        feedback=result.get("feedback", ""),
        alternative_approach=result.get("alternative_approach", "")
    )


@app.get("/journal/weekly", response_model=WeeklyJournalResponse)
def get_weekly_journal(db: Session = Depends(get_db)):
    """Generates past 7 days mistake journal and aggregated stats (Tier 5.1)."""
    seven_days_ago = get_utc_now() - timedelta(days=7)
    attempts = db.query(Attempt).filter(
        Attempt.timestamp >= seven_days_ago,
        (Attempt.explanation_text.is_(None) | (Attempt.explanation_text != "Synced from LeetCode solved history (historical baseline)."))
    ).all()

    by_category = Counter()
    example_problems = set()
    total_solved = 0

    for a in attempts:
        if a.verdict == "Accepted":
            total_solved += 1
        elif a.root_cause_category:
            by_category[a.root_cause_category] += 1
            if a.problem:
                example_problems.add(a.problem.title)

    start_str = seven_days_ago.strftime("%Y-%m-%d")
    end_str = get_utc_now().strftime("%Y-%m-%d")

    # Generate a detailed list of mistakes grouped by problem
    failed_attempts = db.query(Attempt).filter(
        Attempt.timestamp >= seven_days_ago,
        Attempt.verdict != "Accepted",
        (Attempt.explanation_text.is_(None) | (Attempt.explanation_text != "Synced from LeetCode solved history (historical baseline)."))
    ).order_by(Attempt.timestamp.desc()).all()

    problem_mistakes = {}
    for a in failed_attempts:
        if not a.problem:
            continue
        pid = a.problem.id
        if pid not in problem_mistakes:
            problem_mistakes[pid] = {
                "problem": a.problem,
                "mistakes": []
            }
        problem_mistakes[pid]["mistakes"].append(a)

    key_learnings = {
        "wrong_approach": "Ensure you verify time/space complexities and write pseudo-code for alternative approaches (like hash maps, two pointers, or sliding window) before writing code.",
        "implementation_bug": "Carefully dry-run code with small/empty inputs and check boundary conditions (such as off-by-one errors or null pointer checks).",
        "time_limit_exceeded": "When dealing with large inputs, look for opportunities to reduce complexity from O(N^2) to O(N log N) or O(N) using sorting, hashing, or binary search.",
        "edge_case_missed": "Before submitting, explicitly trace code execution with edge cases like empty inputs, single element arrays, or negative numbers.",
        "conceptual_gap": "Spend time understanding the fundamental theory of the algorithm or data structure before jumping to the implementation.",
        "none": "Ensure code correctness and review details before submitting."
    }

    md_lines = [
        f"# Weekly DSA Practice Digest ({start_str} to {end_str})",
        "",
        f"- **Total Attempts**: {len(attempts)}",
        f"- **Problems Solved**: {total_solved}",
        "",
        "## Mistakes by Category:",
    ]
    for cat, cnt in by_category.items():
        md_lines.append(f"- **{cat.replace('_', ' ').title()}**: {cnt}")

    if problem_mistakes:
        md_lines.append("")
        md_lines.append("## Detailed Journal of Mistakes & Key Learnings")
        md_lines.append("")
        for pid, data in problem_mistakes.items():
            prob = data["problem"]
            md_lines.append(f"### ❌ [{prob.title}]({prob.url})")
            md_lines.append(f"- **Difficulty**: {prob.difficulty} | **Topic**: {prob.topics}")
            md_lines.append("- **Mistakes**:")
            
            latest_category = "none"
            for m in data["mistakes"]:
                date_str = m.timestamp.strftime("%Y-%m-%d %H:%M")
                cat_display = m.root_cause_category.replace('_', ' ').title() if m.root_cause_category else "Unknown"
                explanation = m.explanation_text if m.explanation_text else "No explanation provided."
                md_lines.append(f"  - *{date_str}* ({cat_display}): {explanation}")
                if m.root_cause_category and latest_category == "none":
                    latest_category = m.root_cause_category
                    
            learning = key_learnings.get(latest_category, "Thoroughly analyze failures and write down the root cause to avoid repeating the mistake.")
            md_lines.append(f"- **💡 Key Learning**: {learning}")
            md_lines.append("")

    # Generate a detailed list of solved problems with date solved
    accepted_attempts = db.query(Attempt).filter(
        Attempt.timestamp >= seven_days_ago,
        Attempt.verdict == "Accepted",
        (Attempt.explanation_text.is_(None) | (Attempt.explanation_text != "Synced from LeetCode solved history (historical baseline)."))
    ).order_by(Attempt.timestamp.desc()).all()

    if accepted_attempts:
        md_lines.append("")
        md_lines.append("## ✅ Solved Problems Journal")
        md_lines.append("")
        seen_solved = set()
        for a in accepted_attempts:
            if not a.problem or a.problem.id in seen_solved:
                continue
            seen_solved.add(a.problem.id)
            date_str = a.timestamp.strftime("%Y-%m-%d %H:%M")
            md_lines.append(f"- **[{a.problem.title}]({a.problem.url})** — *Solved on {date_str}* (Difficulty: {a.problem.difficulty} | Topics: {a.problem.topics})")

    # Gather distinct solved problems & topics practiced
    solved_problem_titles = []
    topics_practiced = set()
    if accepted_attempts:
        for a in accepted_attempts:
            if a.problem and a.problem.title:
                if a.problem.title not in solved_problem_titles:
                    solved_problem_titles.append(a.problem.title)
                if a.problem.topics:
                    for t in a.problem.topics.split(","):
                        if t.strip():
                            topics_practiced.add(t.strip())

    # Generate AI Growth Analysis & Pattern Spotlight
    ai_insights = generate_weekly_ai_insights(
        total_attempts=len(attempts),
        total_solved=total_solved,
        mistakes_by_category=dict(by_category),
        solved_problems=solved_problem_titles,
        topics_practiced=list(topics_practiced)
    )

    ai_growth = ai_insights.get("ai_growth_summary", "")
    concepts = ai_insights.get("concepts_learned", [])
    spotlight = ai_insights.get("pattern_spotlight", "")

    # Insert AI Growth Section at the top of the markdown
    if ai_growth or spotlight:
        ai_section = [
            "",
            "## 🤖 AI Coach: Weekly Growth Reflection",
            f"> {ai_growth}",
            ""
        ]
        if concepts:
            ai_section.append("### 🧠 Core Algorithmic Patterns & Concepts Strengthened:")
            for c in concepts:
                ai_section.append(f"- 🔹 {c}")
            ai_section.append("")
        if spotlight:
            ai_section.append("### 💡 DSA Pattern Spotlight & Pro-Tip of the Week:")
            ai_section.append(f"{spotlight}")
            ai_section.append("")
        md_lines = md_lines[:3] + ai_section + md_lines[3:]

    if example_problems:
        md_lines.extend(["", "## Review Suggested For Problems:", *[f"- {p}" for p in list(example_problems)[:10]]])

    return WeeklyJournalResponse(
        period_start=start_str,
        period_end=end_str,
        total_attempts=len(attempts),
        total_solved=total_solved,
        by_category=dict(by_category),
        example_problems=list(example_problems)[:10],
        markdown_text="\n".join(md_lines),
        ai_growth_summary=ai_growth,
        concepts_learned=concepts,
        pattern_spotlight=spotlight
    )


@app.get("/problems/{problem_id}")
def get_problem_details(problem_id: str, db: Session = Depends(get_db)):
    """Fetches metadata, user notes, and personal difficulty rating for a problem."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        return {"problem_id": problem_id, "user_notes": "", "personal_difficulty": ""}
    return {
        "problem_id": problem.id,
        "title": problem.title,
        "difficulty": problem.difficulty,
        "topics": problem.topics,
        "companies": problem.companies,
        "user_notes": problem.user_notes or "",
        "personal_difficulty": problem.personal_difficulty or ""
    }


@app.post("/problems/{problem_id}/notes")
def save_problem_notes(problem_id: str, req: dict, db: Session = Depends(get_db)):
    """Saves custom user notes and personal difficulty rating for a problem."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        problem = Problem(
            id=problem_id,
            title=req.get("problem_title", problem_id),
            url=f"https://leetcode.com/problems/{problem_id}/",
            difficulty="Medium",
            topics="Arrays & Hashing"
        )
        db.add(problem)
        db.commit()
        db.refresh(problem)

    if "user_notes" in req:
        problem.user_notes = req["user_notes"]
    if "personal_difficulty" in req:
        problem.personal_difficulty = req["personal_difficulty"]

    db.commit()
    return {
        "status": "success",
        "problem_id": problem.id,
        "user_notes": problem.user_notes,
        "personal_difficulty": problem.personal_difficulty
    }


@app.get("/export/solved-csv")
def export_solved_csv(timeframe: str = "current_week", db: Session = Depends(get_db)):
    """
    Exports solved DSA problems to an expanded CSV spreadsheet with review dates,
    user comments/notes, personal difficulty ratings, attempt counts, mistake categories, and hints used.
    """
    import csv
    import io
    from fastapi import Response

    now = get_utc_now()
    
    if timeframe in ["current_week", "past_7_days"]:
        cutoff = now - timedelta(days=7)
    elif timeframe == "past_30_days":
        cutoff = now - timedelta(days=30)
    else:
        cutoff = None  # all_time

    # Query all solved problems
    solved_problems = db.query(Problem).filter(Problem.is_solved == True).all()

    # Pre-query SpacedRepetition reviews map
    sr_records = {sr.problem_id: sr for sr in db.query(SpacedRepetition).all()}

    # Pre-query attempts grouped by problem_id
    attempts_all = db.query(Attempt).all()
    attempts_by_problem = {}
    for a in attempts_all:
        attempts_by_problem.setdefault(a.problem_id, []).append(a)

    rows = []
    for p in solved_problems:
        p_attempts = attempts_by_problem.get(p.id, [])
        accepted_attempts = [a for a in p_attempts if a.verdict == "Accepted"]

        # Date solved determination
        latest_acc = max(accepted_attempts, key=lambda a: a.timestamp) if accepted_attempts else None
        if latest_acc:
            date_solved_ts = latest_acc.timestamp
        elif p_attempts:
            date_solved_ts = max(p_attempts, key=lambda a: a.timestamp).timestamp
        else:
            date_solved_ts = now

        # Timeframe filter check
        if cutoff and date_solved_ts < cutoff:
            continue

        date_solved_str = date_solved_ts.strftime("%Y-%m-%d %H:%M")

        # Spaced Repetition Review Schedule
        sr = sr_records.get(p.id)
        if sr:
            next_due_str = sr.next_due.strftime("%Y-%m-%d")
            stage_map = {
                1: "Stage 1 (3 days)",
                2: "Stage 2 (7 days)",
                3: "Stage 3 (14 days)",
                4: "Stage 4 (30 days / Monthly Review)",
                5: "Mastered / Complete"
            }
            schedule_str = stage_map.get(sr.stage, f"Stage {sr.stage}")
            if sr.stage >= 5:
                status_str = "Mastered"
            elif sr.next_due <= now:
                status_str = "DUE TODAY / OVERDUE"
            else:
                days_left = (sr.next_due.date() - now.date()).days
                status_str = f"Due in {days_left} day(s)"
        else:
            next_due_str = "Not Scheduled"
            schedule_str = "None"
            status_str = "N/A"

        # Diagnostic mistake notes & max hints used across attempts
        failed_attempts = [a for a in p_attempts if a.verdict != "Accepted"]
        if failed_attempts:
            categories = list(set(a.root_cause_category for a in failed_attempts if a.root_cause_category))
            mistake_note = ", ".join(categories) if categories else "Failed attempts logged"
        else:
            mistake_note = "None (Passed cleanly)"

        max_hints_used = max([a.hints_used for a in p_attempts], default=0)

        rows.append({
            "Problem Title": p.title,
            "Problem ID": p.id,
            "LeetCode Difficulty": p.difficulty or "Medium",
            "Personal Difficulty / Flag": p.personal_difficulty or "Not Rated",
            "Topics": p.topics or "",
            "Companies": p.companies or "",
            "Date Solved": date_solved_str,
            "Next Review Due Date": next_due_str,
            "Review Schedule": schedule_str,
            "Review Status": status_str,
            "Total Attempts Count": len(p_attempts),
            "Mistake Category / Note": mistake_note,
            "User Notes & Comments": p.user_notes or "",
            "Hints Used": max_hints_used,
            "LeetCode URL": p.url
        })

    output = io.StringIO()
    fieldnames = [
        "Problem Title",
        "Problem ID",
        "LeetCode Difficulty",
        "Personal Difficulty / Flag",
        "Topics",
        "Companies",
        "Date Solved",
        "Next Review Due Date",
        "Review Schedule",
        "Review Status",
        "Total Attempts Count",
        "Mistake Category / Note",
        "User Notes & Comments",
        "Hints Used",
        "LeetCode URL"
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)

    csv_data = output.getvalue()
    filename = f"solved_problems_detailed_{timeframe}_{now.strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



