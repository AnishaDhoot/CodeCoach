# 🧠 CodeCoach Agent — Autonomous LeetCode Companion

> An intelligent, autonomous Data Structures & Algorithms (DSA) CodeCoach overlay for LeetCode. Features conceptual failure diagnostics, test-driven badge topic mastery scoring, progressive 3-stage hint revealing, formal Badge Tests with celebratory badge unlocking modals, spaced repetition reviews, strict fairplay locks against past submission answers, and premium problem filtering.

---

## 🚀 Key Features

### 1. Conceptual Failure Diagnostics (AI Agent Layer)
- **Automatic Submission Interception**: Listens to LeetCode submission verdicts in real time (`Wrong Answer`, `Time Limit Exceeded`, `Runtime Error`, `Compile Error`).
- **LLM Root-Cause Classification**: Automatically classifies failures into exact conceptual categories using an AI diagnosis engine:
  - `wrong_approach`: Fundamental algorithmic flaw (e.g. using Greedy instead of Dynamic Programming).
  - `implementation_bug`: Structural syntax/logic issue (off-by-one errors, pointer mismanagement).
  - `edge_case_miss`: Fails on boundary conditions (empty arrays, duplicate elements, large values).
  - `complexity_issue`: Solution is correct but exceeds time/space limits (TLE / OOM).
  - `unclear`: Compilation errors or syntax issues preventing execution.
- **Actionable Guidance**: Provides plain-language explanations of *why* the logic fails without spoiling the exact code solution.

### 2. Test-Driven Topic Mastery & Adaptive Recommender
- **Badge Test Progression System**: Topic mastery levels ($0-5$) and badges (Bronze 🥉, Silver 🥈, Gold 🥇, Platinum 🛡️, Diamond 💎) are unlocked strictly by passing formal, timed **Badge Tests** (1.5 hours, 2 problems per test).
- **Celebratory Badge Award Modal**: Upon completing both problems in a Badge Test, an animated celebration modal triggers with falling multi-color particle confetti, glowing radiant tier badges, and topic Elo boost metrics.
- **Premium Problem Exclusion**: Automatically filters out LeetCode premium/paid-only questions across all recommendations, spaced repetition reviews, fallback queries, and exploratory modes.
- **Productive Struggle Band**: Recommends problem difficulties (Easy $\rightarrow$ Medium $\rightarrow$ Hard) matched precisely to your unlocked badge level for that specific topic:
  - **Level 0 (Locked) & Level 1 (Bronze)**: Easy questions to build fundamental concepts.
  - **Level 2 (Silver) & Level 3 (Gold)**: Medium questions to deepen problem-solving skills.
  - **Level 4 (Platinum) & Level 5 (Diamond)**: Hard questions to challenge advanced algorithmic mastery.
- **Streak & Performance Adjustments**: Dynamically upgrades target difficulty after 2 consecutive accepted solves, or steps down difficulty after consecutive failures.
- **Epsilon-Greedy Exploration ($\epsilon=0.15$)**: Periodically introduces exploratory problems outside your weak zone to ensure broad skill coverage.
- **Weak-Pair Detection**: Identifies co-occurring weak topic pairs (e.g., Dynamic Programming + Bit Manipulation) for targeted practice.

### 3. Spaced Repetition Review Engine
- **Automated Retention Scheduling**: Schedules review dates based on performance (Stage 1: 3 days, Stage 2: 7 days, Stage 3: 14 days, Stage 4: 30 days, Stage 5: Mastered).
- **Load-Time & Background Alerts**: Automatically alerts you via floating review reminder cards on LeetCode when review items are due today.

### 4. Interactive Code Coach
- **Approach Critique**: Analyzes your code efficiency before submission and suggests optimal alternatives.
- **3-Stage Progressive Hints**:
  - **Level 1**: Core Concept & Invariant Insight
  - **Level 2**: Data Structure & Algorithmic Strategy
  - **Level 3**: Step-by-Step Pseudocode & Logic Breakdown (strictly non-executable code)
- **Edge Case Generator**: Identifies missing edge cases and critiques constraint boundaries ($N \le 10^5$).
- **Explain-Back Verification**: Analyzes your plain-English explanation against your code implementation to ensure true conceptual comprehension.
- **Complexity Self-Estimate**: Predicts time/space complexities and compares them against AI benchmark analysis.

### 5. Fairplay Anti-Cheat & Assessment Integrity Protocol
- **Badge Test Anti-Cheat Engine**:
  - Automatically hides LeetCode solutions, editorials, and discussion forums during active assessment sessions.
  - **Past Submissions Privacy**: Prevents viewing historical submission code, past solutions, and submission detail drawers (`/submissions/detail/`, `div.submission-detail`, `div.submissions-list`) during tests while preserving live submission verdicts.
  - Automatically resets the Monaco editor to clean starter code when switching problems during Badge Tests.
  - Disables hints and AI assistance during active assessments to maintain testing validity.

### 6. Analytics, History Sync & Daily Quotas
- **LeetCode History Sync**: Piggybacks on active LeetCode sessions to import all historical solved problems via `/api/problems/all/` REST calls and bulk GraphQL queries without hitting rate limits.
- **Atomic Daily AI Quota Counter**: Enforces process-safe daily limits (default: 50 requests/day) via atomic SQL updates to prevent concurrent race conditions.
- **Weekly Journal Export**: Generates a Markdown digest summarizing your past week's attempts, error categories, and review candidates.

---

## 🏗️ Architecture & Tech Stack

```
   ┌────────────────────────────────────────────────────────┐
   │             LeetCode Page (Chrome / Edge)               │
   │  ┌──────────────────────────────────────────────────┐  │
   │  │ DSA Tutor Overlay Panel (React 18 + Shadow DOM)  │  │
   │  └────────────────────────┬─────────────────────────┘  │
   └───────────────────────────┼────────────────────────────┘
                               │ Chrome Extension Messaging (MV3)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │          Background Service Worker (background.js)      │
   └───────────────────────────┬────────────────────────────┘
                               │ HTTP / JSON API (localhost:8000)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │            FastAPI Backend Engine (Python 3.10+)       │
   │   ┌─────────────────────┐    ┌─────────────────────┐   │
   │   │ Badge Recommender   │    │  Spaced Repetition  │   │
   │   └──────────┬──────────┘    └──────────┬──────────┘   │
   │              └────────────┬─────────────┘              │
   │                           ▼                            │
   │               SQLite Database (dsa_tutor.db)           │
   │                           │                            │
   │                           ▼                            │
   │            AI Agent Router (agent.py)                  │
   │             ├── Primary: Groq API (openai/gpt-oss-20b) │
   │             └── Fallback: Local Ollama (qwen2.5:7b)    │
   └────────────────────────────────────────────────────────┘
```

---

## 🛠️ Getting Started & Local Setup

### 1. Prerequisites
- **Python**: 3.10+ (Python 3.12 recommended)
- **Node.js**: v18+ and `npm`
- **Groq API Key** *(Optional, cloud LLM)* or **Ollama** *(Local LLM)*

### 2. Backend Setup
```bash
# Clone the repository
git clone https://github.com/AnishaDhoot/LeetcodeHelper.git
cd LeetcodeHelper

# Create virtual environment & install dependencies
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

# Start backend server
powershell ./run_backend.ps1
# Or manually:
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. Extension Setup (Build & Install)
```bash
cd extension
npm install
npm run build
```
This compiles the packed Chrome Manifest V3 extension into `extension/dist/`.

#### Installing in Browser:
1. Open Chrome/Edge/Brave and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/dist` folder.
4. Open any problem on [LeetCode](https://leetcode.com/problems/two-sum/) to start using the DSA Tutor overlay!

---

## 🧪 Running Diagnostic Tests

To verify backend endpoints, database schema auto-migrations, and AI Agent diagnostics:

```powershell
# Run full automated backend test suite (60 tests)
$env:PYTHONPATH="."; python -m pytest backend/tests

# Run frontend tests
cd extension; npm test
```

---

## 📬 Contact
Questions, feedback, or data-deletion requests: **codecoach.work@gmail.com**

---

## 📄 License
MIT License © 2026 Anisha Dhoot
