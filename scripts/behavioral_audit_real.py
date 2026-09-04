import sqlite3
import json
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import engine, Base, SessionLocal
from backend.models import Problem, TopicMastery, Attempt, SpacedRepetition, UserConfig, BadgeTest, DailyActivity

client = TestClient(app)
DB_PATH = "dsa_tutor.db"

def query_db(query, args=(), one=False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(query, args)
    rows = cur.fetchall()
    conn.commit()
    conn.close()
    if one:
        return dict(rows[0]) if rows else None
    return [dict(r) for r in rows]

def run_behavioral_audit():
    results = {}

    # 1. Health Probe
    r = client.get("/health")
    results["health"] = {"status": r.status_code, "body": r.json()}

    # 2. AI Quota Real Flow
    r = client.get("/ai/quota")
    results["ai_quota"] = {"status": r.status_code, "body": r.json()}

    # 3. Topic Mastery Real DB Grid
    r = client.get("/topics/mastery")
    data = r.json()
    db_rows = query_db("SELECT topic, rating, level, attempts_count, success_count FROM topic_mastery LIMIT 5")
    results["topics_mastery"] = {
        "api_count": len(data),
        "sample_api": data[0] if data else None,
        "sample_db": db_rows[0] if db_rows else None
    }

    # 4. Focus Topics Set & Persist
    r1 = client.post("/topics/focus", json={"topics": ["Dynamic Programming", "Trees"]})
    r2 = client.get("/topics/focus")
    cfg = query_db("SELECT key, value FROM user_config WHERE key = 'focus_topics'", one=True)
    results["focus_topics"] = {
        "post_res": r1.json(),
        "get_res": r2.json(),
        "db_row": cfg
    }

    # 5. Progressive Hints Real Flow (L1 -> L2 -> L3)
    h1 = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 1
    }).json()

    h2 = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 2
    }).json()

    h3 = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 3
    }).json()

    results["progressive_hints"] = {
        "h1_level": h1.get("level"),
        "h1_has_next": h1.get("has_next"),
        "h2_level": h2.get("level"),
        "h2_has_next": h2.get("has_next"),
        "h3_level": h3.get("level"),
        "h3_has_next": h3.get("has_next"),
    }

    # 6. Next Problems & Company Filter Real Flow
    rec_cisco = client.get("/problems/next?company=Cisco").json()
    rec_gen = client.get("/problems/next").json()
    results["recommendations"] = {
        "cisco_count": len(rec_cisco.get("recommendations", [])),
        "cisco_top": rec_cisco.get("recommendations", [])[0] if rec_cisco.get("recommendations") else None,
        "gen_count": len(rec_gen.get("recommendations", [])),
        "gen_top": rec_gen.get("recommendations", [])[0] if rec_gen.get("recommendations") else None,
    }

    # 7. Badge Test Real Lifecycle Flow (Start -> Active -> Double Click -> Submit/Abandon)
    # Clear any stale tests first
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM badge_tests")
    conn.commit()
    conn.close()

    # Start test
    start_res = client.post("/badge-test/start", json={"topic": "Arrays"}).json()

    # Poll active
    active_res = client.get("/badge-test/active").json()

    # Test duplicate start rejection
    dup_res = client.post("/badge-test/start", json={"topic": "Arrays"})

    # Test submission before solve
    submit_res = client.post("/badge-test/submit").json()

    # Database state verification
    db_state = query_db("SELECT id, topic, level, status, problem1_id, problem2_id FROM badge_tests", one=True)

    results["badge_test"] = {
        "start_id": start_res.get("id"),
        "active_status": active_res.get("status") if active_res else None,
        "duplicate_http_code": dup_res.status_code,
        "duplicate_error": dup_res.json().get("detail"),
        "submit_status": submit_res.get("test_status"),
        "db_row": db_state
    }

    # 8. Notes & Personal Difficulty Persistence
    save_res = client.post("/problems/two-sum/notes", json={
        "user_notes": "Use hash map for complement lookup in O(N).",
        "personal_difficulty": "Easy"
    }).json()
    get_res = client.get("/problems/two-sum").json()
    results["problem_notes"] = {
        "save_status": save_res.get("status"),
        "persisted_notes": get_res.get("user_notes"),
        "persisted_diff": get_res.get("personal_difficulty")
    }

    # 9. CSV & Journal Export Real Generation
    csv_res = client.get("/export/solved-csv?timeframe=all_time")
    journal_res = client.get("/journal/weekly")
    results["exports"] = {
        "csv_status": csv_res.status_code,
        "csv_content_type": csv_res.headers.get("content-type"),
        "csv_length": len(csv_res.text),
        "journal_status": journal_res.status_code,
        "journal_keys": list(journal_res.json().keys()) if journal_res.status_code == 200 else None
    }

    print("AUDIT EXECUTION COMPLETE. SUMMARY EVIDENCE:")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    run_behavioral_audit()
