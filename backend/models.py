from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
from typing import List, Optional, Set
from backend.database import Base

KNOWN_PREMIUM_SLUGS: Set[str] = {
    "meeting-rooms", "meeting-rooms-ii", "alien-dictionary", "walls-and-gates",
    "graph-valid-tree", "number-of-connected-components-in-an-undirected-graph",
    "encode-and-decode-strings", "inorder-successor-in-bst", "inorder-successor-in-bst-ii",
    "paint-house", "paint-house-ii", "paint-fence", "bomb-enemy", "design-tic-tac-toe",
    "design-hit-counter", "design-search-autocomplete-system", "design-in-memory-file-system",
    "find-leaves-of-binary-tree", "binary-tree-vertical-order-traversal", "shortest-word-distance",
    "shortest-word-distance-ii", "shortest-word-distance-iii", "two-sum-iii-data-structure-design",
    "two-sum-bsts", "two-sum-less-than-k", "group-shifted-strings", "count-univalue-subtrees",
    "factor-combinations", "verify-preorder-sequence-in-binary-search-tree", "flatten-2d-vector",
    "sparse-matrix-multiplication", "binary-tree-longest-consecutive-sequence",
    "binary-tree-longest-consecutive-sequence-ii", "generalized-abbreviation",
    "maximum-size-subarray-sum-equals-k", "nested-list-weight-sum", "nested-list-weight-sum-ii",
    "longest-substring-with-at-most-k-distinct-characters",
    "longest-substring-with-at-most-two-distinct-characters", "range-addition",
    "line-reflection", "plus-one-linked-list", "sentence-screen-fitting", "sequence-reconstruction",
    "ternary-expression-parser", "optimal-account-balancing", "kill-process",
    "split-array-with-equal-sum", "boundary-of-binary-tree", "lonely-pixel-i", "lonely-pixel-ii",
    "output-contest-matches", "encode-string-with-shortest-length", "bold-words-in-string",
    "pour-water", "candy-crush", "closest-binary-search-tree-value", "closest-binary-search-tree-value-ii",
    "valid-word-square", "word-squares", "maximum-average-subarray-ii", "design-compressed-string-iterator",
    "add-bold-tag-in-string", "design-snake-game", "design-phone-directory", "logger-rate-limiter",
    "android-unlock-patterns", "strobogrammatic-number", "strobogrammatic-number-ii",
    "strobogrammatic-number-iii", "wiggle-sort", "palindrome-permutation", "palindrome-permutation-ii",
    "read-n-characters-given-read4", "read-n-characters-given-read4-ii-call-multiple-times",
    "one-edit-distance", "missing-ranges", "reverse-words-in-a-string-ii", "rearrange-string-k-distance-apart",
    "max-consecutive-ones-ii", "dot-product-of-two-sparse-vectors", "binary-search-tree-iterator-ii",
    "find-root-of-n-ary-tree", "buildings-with-an-ocean-view", "minimum-cost-to-connect-sticks",
    "leftmost-column-with-at-least-a-one", "design-excel-sum-formula", "design-log-storage-system"
}

# ==========================================
# SQLAlchemy Models
# ==========================================

class User(Base):
    """
    A single CodeCoach account.

    Phase 1 (multi-tenant foundation): identity is a random device token minted
    by the extension on first run and sent as `Authorization: Bearer <token>`.
    `google_sub` / `email` are reserved for the Phase-2 Google Sign-In linking
    that upgrades a device to a real, cross-device account. No other table
    references this yet — per-user scoping of the domain tables lands in Phase 2/3.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    device_token = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=True, index=True)
    google_sub = Column(String, unique=True, index=True, nullable=True)  # Google OAuth subject (future)
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    last_seen = Column(DateTime, default=get_utc_now, nullable=False)


class Problem(Base):
    __tablename__ = "problems"

    id = Column(String, primary_key=True, index=True) # e.g. "two-sum" or "1"
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    difficulty = Column(String, nullable=False) # Easy, Medium, Hard
    topics = Column(String, nullable=False) # Comma-separated list of topics, e.g. "Arrays,Two Pointers"
    companies = Column(String, nullable=True)  # Comma-separated company names, e.g. "Google,Amazon"
    is_solved = Column(Boolean, default=False, nullable=False) # True once synced from LeetCode history
    is_premium = Column(Boolean, default=False, nullable=False) # True if paid/premium LeetCode problem
    user_notes = Column(Text, nullable=True)
    personal_difficulty = Column(String, nullable=True) # e.g. "Hard for me", "Tricky Edge Cases", "Medium", "Easy"

    attempts = relationship("Attempt", back_populates="problem")


class UserProblem(Base):
    """Per-user problem state (Phase 2 expand).

    `problems` becomes a shared catalog (title/url/difficulty/topics/companies/
    is_premium); the per-user bits (solved status, notes, personal difficulty)
    live here, one row per (user, problem). Phase 3 dual-writes and backfills
    from the legacy Problem.is_solved/user_notes columns; the contract phase then
    drops those columns from `problems`.
    """
    __tablename__ = "user_problems"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    problem_id = Column(String, ForeignKey("problems.id"), index=True, nullable=False)
    is_solved = Column(Boolean, default=False, nullable=False)
    solved_live = Column(Boolean, default=False, nullable=False)
    user_notes = Column(Text, nullable=True)
    personal_difficulty = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "problem_id", name="uq_user_problem"),
    )


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Phase 2 (expand): nullable now; Phase 3 scopes reads/writes, contract phase makes it NOT NULL.
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    problem_id = Column(String, ForeignKey("problems.id"), nullable=False)
    timestamp = Column(DateTime, default=get_utc_now, nullable=False)
    verdict = Column(String, nullable=False) # e.g., Wrong Answer, Accepted, etc.
    root_cause_category = Column(String, nullable=True) # wrong_approach, implementation_bug, etc.
    explanation_text = Column(Text, nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)
    time_spent_seconds = Column(Integer, nullable=True)
    hints_used = Column(Integer, default=0, nullable=False)  # progressive hint reveal count (Tier 3.1)

    problem = relationship("Problem", back_populates="attempts")


class TopicMastery(Base):
    __tablename__ = "topic_mastery"

    topic = Column(String, primary_key=True, index=True) # e.g., "Arrays", "Two Pointers"
    # Phase 2 (expand): nullable now. Contract phase moves the PK to (user_id, topic).
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    rating = Column(Float, default=1200.0, nullable=False)
    attempts_count = Column(Integer, default=0, nullable=False)
    success_count = Column(Integer, default=0, nullable=False)
    level = Column(Integer, default=0, nullable=False)
    last_updated = Column(DateTime, default=get_utc_now, nullable=False)
    next_review_date = Column(DateTime, nullable=True)

    @property
    def badge(self) -> str:
        badges = {
            0: "None",
            1: "Bronze",
            2: "Silver",
            3: "Gold",
            4: "Platinum",
            5: "Diamond"
        }
        return badges.get(self.level or 0, "None")

    @property
    def mastery_score(self) -> float:
        return (self.level or 0) / 5.0

    @property
    def success_rate(self) -> float:
        if self.attempts_count <= 0:
            return 0.0
        return self.success_count / self.attempts_count

    @property
    def last_attempted(self) -> Optional[datetime]:
        return self.last_updated

    @property
    def next_due_date(self) -> Optional[datetime]:
        return self.next_review_date


class BadgeTest(Base):
    __tablename__ = "badge_tests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)  # Phase 2 (expand)
    topic = Column(String, nullable=False)
    level = Column(Integer, nullable=False) # level being tested for (1-5)
    status = Column(String, default="active") # "active", "passed", "abandoned"
    problem1_id = Column(String, nullable=False)
    problem2_id = Column(String, nullable=False)
    problem1_solved = Column(Boolean, default=False, nullable=False)
    problem2_solved = Column(Boolean, default=False, nullable=False)
    time_limit_seconds = Column(Integer, default=5400, nullable=False)  # 1.5 hours default
    start_time = Column(DateTime, default=get_utc_now, nullable=False)
    end_time = Column(DateTime, nullable=True)


class UserConfig(Base):
    """Simple key/value store for user preferences (e.g. focus topic, critique estimates)."""
    __tablename__ = "user_config"

    key = Column(String, primary_key=True, index=True)
    # Phase 2 (expand): nullable now. Contract phase moves the PK to (user_id, key).
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    value = Column(String, nullable=True)


class SpacedRepetition(Base):
    __tablename__ = "spaced_repetition"

    problem_id = Column(String, ForeignKey("problems.id"), primary_key=True, index=True)
    # Phase 2 (expand): nullable now. Contract phase moves the PK to (user_id, problem_id).
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    stage = Column(Integer, default=1, nullable=False) # 1: 3 days, 2: 7 days, 3: 14 days, 4: complete
    last_solved = Column(DateTime, default=get_utc_now, nullable=False)
    next_due = Column(DateTime, nullable=False)

    problem = relationship("Problem")


class DailyActivity(Base):
    """Tracks per-day attempt/solve counts for streak calculation (Tier 1.4)."""
    __tablename__ = "daily_activity"

    date = Column(String, primary_key=True)  # ISO date string "YYYY-MM-DD"
    # Phase 2 (expand): nullable now. Contract phase moves the PK to (user_id, date).
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    problems_attempted = Column(Integer, default=0, nullable=False)
    problems_solved = Column(Integer, default=0, nullable=False)



class CompanyMetadata(Base):
    """Stores company-specific focus notes and metadata."""
    __tablename__ = "company_metadata"

    name = Column(String, primary_key=True, index=True)
    focus_note = Column(Text, nullable=True)


# ==========================================================
# Pydantic Schemas
# ==========================================

class ProblemBase(BaseModel):
    id: str
    title: str
    url: str
    difficulty: str
    topics: str
    companies: Optional[str] = None
    user_notes: Optional[str] = None
    personal_difficulty: Optional[str] = None

class SaveProblemNotesRequest(BaseModel):
    user_notes: Optional[str] = None
    personal_difficulty: Optional[str] = None

class ProblemSchema(ProblemBase):
    model_config = ConfigDict(from_attributes=True)

class AttemptBase(BaseModel):
    problem_id: str
    verdict: str
    root_cause_category: Optional[str] = None
    explanation_text: Optional[str] = None
    time_taken_seconds: Optional[int] = None
    hints_used: int = 0

class AttemptCreate(AttemptBase):
    pass

class AttemptSchema(AttemptBase):
    id: int
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

class BadgeTestProblemSchema(BaseModel):
    id: str
    title: str
    url: str
    difficulty: str


class TopicMasterySchema(BaseModel):
    topic: str
    mastery_score: float
    attempts_count: int
    success_rate: float
    rating: float
    level: int
    badge: str
    next_questions: List[BadgeTestProblemSchema] = []
    last_attempted: Optional[datetime] = None
    next_due_date: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class BadgeTestStartRequest(BaseModel):
    topic: str


class BadgeTestSchema(BaseModel):
    id: int
    topic: str
    level: int
    status: str
    problem1: BadgeTestProblemSchema
    problem2: BadgeTestProblemSchema
    problem1_solved: bool
    problem2_solved: bool
    time_limit_seconds: int = 5400
    elapsed_seconds: int = 0
    start_time: datetime
    end_time: Optional[datetime] = None

class SubmissionAnalyzeRequest(BaseModel):
    problem_id: str
    problem_title: str
    code: str
    language: str
    verdict: str
    error_details: Optional[str] = None
    test_cases: Optional[List[dict]] = None
    time_taken_seconds: Optional[int] = None
    hints_used: int = 0  # passed from extension after progressive hint use

class SubmissionAnalyzeResponse(BaseModel):
    root_cause_category: str
    explanation: str
    suggested_action: str
    badge_test_result: Optional[dict] = None

class RecommendationItem(BaseModel):
    problem_id: str
    title: str
    url: str
    difficulty: str
    reason: str
    topics: Optional[str] = None
    companies: Optional[str] = None


class ReviewItem(BaseModel):
    problem_id: str
    title: str
    url: str
    difficulty: str
    due_date: datetime
    stage: int
    topics: Optional[str] = None
    companies: Optional[str] = None


class ProblemRecommendResponse(BaseModel):
    recommendations: List[RecommendationItem]
    reviews: List[ReviewItem]


class SolvedProblemSyncSchema(BaseModel):
    problem_id: str
    title: str
    difficulty: str
    topics: List[str]
    company: Optional[str] = None  # 1.1: optional company tag from sync source
    solved_at: Optional[str] = None  # ISO timestamp string if known
    timestamp: Optional[int] = None  # Epoch timestamp integer in seconds


class SyncSolvedRequest(BaseModel):
    problems: List[SolvedProblemSyncSchema]
    username: Optional[str] = None


class SolvedProblemTableItem(BaseModel):
    problem_id: str
    title: str
    url: str
    difficulty: str
    topics: str
    companies: Optional[str] = None
    date_solved: str
    next_review_due: str
    review_schedule: str
    review_status: str
    attempts_count: int
    user_notes: Optional[str] = ""
    personal_difficulty: Optional[str] = ""
    hints_used: int = 0


class TopicStatItem(BaseModel):
    topic: str
    solved_count: int
    mastery_score: float
    badge: Optional[str] = None


class TopicAnalysisResponse(BaseModel):
    total_solved: int
    difficulty_breakdown: dict
    top_topics: List[TopicStatItem]
    weak_topics: List[TopicStatItem]


class FocusResponse(BaseModel):
    focus_topic: Optional[str] = None
    focus_topics: List[str] = []


class SetFocusRequest(BaseModel):
    topic: Optional[str] = None  # Single topic or comma-separated
    topics: Optional[List[str]] = None  # Up to 3 focus topics


class CheckApproachRequest(BaseModel):
    problem_id: str
    problem_title: str
    code: str
    language: str
    constraints: Optional[List[str]] = None
    is_contest: Optional[bool] = False


class CheckApproachResponse(BaseModel):
    is_optimal: Optional[bool] = False
    current_complexity: Optional[str] = "O(N)"
    optimal_complexity: Optional[str] = "O(N)"
    feedback: Optional[str] = ""
    alternative_approach: Optional[str] = ""
    verdict: Optional[str] = "Critique complete"
    explanation: Optional[str] = ""
    suggested_action: Optional[str] = ""


# --- Levelled hint schemas (Tier 3.1) ---

class ComplexityEstimateRequest(BaseModel):
    problem_id: str
    time_complexity: Optional[str] = "O(N)"
    space_complexity: Optional[str] = "O(1)"
    user_time: Optional[str] = "O(N)"
    user_space: Optional[str] = "O(1)"
    code: Optional[str] = ""
    language: Optional[str] = "python3"
    is_contest: Optional[bool] = False


class ComplexityRevealRequest(BaseModel):
    problem_id: str
    code: str
    language: str


class ComplexityRevealResponse(BaseModel):
    optimal_time: str
    optimal_space: str
    user_matches: bool
    explanation: str


class GetHintRequest(BaseModel):
    problem_id: str
    problem_title: str
    code: str
    language: str
    level: Optional[int] = 1  # 1, 2, or 3
    constraints: Optional[List[str]] = None
    is_contest: Optional[bool] = False


class GetHintResponse(BaseModel):
    hint: str
    level: int
    has_next: bool


class HintRevealRequest(BaseModel):
    problem_id: str
    problem_title: Optional[str] = None
    code: str
    language: str
    level: Optional[int] = 1  # 1, 2, or 3
    constraints: Optional[List[str]] = None
    is_contest: Optional[bool] = False


class HintRevealResponse(BaseModel):
    hint: str
    level: int
    has_next: bool  # False when level == 3


class GetEdgeCasesRequest(BaseModel):
    problem_id: str
    problem_title: str
    code: str
    language: str
    constraints: Optional[List[str]] = None
    is_contest: Optional[bool] = False


class GetEdgeCasesResponse(BaseModel):
    edge_cases: List[dict]
    constraints_critique: str


class AskHelpRequest(BaseModel):
    problem_id: str
    problem_title: str
    code: str
    language: str
    question: str
    constraints: Optional[List[str]] = None
    is_contest: Optional[bool] = False


class AskHelpResponse(BaseModel):
    answer: str


# --- Explain-back schemas (Tier 3.2) ---

class ExplainBackRequest(BaseModel):
    problem_id: str
    code: str
    language: str
    user_explanation: str
    is_contest: Optional[bool] = False


class ExplainBackResponse(BaseModel):
    matches: bool
    discrepancy_note: Optional[str] = None


class ApproachCritiqueResponse(BaseModel):
    feedback: str
    alternative_approach: str


# --- Activity / streak schemas (Tier 1.4) ---

class StreakResponse(BaseModel):
    current_streak_days: int
    problems_today: int
    solved_today: int


# --- Weekly journal schema (Tier 5.1) ---

class WeeklyJournalResponse(BaseModel):
    period_start: str
    period_end: str
    total_attempts: int
    total_solved: int
    by_category: dict          # { category: count }
    example_problems: List[str]
    markdown_text: str
    ai_growth_summary: Optional[str] = None
    concepts_learned: List[str] = []
    pattern_spotlight: Optional[str] = None



# --- Weak pairs (Tier 2.1) ---

class WeakPairItem(BaseModel):
    topic_a: str
    topic_b: str
    co_occurrence: int
