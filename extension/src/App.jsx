import React, { useState, useEffect, useRef } from 'react';

// Format category names for user-friendly display
const CATEGORY_MAP = {
  wrong_approach: { label: 'Wrong Approach', color: '#f59e0b', emoji: '💡' },
  implementation_bug: { label: 'Implementation Bug', color: '#f43f5e', emoji: '🐛' },
  edge_case_miss: { label: 'Edge Case Miss', color: '#fbbf24', emoji: '⚠️' },
  complexity_issue: { label: 'Complexity/Performance', color: '#3b82f6', emoji: '⚡' },
  unclear: { label: 'Diagnostics Unclear', color: '#9ca3af', emoji: '❔' }
};

// Active Badge Test is mirrored into localStorage (same origin as the page, so
// injected.js can read it too) so the UI and editor lock can be applied
// synchronously on load instead of after a backend round trip.
const ACTIVE_TEST_CACHE_KEY = 'dsaTutorActiveBadgeTest';

const readCachedActiveTest = () => {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TEST_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !c.data || !c.cachedAt) return null;
    const limit = c.data.time_limit_seconds || 5400;
    const elapsed = (c.data.elapsed_seconds || 0) + (Date.now() - c.cachedAt) / 1000;
    if (elapsed >= limit) return null;
    return { data: c.data, remaining: Math.floor(limit - elapsed) };
  } catch {
    return null;
  }
};

const writeCachedActiveTest = (data) => {
  try {
    if (data) {
      window.localStorage.setItem(ACTIVE_TEST_CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
    } else {
      window.localStorage.removeItem(ACTIVE_TEST_CACHE_KEY);
    }
  } catch { /* storage unavailable */ }
};

// Only follow links that point at LeetCode itself (backend data is not trusted
// to contain javascript:/external URLs).
const safeLeetCodeUrl = (url) => {
  try {
    const u = new URL(url, 'https://leetcode.com');
    if (u.protocol === 'https:' && (u.hostname === 'leetcode.com' || u.hostname.endsWith('.leetcode.com'))) return u.href;
  } catch { /* invalid URL */ }
  return null;
};

const goTo = (url) => {
  const safe = safeLeetCodeUrl(url);
  if (safe) window.location.href = safe;
};

const difficultyClass = (d) => String(d || 'medium').toLowerCase();

const PANEL_OPEN_KEY = 'dsaTutorPanelOpen';
const readPanelOpen = () => {
  try { return window.localStorage.getItem(PANEL_OPEN_KEY) !== 'false'; } catch { return true; }
};

const EXT_VERSION = (() => {
  try { return chrome.runtime.getManifest().version; } catch { return ''; }
})();

const slugOf = (p) => {
  if (!p) return '';
  const m = String(p.url || '').match(/problems\/([^/?#]+)/);
  return (m ? m[1] : String(p.id || '')).toLowerCase();
};

export default function App() {
  const isContestMode = typeof window !== 'undefined' && (window.location.href.includes('/contest/') || window.location.pathname.startsWith('/contest'));
  const [isOpen, setIsOpenState] = useState(readPanelOpen);
  // Remember whether the user collapsed the panel so it doesn't pop open
  // over the editor on every page load.
  const setIsOpen = (open) => {
    setIsOpenState(open);
    try { window.localStorage.setItem(PANEL_OPEN_KEY, open ? 'true' : 'false'); } catch { /* storage unavailable */ }
  };
  const [activeTab, setActiveTab] = useState('coach');
  const [masteryData, setMasteryData] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshTimerRef = useRef(null);
  const scheduleBatchedRefresh = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      fetchMastery();
      fetchRecommendation();
      fetchStreak();
      fetchActiveTest();
      fetchAiQuota();
    }, 100);
  };

  // Badge Test states
  // Seed from the local cache so a reload mid-test renders the Badge Test view
  // immediately; fetchActiveTest() below verifies it against the backend.
  const cachedTestRef = useRef(undefined);
  if (cachedTestRef.current === undefined) cachedTestRef.current = readCachedActiveTest();
  const [activeTest, setActiveTest] = useState(cachedTestRef.current ? cachedTestRef.current.data : null);
  const [testTimerSeconds, setTestTimerSeconds] = useState(cachedTestRef.current ? cachedTestRef.current.remaining : 5400); // 1.5 hours default
  const [badgeAwardModal, setBadgeAwardModal] = useState(null);
  const hasActiveTest = !!activeTest;

  // Code Coach states (persistent per tool)
  const [approachResult, setApproachResult] = useState(null);
  const [edgeResult, setEdgeResult] = useState(null);
  const [askResults, setAskResults] = useState([]);
  const [diagnosisResult, setDiagnosisResult] = useState(null);

  const getBadgeEmoji = (badge) => {
    switch (badge) {
      case 'Bronze': return '🥉';
      case 'Silver': return '🥈';
      case 'Gold': return '🥇';
      case 'Platinum': return '🛡️';
      case 'Diamond': return '💎';
      default: return '❌';
    }
  };

  // Optimistic "solved" flags: set the instant an Accepted verdict is seen on a
  // Badge Test problem, so the UI doesn't wait for the backend round trips.
  // Backend data is merged with these until the backend confirms (or the
  // analyze call fails and we revert).
  const optimisticSolvedRef = useRef({ testId: null, p1: false, p2: false });

  const mergeOptimisticSolved = (data) => {
    const o = optimisticSolvedRef.current;
    if (!data || o.testId !== data.id) return data;
    const out = { ...data };
    if (o.p1) { if (data.problem1_solved) o.p1 = false; else out.problem1_solved = true; }
    if (o.p2) { if (data.problem2_solved) o.p2 = false; else out.problem2_solved = true; }
    return out;
  };

  // resetEditor=true only on page load: wiping the editor on later refreshes
  // (e.g. after a Wrong Answer) would destroy the user's in-progress work.
  const fetchActiveTest = (retriesLeft = 4, { resetEditor = false } = {}) => {
    chrome.runtime.sendMessage({ action: 'get_active_badge_test' }, (res) => {
      if (res && res.success) {
        // Backend responded authoritatively.
        if (res.data) {
          setActiveTest(mergeOptimisticSolved(res.data));
          const timeLimit = res.data.time_limit_seconds || 5400;
          const elapsed = res.data.elapsed_seconds || 0;
          const remaining = timeLimit - elapsed;
          setTestTimerSeconds(remaining > 0 ? remaining : 0);
          if (window.dsaTutor?.setAssessmentLocked) {
            window.dsaTutor.setAssessmentLocked(true, 'Badge Test');
          }
          if (resetEditor && window.dsaTutor?.resetEditor) {
            window.dsaTutor.resetEditor();
            [200, 600, 1200, 2200].forEach(d => {
              setTimeout(() => {
                if (window.dsaTutor?.resetEditor) window.dsaTutor.resetEditor();
              }, d);
            });
          }
        } else {
          // Confirmed: no active test (also clears any stale cached test).
          setActiveTest(null);
          writeCachedActiveTest(null);
          window.postMessage({ type: 'REVEAL_EDITOR' }, window.location.origin);
        }
      } else if (retriesLeft > 0) {
        // Transient failure (e.g. cold/free backend, timeout). Do NOT wipe the
        // badge-test UI — retry so an in-progress test survives a page reload.
        setTimeout(() => fetchActiveTest(retriesLeft - 1, { resetEditor }), 2000);
      }
    });
  };

  const startBadgeTest = (topic) => {
    chrome.runtime.sendMessage({ action: 'start_badge_test', payload: { topic } }, (res) => {
      if (res && res.success && res.data) {
        // Persist immediately (not just in the effect) so the next page can
        // see the test even if we navigate away before React commits.
        writeCachedActiveTest(res.data);
        setActiveTest(res.data);
        setTestTimerSeconds(res.data.time_limit_seconds || 5400);
        setActiveTab('test');
        if (window.dsaTutor?.setAssessmentLocked) {
          window.dsaTutor.setAssessmentLocked(true, 'Badge Test');
        }
        if (window.dsaTutor?.resetEditor) {
          window.dsaTutor.resetEditor();
          [200, 600, 1200, 2200].forEach(d => {
            setTimeout(() => {
              if (window.dsaTutor?.resetEditor) window.dsaTutor.resetEditor();
            }, d);
          });
        }
        if (res.data.problem1?.url) {
          const urlMatch = window.location.href.match(/problems\/([^/?#]+)/);
          const currentSlug = urlMatch ? urlMatch[1].toLowerCase() : '';
          if (currentSlug !== slugOf(res.data.problem1)) {
            goTo(res.data.problem1.url);
          }
        }
      } else {
        alert(res?.error || 'Failed to start Badge Test.');
      }
    });
  };

  const [showBadgeSubmitConfirm, setShowBadgeSubmitConfirm] = useState(false);

  const abandonBadgeTest = () => {
    if (window.confirm && !window.confirm('Are you sure you want to abandon this Badge Test? All progress for this test will be lost.')) return;
    writeCachedActiveTest(null);
    setActiveTest(null);
    setActiveTab('mastery');
    if (window.dsaTutor?.setAssessmentLocked) {
      window.dsaTutor.setAssessmentLocked(false);
    }
    chrome.runtime.sendMessage({ action: 'abandon_badge_test' }, () => {
      fetchMastery();
    });
  };

  const submitBadgeTest = () => {
    chrome.runtime.sendMessage({ action: 'submit_badge_test' }, (res) => {
      setShowBadgeSubmitConfirm(false);
      if (res && res.success) {
        if (res.data?.passed) {
          setBadgeAwardModal({
            topic: res.data.topic || activeTest?.topic,
            level: res.data.level || activeTest?.level,
            badge: res.data.badge || (activeTest?.level === 1 ? 'Bronze' : activeTest?.level === 2 ? 'Silver' : activeTest?.level === 3 ? 'Gold' : activeTest?.level === 4 ? 'Platinum' : 'Diamond'),
            rating: res.data.rating,
            message: res.data.message
          });
        } else {
          alert(res.data?.message || 'Badge Test submitted. Both problems must be solved to earn the badge.');
        }
        writeCachedActiveTest(null);
        setActiveTest(null);
        setActiveTab('mastery');
        fetchMastery();
      } else {
        alert(res?.error || 'Failed to submit Badge Test.');
      }
    });
  };

  const [aiQuota, setAiQuota] = useState({ used: 0, limit: 50 });

  const fetchAiQuota = () => {
    chrome.runtime.sendMessage({ action: 'get_ai_quota' }, (res) => {
      if (res && res.success && res.data) {
        setAiQuota(res.data);
      }
    });
  };



  const [coachFilter, setCoachFilter] = useState('all');
  const [coachLoading, setCoachLoading] = useState(null); // current action id or null
  const [coachError, setCoachError] = useState(null);
  const [askInput, setAskInput] = useState('');

  // Progressive Hint state
  const [currentProblemId, setCurrentProblemId] = useState(null);
  const [hintsList, setHintsList] = useState([]);
  const [currentHintLevel, setCurrentHintLevel] = useState(0);

  // History sync state
  const [syncStatus, setSyncStatus] = useState(null); // {phase, message, counts}

  // Backend health state
  const [backendOnline, setBackendOnline] = useState(null); // null=unknown, true/false

  // Focus topic state (up to 3 focus topics)
  const [focusTopics, setFocusTopics] = useState([]);

  // Topic analysis state (loaded after sync or on mount)
  const [analysisData, setAnalysisData] = useState(null);

  // New Roadmap States (Tiers 1 - 5)
  const [streakData, setStreakData] = useState({ current_streak_days: 0, problems_today: 0, solved_today: 0 });
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [weakPairs, setWeakPairs] = useState([]);
  const [showExplainBack, setShowExplainBack] = useState(false);
  const [userExplanationInput, setUserExplanationInput] = useState('');
  const [explainBackResult, setExplainBackResult] = useState(null);

  const fetchStreak = () => {
    chrome.runtime.sendMessage({ action: 'get_streak' }, (res) => {
      if (res && res.success) setStreakData(res.data);
    });
  };

  const fetchCompanies = () => {
    chrome.runtime.sendMessage({ action: 'get_companies' }, (res) => {
      if (res && res.success) setCompanies(res.data || []);
    });
  };

  const fetchWeakPairs = () => {
    chrome.runtime.sendMessage({ action: 'get_weak_pairs' }, (res) => {
      if (res && res.success) setWeakPairs(res.data || []);
    });
  };

  // Synced Account State (Persistent from backend)
  const [syncedAccount, setSyncedAccount] = useState({ username: 'LeetCode User', synced_count: 0, topics_count: 0, last_synced: null });

  const fetchSyncedAccount = () => {
    chrome.runtime.sendMessage({ action: 'get_synced_account' }, (res) => {
      if (res && res.success && res.data && res.data.account) {
        setSyncedAccount(res.data.account);
      }
    });
  };

  // Solved Problems Table States & Filters
  const [solvedProblems, setSolvedProblems] = useState([]);

  const fetchSolvedProblems = () => {
    chrome.runtime.sendMessage({ action: 'get_solved_problems' }, (res) => {
      if (res && res.success && Array.isArray(res.data)) {
        setSolvedProblems(res.data);
      }
    });
  };

  // Weekly DSA Log Modal State
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);
  const [weeklyData, setWeeklyData] = useState(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [weeklyCopied, setWeeklyCopied] = useState(false);

  const openWeeklyDigest = () => {
    setLoadingWeekly(true);
    setShowWeeklyModal(true);
    chrome.runtime.sendMessage({ action: 'get_weekly_journal' }, (res) => {
      setLoadingWeekly(false);
      if (res && res.success && res.data) {
        setWeeklyData(res.data);
      }
    });
  };

  const copyWeeklyMarkdown = () => {
    if (!weeklyData?.markdown_text || !navigator.clipboard) return;
    navigator.clipboard.writeText(weeklyData.markdown_text)
      .then(() => {
        setWeeklyCopied(true);
        setTimeout(() => setWeeklyCopied(false), 2500);
      })
      .catch(() => alert('Could not copy to clipboard. Use "Download .md" instead.'));
  };

  // CSV Export state
  const [csvTimeframe, setCsvTimeframe] = useState('current_week');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Problem Notes & Personal Difficulty states
  const [userNotesInput, setUserNotesInput] = useState('');
  const [personalDifficultyInput, setPersonalDifficultyInput] = useState('');
  const [savingNotesStatus, setSavingNotesStatus] = useState(false);
  const notesSaveTimerRef = useRef(null);

  const fetchProblemDetails = (probId) => {
    if (!probId) return;
    chrome.runtime.sendMessage({ action: 'get_problem_details', payload: { problem_id: probId } }, (res) => {
      if (res && res.success && res.data) {
        setUserNotesInput(res.data.user_notes || '');
        setPersonalDifficultyInput(res.data.personal_difficulty || '');
      }
    });
  };

  // Debounced: typing in the notes box shouldn't fire one request per keystroke.
  const saveNotes = (notes, diff, { immediate = false } = {}) => {
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    if (!immediate) {
      notesSaveTimerRef.current = setTimeout(() => saveNotes(notes, diff, { immediate: true }), 700);
      return;
    }
    const identity = window.dsaTutor?.getIdentity ? window.dsaTutor.getIdentity() : null;
    const probId = identity?.problemId || currentProblemId;
    if (!probId) return;
    const payload = {
      problem_id: probId,
      problem_title: identity?.problemTitle || probId,
      user_notes: notes,
      personal_difficulty: diff
    };
    chrome.runtime.sendMessage({ action: 'save_problem_notes', payload }, (res) => {
      if (res && res.success) {
        setSavingNotesStatus(true);
        setTimeout(() => setSavingNotesStatus(false), 2000);
      }
    });
  };

  const exportWeeklyJournal = () => {
    chrome.runtime.sendMessage({ action: 'get_weekly_journal' }, (res) => {
      if (res && res.success && res.data?.markdown_text) {
        const blob = new Blob([res.data.markdown_text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `weekly_dsa_digest_${res.data.period_end || 'latest'}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        alert(res?.error || 'Failed to download the weekly log.');
      }
    });
  };



  const exportSolvedCsv = () => {
    setExportingCsv(true);
    chrome.runtime.sendMessage({ action: 'export_solved_csv', payload: { timeframe: csvTimeframe } }, (res) => {
      setExportingCsv(false);
      if (res && res.success && res.data) {
        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = new Date().toISOString().slice(0, 10);
        a.download = `dsa_solved_problems_${csvTimeframe}_${today}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        alert(res?.error || 'Failed to export CSV.');
      }
    });
  };







  const runExplainBackCheck = async () => {
    if (isContestMode) {
      alert('AI features are disabled during LeetCode contests.');
      return;
    }
    if (!userExplanationInput.trim()) return;
    try {
      const ctx = await gatherContext(true);
      const payload = { problem_id: ctx.problem_id, code: ctx.code, language: ctx.language, user_explanation: userExplanationInput.trim(), is_contest: isContestMode };
      chrome.runtime.sendMessage({ action: 'explain_back', payload }, (res) => {
        fetchAiQuota();
        if (res && res.success) {
          setExplainBackResult(res.data);
        } else {
          setCoachError(res?.error || 'Could not verify your explanation.');
        }
      });
    } catch (e) {
      setCoachError(e.message || String(e));
    }
  };

  // Helper: gather current code/lang/constraints + identity, throw on empty code.
  const gatherContext = async (requireCode = true) => {
    const identity = window.dsaTutor?.getIdentity
      ? window.dsaTutor.getIdentity()
      : { problemId: 'unknown-problem', problemTitle: 'Unknown Problem' };
    const code = window.dsaTutor?.getCode ? await window.dsaTutor.getCode() : '';
    const language = window.dsaTutor?.getLanguage ? window.dsaTutor.getLanguage() : 'python3';
    const constraints = window.dsaTutor?.getConstraints ? window.dsaTutor.getConstraints() : null;
    if (requireCode && !code) {
      throw new Error('No code found in the editor. Open a problem and write some code first.');
    }
    return {
      problem_id: identity.problemId,
      problem_title: identity.problemTitle,
      code,
      language,
      constraints,
      is_contest: isContestMode
    };
  };

  // Generic Code Coach action runner.
  const runCoachAction = async (actionId, messageAction) => {
    if (isContestMode) {
      setCoachError('AI assistance is disabled during LeetCode contests to comply with fair play rules.');
      return;
    }
    setCoachError(null);
    setCoachLoading(actionId);
    try {
      const ctx = await gatherContext(true);
      chrome.runtime.sendMessage({ action: messageAction, payload: ctx }, (response) => {
        setCoachLoading(null);
        fetchAiQuota();
        if (response && response.success) {
          if (actionId === 'edge') {
            setEdgeResult(response.data);
            setCoachFilter('edge');
          } else if (actionId === 'approach') {
            setApproachResult(response.data);
            setCoachFilter('approach');
          }
          setIsOpen(true);
          setActiveTab('coach');
        } else {
          setCoachError(response?.error || 'Request failed.');
        }
      });
    } catch (e) {
      setCoachLoading(null);
      setCoachError(e.message || String(e));
    }
  };

  // Reveal next level of progressive hints.
  const revealNextHint = async () => {
    if (isContestMode) {
      setCoachError('AI assistance is disabled during LeetCode contests to comply with fair play rules.');
      return;
    }
    setCoachError(null);
    setCoachLoading('hint');
    try {
      const ctx = await gatherContext(true);
      const nextLevel = Math.min(3, Math.max(1, (currentHintLevel || 0) + 1));
      const payload = { ...ctx, level: nextLevel };
      
      chrome.runtime.sendMessage({ action: 'reveal_hint', payload }, (response) => {
        setCoachLoading(null);
        fetchAiQuota();
        if (response && response.success) {
          const returnedLevel = response.data.level || nextLevel;
          const newHint = { level: returnedLevel, hint: response.data.hint };
          setHintsList(prev => [...prev.filter(h => h.level !== returnedLevel), newHint].sort((a, b) => a.level - b.level));
          setCurrentHintLevel(returnedLevel);
          setCoachFilter('hints');
          if (window.dsaTutor) {
            window.dsaTutor.hintsUsed = returnedLevel;
          }
          setIsOpen(true);
          setActiveTab('coach');
        } else {
          setCoachError(response?.error || 'Request failed.');
        }
      });
    } catch (e) {
      setCoachLoading(null);
      setCoachError(e.message || String(e));
    }
  };

  // Ask a free-form question about the current code.
  const runAskHelp = async () => {
    if (isContestMode) {
      setCoachError('AI assistance is disabled during LeetCode contests to comply with fair play rules.');
      return;
    }
    if (!askInput.trim()) return;
    const currentQ = askInput.trim();
    setCoachError(null);
    setCoachLoading('ask');
    try {
      const ctx = await gatherContext(true);
      const payload = { ...ctx, question: currentQ };
      chrome.runtime.sendMessage({ action: 'ask_help', payload }, (response) => {
        setCoachLoading(null);
        fetchAiQuota();
        if (response && response.success) {
          setAskResults(prev => [{ id: Date.now(), question: currentQ, answer: response.data.answer }, ...prev]);
          setAskInput('');
          setCoachFilter('ask');
          setIsOpen(true);
          setActiveTab('coach');
        } else {
          setCoachError(response?.error || 'Request failed.');
        }
      });
    } catch (e) {
      setCoachLoading(null);
      setCoachError(e.message || String(e));
    }
  };

  const runHistorySync = async () => {
    setSyncStatus({ phase: 'fetching', message: 'Fetching all your solved problems from LeetCode… This may take a moment.' });
    chrome.runtime.sendMessage({ action: 'fetch_leetcode_history' }, (fetchRes) => {
      if (!fetchRes || !fetchRes.success) {
        setSyncStatus({ phase: 'error', message: fetchRes?.error || 'Failed to fetch LeetCode history.' });
        return;
      }
      const problems = fetchRes.data?.problems || [];
      const username = fetchRes.data?.username || 'LeetCode User';
      if (problems.length === 0) {
        setSyncStatus({ phase: 'done', message: 'No solved problems found. Solve a few on LeetCode first!', counts: { synced: 0, topics: 0 } });
        return;
      }
      setSyncStatus({ phase: 'syncing', message: `Importing ${problems.length} solved problem(s) into your tutor for ${username}…` });
      chrome.runtime.sendMessage({ action: 'sync_solved', payload: { problems, username } }, (syncRes) => {
        if (!syncRes || !syncRes.success) {
          setSyncStatus({ phase: 'error', message: syncRes?.error || 'Backend sync failed.' });
          return;
        }
        const { synced, topics, new_topics } = syncRes.data;
        setSyncStatus({
          phase: 'done',
          message: syncRes.data.message,
          counts: { synced, topics, new_topics, fetched: problems.length }
        });
        // Refresh mastery, focus, analysis, recommendations, account, and solved problems table.
        fetchMastery();
        fetchFocus();
        fetchAnalysis();
        fetchRecommendation();
        fetchStreak();
        fetchSyncedAccount();
        fetchSolvedProblems();
      });
    });
  };


  const checkBackendHealth = () => {
    chrome.runtime.sendMessage({ action: 'check_health' }, (response) => {
      setBackendOnline(!!(response && response.success));
    });
  };

  const fetchFocus = () => {
    chrome.runtime.sendMessage({ action: 'get_focus' }, (response) => {
      if (response && response.success) {
        const topics = response.data?.focus_topics || (response.data?.focus_topic ? response.data.focus_topic.split(',').map(s => s.trim()) : []);
        setFocusTopics(topics);
      }
    });
  };

  const toggleFocusTopic = (topic) => {
    let updated = [...focusTopics];
    if (updated.includes(topic)) {
      updated = updated.filter(t => t !== topic);
    } else {
      if (updated.length >= 3) {
        updated = [...updated.slice(1), topic];
      } else {
        updated.push(topic);
      }
    }
    chrome.runtime.sendMessage({ action: 'set_focus', payload: { topics: updated } }, (response) => {
      if (response && response.success) {
        const resTopics = response.data?.focus_topics || (response.data?.focus_topic ? response.data.focus_topic.split(',').map(s => s.trim()) : []);
        setFocusTopics(resTopics);
        fetchRecommendation();
      }
    });
  };

  const clearFocusTopics = () => {
    chrome.runtime.sendMessage({ action: 'set_focus', payload: { topics: [] } }, (response) => {
      if (response && response.success) {
        setFocusTopics([]);
        fetchRecommendation();
      }
    });
  };

  const fetchAnalysis = () => {
    chrome.runtime.sendMessage({ action: 'get_analysis' }, (response) => {
      if (response && response.success) {
        setAnalysisData(response.data);
      }
    });
  };

  const clearCurrentCoachState = () => {
    setApproachResult(null);
    setEdgeResult(null);
    setAskResults([]);
    setDiagnosisResult(null);
    setHintsList([]);
    setCurrentHintLevel(0);
    setUserExplanationInput('');
    setExplainBackResult(null);
    setShowExplainBack(false);
    setCoachError(null);
    setAskInput('');
    setCoachFilter('all');
    if (window.dsaTutor) {
      window.dsaTutor.hintsUsed = 0;
    }
  };

  // Instant problem change listener to detect problem navigation (only resets on problem slug change)
  useEffect(() => {
    let lastProblemSlug = currentProblemId;

    const checkProblemChange = () => {
      try {
        const identity = window.dsaTutor?.getIdentity ? window.dsaTutor.getIdentity() : null;
        if (identity && identity.problemId && identity.problemId !== 'unknown-problem') {
          if (identity.problemId !== lastProblemSlug) {
            lastProblemSlug = identity.problemId;
            setCurrentProblemId(identity.problemId);
            clearCurrentCoachState();
            fetchProblemDetails(identity.problemId);

            // If active badge test is running and moving to a new question, reset editor once
            if (activeTest && window.dsaTutor?.resetEditor) {
              window.dsaTutor.resetEditor();
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    checkProblemChange();
    window.addEventListener('popstate', checkProblemChange);
    const interval = setInterval(checkProblemChange, 500);

    return () => {
      window.removeEventListener('popstate', checkProblemChange);
      clearInterval(interval);
    };
  }, [currentProblemId, activeTest]);



  // Keep the local cache in sync with the active test.
  useEffect(() => {
    writeCachedActiveTest(activeTest);
  }, [activeTest]);

  // Active Badge Test Live Poller to instantly reflect solved problems
  useEffect(() => {
    if (!activeTest) return;
    const pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'get_active_badge_test' }, (res) => {
        if (res && res.success && res.data) {
          setActiveTest(mergeOptimisticSolved(res.data));
        }
      });
    }, 2000);
    return () => clearInterval(pollInterval);
  }, [activeTest?.id]);



  // Active Badge Test countdown timer
  useEffect(() => {
    if (!hasActiveTest) return;
    const t = setInterval(() => {
      setTestTimerSeconds(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [hasActiveTest, activeTest?.id]);

  // Handle expiry outside the state updater (updaters must stay side-effect free).
  useEffect(() => {
    if (!hasActiveTest || testTimerSeconds > 0) return;
    writeCachedActiveTest(null);
    setActiveTest(null);
    fetchMastery();
    alert('⏱ Badge test time expired!');
  }, [hasActiveTest, testTimerSeconds]);

  // Lock Solutions, Editorial, and Discussion tabs during Badge Tests.
  // Depends on whether a test is active (not the test object, which the 2s
  // poller replaces) so the locks don't flicker off/on every poll.
  useEffect(() => {
    const reason = hasActiveTest ? 'Badge Test' : '';

    const notifyLock = () => {
      if (window.dsaTutor?.setAssessmentLocked) {
        window.dsaTutor.setAssessmentLocked(hasActiveTest, reason);
      }
      window.postMessage({ type: 'SET_ASSESSMENT_LOCKED', locked: hasActiveTest, reason }, window.location.origin);
    };

    notifyLock();
    const lockPulse = setInterval(notifyLock, 1000);

    return () => {
      clearInterval(lockPulse);
      if (window.dsaTutor?.setAssessmentLocked) {
        window.dsaTutor.setAssessmentLocked(false, '');
      }
      window.postMessage({ type: 'SET_ASSESSMENT_LOCKED', locked: false, reason: '' }, window.location.origin);
    };
  }, [hasActiveTest]);

  // Fetch data on mount
  useEffect(() => {
    fetchMastery();
    fetchRecommendation();
    checkBackendHealth();
    fetchFocus();
    fetchAnalysis();
    fetchStreak();
    fetchCompanies();
    fetchWeakPairs();
    fetchActiveTest(4, { resetEditor: true });
    fetchAiQuota();
    fetchSyncedAccount();
    fetchSolvedProblems();

    // Extend (do NOT overwrite) window.dsaTutor so the page-context scrapers from
    // main.jsx (getCode/getLanguage/getConstraints/getIdentity) are preserved.
    window.dsaTutor = Object.assign(window.dsaTutor || {}, {
      fetchActiveTest: fetchActiveTest,
      markProblemSolvedOptimistic: (problemId) => {
        const id = String(problemId || '').toLowerCase();
        if (!id) return;
        setActiveTest(prev => {
          if (!prev) return prev;
          const o = optimisticSolvedRef.current;
          if (o.testId !== prev.id) { o.testId = prev.id; o.p1 = false; o.p2 = false; }
          const next = { ...prev };
          if (slugOf(prev.problem1) === id && !prev.problem1_solved) { next.problem1_solved = true; o.p1 = true; }
          else if (slugOf(prev.problem2) === id && !prev.problem2_solved) { next.problem2_solved = true; o.p2 = true; }
          else return prev;
          return next;
        });
      },
      revertOptimisticSolved: () => {
        const o = optimisticSolvedRef.current;
        const { p1, p2 } = o;
        o.p1 = false; o.p2 = false;
        if (!p1 && !p2) return;
        // Re-sync from the backend, which is authoritative.
        fetchActiveTest();
      },
      fetchMastery: fetchMastery,
      showBadgeAwardModal: (awardData) => {
        setBadgeAwardModal(awardData);
        writeCachedActiveTest(null);
        setActiveTest(null);
        setActiveTab('mastery');
        fetchMastery();
      },
      setLoading: (isLoading) => {
        setLoading(isLoading);
        if (isLoading) {
          setIsOpen(true);
          if (!activeTest) {
            setActiveTab('coach');
          }
          setError(null);
        }
      },
      setDiagnosis: (diagResult) => {
        setLoading(false);
        setIsOpen(true);
        if (!activeTest) {
          setActiveTab('coach');
        }
        // Auto-diagnosis results go into the Code Coach result area too.
        setDiagnosisResult(diagResult);
        setCoachError(null);
        setCoachLoading(null);
        if (diagResult.verdict === 'Accepted') {
          setShowExplainBack(true);
          if (activeTest) {
            fetchActiveTest();
          }
        }
        // Consolidated debounced refresh to eliminate render flashing
        scheduleBatchedRefresh();
      },
      setError: (errMessage) => {
        setLoading(false);
        setError(errMessage);
        setIsOpen(true);
        if (!activeTest) {
          setActiveTab('coach');
        }
      },
      resetEditor: window.dsaTutor?.resetEditor || (() => {
        window.postMessage({ type: 'RESET_EDITOR' }, window.location.origin);
      }),
      refreshData: () => {
        scheduleBatchedRefresh();
      }
    });

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setBadgeAwardModal(null);
        setShowWeeklyModal(false);
        setShowBadgeSubmitConfirm(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      // Only remove our own handlers; leave the scraper helpers intact.
      if (window.dsaTutor) {
        delete window.dsaTutor.setLoading;
        delete window.dsaTutor.setDiagnosis;
        delete window.dsaTutor.setError;
        delete window.dsaTutor.refreshData;
      }
    };
  }, []);

  const fetchMastery = () => {
    chrome.runtime.sendMessage({ action: 'get_mastery' }, (response) => {
      if (response && response.success && Array.isArray(response.data)) {
        // Sort by lowest mastery score first
        const sortedData = [...response.data].sort((a, b) => a.mastery_score - b.mastery_score);
        setMasteryData(sortedData);
      }
    });
  };

  const fetchRecommendation = (comp = selectedCompany) => {
    chrome.runtime.sendMessage({ action: 'get_recommendation', payload: { company: comp || null } }, (response) => {
      if (response && response.success) {
        setRecommendation(response.data);
      }
    });
  };

  if (!isOpen) {
    return (
      <button type="button" className="tutor-trigger" onClick={() => setIsOpen(true)} title="Open CodeCoach" aria-label="Open CodeCoach">
        {/* Bracket mark */}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/>
          <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>
        </svg>
      </button>
    );
  }

  return (
    <div id="dsa-tutor-panel-container">

      {/* Header */}
      <div className="tutor-header">
        <h3 className="tutor-title">
          <span className="logo-mark">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/>
              <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>
            </svg>
          </span>
          CodeCoach
          <span className="streak-pill" title="Daily solving streak">
            🔥 {streakData?.current_streak_days || 0}d
          </span>
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

          <button className="close-btn" onClick={() => setIsOpen(false)} title="Minimize" aria-label="Minimize CodeCoach">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      {!activeTest && (
        <div className="tabs-container">
          <button
            className={`tab-btn ${activeTab === "coach" ? "active" : ""}`}
            onClick={() => setActiveTab('coach')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 3.3 2 6.2 5 7.4V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2.6c3-1.2 5-4.1 5-7.4a8 8 0 0 0-8-8z"/>
              <path d="M10 22h4"/>
            </svg>
            Code Coach
          </button>
          <button
            className={`tab-btn ${activeTab === "mastery" ? "active" : ""}`}
            onClick={() => setActiveTab('mastery')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/>
              <path d="M10 14.66V17c0 .55-.45 1-1 1H7v2h10v-2h-2c-.55 0-1-.45-1-1v-2.34"/>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
            </svg>
            Mastery
          </button>
          <button
            className={`tab-btn ${activeTab === "recommendation" ? "active" : ""}`}
            onClick={() => setActiveTab('recommendation')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Next Up
          </button>
          <button
            className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab('history')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Sync
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="tutor-content">
        {activeTest ? (
          <div className="test-mode-container" style={{
            background: '#111113',
            border: '1px solid #1f1f23',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* Minimal Header */}
            <div className="test-mode-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #1a1a1e',
              paddingBottom: '10px',
              gap: '8px'
            }}>
              <div className="test-mode-title" style={{
                fontSize: '12.5px',
                fontWeight: '600',
                color: '#f4f4f5',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                minWidth: 0,
                flex: 1
              }}>
                <span style={{ flexShrink: 0 }}>🏆</span>
                <span style={{ lineHeight: 1.35 }}>
                  Badge Test: {activeTest.topic} Level {activeTest.level}
                </span>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: '500', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  ({activeTest.level === 1 ? 'Bronze' : activeTest.level === 2 ? 'Silver' : activeTest.level === 3 ? 'Gold' : activeTest.level === 4 ? 'Platinum' : 'Diamond'})
                </span>
              </div>

              <div style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: '600',
                color: testTimerSeconds < 600 ? '#f87171' : '#a1a1aa',
                background: '#18181b',
                border: '1px solid #27272a',
                padding: '3px 7px',
                borderRadius: '5px',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}>
                ⏱ {String(Math.floor(testTimerSeconds / 3600)).padStart(2, '0')}:
                {String(Math.floor((testTimerSeconds % 3600) / 60)).padStart(2, '0')}:
                {String(testTimerSeconds % 60).padStart(2, '0')}
              </div>
            </div>

            {/* Problem List (Minimal clickable cards that turn green when solved) */}
            <div className="test-mode-problem-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Problem 1 */}
              <div
                className={`test-problem-card ${activeTest.problem1_solved ? 'solved' : 'unsolved'}`}
                style={{
                  background: activeTest.problem1_solved ? 'rgba(34, 197, 94, 0.08)' : '#18181b',
                  border: activeTest.problem1_solved
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : currentProblemId === activeTest.problem1?.id
                    ? '1px solid #3b82f6'
                    : '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  if (activeTest.problem1?.url && currentProblemId !== activeTest.problem1.id) {
                    chrome.runtime.sendMessage({ action: 'navigate_tab', url: activeTest.problem1.url }, (res) => {
                      if (!res || !res.success) goTo(activeTest.problem1.url);
                    });
                    if (window.dsaTutor?.resetEditor) {
                      window.dsaTutor.resetEditor();
                      [200, 600, 1200, 2000].forEach(d => setTimeout(() => window.dsaTutor?.resetEditor?.(), d));
                    }
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '12.5px',
                    fontWeight: '500',
                    color: activeTest.problem1_solved ? '#4ade80' : '#f4f4f5'
                  }}>
                    1. {activeTest.problem1?.title}
                  </span>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: '500',
                    color: activeTest.problem1?.difficulty === 'Easy' ? '#4ade80' : activeTest.problem1?.difficulty === 'Medium' ? '#fbbf24' : '#f87171'
                  }}>
                    {activeTest.problem1?.difficulty}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {activeTest.problem1_solved ? (
                    <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '600' }}>🟢 Solved</span>
                  ) : currentProblemId === activeTest.problem1?.id ? (
                    <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: '600', background: 'rgba(59, 130, 246, 0.12)', padding: '2px 6px', borderRadius: '4px' }}>Active</span>
                  ) : null}
                </div>
              </div>

              {/* Problem 2 */}
              <div
                className={`test-problem-card ${activeTest.problem2_solved ? 'solved' : 'unsolved'}`}
                style={{
                  background: activeTest.problem2_solved ? 'rgba(34, 197, 94, 0.08)' : '#18181b',
                  border: activeTest.problem2_solved
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : currentProblemId === activeTest.problem2?.id
                    ? '1px solid #3b82f6'
                    : '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  if (activeTest.problem2?.url && currentProblemId !== activeTest.problem2.id) {
                    chrome.runtime.sendMessage({ action: 'navigate_tab', url: activeTest.problem2.url }, (res) => {
                      if (!res || !res.success) goTo(activeTest.problem2.url);
                    });
                    if (window.dsaTutor?.resetEditor) {
                      window.dsaTutor.resetEditor();
                      [200, 600, 1200, 2000].forEach(d => setTimeout(() => window.dsaTutor?.resetEditor?.(), d));
                    }
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '12.5px',
                    fontWeight: '500',
                    color: activeTest.problem2_solved ? '#4ade80' : '#f4f4f5'
                  }}>
                    2. {activeTest.problem2?.title}
                  </span>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: '500',
                    color: activeTest.problem2?.difficulty === 'Easy' ? '#4ade80' : activeTest.problem2?.difficulty === 'Medium' ? '#fbbf24' : '#f87171'
                  }}>
                    {activeTest.problem2?.difficulty}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {activeTest.problem2_solved ? (
                    <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '600' }}>🟢 Solved</span>
                  ) : currentProblemId === activeTest.problem2?.id ? (
                    <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: '600', background: 'rgba(59, 130, 246, 0.12)', padding: '2px 6px', borderRadius: '4px' }}>Active</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Action Buttons: Equal Length, Neutral Submit, Red Abandon */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', paddingTop: '4px' }}>
              <button
                className="coach-btn secondary"
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  background: '#18181b',
                  color: '#f4f4f5',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
                onClick={() => setShowBadgeSubmitConfirm(true)}
              >
                Submit Test
              </button>
              <button
                className="abandon-btn"
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
                onClick={abandonBadgeTest}
              >
                Abandon Test
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Contest Mode Active Banner */}
            {isContestMode && (
              <div className="info-section" style={{ borderColor: '#ea580c88', background: '#ea580c1b', marginBottom: '14px' }}>
                <div className="section-label" style={{ color: '#fb923c', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🏆 Contest Mode Active</span>
                  <span style={{ fontSize: '10px', background: '#ea580c44', color: '#ffedd5', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>FAIR PLAY LOCK</span>
                </div>
                <div className="section-content" style={{ fontSize: '11px', color: '#ffedd5', lineHeight: '1.4', marginTop: '4px' }}>
                  AI assistance, hints, code coaching, and problem diagnostics are strictly disabled during LeetCode contests to ensure compliance with contest rules.
                </div>
              </div>
            )}

            {/* Review Today Prompt Banner */}
            {recommendation?.reviews && recommendation.reviews.length > 0 && activeTab !== 'recommendation' && !activeTest && (
              <div
                onClick={() => setActiveTab('recommendation')}
                style={{ background: '#f59e0b1b', border: '1px solid #f59e0b66', borderRadius: '6px', padding: '8px 10px', marginBottom: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📅 <strong>{recommendation.reviews.length} {recommendation.reviews.length === 1 ? 'problem' : 'problems'} due for review today</strong>
                </span>
                <span style={{ fontSize: '10px', color: '#fcd34d', fontWeight: 'bold', textDecoration: 'underline' }}>Open Reviews →</span>
              </div>
            )}

            {/* TAB 1: MASTERY OVERVIEW */}
            {!activeTest && activeTab === 'mastery' && (
              <div>
                {/* Focus banner */}
                {focusTopics && focusTopics.length > 0 && (
                  <div className="focus-banner">
                    <div className="focus-banner-text">
                      <span className="focus-icon">◎</span>
                      <span>
                        Focus ({focusTopics.length}/3):{' '}
                        <strong style={{ color: '#d4d4d8' }}>{focusTopics.join(', ')}</strong>
                      </span>
                    </div>
                    <button className="focus-change-btn" onClick={clearFocusTopics}>
                      Clear All
                    </button>
                  </div>
                )}
            {weakPairs && weakPairs.length > 0 && (
              <div className="info-section alt-section" style={{ marginBottom: '14px', borderLeftColor: '#fbbf24' }}>
                <div className="section-label alt-label" style={{ color: '#fbbf24' }}>
                  💡 Prerequisite Review Suggestion
                </div>
                <div className="section-content" style={{ fontSize: '12px', color: '#d4d4d8' }}>
                  Review <strong>{weakPairs[0].topic_a}</strong> before tackling <strong>{weakPairs[0].topic_b}</strong> (co-occurred {weakPairs[0].co_occurrence} times).
                </div>
              </div>
            )}

            <h4 className="section-heading">Per-Topic Mastery</h4>
            {masteryData.length === 0 ? (
              <div className="empty-state">
                {backendOnline === false
                  ? 'Can’t reach the CodeCoach server right now. Try again in a minute.'
                  : 'No topics yet. Sync your LeetCode history from the Sync tab to get started.'}
              </div>
            ) : (
              masteryData.map((data) => {
                const pct = data.mastery_score * 100;
                const levelColor = pct >= 65 ? 'high' : pct >= 35 ? 'mid' : 'low';
                return (
                  <div
                    key={data.topic}
                    className={`mastery-card ${focusTopics.includes(data.topic) ? 'mastery-card-focus' : ''}`}
                    data-level={levelColor}
                  >
                    <div className="mastery-header">
                      <span className="mastery-name">{data.topic}</span>
                      {data.badge !== 'None' ? (
                        <span className="badge-status-pill earned">
                          {getBadgeEmoji(data.badge)} {data.badge}
                        </span>
                      ) : (
                        <span className="badge-status-pill locked">
                          🔒 Locked
                        </span>
                      )}
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fg"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mastery-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Level {data.level}/5</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {data.level < 5 ? (
                          <button className="badge-btn" onClick={() => startBadgeTest(data.topic)}>
                            🚀 Test L{data.level + 1}
                          </button>
                        ) : (
                          <span style={{ color: '#22c55e', fontWeight: '600', fontSize: '11px' }}>🏆 Max Tier!</span>
                        )}
                        <button
                          className={`focus-pick-btn ${focusTopics.includes(data.topic) ? 'active' : ''}`}
                          onClick={() => toggleFocusTopic(data.topic)}
                          title={focusTopics.includes(data.topic) ? 'Remove focus' : 'Set as focus topic (max 3)'}
                        >
                          {focusTopics.includes(data.topic) ? 'Focused' : 'Focus'}
                        </button>
                      </div>
                    </div>


                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: CODE COACH */}
        {!activeTest && activeTab === 'coach' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <h4 className="section-heading" style={{ margin: 0 }}>Code Coach</h4>
              {(approachResult || hintsList.length > 0 || edgeResult || askResults.length > 0 || diagnosisResult || coachError) && (
                <button
                  onClick={clearCurrentCoachState}
                  style={{ background: 'transparent', color: '#71717a', border: 'none', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Clear all results for current problem"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  Reset View
                </button>
              )}
            </div>
            <p className="coach-intro">
              Analyze the code currently inside LeetCode's editor using autonomous diagnostic tools.
            </p>

            {/* Post-Solve Explain-Back Check (Tier 3.2) */}
            {showExplainBack && (
              <div className="info-section alt-section" style={{ marginBottom: '14px', borderColor: '#22c55e44', background: '#22c55e11' }}>
                <div className="section-label alt-label" style={{ color: '#4ade80' }}>
                  🎉 Problem Solved! Explain your approach
                </div>
                <textarea
                  className="ask-input"
                  rows={2}
                  placeholder="Briefly explain how your solution works in 1-2 sentences..."
                  value={userExplanationInput}
                  onChange={(e) => setUserExplanationInput(e.target.value)}
                  style={{ marginTop: '6px', fontSize: '12px' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                  <button className="coach-btn" style={{ width: '100%', padding: '6px 12px', fontSize: '12px' }} onClick={runExplainBackCheck}>
                    Verify Explanation
                  </button>
                  <button className="coach-btn secondary" style={{ width: '100%', padding: '6px 12px', fontSize: '11px' }} onClick={() => setShowExplainBack(false)}>
                    Skip
                  </button>
                </div>
                {explainBackResult && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: explainBackResult.matches ? '#4ade80' : '#fbbf24' }}>
                    {explainBackResult.matches ? '✓ Great explanation! Perfectly matches your code.' : `⚠️ ${explainBackResult.discrepancy_note}`}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="coach-actions">
              <button
                className={`coach-btn ${coachLoading === 'approach' ? 'loading' : ''}`}
                disabled={!!coachLoading}
                onClick={() => runCoachAction('approach', 'check_approach')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', verticalAlign: 'middle'}}><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
                {coachLoading === 'approach' ? 'Analyzing approach…' : 'Analyze Approach'}
              </button>
              <button
                className={`coach-btn secondary ${coachLoading === 'hint' ? 'loading' : ''}`}
                disabled={!!coachLoading || currentHintLevel >= 3}
                onClick={revealNextHint}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', verticalAlign: 'middle'}}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                {coachLoading === 'hint' 
                  ? 'Thinking…' 
                  : currentHintLevel >= 3 
                    ? 'All Hints Unlocked' 
                    : currentHintLevel > 0 
                      ? `Get Hint (Level ${currentHintLevel + 1})` 
                      : 'Get a Hint'}
              </button>
              <button
                className={`coach-btn secondary ${coachLoading === 'edge' ? 'loading' : ''}`}
                disabled={!!coachLoading}
                onClick={() => runCoachAction('edge', 'get_edge_cases')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', verticalAlign: 'middle'}}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {coachLoading === 'edge' ? 'Checking…' : 'Edge Cases'}
              </button>
            </div>

            {/* Loading / error states */}
            {coachLoading && (
              <div className="loading-container">
                <div className="spinner" />
                <p style={{ margin: 0, fontSize: '12px', color: '#71717a' }}>Analyzing…</p>
              </div>
            )}
            {coachError && (
              <div className="info-section error-section">
                <div className="section-label error-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {String(coachError).toLowerCase().includes('limit') || String(coachError).toLowerCase().includes('quota') || String(coachError).includes('429') ? 'LIMIT EXCEEDED' : 'ERROR'}
                </div>
                <div className="section-content">
                  {String(coachError).includes('429') 
                    ? 'Daily AI request limit reached. Please try again tomorrow.' 
                    : coachError}
                </div>
              </div>
            )}

            {/* Live submission auto-diagnosis */}
            {loading && (
              <div className="loading-container">
                <div className="spinner" />
                <p style={{ margin: 0, fontSize: '12px', color: '#71717a' }}>Analyzing submission…</p>
              </div>
            )}
            {error && (
              <div className="info-section error-section">
                <div className="section-label error-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {String(error).toLowerCase().includes('limit') || String(error).toLowerCase().includes('quota') || String(error).includes('429') ? 'LIMIT EXCEEDED' : 'ERROR'}
                </div>
                <div className="section-content">
                  {String(error).includes('429') 
                    ? 'Daily AI request limit reached. Please try again tomorrow.' 
                    : error}
                </div>
              </div>
            )}

            {/* Multi-Tool Results (Stacked & Persistent) */}
            {!coachLoading && (approachResult || hintsList.length > 0 || edgeResult || askResults.length > 0 || diagnosisResult) && (
              <div className="coach-result-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                
                {/* Filter bar if multiple outputs exist */}
                {((approachResult ? 1 : 0) + (hintsList.length ? 1 : 0) + (edgeResult ? 1 : 0) + (askResults.length ? 1 : 0) + (diagnosisResult ? 1 : 0)) > 1 && (
                  <div className="filter-chips-bar" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <button
                      className={`filter-chip ${coachFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setCoachFilter('all')}
                      style={{ background: coachFilter === 'all' ? '#3f3f46' : '#18181b', color: coachFilter === 'all' ? '#fff' : '#a1a1aa', border: '1px solid #27272a', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      All ({ (approachResult ? 1 : 0) + (hintsList.length ? 1 : 0) + (edgeResult ? 1 : 0) + (askResults.length ? 1 : 0) + (diagnosisResult ? 1 : 0) })
                    </button>
                    {approachResult && (
                      <button
                        className={`filter-chip ${coachFilter === 'approach' ? 'active' : ''}`}
                        onClick={() => setCoachFilter('approach')}
                        style={{ background: coachFilter === 'approach' ? '#3f3f46' : '#18181b', color: coachFilter === 'approach' ? '#fff' : '#a1a1aa', border: '1px solid #27272a', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Approach
                      </button>
                    )}
                    {hintsList.length > 0 && (
                      <button
                        className={`filter-chip ${coachFilter === 'hints' ? 'active' : ''}`}
                        onClick={() => setCoachFilter('hints')}
                        style={{ background: coachFilter === 'hints' ? '#3f3f46' : '#18181b', color: coachFilter === 'hints' ? '#fff' : '#a1a1aa', border: '1px solid #27272a', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Hints ({hintsList.length})
                      </button>
                    )}
                    {edgeResult && (
                      <button
                        className={`filter-chip ${coachFilter === 'edge' ? 'active' : ''}`}
                        onClick={() => setCoachFilter('edge')}
                        style={{ background: coachFilter === 'edge' ? '#3f3f46' : '#18181b', color: coachFilter === 'edge' ? '#fff' : '#a1a1aa', border: '1px solid #27272a', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Edge Cases
                      </button>
                    )}
                    {askResults.length > 0 && (
                      <button
                        className={`filter-chip ${coachFilter === 'ask' ? 'active' : ''}`}
                        onClick={() => setCoachFilter('ask')}
                        style={{ background: coachFilter === 'ask' ? '#3f3f46' : '#18181b', color: coachFilter === 'ask' ? '#fff' : '#a1a1aa', border: '1px solid #27272a', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Q&A ({askResults.length})
                      </button>
                    )}
                    {diagnosisResult && (
                      <button
                        className={`filter-chip ${coachFilter === 'diagnosis' ? 'active' : ''}`}
                        onClick={() => setCoachFilter('diagnosis')}
                        style={{ background: coachFilter === 'diagnosis' ? '#3f3f46' : '#18181b', color: coachFilter === 'diagnosis' ? '#fff' : '#a1a1aa', border: '1px solid #27272a', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Diagnosis
                      </button>
                    )}
                  </div>
                )}

                {/* 1. Auto-diagnosis Result Section */}
                {diagnosisResult && (coachFilter === 'all' || coachFilter === 'diagnosis') && (
                  <div className="coach-result">
                    <div className="diagnosis-badges">
                      <span className={`verdict-badge ${diagnosisResult.verdict === 'Accepted' ? 'success' : 'failure'}`}>
                        {diagnosisResult.verdict === 'Accepted' ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polyline points="20 6 9 17 4 12"/></svg>
                            Accepted
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            {diagnosisResult.verdict || 'Failed'}
                          </>
                        )}
                      </span>
                      {diagnosisResult.verdict !== 'Accepted' && diagnosisResult.root_cause_category && CATEGORY_MAP[diagnosisResult.root_cause_category] && (
                        <span
                          className="category-tag"
                          style={{
                            color: CATEGORY_MAP[diagnosisResult.root_cause_category].color,
                            borderColor: `${CATEGORY_MAP[diagnosisResult.root_cause_category].color}30`,
                            background: `${CATEGORY_MAP[diagnosisResult.root_cause_category].color}12`
                          }}
                        >
                          {CATEGORY_MAP[diagnosisResult.root_cause_category].emoji} {CATEGORY_MAP[diagnosisResult.root_cause_category].label}
                        </span>
                      )}
                    </div>
                    <div className="info-section">
                      <div className="section-label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Root Cause Analysis
                      </div>
                      <div className="section-content">{diagnosisResult.explanation}</div>
                    </div>
                    {diagnosisResult.suggested_action && (
                      <div className="info-section alt-section">
                        <div className="section-label alt-label">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          Suggested Action
                        </div>
                        <div className="section-content">{diagnosisResult.suggested_action}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Approach Critique Section */}
                {approachResult && (coachFilter === 'all' || coachFilter === 'approach') && (
                  <div className="coach-result">
                    <div className="coach-result-head">
                      <span className={`tag-pill ${approachResult.is_optimal ? 'tag-good' : 'tag-bad'}`}>
                        {approachResult.is_optimal ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polyline points="20 6 9 17 4 12"/></svg>
                            Optimal Approach
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            Can be optimized
                          </>
                        )}
                      </span>
                    </div>
                    <div className="complexity-row">
                      <div>
                        <span className="complexity-label">Current Complexity</span>
                        <span>{approachResult.current_complexity}</span>
                      </div>
                      <div>
                        <span className="complexity-label">Optimal Complexity</span>
                        <span>{approachResult.optimal_complexity}</span>
                      </div>
                    </div>
                    <div className="info-section">
                      <div className="section-label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        Feedback
                      </div>
                      <div className="section-content">{approachResult.feedback}</div>
                    </div>
                    <div className="info-section alt-section">
                      <div className="section-label alt-label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Alternative Approach
                      </div>
                      <div className="section-content">{approachResult.alternative_approach}</div>
                    </div>
                  </div>
                )}

                {/* 3. Progressive Hints Section */}
                {hintsList.length > 0 && (coachFilter === 'all' || coachFilter === 'hints') && (
                  <div className="coach-result">
                    <div className="progressive-hints-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                      {hintsList.map((h) => (
                        <div key={h.level} className="info-section alt-section" style={{ margin: 0 }}>
                          <div className="section-label alt-label" style={{ display: 'flex', alignItems: 'center' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                            {h.level === 1 ? '💡 Level 1: Conceptual Strategy' : h.level === 2 ? '⚙️ Level 2: Algorithmic Strategy' : '🛠️ Level 3: Pseudocode Breakdown'}
                          </div>
                          <div className="section-content" style={{ whiteSpace: 'pre-wrap' }}>{h.hint}</div>
                        </div>
                      ))}
                      
                      {currentHintLevel < 3 && (
                        <div style={{ marginTop: '4px' }}>
                          <button
                            className={`coach-btn ${coachLoading === 'hint' ? 'loading' : ''}`}
                            disabled={!!coachLoading}
                            onClick={revealNextHint}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '6px', verticalAlign: 'middle'}}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                            {coachLoading === 'hint' ? 'Thinking…' : `Reveal Next Hint (Level ${currentHintLevel + 1})`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Edge Cases Section */}
                {edgeResult && (coachFilter === 'all' || coachFilter === 'edge') && (
                  <div className="coach-result">
                    <div className="info-section">
                      <div className="section-label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Edge Cases Detected
                      </div>
                      {(edgeResult.edge_cases || []).map((ec, i) => (
                        <div key={i} className="edge-case-item">
                          <span className={`handled-tag ${ec.handled ? 'handled-yes' : 'handled-no'}`}>
                            {ec.handled ? 'Handled' : 'Missing'}
                          </span>
                          <div>
                            <div className="edge-case-name">{ec.case}</div>
                            <div className="edge-case-suggestion">{ec.suggestion}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="info-section alt-section">
                      <div className="section-label alt-label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                        Constraints Critique
                      </div>
                      <div className="section-content">{edgeResult.constraints_critique}</div>
                    </div>
                  </div>
                )}

                {/* 5. Custom Q&A Section */}
                {askResults.length > 0 && (coachFilter === 'all' || coachFilter === 'ask') && (
                  <div className="coach-result" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {askResults.map((item) => (
                      <div key={item.id} className="info-section alt-section">
                        <div className="section-label alt-label">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          Tutor Q&A Response
                        </div>
                        {item.question && (
                          <div className="ask-question" style={{ fontWeight: '600', color: '#e4e4e7', marginBottom: '6px' }}>Q: {item.question}</div>
                        )}
                        <div className="section-content" style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {/* Ask a question */}
            {!coachLoading && !loading && (
              <div className="ask-block">
                <div className="section-heading" style={{ marginTop: '8px' }}>Ask a custom question</div>
                <textarea
                  className="ask-input"
                  rows={2}
                  placeholder="e.g. Why is my two-pointer approach failing on sorted inputs?"
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                />
                <button
                  className="coach-btn"
                  disabled={!askInput.trim() || !!coachLoading}
                  onClick={runAskHelp}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '6px', verticalAlign: 'middle'}}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Ask Tutor
                </button>
              </div>
            )}

            {/* Personal Problem Notes & Rating */}
            {!coachLoading && !loading && (
              <div className="info-section alt-section" style={{ marginTop: '14px', background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '10px 12px' }}>
                <div className="section-label alt-label" style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>📝 Personal Notes & Rating</span>
                  {savingNotesStatus && <span style={{ fontSize: '10px', color: '#4ade80' }}>✓ Saved</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Difficulty Flag:</span>
                  <select
                    value={personalDifficultyInput}
                    onChange={(e) => {
                      setPersonalDifficultyInput(e.target.value);
                      saveNotes(userNotesInput, e.target.value);
                    }}
                    style={{ flex: 1, background: '#09090b', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                  >
                    <option value="">Not Rated</option>
                    <option value="Hard for me">🔥 Hard for me</option>
                    <option value="Tricky Edge Cases">⚠️ Tricky Edge Cases</option>
                    <option value="Medium">⚡ Medium</option>
                    <option value="Easy">✅ Easy</option>
                  </select>
                </div>
                <textarea
                  className="ask-input"
                  rows={2}
                  placeholder="Add notes for this problem (included in your CSV export)…"
                  value={userNotesInput}
                  onChange={(e) => {
                    setUserNotesInput(e.target.value);
                    saveNotes(e.target.value, personalDifficultyInput);
                  }}
                  style={{ fontSize: '11px' }}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RECOMMENDATION */}
        {!activeTest && activeTab === 'recommendation' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', background: '#141416', padding: '8px 12px', borderRadius: '8px', border: '1px solid #27272a' }}>
              <span style={{ fontSize: '11px', color: '#a1a1aa' }}>🏢 Target Company:</span>
              <select
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  fetchRecommendation(e.target.value);
                }}
                style={{ background: '#18181b', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
              >
                <option value="">All Companies</option>
                {Array.from(new Set([...(companies || []), 'Google', 'Meta', 'Amazon', 'Microsoft', 'Apple', 'Uber', 'Bloomberg', 'Netflix', 'ByteDance', 'Adobe', 'Salesforce'])).sort().map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {focusTopics && focusTopics.length > 0 && (
              <div className="rec-focus-note">
                <span>🎯 Focus ({focusTopics.length}/3): <strong>{focusTopics.join(', ')}</strong></span>
                <button className="focus-change-btn-inline" onClick={() => clearFocusTopics()} aria-label="Clear focus topics" title="Clear focus topics">✕</button>
              </div>
            )}
            
            <h4 className="section-heading">Adaptive Recommendations</h4>
            {recommendation && recommendation.recommendations ? (
              <div className="rec-list-container">
                {recommendation.recommendations.map((rec) => {
                  const recTopics = rec.topics ? rec.topics.split(',').map(t => t.trim()).filter(Boolean) : [];
                  return (
                    <div key={rec.problem_id} className="rec-item-card">
                      <div className="rec-title-row">
                        <h5 className="rec-title">{rec.title}</h5>
                        {rec.difficulty && (
                          <span className={`difficulty-badge ${difficultyClass(rec.difficulty)}`}>
                            {rec.difficulty}
                          </span>
                        )}
                      </div>

                      {rec.companies && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0', fontSize: '11px', color: '#60a5fa', fontWeight: '500' }}>
                          <span>🏢 {rec.companies}</span>
                        </div>
                      )}

                      <div className="rec-reason">
                        {rec.reason}
                      </div>

                      {recTopics.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' }}>
                          {recTopics.map(t => (
                            <button
                              key={t}
                              className={`focus-pick-btn ${focusTopics.includes(t) ? 'active' : ''}`}
                              onClick={() => toggleFocusTopic(t)}
                              style={{ fontSize: '10px', padding: '2px 6px', border: '1px solid #27272a', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              🎯 {focusTopics.includes(t) ? 'Focused' : `Focus on ${t}`}
                            </button>
                          ))}
                        </div>
                      )}

                      {safeLeetCodeUrl(rec.url) && <a
                        className="rec-item-link"
                        href={safeLeetCodeUrl(rec.url) || undefined}
                        target="_self"
                        onClick={(e) => {
                          e.preventDefault();
                          goTo(rec.url);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Attempt Problem
                      </a>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">Loading recommendations...</div>
            )}

            {/* Spaced Repetition Review Section */}
            <div className="review-section">
              <h4 className="section-heading" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Spaced Repetition Reviews
              </h4>
              {recommendation && recommendation.reviews ? (
                recommendation.reviews.length > 0 ? (
                  recommendation.reviews.map((rev) => {
                    const revTopics = rev.topics ? rev.topics.split(',').map(t => t.trim()).filter(Boolean) : [];
                    return (
                      <div key={rev.problem_id} className="review-card">
                        <div className="review-info">
                          <div className="review-title-row">
                            <span className="review-title">{rev.title}</span>
                            {rev.difficulty && (
                              <span className={`difficulty-badge ${difficultyClass(rev.difficulty)}`}>
                                {rev.difficulty}
                              </span>
                            )}
                          </div>

                          {rev.companies && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: '3px 0', fontSize: '10px', color: '#60a5fa', fontWeight: '500' }}>
                              <span>🏢 {rev.companies}</span>
                            </div>
                          )}

                          <div className="review-meta" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span className={`review-badge stage-${rev.stage}`}>
                              Review {rev.stage} ({rev.stage === 1 ? '3d' : rev.stage === 2 ? '7d' : '14d'})
                            </span>
                            {rev.due_date && (
                              <span style={{ fontSize: '10px', color: '#a1a1aa' }}>
                                📅 Due: {new Date(rev.due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {revTopics.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                              {revTopics.map(t => (
                                <button
                                  key={t}
                                  className={`focus-pick-btn ${focusTopics.includes(t) ? 'active' : ''}`}
                                  onClick={() => toggleFocusTopic(t)}
                                  style={{ fontSize: '9px', padding: '2px 5px', border: '1px solid #27272a', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  🎯 {focusTopics.includes(t) ? 'Focused' : `Focus on ${t}`}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {safeLeetCodeUrl(rev.url) && <a
                          className="review-link-btn"
                          href={safeLeetCodeUrl(rev.url) || undefined}
                          target="_self"
                          onClick={(e) => {
                            e.preventDefault();
                            goTo(rev.url);
                          }}
                        >
                          Review Now →
                        </a>}
                      </div>
                    );
                  })
                ) : (
                  <div className="success-card">
                    <div className="success-card-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div className="success-card-content">
                      <span className="success-card-title">All Caught Up!</span>
                      <span className="success-card-text">No problems are due for spaced repetition review today. Keep solving to build your queue.</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="empty-state">Loading reviews...</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: HISTORY SYNC */}
        {!activeTest && activeTab === 'history' && (
          <div>
            <h4 className="section-heading">LeetCode History Sync & Account</h4>
            <p className="coach-intro">
              Synchronize your historical solved problems from LeetCode to map topic mastery, seed spaced repetition, and populate your problem table.
            </p>

            {/* Persistent Synced Account Card */}
            <div className="info-section alt-section" style={{ marginBottom: '14px', background: '#18181b', border: '1px solid #27272a', padding: '12px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>👤</span> {syncedAccount.username || 'LeetCode User'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '3px' }}>
                    <strong>{syncedAccount.synced_count || solvedProblems.length || 0}</strong> Solved Problems Synced
                  </div>
                  {syncedAccount.last_synced && (
                    <div style={{ fontSize: '10px', color: '#71717a', marginTop: '2px' }}>
                      Last Synced: {syncedAccount.last_synced}
                    </div>
                  )}
                </div>
                <div>
                  <button
                    className="coach-btn secondary"
                    style={{ padding: '6px 12px', fontSize: '11px', width: 'auto' }}
                    onClick={openWeeklyDigest}
                  >
                    ✨ AI Weekly Log
                  </button>
                </div>
              </div>
            </div>

            <button
              className={`coach-btn ${syncStatus && syncStatus.phase !== 'done' && syncStatus.phase !== 'error' ? 'loading' : ''}`}
              disabled={!!syncStatus && ['fetching', 'syncing'].includes(syncStatus.phase)}
              onClick={runHistorySync}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '6px', verticalAlign: 'middle'}}><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              {syncStatus && ['fetching', 'syncing'].includes(syncStatus.phase)
                ? 'Syncing history…'
                : 'Sync All LeetCode History'}
            </button>

            {/* Solved Problems Spreadsheet Export (.csv) */}
            <div className="info-section alt-section" style={{ marginTop: '12px', background: '#18181b', border: '1px solid #27272a', padding: '10px 12px', borderRadius: '8px' }}>
              <div className="section-label alt-label" style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Export Solved Problems Spreadsheet (.csv)
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                <select
                  value={csvTimeframe}
                  onChange={(e) => setCsvTimeframe(e.target.value)}
                  style={{ flex: 1, background: '#09090b', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}
                >
                  <option value="current_week">Current Week (Past 7 Days)</option>
                  <option value="past_30_days">Past 30 Days</option>
                  <option value="all_time">All Solved Problems</option>
                </select>
                <button
                  className={`coach-btn ${exportingCsv ? 'loading' : ''}`}
                  style={{ flex: 'none', width: 'auto', padding: '6px 12px', fontSize: '11px' }}
                  disabled={exportingCsv}
                  onClick={exportSolvedCsv}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px', verticalAlign: 'middle'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {exportingCsv ? 'Exporting…' : 'Download .csv'}
                </button>
              </div>
            </div>

            {syncStatus && (
              <div className={`sync-card ${syncStatus.phase === 'error' ? 'sync-error' : ''}`}>
                <div className="sync-message">{syncStatus.message}</div>
                {syncStatus.counts && (
                  <div className="sync-stats">
                    {syncStatus.counts.fetched !== undefined && (
                      <div className="sync-stat">
                        <span className="sync-stat-num">{syncStatus.counts.fetched}</span>
                        <span className="sync-stat-label">Fetched</span>
                      </div>
                    )}
                    <div className="sync-stat">
                      <span className="sync-stat-num">{syncStatus.counts.synced}</span>
                      <span className="sync-stat-label">Synced</span>
                    </div>
                    <div className="sync-stat">
                      <span className="sync-stat-num">{syncStatus.counts.topics}</span>
                      <span className="sync-stat-label">Topics</span>
                    </div>
                    {syncStatus.counts.new_topics !== undefined && (
                      <div className="sync-stat">
                        <span className="sync-stat-num">{syncStatus.counts.new_topics}</span>
                        <span className="sync-stat-label">New</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Analysis card: shown after sync completes */}
            {analysisData && (
              <div className="analysis-card">
                <h4 className="section-heading" style={{ margin: '0 0 14px 0' }}>LeetCode Profile Overview</h4>

                {/* Difficulty breakdown */}
                <div className="diff-bar">
                  <div className="diff-segment diff-easy" style={{ flex: Math.max(1, analysisData.difficulty_breakdown.Easy || 0) }} />
                  <div className="diff-segment diff-medium" style={{ flex: Math.max(1, analysisData.difficulty_breakdown.Medium || 0) }} />
                  <div className="diff-segment diff-hard" style={{ flex: Math.max(1, analysisData.difficulty_breakdown.Hard || 0) }} />
                </div>
                <div className="diff-labels">
                  <span className="diff-label-easy">{analysisData.difficulty_breakdown.Easy || 0} Easy</span>
                  <span className="diff-label-medium">{analysisData.difficulty_breakdown.Medium || 0} Medium</span>
                  <span className="diff-label-hard">{analysisData.difficulty_breakdown.Hard || 0} Hard</span>
                </div>
                <div className="total-solved-line">Total Solved Problems: <strong>{analysisData.total_solved}</strong></div>

                {/* Top topics */}
                <div className="analysis-section">
                  <div className="section-label">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Top Covered Topics
                  </div>
                  <div className="topic-chips">
                    {(analysisData.top_topics || []).slice(0, 8).map((t) => (
                      <span key={t.topic} className="topic-chip">
                        {t.topic} <span className="chip-count">{t.solved_count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Weakest topics */}
                {analysisData.weak_topics && analysisData.weak_topics.length > 0 && (
                  <div className="analysis-section">
                    <div className="section-label" style={{ color: '#fb7185' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px'}}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Weakest Mastery Areas
                    </div>
                    <div className="weak-list">
                      {analysisData.weak_topics.map((t) => (
                        <div key={t.topic} className="weak-item">
                          <span className="weak-topic-name">{t.topic}</span>
                          <div className="weak-item-right">
                            <span className="weak-score" style={{ marginRight: '6px' }}>
                              {t.badge !== 'None' ? `${getBadgeEmoji(t.badge)} ${t.badge}` : '🔒 Locked'}
                            </span>
                            <button
                              className={`focus-pick-btn ${focusTopics.includes(t.topic) ? 'active' : ''}`}
                              onClick={() => toggleFocusTopic(t.topic)}
                              title={focusTopics.includes(t.topic) ? 'Remove focus' : 'Set as focus topic (max 3)'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                              {focusTopics.includes(t.topic) ? 'Focused' : 'Focus'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </>
    )}
  </div>

      {/* AI Weekly DSA Digest Modal */}
      {showWeeklyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 10, 12, 0.65)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setShowWeeklyModal(false)}>
          <div style={{ background: '#0e0e10', border: '1px solid #27272a', borderRadius: '12px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto', padding: '20px', color: '#f4f4f5', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✨</span> Weekly DSA Digest & AI Insights
                </h3>
                <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                  {weeklyData ? `Period: ${weeklyData.period_start} to ${weeklyData.period_end}` : 'Generating learning synthesis…'}
                </div>
              </div>
              <button aria-label="Close weekly log" onClick={() => setShowWeeklyModal(false)} style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            {loadingWeekly ? (
              <div className="loading-container" style={{ padding: '30px 0' }}>
                <div className="spinner" />
                <p style={{ margin: 0, fontSize: '12px', color: '#a1a1aa' }}>Analyzing weekly patterns & generating AI takeaways…</p>
              </div>
            ) : weeklyData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Stats Summary Bar */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, background: '#18181b', padding: '8px 10px', borderRadius: '8px', border: '1px solid #27272a', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#a1a1aa', textTransform: 'uppercase' }}>Solved This Week</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#4ade80', marginTop: '2px' }}>{weeklyData.total_solved}</div>
                  </div>
                  <div style={{ flex: 1, background: '#18181b', padding: '8px 10px', borderRadius: '8px', border: '1px solid #27272a', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#a1a1aa', textTransform: 'uppercase' }}>Total Attempts</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#60a5fa', marginTop: '2px' }}>{weeklyData.total_attempts}</div>
                  </div>
                </div>

                {/* 1. AI Growth Summary Card */}
                {weeklyData.ai_growth_summary && (
                  <div style={{ background: '#09090b', border: '1px solid #3b82f644', borderLeft: '4px solid #3b82f6', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🤖</span> AI Growth Reflection & Progress
                    </div>
                    <div style={{ fontSize: '12px', color: '#e4e4e7', lineHeight: '1.5' }}>
                      {weeklyData.ai_growth_summary}
                    </div>
                  </div>
                )}

                {/* 2. Core Concepts Mastered */}
                {weeklyData.concepts_learned && weeklyData.concepts_learned.length > 0 && (
                  <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🧠</span> Core Concepts & Patterns Strengthened
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#d4d4d8', lineHeight: '1.5' }}>
                      {weeklyData.concepts_learned.map((c, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. DSA Pattern Spotlight & Trivia */}
                {weeklyData.pattern_spotlight && (
                  <div style={{ background: '#f59e0b11', border: '1px solid #f59e0b44', borderLeft: '4px solid #f59e0b', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>💡</span> Pattern Spotlight & Pro-Tip of the Week
                    </div>
                    <div style={{ fontSize: '12px', color: '#fde68a', lineHeight: '1.5' }}>
                      {weeklyData.pattern_spotlight}
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    className="coach-btn secondary"
                    style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                    onClick={copyWeeklyMarkdown}
                  >
                    {weeklyCopied ? '✓ Copied Markdown!' : '📋 Copy Markdown'}
                  </button>
                  <button
                    className="coach-btn"
                    style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                    onClick={exportWeeklyJournal}
                  >
                    📥 Download .md
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                Couldn’t load your weekly log. Check your connection and try again.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badge Test Submit Confirmation Modal */}
      {showBadgeSubmitConfirm && activeTest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 10, 12, 0.65)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setShowBadgeSubmitConfirm(false)}>
          <div style={{ background: '#0e0e10', border: '1px solid #27272a', borderRadius: '12px', width: '100%', maxWidth: '380px', padding: '18px', color: '#f4f4f5', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '10px', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🏆 Submit Badge Test
              </h3>
              <button aria-label="Close dialog" onClick={() => setShowBadgeSubmitConfirm(false)} style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ fontSize: '12px', color: '#d4d4d8', marginBottom: '12px' }}>
              Ready to submit your <strong>{activeTest.topic} Level {activeTest.level}</strong> test? Review your progress below:
            </div>

            <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ fontWeight: '500', color: '#f4f4f5' }}>1. {activeTest.problem1?.title}</span>
                {activeTest.problem1_solved ? (
                  <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '11px' }}>🟢 Solved</span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '11px' }}>🔴 Unsolved</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ fontWeight: '500', color: '#f4f4f5' }}>2. {activeTest.problem2?.title}</span>
                {activeTest.problem2_solved ? (
                  <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '11px' }}>🟢 Solved</span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '11px' }}>🔴 Unsolved</span>
                )}
              </div>
            </div>

            {(!activeTest.problem1_solved || !activeTest.problem2_solved) ? (
              <div style={{ background: '#451a03', border: '1px solid #92400e', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#fde68a', marginBottom: '14px', lineHeight: '1.4' }}>
                ⚠️ <strong>Unsolved Problems:</strong> You have not solved all problems yet. Submitting now will finalize this attempt. You can click <strong>"Go Back"</strong> to keep solving!
              </div>
            ) : (
              <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#bbf7d0', marginBottom: '14px', lineHeight: '1.4' }}>
                ✨ <strong>All Problems Solved!</strong> Submitting now will evaluate your test and unlock your new badge.
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="abandon-btn"
                style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                onClick={() => setShowBadgeSubmitConfirm(false)}
              >
                ← Go Back
              </button>
              <button
                className="coach-btn"
                style={{ flex: 1, padding: '8px 12px', fontSize: '12px', background: '#22c55e', color: '#09090b', fontWeight: 'bold' }}
                onClick={submitBadgeTest}
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Badge Awarded Result Modal (Refined Developer UI) */}
      {badgeAwardModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 10, 12, 0.65)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setBadgeAwardModal(null)}>
          <div style={{ background: '#0e0e10', border: '1px solid #27272a', borderRadius: '12px', width: '100%', maxWidth: '380px', padding: '20px', color: '#f4f4f5', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.85)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f1f23', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏆</span>
                <span>Badge Test Passed</span>
              </div>
              <button aria-label="Close" onClick={() => setBadgeAwardModal(null)} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            {/* Badge Card */}
            <div style={{ background: '#141417', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', textAlign: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px', lineHeight: '1' }}>
                {getBadgeEmoji(badgeAwardModal?.badge || 'Bronze')}
              </div>
              <div style={{ display: 'inline-block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: '4px', background: badgeAwardModal?.badge === 'Bronze' ? 'rgba(217, 119, 6, 0.15)' : badgeAwardModal?.badge === 'Silver' ? 'rgba(228, 228, 231, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: badgeAwardModal?.badge === 'Bronze' ? '#f59e0b' : badgeAwardModal?.badge === 'Silver' ? '#e4e4e7' : '#fbbf24', border: '1px solid currentColor', marginBottom: '8px' }}>
                Level {badgeAwardModal?.level ?? 1} • {badgeAwardModal?.badge || 'Bronze'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#f4f4f5' }}>
                {badgeAwardModal?.topic || 'Topic'}
              </div>
              <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px', lineHeight: '1.4' }}>
                You solved both test problems and earned the {badgeAwardModal?.badge || 'Bronze'} badge!
              </div>
            </div>

            {/* Stats Row */}
            {badgeAwardModal?.rating ? (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1, background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9.5px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Topic Rating</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#4ade80', marginTop: '2px' }}>+{Math.round(badgeAwardModal.rating)} Elo</div>
                </div>
                <div style={{ flex: 1, background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9.5px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Test Verdict</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#60a5fa', marginTop: '2px' }}>Passed (2/2)</div>
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                className="coach-btn"
                style={{ width: '100%', padding: '8px 14px', fontSize: '11.5px', fontWeight: '600', background: '#18181b', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: '6px', cursor: 'pointer' }}
                onClick={() => {
                  setBadgeAwardModal(null);
                  setActiveTab('mastery');
                  fetchMastery();
                }}
              >
                View in Topic Mastery ➔
              </button>
              <button
                className="abandon-btn"
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#71717a', fontSize: '11px', padding: '6px', cursor: 'pointer' }}
                onClick={() => setBadgeAwardModal(null)}
              >
                Close & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="tutor-footer">
        <span>
          <span className={`status-dot ${backendOnline ? 'online' : backendOnline === false ? 'offline' : ''}`} />
          {backendOnline === null ? 'Connecting…' : backendOnline ? 'Online' : 'Offline'}
        </span>
        {backendOnline && (
          <span style={{ fontSize: '10px', color: '#a1a1aa' }}>
            AI Daily Limit: {aiQuota.limit - aiQuota.used}/{aiQuota.limit} left
          </span>
        )}
        <span className="footer-version">
          <a className="footer-contact" href="mailto:codecoach.work@gmail.com" title="codecoach.work@gmail.com">Contact</a>
          {EXT_VERSION ? <span>· v{EXT_VERSION}</span> : null}
        </span>
      </div>
    </div>
  );
}
