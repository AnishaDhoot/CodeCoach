# 🧠 CodeCoach Agent — Complete Project Master Guide

> **Author**: Anisha Dhoot  
> **Project**: Autonomous CodeCoach Agent — LeetCode Companion  
> **Target Audience**: Technical Interviewers, Systems Engineers, AI/ML Engineers  

---

## 📑 Table of Contents
1. [Executive Overview & Vision](#1-executive-overview--vision)
2. [System Architecture & Component Map](#2-system-architecture--component-map)
3. [Agentic AI Engineering & Design Patterns](#3-agentic-ai-engineering--design-patterns)
4. [Mathematical Engine: Elo Scoring & Spaced Repetition](#4-mathematical-engine-elo-scoring--spaced-repetition)
5. [Complete Module-by-Module Code Walkthrough](#5-complete-module-by-module-code-walkthrough)
6. [Production Hardening & Bug Fix Case Studies](#6-production-hardening--bug-fix-case-studies)
7. [Interview Preparation Guide & Technical Q&A](#7-interview-preparation-guide--technical-qa)

---

## 1. Executive Overview & Vision

### The Problem
When practicing Data Structures & Algorithms (DSA) on platforms like LeetCode, software engineers encounter two critical bottlenecks:
1. **Unproductive Struggle**: Failing a test case often leads to generic error messages (`Wrong Answer`, `Time Limit Exceeded`) without revealing *why* the underlying logic failed. Users resort to reading full code solutions, destroying the learning process.
2. **Lack of Personalization**: Standard practice lists (e.g. Blind 75) treat all users identically, ignoring individual topic weaknesses, forgetting curves, and skill gaps.

### The Solution: Agentic AI Overlay
**CodeCoach Agent** is an autonomous AI companion embedded directly into the browser context. It observes user behavior in real time, intercepts code submission failures automatically, categorizes failure root-causes, updates a dynamic Elo topic mastery model, and delivers adaptive problem recommendations, timed 3-question mock interviews, formal Badge Tests, and progressive 3-stage hints.

---

## 2. System Architecture & Component Map

### Overall Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                BROWSER CONTEXT (leetcode.com)                           │
│                                                                                         │
│  ┌───────────────────────────────┐               ┌───────────────────────────────────┐  │
│  │   LeetCode Main Page          │               │   DSA Tutor React Panel (App.jsx) │  │
│  │   - Monaco Editor             │               │   - Shadow DOM Isolated Container │  │
│  │   - DOM Submission Badge      │               │   - Code Coach, Hints, Reviews    │  │
│  └──────────────┬────────────────┘               └─────────────────▲─────────────────┘  │
│                 │                                                  │                    │
│                 │ window.postMessage                               │ React State        │
│                 ▼                                                  │                    │
│  ┌───────────────────────────────┐                                 │                    │
│  │   Page Scraper (injected.js)  │                                 │                    │
│  │   - Monaco Memory Reader      │                                 │                    │
│  │   - DOM Lock / Fairplay CSS   │                                 │                    │
│  └──────────────┬────────────────┘                                 │                    │
│                 │                                                  │                    │
│                 │ chrome.runtime.sendMessage                       │                    │
│                 ▼                                                  │                    │
│  ┌─────────────────────────────────────────────────────────────────┴─────────────────┐  │
│  │                     Chrome Extension Background Service Worker                     │  │
│  │                     (background.js — MV3 Event Router)                            │  │
│  └──────────────────────────────────────┬────────────────────────────────────────────┘  │
└─────────────────────────────────────────┼───────────────────────────────────────────────┘
                                          │ HTTP REST Requests (JSON)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              LOCAL FASTAPI BACKEND SERVER                               │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                             FastAPI Router (main.py)                              │  │
│  └──────────────┬───────────────────────┬────────────────────────────┬───────────────┘  │
│                 │                       │                            │                  │
│                 ▼                       ▼                            ▼                  │
│  ┌───────────────────────────┐ ┌───────────────────┐ ┌──────────────────────────────┐  │
│  │ Elo Recommender Engine    │ │ Spaced Repetition │ │ AI Agent Engine (agent.py)   │  │
│  │ (recommender.py)          │ │ (models.py)       │ │ - System Prompt Builders     │  │
│  └──────────────┬────────────┘ └────────┬──────────┘ │ - Structured JSON Cleaning   │  │
│                 │                       │            └──────────────┬───────────────┘  │
│                 ▼                       ▼                           │                  │
│  ┌─────────────────────────────────────────────────┐                │                  │
│  │ SQLite Database (dsa_tutor.db)                  │                │                  │
│  │ - Problems, Attempts, TopicMastery, Activity    │                │                  │
│  └─────────────────────────────────────────────────┘                │                  │
│                                                                     │                  │
│                                      ┌──────────────────────────────┴───────────────┐  │
│                                      │          Dual LLM Inference Provider         │  │
│                                      │  Primary: Groq API (openai/gpt-oss-20b)      │  │
│                                      │  Fallback: Local Ollama (qwen2.5:7b)         │  │
│                                      └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Agentic AI Engineering & Design Patterns

### 3.1 Autonomous Perception-Action Loop
Rather than acting as a simple chat interface, the agent uses an event-driven loop:
1. **Perceive**: A `MutationObserver` on `document.body` watches for LeetCode verdict elements (`Wrong Answer`, `Accepted`, `TLE`).
2. **Extract Context**: Triggers `injected.js` to inspect `window.monaco.editor.getModels()` and extract the code in memory along with problem metadata.
3. **Reason & Diagnose**: Transmits code, failing test cases, and verdict to `agent.py`, which prompts the LLM to categorize the conceptual failure root-cause into 1 of 5 taxonomy buckets.
4. **Act & Adapt**: Updates Elo topic mastery in SQLite and displays a plain-language explanation and recommended action in the UI overlay.

### 3.2 Failure Root-Cause Taxonomy
The AI agent classifies code failures into five mutually exclusive categories:

| Category | Description | Agent Action & Recommendation |
| :--- | :--- | :--- |
| `wrong_approach` | Fundamental algorithmic flaw (e.g. Greedy instead of DP). | Recommends reviewing fundamental topic patterns; suggests stepping down in difficulty. |
| `implementation_bug` | Correct algorithm, but contains coding bugs (off-by-one, pointer updates). | Directs user to dry-run logic on failing pointer indices. |
| `edge_case_miss` | Fails on empty arrays, duplicates, negative numbers, or extreme inputs. | Highlights constraint bounds ($N=0$ or duplicate values). |
| `complexity_issue` | Code is correct but exceeds time/space limits (TLE / OOM). | Analyzes time complexity ($O(N^2) \rightarrow O(N \log N)$) and suggests hash maps / two-pointer optimizations. |
| `unclear` | Syntax or compile errors preventing execution. | Prompts user to check code syntax. |

### 3.3 3-Stage Progressive Hinting System
To prevent giving away answers, hints are gated progressively:
- **Level 1 (Core Concept & Invariants)**: Explains the underlying mathematical property or problem invariant without naming specific algorithms.
- **Level 2 (Algorithmic Strategy & Data Structures)**: Identifies the target technique (e.g. *Monotonic Stack*, *Sliding Window*, *Binary Search*).
- **Level 3 (Step-by-Step Pseudocode)**: Outlines high-level logic breakdown without providing copy-paste syntax for a specific programming language.

---

## 4. Mathematical Engine: Test-Driven Topic Mastery & Spaced Repetition

### 4.1 Test-Driven Badge Test Progression
Topic mastery levels ($0-5$) and badges are unlocked **strictly via formal, timed Badge Tests**. Standard problem submissions update attempt counts, success rates, and spaced-repetition schedules, but badge level advancement is strictly test-gated.

| Level | Badge Name | Badge Icon | Unlocked Difficulty Band | Evaluation Test Criteria |
| :---: | :--- | :---: | :--- | :--- |
| **0** | Locked / None | ❌ | Easy | Initial level for all topics. |
| **1** | Bronze | 🥉 | Easy | Complete 2 Easy problems in 1.5 hours. |
| **2** | Silver | 🥈 | Medium | Complete 2 Easy/Medium problems in 1.5 hours. |
| **3** | Gold | 🥇 | Medium | Complete 2 Medium problems in 1.5 hours. |
| **4** | Platinum | 🛡️ | Hard | Complete 2 Medium/Hard problems in 1.5 hours. |
| **5** | Diamond | 💎 | Hard | Complete 2 Hard problems in 1.5 hours. |

### 4.2 Productive Struggle & Exploration Policy
- **Productive Struggle Band**: The recommender selects target problem difficulties matching the user's unlocked badge level:
  - Level 0 / Level 1 (Bronze) $\rightarrow$ Target **Easy**
  - Level 2 (Silver) / Level 3 (Gold) $\rightarrow$ Target **Medium**
  - Level 4 (Platinum) / Level 5 (Diamond) $\rightarrow$ Target **Hard**
- **Dynamic Streak Adjustments**: Solving 2 consecutive problems upgrades target difficulty; failing 2 consecutive problems steps down difficulty to rebuild confidence.
- **Epsilon-Greedy Exploration ($\epsilon=0.15$)**: With 15% probability, the top recommendation is swapped for a random problem outside the productive struggle band to expose the user to unfamiliar topics.

### 4.3 Spaced Repetition Scheduling
Upon solving a problem (`Accepted`), a 5-stage retention review schedule is initialized or advanced:
- **Stage 1**: Review due in **3 days**
- **Stage 2**: Review due in **7 days**
- **Stage 3**: Review due in **14 days**
- **Stage 4**: Review due in **30 days**
- **Stage 5**: Mastered (due in 3,650 days)

---

## 5. Complete Module-by-Module Code Walkthrough

### 5.1 Backend Files

#### `backend/agent.py` — The AI Agent Engine
- `query_groq()`: Sends prompts to Groq API (`openai/gpt-oss-20b` / candidate models) with `max_tokens=1024` and `response_format={"type": "json_object"}`.
- `query_ollama()`: Fallback provider querying local Ollama (`qwen2.5:7b`) via official python SDK.
- `clean_json_string()`: Strips markdown code block wrappers (````json ... ````) and performs non-greedy extraction.
- `repair_json_string()`: Fixes unescaped quotes and trailing commas before parsing.
- Prompt Builders: `generate_diagnosis()`, `generate_approach_critique()`, `generate_levelled_hint()`, `analyze_edge_cases()`, `answer_custom_question()`, `generate_explain_back_check()`, `evaluate_mock_approach()`, `generate_mock_scorecard()`.

#### `backend/main.py` — FastAPI Server & REST Endpoints
- `analyze_submission()`: Primary endpoint receiving code, verdict, and test cases. Splits comma-separated topic strings and updates attempt/success metrics per topic independently.
- `sync_solved()`: Batch sync endpoint for LeetCode historical solves; imports solved problems in a single call via `/api/problems/all/` and bulk GraphQL queries without rate-limiting.
- Daily AI Quota (`/check-ai-quota`): Enforces process-safe daily limits (default: 25 requests/day) using atomic SQL updates.
- Schema Migration (`_ensure_schema()`): Auto-migrates database schemas across versions without data loss.

#### `backend/database.py` — Database Initialization
- `DB_PATH`: Resolves absolute path to `dsa_tutor.db` in project root.
- `create_engine`: Initializes SQLite connection with `connect_args={"check_same_thread": False, "timeout": 15}` to prevent write lock errors under concurrent loads.

#### `backend/models.py` — SQLAlchemy ORM & Pydantic Models
- `Problem`: Primary key `id` (slug), title, difficulty, comma-separated `topics`, `companies`, `user_notes`, `personal_difficulty`, `is_solved`, `is_premium`.
- `Attempt`: Records submission verdict, failure category, explanation text, time spent, and `hints_used`.
- `TopicMastery`: Tracks per-topic `level` ($0-5$), `attempts_count`, `success_count`, `last_updated`, `next_review_date`.
- `BadgeTest`: Stores active 1.5h evaluation test sessions (topic, level, problem1_id, problem2_id, status).
- `MockInterviewSession`: Manages 3-question mock sessions (company, problem_ids, current_question_index, approaches_submitted, ai_feedback, scorecard).


---

### 5.2 Extension Files

#### `extension/public/injected.js` — Monaco Editor & DOM Controls
- Runs in main page JS context (`world: "MAIN"`).
- Iterates `window.monaco.editor.getModels()` and selects non-testcase code models.
- Applies `readOnly` state and injects DOM lock overlays during approach-gated mock sessions.
- Injects Fairplay CSS hiding solutions, editorials, and discussion tabs during active tests/mocks.

#### `extension/public/background.js` — Service Worker Event Router
- Handles API passthrough calls between extension overlay and backend API.
- Implements `fetchSolvedProblemsViaTab()` using `chrome.scripting.executeScript` to pull historical solves from LeetCode. Batches GraphQL requests in groups of 5 with 80ms delays to prevent HTTP 429 rate limiting.
- Manages 15-minute background alarm for due review alerts.

#### `extension/src/main.jsx` — Content Script & DOM Observer
- Mounts React application into an isolated Shadow Root container (`dsa-tutor-panel-root`).
- Implements `MutationObserver` on `document.body` to auto-detect submission verdict badges.
- Exposes window helpers (`dsaTutor.getCode()`, `dsaTutor.getLanguage()`, `dsaTutor.getConstraints()`).

#### `extension/src/App.jsx` & `index.css` — React Overlay UI
- Modern dark-mode interface with tabbed navigation: **Mastery**, **Code Coach**, **Recommendations**, **Mock Interview**, **Journal Export**.
- Responsive flexbox styling with cross-browser scrollbar hiding (`::-webkit-scrollbar { display: none }`).

---

## 6. Production Hardening & Bug Fix Case Studies

During development, critical production-level bugs were identified, diagnosed, and resolved:

### Case Study 1: LLM Output Truncation & Fallback Loop
* **Symptom**: Complex Level 3 hints and edge-case lists consistently returned generic fallback text (*"The tutor could not parse a structured explanation..."*).
* **Root Cause**: `query_groq()` was hardcoded to `max_tokens=350`. Long responses were truncated mid-sentence, causing `json.loads()` to raise `JSONDecodeError`.
* **Fix**: Increased `max_tokens` to `1024`, added markdown code fence stripping, and implemented `repair_json_string()` to clean unescaped formatting before parsing.

### Case Study 2: Multi-Topic String Contamination in Elo Engine
* **Symptom**: Submitting problems with multiple topics (e.g. `"Arrays, Two Pointers"`) created duplicate composite database rows instead of updating individual topic ratings.
* **Root Cause**: `analyze_submission` passed `problem.topics` (raw comma-separated string) directly to `update_mastery_on_submission()`.
* **Fix**: Refactored `analyze_submission` in `main.py` to parse comma-separated strings into lists and update Elo ratings for each topic independently.

### Case Study 3: SQLite Database Path & Write Locks
* **Symptom**: Running the backend from different directories created separate database files; concurrent API calls raised `sqlite3.OperationalError: database is locked`.
* **Root Cause**: Database path was relative (`./dsa_tutor.db`), and default SQLite timeout was too short for concurrent async operations.
* **Fix**: Pinned database URL to an absolute path (`Path(__file__).parent.parent / "dsa_tutor.db"`) and added `timeout: 15` to `connect_args`.

### Case Study 4: Monaco Model Extraction Failure
* **Symptom**: Code Coach occasionally diagnosed empty strings or testcase inputs instead of actual solution code.
* **Root Cause**: `injected.js` selected `models[0]` by default, which returned custom testcase input models when test tabs were focused.
* **Fix**: Upgraded `injected.js` to iterate all Monaco models, filter out testcase URIs, select the largest code model, and fallback to DOM text containers.

### Case Study 5: GraphQL History Sync HTTP 429 Rate Limiting
* **Symptom**: Syncing solved problem history for active users failed midway with HTTP 429 errors.
* **Root Cause**: `fetchSolvedProblemsViaTab` sent 20 concurrent GraphQL requests per batch without delay.
* **Fix**: Reduced batch size to 5 and added an 80ms delay between batches.

### Case Study 6: Daily AI Quota Concurrent Race Conditions
* **Symptom**: Users could exceed the daily limit of LLM requests by making rapid concurrent requests.
* **Root Cause**: The check-and-increment transaction on SQLite was not thread-safe and was susceptible to double-read race conditions in Python's multi-threaded FastAPI execution.
* **Fix**: Replaced the Python-level thread lock with an atomic SQL `UPDATE` statement: `UPDATE user_config SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = :key AND CAST(value AS INTEGER) < :limit RETURNING value`. If no row is returned, it immediately raises a 429. This guarantees database-level, process-safe atomic checks.

### Case Study 7: Pydantic V2 Migration & Python 3.12+ Datetime Deprecations
* **Symptom**: Test execution threw deprecation warnings for class-based Pydantic configurations and the `datetime.utcnow()` method.
* **Root Cause**: Legacy Config classes were used inside Pydantic schemas, and `datetime.utcnow()` has been deprecated starting in Python 3.12.
* **Fix**: Replaced schemas with `model_config = ConfigDict(from_attributes=True)` and added a `get_utc_now()` timezone-aware UTC naive datetime generator.

### Case Study 8: Mock Interview Page Redirection State Loss
* **Symptom**: Starting a mock interview redirected the page, tearing down the extension DOM node and resetting in-memory UI states (timer, locked editor status).
* **Root Cause**: Mounting React inside the tab DOM means page reloads destroy React memory.
* **Fix**: Built a `/mock-interview/active` endpoint queried on mount to automatically recover current mock state (time remaining, active problem, gate locks) upon reload.

### Case Study 9: Spaced Repetition Load-Time Reminders
* **Symptom**: Users missed their due spaced repetition cards because they only saw them when manually opening the extension panel.
* **Root Cause**: No automatic alert mechanism on LeetCode page load.
* **Fix**: Injected a floating review reminder card on the bottom-left of LeetCode if background calls indicate reviews are due today.

### Case Study 10: Filtering LeetCode Premium Problems Across the Entire Recommender Pipeline
* **Symptom**: The adaptive recommender, spaced repetition reviews, and exploratory picks sometimes recommended paid/premium LeetCode problems (e.g. *Meeting Rooms II*, *Paint House*), locking out non-subscriber users.
* **Root Cause**: `Problem.is_premium` was not uniformly checked across fallback `Pass D`, Spaced Repetition reviews, and exploration query branches. Additionally, several well-known premium slugs had `is_premium = False` in raw database seed data.
* **Fix**: Centralized a `KNOWN_PREMIUM_SLUGS` constant in `backend/models.py` and strictly filtered all queries in `backend/recommender.py` with `Problem.is_premium == False` and `Problem.id.notin_(KNOWN_PREMIUM_SLUGS)`.

### Case Study 11: Fairplay Privacy — Concealing Historical Submission Answers While Preserving Live Feedback
* **Symptom**: During Mock Interviews and Badge Tests, users could open the LeetCode "Submissions" drawer or navigate to `/submissions/detail/` to inspect previously accepted code solutions.
* **Root Cause**: Over-broad fairplay regexes either failed to block the submissions history drawer or blocked live `/submission` verdict requests, causing recursive page reload loops.
* **Fix**: Refined `isForbiddenDOMElement` and `isForbiddenElement` in `main.jsx` and `injected.js` to specifically target past submission history, submission detail inspection panels, and solution drawers (`/submissions/detail/`, `div.submission-detail`, `div.submissions-list`) while explicitly exempting live action submit buttons and result banners.

### Case Study 12: Badge Test Navigation Integrity & Celebratory Particle Award Modal
* **Symptom**: Submitting a problem in a Badge Test triggered rate-limit warnings or kicked users out of the test questions panel, and passing both questions lacked visual feedback.
* **Root Cause**: `setLoading` / `setDiagnosis` forced `setActiveTab('coach')`, kicking users out of the active test tab on submission. Additionally, `/badge-test/submit` only queried `status == "active"` instead of supporting `"passed"`.
* **Fix**: Updated `window.dsaTutor` to prevent tab-switching during active tests, added direct Question 1 and Question 2 navigation cards with Monaco editor resets, and implemented a celebratory Badge Award modal with falling confetti particle animations, radiant glowing tier badges, and Elo score updates upon passing.

---

## 7. Interview Preparation Guide & Technical Q&A

### 30-Second Interview Pitch
> *"I built **CodeCoach Agent**, an autonomous browser extension and AI backend for LeetCode. It observes user submissions in real time, diagnoses failure root-causes using structured LLM classification, dynamically adapts problem recommendations via per-topic Elo ratings, and provides 3-stage progressive hints, Badge Tests, and 3-question mock interviews."*

### Key Technical Talking Points
1. **Agentic Architecture**: Event-driven perception loop (DOM observer + Monaco extraction + LLM taxonomy + dynamic state mutation).
2. **Mathematical Rigor**: Elo rating update equations for skill scoring & Productive Struggle Band tuning.
3. **Resilience & Production Hardening**: Dual-LLM fallback (Groq Cloud $\rightarrow$ Ollama Local), JSON repair pipeline, SQLite lock handling, atomic AI quota enforcement, and GraphQL rate limiting.

### 5 Tough Interview Questions & Sample Answers

#### Q1: How do you prevent LLMs from giving away the exact code solution in hints?
> **Answer**: *"We use strict 3-stage prompt scaffolding. Level 1 hints only discuss core mathematical invariants. Level 2 hints specify the data structure strategy. Level 3 hints provide high-level pseudocode logic without language-specific code syntax. Prompts explicitly prohibit raw executable code blocks."*

#### Q2: What happens if the primary cloud LLM provider goes down?
> **Answer**: *"We implemented a dual-provider router in `agent.py`. If Groq API fails or rate-limits (HTTP 429), the query automatically catches the exception and falls back to a local Ollama instance (`qwen2.5:7b`). If both fail, safe static fallbacks preserve app stability."*

#### Q3: How do you handle style isolation between the extension overlay and LeetCode?
> **Answer**: *"We mount the entire React overlay into a Shadow Root (`attachShadow({ mode: 'open' })`). This creates a CSS encapsulation boundary so LeetCode's global styles cannot leak into our UI, and our styles cannot affect LeetCode."*

#### Q4: Why did you choose Elo over simple percentage accuracy for topic mastery?
> **Answer**: *"Percentage accuracy treats an Easy problem solve the same as a Hard problem solve. Elo rating accounts for opponent strength (problem difficulty): solving a Hard problem yields a larger rating increase than solving an Easy problem, accurately reflecting true skill progression."*

#### Q5: How do you prevent race conditions between Chrome extension service workers and backend endpoints?
> **Answer**: *"We handle service worker idle state by making all background fetches async promise-wrapped handlers, passing responses back via Chrome message channels, and configuring SQLite with a 15-second write lock timeout to handle concurrent background calls."*

---

## 📄 License
MIT License © 2026 Anisha Dhoot

