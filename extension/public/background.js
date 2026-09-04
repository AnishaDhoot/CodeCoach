// Chrome Extension Service Worker (background.js)
// Handles API calls to the local FastAPI backend to bypass CORS and extension constraints,
// and fetches the user's LeetCode solved-problem history via scripting injection.

let DEFAULT_BACKEND_URL = "http://localhost:8000";

async function getBackendUrl() {
  try {
    const data = await chrome.storage.local.get("customBackendUrl");
    if (data && data.customBackendUrl) {
      return data.customBackendUrl.replace(/\/+$/, "");
    }
  } catch (e) {
    console.warn("[DSA Tutor Background] Failed to read storage URL:", e);
  }
  return DEFAULT_BACKEND_URL;
}

// Generic JSON POST/GET helper that resolves sendResponse.
async function backendFetch(path, { method = "GET", body } = {}) {
  const baseUrl = await getBackendUrl();
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, opts);
  if (!res.ok) {
    let errorDetail = "";
    try {
      const errData = await res.json();
      if (errData && errData.detail) {
        errorDetail = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
      }
    } catch (e) {}

    if (res.status === 429) {
      throw new Error(errorDetail || "Limit Exceeded: Daily AI request limit reached. Please try again tomorrow.");
    }
    throw new Error(errorDetail || `HTTP error! status: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// LeetCode history fetch via chrome.scripting.executeScript (world: "MAIN")
//
// WHY world:"MAIN": The injected code runs inside the LeetCode page's own
// JavaScript context, so every fetch is same-origin (leetcode.com → leetcode.com)
// with session cookies included automatically. No CORS issues.
//
// HOW we get ALL problems: LeetCode's /api/problems/all/ REST endpoint returns
// every problem the authenticated user has attempted, including solved status.
// This has no page-size limit — one request gives the full history.
// ---------------------------------------------------------------------------

async function fetchSolvedProblemsViaTab() {
  // Find an open leetcode.com tab to piggy-back on.
  const tabs = await chrome.tabs.query({ url: "https://leetcode.com/*" });
  if (!tabs || tabs.length === 0) {
    throw new Error(
      "No LeetCode tab found. Please open leetcode.com in a tab and try again."
    );
  }
  const tabId = tabs[0].id;

  // Inject script into the LeetCode page (MAIN world = same-origin fetch).
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      // ── Step 1: Get ALL solved problems in ONE request ──────────────────
      // /api/problems/all/ returns every LeetCode problem with the user's
      // solved status (status === "ac"). No pagination, no artificial limit.
      const apiRes = await fetch("https://leetcode.com/api/problems/all/", {
        credentials: "include"
      });
      if (!apiRes.ok) throw new Error(`Problems API HTTP ${apiRes.status}`);
      const apiData = await apiRes.json();

      if (!apiData.user_name) {
        throw new Error(
          "Not signed in to LeetCode. Please log in and visit leetcode.com first."
        );
      }

      const diffMap = { 1: "Easy", 2: "Medium", 3: "Hard" };
      const solved = (apiData.stat_status_pairs || [])
        .filter(p => p.status === "ac" && !p.stat.question__hide)
        .map(p => ({
          slug: p.stat.question__title_slug,
          title: p.stat.question__title || p.stat.question__title_slug,
          difficulty: diffMap[p.difficulty?.level] || "Medium"
        }));

      if (solved.length === 0) return { ok: true, problems: [] };

      // ── Step 1b: Fetch recent AC submission timestamps to get accurate solve dates ─────────
      const timestampMap = new Map();
      try {
        const subRes = await fetch("https://leetcode.com/graphql/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query recentAcSubmissions($username: String!) {
              recentAcSubmissionList(username: $username, limit: 100) {
                titleSlug
                timestamp
              }
            }`,
            variables: { username: apiData.user_name }
          })
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          const subList = subData?.data?.recentAcSubmissionList || [];
          for (const s of subList) {
            if (s.titleSlug && s.timestamp) {
              const tsNum = parseInt(s.timestamp, 10);
              if (!isNaN(tsNum)) {
                timestampMap.set(s.titleSlug, tsNum);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[DSA Tutor] Submission timestamp fetch notice:", e);
      }

      // ── Step 2: Fetch topic tags via instant bulk GraphQL ────────────────────
      const topicMap = new Map();
      try {
        const bulkRes = await fetch("https://leetcode.com/graphql/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query { allQuestions { titleSlug topicTags { name } } }`
          })
        });
        if (bulkRes.ok) {
          const bulkData = await bulkRes.json();
          const qList = bulkData?.data?.allQuestions || [];
          for (const q of qList) {
            if (q.titleSlug && q.topicTags) {
              topicMap.set(q.titleSlug, q.topicTags.map(t => t.name));
            }
          }
        }
      } catch (e) {
        console.warn("[DSA Tutor] Bulk topic fetch failed:", e);
      }

      const CANONICAL_TOPIC_MAP = {
        "array": "Arrays",
        "arrays": "Arrays",
        "arrays & hashing": "Arrays",
        "matrix": "Arrays",
        "sorting": "Arrays",
        "string": "Strings",
        "strings": "Strings",
        "string matching": "Strings",
        "two pointers": "Sliding Window & Two Pointers",
        "sliding window": "Sliding Window & Two Pointers",
        "sliding window & two pointers": "Sliding Window & Two Pointers",
        "binary search": "Binary Search",
        "linked list": "Linked List",
        "linked lists": "Linked List",
        "stack": "Stack & Queue",
        "stacks": "Stack & Queue",
        "queue": "Stack & Queue",
        "queues": "Stack & Queue",
        "monotonic stack": "Stack & Queue",
        "monotonic queue": "Stack & Queue",
        "hash table": "Hashing",
        "hashing": "Hashing",
        "hashmap": "Hashing",
        "recursion": "Recursion & Backtracking",
        "backtracking": "Recursion & Backtracking",
        "tree": "Trees & BST",
        "trees": "Trees & BST",
        "binary tree": "Trees & BST",
        "binary search tree": "Trees & BST",
        "heap (priority queue)": "Heaps / Priority Queue",
        "heap": "Heaps / Priority Queue",
        "heaps": "Heaps / Priority Queue",
        "graph": "Graphs",
        "graphs": "Graphs",
        "depth-first search": "Graphs",
        "breadth-first search": "Graphs",
        "dynamic programming": "Dynamic Programming",
        "dp": "Dynamic Programming",
        "greedy": "Greedy",
        "trie": "Trie & Bit Manipulation",
        "bit manipulation": "Trie & Bit Manipulation"
      };

      const cleanTags = (rawList) => {
        const out = [];
        for (const t of (rawList || [])) {
          const norm = CANONICAL_TOPIC_MAP[t?.trim()?.toLowerCase()] || t?.trim();
          if (norm && !out.includes(norm)) out.push(norm);
        }
        return out.length > 0 ? out : ["Arrays"];
      };

      const missingSlugs = [];
      const problems = [];

      for (const { slug, title, difficulty } of solved) {
        const ts = timestampMap.get(slug) || null;
        if (topicMap.has(slug)) {
          const tags = cleanTags(topicMap.get(slug));
          problems.push({
            problem_id: slug,
            title,
            difficulty,
            topics: tags,
            timestamp: ts
          });
        } else {
          missingSlugs.push({ slug, title, difficulty, timestamp: ts });
        }
      }

      // Fallback for any rare missing slugs with concurrent batching (BATCH = 50):
      if (missingSlugs.length > 0) {
        const BATCH = 50;
        for (let i = 0; i < missingSlugs.length; i += BATCH) {
          const chunk = missingSlugs.slice(i, i + BATCH);
          const settled = await Promise.allSettled(
            chunk.map(async ({ slug, title, difficulty, timestamp }) => {
              try {
                const r = await fetch("https://leetcode.com/graphql/", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    query: `query q($s: String!) { question(titleSlug: $s) { topicTags { name } } }`,
                    variables: { s: slug }
                  })
                });
                const d = r.ok ? await r.json() : null;
                const tags = cleanTags((d?.data?.question?.topicTags || []).map(t => t.name));
                return {
                  problem_id: slug,
                  title,
                  difficulty,
                  topics: tags,
                  timestamp
                };
              } catch {
                return { problem_id: slug, title, difficulty, topics: ["Arrays"], timestamp };
              }
            })
          );
          settled.forEach(r => r.status === "fulfilled" && problems.push(r.value));
        }
      }

      return { ok: true, problems, username: apiData.user_name };
    }
  });

  const result = results?.[0]?.result;
  if (!result?.ok) {
    throw new Error(
      "Script returned no result. Please refresh the LeetCode tab and try again."
    );
  }
  return { problems: result.problems, username: result.username };
}

// ---------------------------------------------------------------------------
// Tier 1.2 — Due review alarm & badge updater
// ---------------------------------------------------------------------------
async function updateReviewBadge() {
  try {
    const data = await backendFetch("/reviews/count");
    const dueCount = data.due_count || 0;
    if (dueCount > 0) {
      chrome.action.setBadgeText({ text: String(dueCount) });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // urgent red badge
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    console.log("[DSA Tutor Background] Failed to fetch review count for badge:", err);
  }
}

// Set up alarm every 15 mins
chrome.alarms.create("check_reviews_due", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check_reviews_due") {
    updateReviewBadge();
  }
});
// Initial check on startup
updateReviewBadge();

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[DSA Tutor Background] Received message:", request);

  // --- Backend passthrough actions ---
  if (request.action === "analyze_submission") {
    backendFetch("/submissions/analyze", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_mastery") {
    backendFetch("/topics/mastery")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_recommendation") {
    const company = request.payload?.company ? `?company=${encodeURIComponent(request.payload.company)}` : "";
    backendFetch(`/problems/next${company}`)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_companies") {
    backendFetch("/companies")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_company_metadata") {
    backendFetch("/companies/metadata")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_reviews_count") {
    backendFetch("/reviews/count")
      .then((data) => {
        updateReviewBadge();
        sendResponse({ success: true, data });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_streak") {
    backendFetch("/activity/streak")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_weak_pairs") {
    backendFetch("/topics/weak-pairs")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_time_trend") {
    const topic = request.payload?.topic || "";
    backendFetch(`/topics/time-trend?topic=${encodeURIComponent(topic)}`)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "record_success") {
    const { problem_id, topic } = request.payload;
    backendFetch(`/submissions/success?problem_id=${problem_id}&topic=${encodeURIComponent(topic)}`, { method: "POST" })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- Badge Test actions ---
  if (request.action === "start_badge_test") {
    backendFetch("/badge-test/start", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_active_badge_test") {
    backendFetch("/badge-test/active")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "abandon_badge_test") {
    backendFetch("/badge-test/abandon", { method: "POST" })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "navigate_tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.update(tabs[0].id, { url: request.url }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: "No active tab found" });
      }
    });
    return true;
  }

  if (request.action === "submit_badge_test") {
    backendFetch("/badge-test/submit", { method: "POST" })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- AI quota actions ---
  if (request.action === "get_ai_quota") {
    backendFetch("/ai/quota")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- Code Coach actions ---
  if (request.action === "check_approach") {
    backendFetch("/approach/check", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "critique_estimate") {
    backendFetch("/critique/estimate", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "critique_reveal") {
    backendFetch("/critique/reveal", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "explain_back") {
    backendFetch("/submissions/explain-back", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_hint") {
    backendFetch("/hints/get", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "reveal_hint") {
    backendFetch("/hints/reveal", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_edge_cases") {
    backendFetch("/edge-cases/get", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "ask_help") {
    backendFetch("/help/ask", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "check_health") {
    backendFetch("/health")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "sync_solved") {
    backendFetch("/sync/solved", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }


  // --- Journal export action ---
  if (request.action === "get_weekly_journal") {
    backendFetch("/journal/weekly")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- LeetCode history fetch (injects into LeetCode tab for same-origin access) ---
  if (request.action === "fetch_leetcode_history") {
    fetchSolvedProblemsViaTab()
      .then(({ problems, username }) => sendResponse({ success: true, data: { problems, username } }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- Synced Account persistence ---
  if (request.action === "get_synced_account") {
    backendFetch("/sync/account")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- Solved Problems Table ---
  if (request.action === "get_solved_problems") {
    backendFetch("/problems/solved")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // --- Analysis & Focus actions ---
  if (request.action === "get_analysis") {
    backendFetch("/topics/analysis")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "get_focus") {
    backendFetch("/topics/focus")
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "set_focus") {
    backendFetch("/topics/focus", { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "export_solved_csv") {
    const timeframe = request.payload?.timeframe || "current_week";
    getBackendUrl().then((baseUrl) => {
      fetch(`${baseUrl}/export/solved-csv?timeframe=${encodeURIComponent(timeframe)}`)
        .then((res) => res.text())
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (request.action === "get_problem_details") {
    const problemId = request.payload?.problem_id;
    backendFetch(`/problems/${encodeURIComponent(problemId)}`)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "save_problem_notes") {
    const problemId = request.payload?.problem_id;
    backendFetch(`/problems/${encodeURIComponent(problemId)}/notes`, { method: "POST", body: request.payload })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});



