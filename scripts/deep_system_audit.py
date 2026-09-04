import urllib.request
import urllib.parse
import json
import sqlite3
import time

BASE_URL = "http://localhost:8000"
DB_PATH = "dsa_tutor.db"

def http_get(path):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status, json.loads(res.read().decode()), res.headers
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body), e.headers
        except:
            return e.code, body, e.headers
    except Exception as e:
        return 0, str(e), {}

def http_post(path, data=None):
    url = f"{BASE_URL}{path}"
    body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read().decode()), res.headers
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body), e.headers
        except:
            return e.code, body, e.headers
    except Exception as e:
        return 0, str(e), {}

def query_db(sql, args=(), one=False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(sql, args)
    rows = cur.fetchall()
    conn.commit()
    conn.close()
    if one:
        return dict(rows[0]) if rows else None
    return [dict(r) for r in rows]

def execute_full_system_audit():
    audit_log = {}

    print("=== EXECUTING DEEP PRODUCTION VERIFICATION SUITE ===")

    # Cleanup any stale locks in DB
    query_db("DELETE FROM badge_tests")

    # 1. Health Probe
    status, body, _ = http_get("/health")
    audit_log["1_health"] = {"status": status, "body": body}

    # 2. AI Quota
    status, body, _ = http_get("/ai/quota")
    audit_log["2_ai_quota"] = {"status": status, "body": body}

    # 3. Topic Mastery Grid
    status, body, _ = http_get("/topics/mastery")
    audit_log["3_topics_mastery"] = {
        "status": status,
        "count": len(body) if isinstance(body, list) else 0,
        "sample": body[0] if isinstance(body, list) and body else None
    }

    # 4. Focus Topics: GET -> POST -> GET -> DB
    query_db("DELETE FROM user_config WHERE key = 'focus_topics'")
    status_post, body_post, _ = http_post("/topics/focus", {"topics": ["Dynamic Programming", "Trees"]})
    status_get, body_get, _ = http_get("/topics/focus")
    db_focus = query_db("SELECT value FROM user_config WHERE key = 'focus_topics'", one=True)
    audit_log["4_focus_topics"] = {
        "post_status": status_post,
        "post_body": body_post,
        "get_status": status_get,
        "get_body": body_get,
        "db_value": db_focus.get("value") if db_focus else None
    }

    # 5. Progressive Hints: Level 1 -> Level 2 -> Level 3
    s1, b1, _ = http_post("/hints/reveal", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 1
    })
    s2, b2, _ = http_post("/hints/reveal", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 2
    })
    s3, b3, _ = http_post("/hints/reveal", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 3
    })
    audit_log["5_progressive_hints"] = {
        "h1": {"status": s1, "level": b1.get("level") if isinstance(b1, dict) else None, "has_next": b1.get("has_next") if isinstance(b1, dict) else None},
        "h2": {"status": s2, "level": b2.get("level") if isinstance(b2, dict) else None, "has_next": b2.get("has_next") if isinstance(b2, dict) else None},
        "h3": {"status": s3, "level": b3.get("level") if isinstance(b3, dict) else None, "has_next": b3.get("has_next") if isinstance(b3, dict) else None},
    }

    # 6. Approach Critique & Complexity Estimation
    s_est, b_est, _ = http_post("/critique/estimate", {
        "problem_id": "two-sum",
        "user_time": "O(N)",
        "user_space": "O(N)",
        "code": "def twoSum(nums, target): pass",
        "language": "python3"
    })
    s_crit, b_crit, _ = http_post("/approach/check", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n",
        "language": "python3"
    })
    audit_log["6_approach_critique"] = {
        "estimate_status": s_est,
        "critique_status": s_crit,
        "is_optimal": b_crit.get("is_optimal") if isinstance(b_crit, dict) else None,
        "current_complexity": b_crit.get("current_complexity") if isinstance(b_crit, dict) else None
    }

    # 7. Edge Cases Analysis
    s_edge, b_edge, _ = http_post("/edge-cases/get", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"]
    })
    audit_log["7_edge_cases"] = {
        "status": s_edge,
        "edge_cases_count": len(b_edge.get("edge_cases", [])) if isinstance(b_edge, dict) else 0
    }

    # 8. Custom Q&A / Ask Help
    s_ask, b_ask, _ = http_post("/help/ask", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "question": "Can I solve this in O(1) space?"
    })
    audit_log["8_custom_ask"] = {
        "status": s_ask,
        "answer_len": len(b_ask.get("answer", "")) if isinstance(b_ask, dict) else 0
    }

    # 9. Next Recommendations: Company Filtering (Cisco vs General)
    s_rec_cisco, b_rec_cisco, _ = http_get("/problems/next?company=Cisco")
    s_rec_gen, b_rec_gen, _ = http_get("/problems/next")
    audit_log["9_recommendations"] = {
        "cisco_status": s_rec_cisco,
        "cisco_count": len(b_rec_cisco.get("recommendations", [])) if isinstance(b_rec_cisco, dict) else 0,
        "cisco_top": b_rec_cisco.get("recommendations", [])[0] if isinstance(b_rec_cisco, dict) and b_rec_cisco.get("recommendations") else None,
        "gen_status": s_rec_gen,
        "gen_count": len(b_rec_gen.get("recommendations", [])) if isinstance(b_rec_gen, dict) else 0,
    }

    # 10. Spaced Repetition Due Count
    s_sr, b_sr, _ = http_get("/reviews/count")
    audit_log["10_spaced_repetition"] = {"status": s_sr, "body": b_sr}

    # 11. Activity Streak
    s_streak, b_streak, _ = http_get("/activity/streak")
    audit_log["11_streak"] = {"status": s_streak, "body": b_streak}

    # 12. Companies & Metadata
    s_comp, b_comp, _ = http_get("/companies")
    s_meta, b_meta, _ = http_get("/companies/metadata")
    audit_log["12_companies"] = {
        "comp_status": s_comp,
        "comp_count": len(b_comp) if isinstance(b_comp, list) else 0,
        "meta_status": s_meta,
        "meta_cisco": b_meta.get("Cisco") if isinstance(b_meta, dict) else None
    }

    # 13. Problem Notes & Difficulty
    s_notes_post, b_notes_post, _ = http_post("/problems/two-sum/notes", {
        "user_notes": "Hash map complement approach.",
        "personal_difficulty": "Easy"
    })
    s_notes_get, b_notes_get, _ = http_get("/problems/two-sum")
    audit_log["13_problem_notes"] = {
        "post_status": s_notes_post,
        "get_status": s_notes_get,
        "notes": b_notes_get.get("user_notes") if isinstance(b_notes_get, dict) else None,
        "diff": b_notes_get.get("personal_difficulty") if isinstance(b_notes_get, dict) else None
    }

    # 14. Badge Test Lifecycle: Start -> Active -> Block AI -> Duplicate Start Rejection -> Submit -> Abandon
    query_db("DELETE FROM badge_tests")
    s_bstart, b_bstart, _ = http_post("/badge-test/start", {"topic": "Arrays"})
    s_bactive, b_bactive, _ = http_get("/badge-test/active")
    # Verify AI lock while active
    s_block, b_block, _ = http_post("/hints/reveal", {
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 1
    })
    # Verify duplicate start rejection
    s_bdup, b_bdup, _ = http_post("/badge-test/start", {"topic": "Arrays"})
    # Submit test (0 of 2 solved -> fail)
    s_bsub, b_bsub, _ = http_post("/badge-test/submit")
    s_bactive_after, b_bactive_after, _ = http_get("/badge-test/active")
    
    audit_log["14_badge_test"] = {
        "start_status": s_bstart,
        "start_id": b_bstart.get("id") if isinstance(b_bstart, dict) else None,
        "active_status": s_bactive,
        "active_id": b_bactive.get("id") if isinstance(b_bactive, dict) else None,
        "ai_lock_status": s_block,
        "ai_lock_detail": b_block.get("detail") if isinstance(b_block, dict) else None,
        "dup_start_status": s_bdup,
        "dup_start_detail": b_bdup.get("detail") if isinstance(b_bdup, dict) else None,
        "submit_status": s_bsub,
        "submit_passed": b_bsub.get("passed") if isinstance(b_bsub, dict) else None,
        "active_after_submit": b_bactive_after
    }


    audit_log["15_mock_interview"] = {
        "start_status": s_mstart,
        "session_id": session_id,
        "active_status": s_mactive,
        "approach_status": s_mapp,
        "approach_approved": b_mapp.get("approved") if isinstance(b_mapp, dict) else None,
        "switch_status": s_mswitch,
        "eval_status": s_meval,
        "eval_verdict": b_meval.get("verdict") if isinstance(b_meval, dict) else None,
        "submit_status": s_msub,
        "active_after_submit": b_mactive_after
    }

    # 16. CSV Export & Weekly Journal
    import urllib.request as ureq
    try:
        with ureq.urlopen(f"{BASE_URL}/export/solved-csv?timeframe=all_time") as res:
            s_csv = res.status
            h_csv = res.headers
            b_csv = res.read().decode("utf-8")
    except Exception as ex:
        s_csv = 500
        h_csv = {}
        b_csv = str(ex)

    s_jnl, b_jnl, _ = http_get("/journal/weekly")
    audit_log["16_exports"] = {
        "csv_status": s_csv,
        "csv_content_type": h_csv.get("Content-Type") or h_csv.get("content-type"),
        "csv_length": len(b_csv),
        "journal_status": s_jnl,
        "journal_has_markdown": bool(b_jnl.get("markdown_text")) if isinstance(b_jnl, dict) else False
    }

    print("\n--- FINAL AUDIT RAW EXECUTION LOG ---")
    print(json.dumps(audit_log, indent=2))

if __name__ == "__main__":
    execute_full_system_audit()
