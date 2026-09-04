import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const rootId = 'dsa-tutor-panel-root';
let rootDiv = document.getElementById(rootId);

if (!rootDiv) {
  rootDiv = document.createElement('div');
  rootDiv.id = rootId;
  rootDiv.style.position = 'fixed';
  rootDiv.style.top = '0';
  rootDiv.style.right = '0';
  rootDiv.style.width = '0';
  rootDiv.style.height = '0';
  rootDiv.style.zIndex = '2147483647';
  rootDiv.style.pointerEvents = 'none';
  (document.documentElement || document.body).appendChild(rootDiv);

  const shadowRoot = rootDiv.attachShadow({ mode: 'open' });

  const reactContainer = document.createElement('div');
  reactContainer.id = 'dsa-tutor-react-container';
  reactContainer.style.pointerEvents = 'auto';
  shadowRoot.appendChild(reactContainer);

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('content.css');
  shadowRoot.appendChild(styleLink);

  ReactDOM.createRoot(reactContainer).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

const injectScript = () => {
  const scriptId = 'dsa-tutor-injected-script';
  if (document.getElementById(scriptId)) return;

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = chrome.runtime.getURL('injected.js');
  (document.head || document.documentElement).appendChild(script);
};

injectScript();

const getCodeFromPage = (timeoutMs = 300) => {
  return new Promise((resolve) => {
    let settled = false;
    const onCodeReceived = (event) => {
      if (event.source !== window || !event.data || event.data.type !== 'CODE_VALUE') return;
      window.removeEventListener('message', onCodeReceived);
      if (settled) return;
      settled = true;
      resolve(event.data.code || '');
    };
    window.addEventListener('message', onCodeReceived);
    window.postMessage({ type: 'REQUEST_CODE' }, window.location.origin);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onCodeReceived);
      resolve('');
    }, timeoutMs);
  });
};

const scrapeCurrentLanguage = () => {
  try {
    const langBtn = document.querySelector(
      '[class*="editor-language"] button, [data-mode], [class*="lang-selector"] button, button[aria-haspopup="listbox"]'
    );
    if (langBtn) {
      const txt = (langBtn.getAttribute('data-mode') || langBtn.textContent || '').trim();
      if (txt) return txt;
    }
    const header = document.querySelector('[class*="header"] [class*="right"]');
    if (header) {
      const known = ['C++', 'Java', 'Python', 'Python3', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Ruby', 'C', 'C#', 'Swift', 'Kotlin', 'PHP', 'Scala'];
      const text = header.textContent || '';
      for (const k of known) {
        if (text.includes(k)) return k;
      }
    }
  } catch (e) {
    console.warn('[DSA Tutor Content] Language scrape failed:', e);
  }
  return 'python3';
};

const scrapeConstraints = () => {
  try {
    const headings = Array.from(document.querySelectorAll('p, li, strong, h2, h3, div'));
    let constraintStart = null;
    for (const el of headings) {
      const t = (el.textContent || '').trim();
      if (/^Constraints:?$/i.test(t) && el.getBoundingClientRect().height > 0) {
        constraintStart = el;
        break;
      }
    }
    if (constraintStart) {
      let list = constraintStart.nextElementSibling?.querySelector?.('li')
        ? constraintStart.nextElementSibling
        : null;
      if (!list) {
        list = constraintStart.parentElement;
      }
      const items = list ? list.querySelectorAll('li') : [];
      const out = [];
      items.forEach((li) => {
        const text = (li.textContent || '').trim();
        if (text && (/\d/.test(text) || /<=|>=|<|>/.test(text))) {
          out.push(text);
        }
      });
      if (out.length > 0) return out;
    }
  } catch (e) {
    console.warn('[DSA Tutor Content] Constraints scrape failed:', e);
  }
  return null;
};

const scrapeProblemIdentity = () => {
  const urlMatch = window.location.href.match(/problems\/([^/]+)/);
  const problemId = urlMatch ? urlMatch[1] : 'unknown-problem';
  const docTitle = document.title || '';
  const problemTitle = docTitle.split('-')[0].trim() || problemId;
  return { problemId, problemTitle };
};

let injectedReady = !!window.__dsaTutorInjectedReady;
let pendingReset = false;

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.type === 'DSA_TUTOR_INJECTED_READY') {
    injectedReady = true;
    if (pendingReset) {
      pendingReset = false;
      window.postMessage({ type: 'RESET_EDITOR' }, '*');
    }
  }
});

window.dsaTutor = Object.assign(window.dsaTutor || {}, {
  getCode: getCodeFromPage,
  getLanguage: scrapeCurrentLanguage,
  getConstraints: scrapeConstraints,
  getIdentity: scrapeProblemIdentity,
  resetEditor: () => {
    if (!injectedReady && !window.__dsaTutorInjectedReady) {
      pendingReset = true;
      window.postMessage({ type: 'PING_INJECTED' }, '*');
      window.postMessage({ type: 'RESET_EDITOR' }, '*');
      return;
    }
    window.postMessage({ type: 'RESET_EDITOR' }, '*');
    if (window.__dsaTutorResetEditor) {
      try { window.__dsaTutorResetEditor(); } catch (e) { }
    }
  }
});

let lastTriggerTime = 0;
const processedVerdictNodes = new WeakSet();
const lastDetectedSubmissions = new Map();

const scrapeFailingTestcase = () => {
  let input = '';
  let expected = '';
  let actual = '';

  const allElements = Array.from(document.querySelectorAll('div, span, p'));
  for (const el of allElements) {
    const text = el.textContent?.trim();
    if (text === 'Input' || text === 'Input =') {
      const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
      if (next) input = next.textContent?.trim() || '';
    } else if (text === 'Output' || text === 'Output =' || text === 'Use Result') {
      const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
      if (next) actual = next.textContent?.trim() || '';
    } else if (text === 'Expected' || text === 'Expected =') {
      const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
      if (next) expected = next.textContent?.trim() || '';
    }
  }

  if (input || expected || actual) {
    return [{ input, expected, actual }];
  }
  return null;
};

const FAIRPLAY_PROTECTED_SELECTORS = [
  '[data-e2e-locator="console-result-block"]',
  '[data-e2e-locator="console-result"]',
  '[data-e2e-locator="submission-result"]',
  '[data-layout-path*="console"]',
  '[data-layout-path*="terminal"]',
  '[data-layout-path*="editor"]',
  '.testcase-panel',
  '.result-container',
  '.monaco-editor',
  '.CodeMirror'
];

function isProtectedFromLock(node) {
  if (!node || !(node instanceof HTMLElement)) return false;
  return FAIRPLAY_PROTECTED_SELECTORS.some(sel => !!node.closest?.(sel));
}

let isAnalyzingSubmission = false;
let lastSubmissionKey = null;
let lastSubmissionTime = 0;
const SUBMISSION_COOLDOWN_MS = 8000;

const handleVerdictDetected = (verdict, source = 'dom') => {
  return new Promise((resolve) => {
    const { problemId, problemTitle } = scrapeProblemIdentity();
    console.log(`[DSA Tutor Content] Processing submission verdict: ${verdict} for ${problemId} [source: ${source}]`);
    window.dsaTutor?.setLoading(true);

    if (verdict === 'Accepted') {
      chrome.runtime.sendMessage({
        action: 'analyze_submission',
        payload: {
          problem_id: problemId,
          problem_title: problemTitle,
          code: '',
          language: scrapeCurrentLanguage(),
          verdict: 'Accepted',
          time_taken_seconds: 0,
          hints_used: window.dsaTutor?.hintsUsed || 0
        }
      }, (response) => {
        try {
          if (response && response.success) {
            window.dsaTutor?.setDiagnosis({
              verdict: 'Accepted',
              explanation: 'Submission succeeded! Great job.',
              suggested_action: 'Proceed to your next recommended problem.'
            });
            if (response.data?.badge_test_result && window.dsaTutor?.showBadgeAwardModal) {
              window.dsaTutor.showBadgeAwardModal(response.data.badge_test_result);
            }
          } else {
            window.dsaTutor?.setError(response?.error || 'Failed to record success submission.');
          }
        } finally {
          resolve();
        }
      });
      return;
    }

    (async () => {
      try {
        const code = await getCodeFromPage();
        if (!code) {
          window.dsaTutor?.setError('Failed to retrieve code from Monaco editor: empty code');
          resolve();
          return;
        }

        const testCases = scrapeFailingTestcase();
        let errorDetails = '';
        const errEls = document.querySelectorAll('[class*="compile-error"], [class*="err-msg"]');
        if (errEls.length > 0) {
          errorDetails = Array.from(errEls).map(el => el.textContent?.trim()).join('\n');
        }

        chrome.runtime.sendMessage({
          action: 'analyze_submission',
          payload: {
            problem_id: problemId,
            problem_title: problemTitle,
            code: code,
            language: scrapeCurrentLanguage(),
            verdict: verdict,
            error_details: errorDetails,
            test_cases: testCases,
            hints_used: window.dsaTutor?.hintsUsed || 0
          }
        }, (response) => {
          try {
            if (response && response.success) {
              window.dsaTutor?.setDiagnosis({
                verdict: verdict,
                root_cause_category: response.data.root_cause_category,
                explanation: response.data.explanation,
                suggested_action: response.data.suggested_action
              });
            } else {
              window.dsaTutor?.setError(response?.error || 'Failed to diagnose submission.');
            }
          } finally {
            resolve();
          }
        });
      } catch (err) {
        window.dsaTutor?.setError(err?.message || 'Unexpected diagnosis error');
        resolve();
      }
    })();
  });
};

function tryHandleVerdict(verdict, source = 'dom') {
  const { problemId } = scrapeProblemIdentity();
  const key = `${problemId}:${verdict}`;
  const now = Date.now();

  if (isAnalyzingSubmission) {
    console.log(`[DSA Tutor Content] Ignored duplicate ${verdict} from ${source}: analysis already in-flight.`);
    return false;
  }

  if (key === lastSubmissionKey && (now - lastSubmissionTime) < SUBMISSION_COOLDOWN_MS) {
    console.log(`[DSA Tutor Content] Ignored ${verdict} from ${source}: within cooldown (${now - lastSubmissionTime}ms).`);
    return false;
  }

  isAnalyzingSubmission = true;
  lastSubmissionKey = key;
  lastSubmissionTime = now;
  lastSubmitClickTimestamp = 0;
  recentSubmitAt = 0;

  handleVerdictDetected(verdict, source).finally(() => {
    isAnalyzingSubmission = false;
  });

  return true;
}

let lastSubmitClickTimestamp = 0;
let recentSubmitAt = 0;
const SUBMIT_GRACE_MS = 15000;

function markSubmitIntent() {
  recentSubmitAt = Date.now();
  lastSubmitClickTimestamp = Date.now();
}

function isWithinSubmitGrace() {
  return Date.now() - recentSubmitAt < SUBMIT_GRACE_MS;
}

let lastRedirectAt = 0;
const REDIRECT_COOLDOWN_MS = 2000;

function safeRedirect(path) {
  const now = Date.now();
  if (now - lastRedirectAt < REDIRECT_COOLDOWN_MS) return;
  lastRedirectAt = now;
  window.location.replace(path);
}

document.addEventListener('click', (e) => {
  const btn = e.target ? e.target.closest('button, [data-e2e-locator="console-submit-button"], [data-cypress="submit-code-btn"]') : null;
  if (!btn) return;
  const txt = (btn.textContent || '').trim().toLowerCase();
  const locator = (btn.getAttribute('data-e2e-locator') || '').toLowerCase();
  const testId = (btn.getAttribute('data-testid') || '').toLowerCase();

  const isSubmitBtn = (
    locator.includes('submit') ||
    testId.includes('submit') ||
    txt === 'submit' ||
    txt === 'submit code' ||
    (txt.includes('submit') && !txt.includes('run'))
  );

  if (isSubmitBtn) {
    markSubmitIntent();
  }
}, true);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    markSubmitIntent();
  }
}, true);

let lastHref = window.location.href;
const checkUrlChange = () => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    recentSubmitAt = 0;
    lastSubmitClickTimestamp = 0;
    window.dispatchEvent(new CustomEvent('dsa-tutor-url-change', { detail: { url: lastHref } }));
  }
};
window.addEventListener('popstate', checkUrlChange);
window.addEventListener('hashchange', checkUrlChange);
setInterval(checkUrlChange, 1000);

// Channel 1: Primary Network Interception Message Listener
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'LEETCODE_SUBMISSION_RESULT') {
    const verdict = event.data.verdict;
    if (verdict) {
      tryHandleVerdict(verdict, 'network');
    }
  }
  if (event.data && event.data.type === 'LEETCODE_SUBMIT_INITIATED') {
    markSubmitIntent(); // still gates the DOM-observer channel below
  }
});

// Channel 2: DOM Mutation Observer
const checkNodeForVerdict = (node) => {
  if (!node || !(node instanceof HTMLElement)) return;
  if (isProtectedFromLock(node)) return;
  if (processedVerdictNodes.has(node) || node.dataset?.dsaProcessed === "true") return;

  const text = node.textContent?.trim() || '';
  if (!text) return;

  const verdicts = ['Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compile Error', 'Memory Limit Exceeded'];
  for (const v of verdicts) {
    if (text === v || (text.includes(v) && text.length < 40)) {
      const isRunSampleOnly = !!node.closest(
        '[data-e2e-locator="console-result"], [data-layout-path*="testcase"], [class*="run-code"], [class*="run-result"], [class*="testcase-result"]'
      );
      if (isRunSampleOnly) return;
      if (!isWithinSubmitGrace()) return;

      // If network channel recently caught this submission, silently drop redundant DOM hits
      const timeSinceLastNetworkHit = Date.now() - lastSubmissionTime;
      if (lastSubmissionKey && timeSinceLastNetworkHit < 3000) {
        return;
      }

      processedVerdictNodes.add(node);
      try { node.dataset.dsaProcessed = "true"; } catch (e) { }

      tryHandleVerdict(v, 'dom');
      break;
    }
  }
};

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length === 0) continue;
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        checkNodeForVerdict(node);
        const childVerdicts = node.querySelectorAll && node.querySelectorAll('*');
        if (childVerdicts) {
          for (const cv of childVerdicts) {
            checkNodeForVerdict(cv);
          }
        }
      }
    }
  }
});

const injectDirectLockCSS = (isLocked) => {
  let styleEl = document.getElementById('dsa-tutor-fairplay-css');
  if (isLocked) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dsa-tutor-fairplay-css';
      styleEl.textContent = `
        a[href*="/solution"], a[href*="/solutions"], a[href*="/editorial"], a[href*="/editorials"], a[href*="/discussion"], a[href*="/discussions"], a[href*="/comments"], a[href*="/community"], a[href*="/submissions"], a[href*="/submission"],
        div[data-layout-path*="solution"], div[data-layout-path*="solutions"], div[data-layout-path*="editorial"], div[data-layout-path*="editorials"], div[data-layout-path*="discussion"], div[data-layout-path*="discussions"], div[data-layout-path*="community"], div[data-layout-path*="submission"], div[data-layout-path*="submissions"],
        [data-track-load*="discussion"], [data-track-load*="discussions"], [data-track-load*="solution"], [data-track-load*="solutions"], [data-track-load*="editorial"], [data-track-load*="editorials"], [data-track-load*="submission"], [data-track-load*="submissions"],
        [data-key*="solution"], [data-key*="solutions"], [data-key*="editorial"], [data-key*="editorials"], [data-key*="discussion"], [data-key*="discussions"], [data-key*="submission"], [data-key*="submissions"],
        div[class*="hint-"], details[class*="hint"], div[class*="Hint"],
        div[class*="discussion-"], div[class*="discussions-"], div[class*="comment-"], div[class*="comments-"],
        div[class*="past-submissions"], div[class*="submissions-list"], div[class*="submission-list"],
        div[class*="submission-detail"]:not([data-e2e-locator="submission-result"]):not(.testcase-panel):not(.result-container),
        section[class*="discussion"], section[class*="comment"], section[class*="community"],
        section[class*="submission"]:not([data-e2e-locator="submission-result"]),
        section[class*="submissions"]:not([data-e2e-locator="submission-result"]) {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
        }
      `;
      (document.head || document.documentElement).appendChild(styleEl);
    }
  } else if (styleEl) {
    styleEl.remove();
  }
};

let directAssessmentLocked = false;
let directAssessmentReason = '';

const isForbiddenDOMElement = (el) => {
  if (!el || el === document.body) return false;
  if (isProtectedFromLock(el)) return false;
  if (el.closest && el.closest('#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container, .monaco-editor, .CodeMirror, [data-layout-path*="editor"], [data-layout-path*="console"], [data-layout-path*="terminal"], [data-e2e-locator*="console"], [data-e2e-locator*="submission-result"], [class*="result"], [class*="verdict"], [class*="status"], [class*="testcase"]')) {
    return false;
  }

  let curr = el;
  let depth = 0;
  while (curr && curr !== document.body && depth < 8) {
    if (curr.id && (curr.id.startsWith('dsa-tutor') || curr.id.includes('dsa-tutor'))) return false;

    const text = (curr.textContent || '').trim().toLowerCase();
    const href = (curr.getAttribute ? curr.getAttribute('href') || '' : '').toLowerCase();
    const dataPath = (curr.getAttribute ? curr.getAttribute('data-layout-path') || '' : '').toLowerCase();
    const dataKey = (curr.getAttribute ? curr.getAttribute('data-key') || '' : '').toLowerCase();
    const dataTrack = (curr.getAttribute ? curr.getAttribute('data-track-load') || '' : '').toLowerCase();
    const ariaLabel = (curr.getAttribute ? curr.getAttribute('aria-label') || '' : '').toLowerCase();
    const title = (curr.getAttribute ? curr.getAttribute('title') || '' : '').toLowerCase();
    const idStr = (curr.id || '').toLowerCase();
    const role = (curr.getAttribute ? curr.getAttribute('role') || '' : '').toLowerCase();
    const cls = (curr.className && typeof curr.className === 'string' ? curr.className : '').toLowerCase();

    const isSubmitActionBtn = (
      curr.getAttribute?.('data-e2e-locator') === 'console-submit-button' ||
      curr.getAttribute?.('data-cypress') === 'submit-code-btn' ||
      text === 'submit' ||
      text === 'submit code' ||
      ((ariaLabel === 'submit' || title === 'submit') && (curr.tagName === 'BUTTON' || role === 'button'))
    );
    if (isSubmitActionBtn) {
      return false;
    }

    if (
      href.includes('/editorial') || href.includes('/solution') || href.includes('/solutions') ||
      href.includes('/discussion') || href.includes('/discussions') || href.includes('/community') ||
      href.includes('/comments') || href.includes('/submissions') || href.includes('/submission') ||
      dataPath.includes('editorial') || dataPath.includes('solution') || dataPath.includes('discussion') ||
      dataPath.includes('community') || dataPath.includes('submission') ||
      dataKey.includes('editorial') || dataKey.includes('solution') || dataKey.includes('discussion') ||
      dataKey.includes('community') || dataKey.includes('submission') ||
      dataTrack.includes('editorial') || dataTrack.includes('solution') || dataTrack.includes('discussion') ||
      dataTrack.includes('submission') ||
      (ariaLabel.includes('solution') && !ariaLabel.includes('submit')) ||
      ariaLabel.includes('editorial') || ariaLabel.includes('discussion') ||
      ariaLabel.includes('community') || ariaLabel.includes('comment') ||
      ariaLabel.includes('past submission') || (ariaLabel.includes('submission') && !ariaLabel.includes('submit')) ||
      (title.includes('solution') && !title.includes('submit')) ||
      title.includes('editorial') || title.includes('discussion') ||
      (title.includes('submission') && !title.includes('submit')) ||
      idStr.includes('editorial') || idStr.includes('discussion') || idStr.includes('submission') ||
      cls.includes('editorial') || cls.includes('solution') || cls.includes('discussion') ||
      cls.includes('submissions-list') || cls.includes('submission-list') || cls.includes('past-submissions') ||
      cls.includes('submission-detail')
    ) {
      return true;
    }

    if (
      curr.tagName === 'A' || curr.tagName === 'BUTTON' || role === 'tab' ||
      cls.includes('tab') || cls.includes('nav') || cls.includes('btn') || dataPath || dataKey
    ) {
      if (
        text === 'editorial' || text.startsWith('editorial') ||
        text === 'solutions' || text === 'solution' || text.startsWith('solutions') ||
        text === 'discussion' || text === 'discussions' || text.startsWith('discussion') ||
        text === 'submissions' || text === 'submission' || text.startsWith('submission') ||
        text === 'past submissions' || text === 'submission history' ||
        text === 'community' || text === 'comments'
      ) {
        return true;
      }
    }

    curr = curr.parentElement;
    depth++;
  }

  return false;
};

const applyDirectTabLocking = (locked, reason = 'Assessment Mode') => {
  directAssessmentLocked = !!locked;
  directAssessmentReason = reason || '';
  injectDirectLockCSS(locked);

  if (locked) {
    const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"], [data-layout-path], [data-key], [data-track-load], div[class*="tab"], div[class*="nav"], li'));
    tabs.forEach(el => {
      if (el.closest('#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container')) return;
      if (isForbiddenDOMElement(el)) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('width', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        el.setAttribute('data-dsa-tab-locked', 'true');
      }
    });
  } else {
    document.querySelectorAll('[data-dsa-tab-locked="true"]').forEach(el => {
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      el.style.removeProperty('pointer-events');
      el.style.removeProperty('opacity');
      el.style.removeProperty('height');
      el.style.removeProperty('width');
      el.style.removeProperty('overflow');
      el.removeAttribute('data-dsa-tab-locked');
    });
  }
};

document.addEventListener('click', (e) => {
  if (!directAssessmentLocked) return;

  const path = e.composedPath ? e.composedPath() : [];
  for (const el of path) {
    if (el && el.id && (el.id === 'dsa-tutor-panel-root' || el.id === 'dsa-tutor-react-container' || el.id === 'dsa-tutor-panel-container')) {
      return;
    }
  }

  if (isForbiddenDOMElement(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    applyDirectTabLocking(true, directAssessmentReason);
    return false;
  }
}, true);

window.dsaTutor = window.dsaTutor || {};
window.dsaTutor.getCode = getCodeFromPage;
window.dsaTutor.getLanguage = scrapeCurrentLanguage;
window.dsaTutor.getConstraints = scrapeConstraints;
window.dsaTutor.getIdentity = scrapeProblemIdentity;
window.dsaTutor.setEditorReadOnly = (readOnly) => {
  window.postMessage({ type: 'SET_READ_ONLY', readOnly }, '*');
};
window.dsaTutor.setAssessmentLocked = (locked, reason) => {
  applyDirectTabLocking(locked, reason);
  window.postMessage({ type: 'SET_ASSESSMENT_LOCKED', locked, reason }, '*');
};

observer.observe(document.body, { childList: true, subtree: true });
console.log('[DSA Tutor Content] DOM observer and overlay UI initialized.');

const injectSpacedRepetitionReminder = () => {
  try {
    const isDismissedSession = sessionStorage.getItem('dsa_tutor_spaced_reminder_dismissed') === 'true';
    const todayStr = new Date().toISOString().split('T')[0];
    const isDismissedToday = localStorage.getItem('dsa_tutor_spaced_reminder_dismissed_date') === todayStr;
    if (isDismissedSession || isDismissedToday) return;
  } catch (e) {}

  chrome.runtime.sendMessage({ action: 'get_recommendation' }, (res) => {
    if (res && res.success && res.data && res.data.reviews && res.data.reviews.length > 0) {
      const dueReviews = res.data.reviews;

      if (document.getElementById('dsa-tutor-spaced-reminder')) return;

      const reminderDiv = document.createElement('div');
      reminderDiv.id = 'dsa-tutor-spaced-reminder';

      Object.assign(reminderDiv.style, {
        position: 'fixed',
        bottom: '24px',
        left: '24px',
        width: '340px',
        backgroundColor: '#121214',
        border: '1px solid #27272a',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        zIndex: '999999',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#f4f4f5',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      });

      const headerDiv = document.createElement('div');
      Object.assign(headerDiv.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #27272a',
        paddingBottom: '10px'
      });

      const titleSpan = document.createElement('span');
      titleSpan.innerHTML = '<span style="color: #60a5fa; margin-right: 6px;">⏰</span><strong>Spaced Repetition Due</strong>';
      titleSpan.style.fontSize = '13px';
      titleSpan.style.fontWeight = '600';
      titleSpan.style.color = '#f4f4f5';
      titleSpan.style.display = 'flex';
      titleSpan.style.alignItems = 'center';

      const closeBtn = document.createElement('button');
      closeBtn.innerText = '✕';
      Object.assign(closeBtn.style, {
        background: 'transparent',
        border: 'none',
        color: '#71717a',
        cursor: 'pointer',
        fontSize: '14px',
        padding: '2px 6px',
        borderRadius: '4px'
      });
      closeBtn.onmouseenter = () => { closeBtn.style.color = '#f4f4f5'; };
      closeBtn.onmouseleave = () => { closeBtn.style.color = '#71717a'; };
      closeBtn.onclick = () => {
        try {
          sessionStorage.setItem('dsa_tutor_spaced_reminder_dismissed', 'true');
          localStorage.setItem('dsa_tutor_spaced_reminder_dismissed_date', new Date().toISOString().split('T')[0]);
        } catch (e) {}
        reminderDiv.remove();
      };

      headerDiv.appendChild(titleSpan);
      headerDiv.appendChild(closeBtn);
      reminderDiv.appendChild(headerDiv);

      const descDiv = document.createElement('div');
      descDiv.innerText = 'Strengthen your memory retention with today\'s prioritized reviews:';
      Object.assign(descDiv.style, {
        fontSize: '11.5px',
        color: '#a1a1aa',
        lineHeight: '1.4'
      });
      reminderDiv.appendChild(descDiv);

      const listContainer = document.createElement('div');
      Object.assign(listContainer.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: '190px',
        overflowY: 'auto'
      });

      dueReviews.forEach((rev) => {
        const itemA = document.createElement('a');
        itemA.href = rev.url;
        itemA.target = '_top';
        Object.assign(itemA.style, {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '8px',
          textDecoration: 'none',
          color: '#f4f4f5',
          fontSize: '12px',
          transition: 'all 0.15s ease'
        });

        itemA.onmouseenter = () => {
          itemA.style.borderColor = '#3b82f6';
          itemA.style.backgroundColor = '#1c1c21';
          itemA.style.transform = 'translateY(-1px)';
        };
        itemA.onmouseleave = () => {
          itemA.style.borderColor = '#27272a';
          itemA.style.backgroundColor = '#18181b';
          itemA.style.transform = 'none';
        };

        const titleCol = document.createElement('div');
        Object.assign(titleCol.style, {
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflow: 'hidden',
          maxWidth: '190px'
        });

        const textSpan = document.createElement('span');
        textSpan.innerText = rev.title;
        textSpan.style.fontWeight = '600';
        textSpan.style.fontSize = '12px';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.color = '#f4f4f5';

        const stageSpan = document.createElement('span');
        stageSpan.innerText = `Stage ${rev.stage || 1} • Due`;
        stageSpan.style.fontSize = '9.5px';
        stageSpan.style.color = '#a1a1aa';

        titleCol.appendChild(textSpan);
        titleCol.appendChild(stageSpan);

        const diffSpan = document.createElement('span');
        diffSpan.innerText = rev.difficulty;
        Object.assign(diffSpan.style, {
          fontSize: '9px',
          fontWeight: '700',
          padding: '2px 6px',
          borderRadius: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        });

        if (rev.difficulty.toLowerCase() === 'easy') {
          diffSpan.style.color = '#4ade80';
          diffSpan.style.backgroundColor = 'rgba(74, 222, 128, 0.12)';
          diffSpan.style.border = '1px solid rgba(74, 222, 128, 0.25)';
        } else if (rev.difficulty.toLowerCase() === 'medium') {
          diffSpan.style.color = '#fbbf24';
          diffSpan.style.backgroundColor = 'rgba(251, 191, 36, 0.12)';
          diffSpan.style.border = '1px solid rgba(251, 191, 36, 0.25)';
        } else {
          diffSpan.style.color = '#f87171';
          diffSpan.style.backgroundColor = 'rgba(248, 113, 113, 0.12)';
          diffSpan.style.border = '1px solid rgba(248, 113, 113, 0.25)';
        }

        itemA.appendChild(titleCol);
        itemA.appendChild(diffSpan);
        listContainer.appendChild(itemA);
      });

      reminderDiv.appendChild(listContainer);
      document.body.appendChild(reminderDiv);
    }
  });
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  injectSpacedRepetitionReminder();
} else {
  window.addEventListener('DOMContentLoaded', injectSpacedRepetitionReminder);
}