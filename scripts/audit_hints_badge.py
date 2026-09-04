import sqlite3
import json
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import engine, Base, SessionLocal
from backend.models import Problem, TopicMastery, Attempt, SpacedRepetition, UserConfig, BadgeTest, MockInterviewSession

client = TestClient(app)
DB_PATH = "dsa_tutor.db"

def clean_sessions():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM badge_tests")
    conn.commit()
    conn.close()

def audit_hints_and_badge_flow():
    clean_sessions()
    
    # 1. Progressive hints with no active test/mock
    h1 = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 1
    })
    
    h2 = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 2
    })
    
    h3 = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 3
    })

    print("HINTS RESPONSES:")
    print("H1:", h1.status_code, json.dumps(h1.json(), ensure_ascii=True))
    print("H2:", h2.status_code, json.dumps(h2.json(), ensure_ascii=True))
    print("H3:", h3.status_code, json.dumps(h3.json(), ensure_ascii=True))

    # 2. Start Badge Test
    b_start = client.post("/badge-test/start", json={"topic": "Arrays"})
    print("BADGE START:", b_start.status_code, b_start.json())

    # 3. Verify Active Badge Test
    b_active = client.get("/badge-test/active")
    print("BADGE ACTIVE:", b_active.status_code, b_active.json())

    # 4. Verify AI lock while Badge Test is active
    h_locked = client.post("/hints/reveal", json={
        "problem_id": "two-sum",
        "problem_title": "Two Sum",
        "code": "def twoSum(nums, target): pass",
        "language": "python3",
        "level": 1
    })
    print("HINT WHILE BADGE ACTIVE (SHOULD BE 403):", h_locked.status_code, h_locked.json())

    # 5. Submit Badge Test (0 of 2 solved -> fails)
    b_submit = client.post("/badge-test/submit")
    print("BADGE SUBMIT:", b_submit.status_code, b_submit.json())

    # 6. Verify Active Badge Test is now cleared (status passed or failed)
    b_active_after = client.get("/badge-test/active")
    print("BADGE ACTIVE AFTER SUBMIT:", b_active_after.status_code, b_active_after.json())

if __name__ == "__main__":
    audit_hints_and_badge_flow()
