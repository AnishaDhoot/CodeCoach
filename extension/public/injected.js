(function () {
  window.__dsaTutorLastActionWasSubmit = false;

  const classifyAndTrack = (url) => {
    const u = (typeof url === 'string' ? url : url?.url || '').toLowerCase();

    // Poll/check requests are not a new action — ignore them for classification
    if (u.includes('/check/')) return;

    if (u.includes('/interpret_solution/') || u.includes('/interpret/')) {
      window.__dsaTutorLastActionWasSubmit = false;
    } else if (/\/problems\/[^/]+\/submit\/?$/.test(u)) {
      window.__dsaTutorLastActionWasSubmit = true;
      window.postMessage({ type: 'LEETCODE_SUBMIT_INITIATED' }, '*');
    }
  };

  const postVerdictIfSubmit = (statusMsg) => {
    if (!statusMsg || !window.__dsaTutorLastActionWasSubmit) return;
    window.postMessage({
      type: 'LEETCODE_SUBMISSION_RESULT',
      verdict: statusMsg === 'Accepted' ? 'Accepted' : statusMsg
    }, '*');
  };

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url || '');
      classifyAndTrack(url);
      const response = await origFetch.apply(this, args);
      try {
        const lower = url.toLowerCase();
        if (lower.includes('/submissions/') || lower.includes('/check/') || lower.includes('/graphql')) {
          const clone = response.clone();
          clone.json().then(data => {
            if (!data) return;
            const statusMsg = data.status_msg || data.data?.submissionDetail?.statusDisplay || data.data?.submissionStatus?.statusDisplay;
            postVerdictIfSubmit(statusMsg);
          }).catch(() => { });
        }
      } catch (e) { }
      return response;
    };
  }

  const origXHR = window.XMLHttpRequest;
  if (origXHR && origXHR.prototype) {
    const origOpen = origXHR.prototype.open;
    const origSend = origXHR.prototype.send;
    origXHR.prototype.open = function (method, url) {
      this._url = url;
      classifyAndTrack(url);
      return origOpen.apply(this, arguments);
    };
    origXHR.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          const url = (this._url || '').toLowerCase();
          if (url.includes('/submissions/') || url.includes('/check/') || url.includes('/graphql')) {
            const data = JSON.parse(this.responseText);
            const statusMsg = data?.status_msg || data?.data?.submissionDetail?.statusDisplay || data?.data?.submissionStatus?.statusDisplay;
            postVerdictIfSubmit(statusMsg);
          }
        } catch (e) { }
      });
      return origSend.apply(this, arguments);
    };
  }
})();

const applyReadOnlyState = (isReadOnly) => {
  window.__dsaTutorReadOnly = !!isReadOnly;

  try {
    if (window.monaco && window.monaco.editor) {
      const editors = window.monaco.editor.getEditors();
      if (editors && editors.length > 0) {
        editors.forEach((editor) => {
          editor.updateOptions({ readOnly: !!isReadOnly });
        });
      }
    }
  } catch (e) {
    console.warn("[DSA Tutor Injected] Error updating Monaco readOnly:", e);
  }

  try {
    const editorEl = document.querySelector(".monaco-editor, .CodeMirror, [class*='editor-container'], [class*='editor'], [data-mode-id], div[class*='monaco']");
    let lockOverlay = document.getElementById("dsa-tutor-editor-lock-overlay");

    if (isReadOnly) {
      if (editorEl) {
        if (!lockOverlay || !editorEl.contains(lockOverlay)) {
          if (lockOverlay) lockOverlay.remove();
          lockOverlay = document.createElement("div");
          lockOverlay.id = "dsa-tutor-editor-lock-overlay";
          Object.assign(lockOverlay.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(14, 14, 16, 0.85)",
            backdropFilter: "blur(4px)",
            webkitBackdropFilter: "blur(4px)",
            zIndex: "9999",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#f4f4f5",
            fontFamily: "'Inter', -apple-system, sans-serif",
            pointerEvents: "all",
            cursor: "not-allowed"
          });
          lockOverlay.innerHTML = `
            <div style="background: #18181b; border: 1px solid #27272a; padding: 18px 24px; border-radius: 10px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6); text-align: center; max-width: 320px;">
              <div style="font-size: 22px; margin-bottom: 6px;">🔒</div>
              <div style="font-size: 14px; font-weight: 700; color: #fbbf24; margin-bottom: 6px;">Assessment Gated</div>
              <div style="font-size: 11px; color: #a1a1aa; line-height: 1.4;">Complete the active assessment in CodeCoach to unlock.</div>
            </div>
          `;
          const currentPos = getComputedStyle(editorEl).position;
          if (currentPos === "static") {
            editorEl.style.position = "relative";
          }
          editorEl.appendChild(lockOverlay);
        }
      }
    } else {
      if (lockOverlay) {
        lockOverlay.remove();
      }
    }
  } catch (e) {
    console.warn("[DSA Tutor Injected] Error setting DOM lock overlay:", e);
  }
};

window.__dsaTutorInitialCodeByUri = window.__dsaTutorInitialCodeByUri || new Map();

const captureInitialCodeForModel = (model) => {
  try {
    if (!model || !model.uri) return;
    const key = model.uri.toString();
    if (!window.__dsaTutorInitialCodeByUri.has(key)) {
      window.__dsaTutorInitialCodeByUri.set(key, model.getValue());
    }
  } catch (e) { }
};

const getActiveCodeModel = () => {
  const editors = window.monaco?.editor?.getEditors() || [];
  const candidates = [];

  for (const editor of editors) {
    const model = editor.getModel && editor.getModel();
    if (!model || !model.uri) continue;
    candidates.push({ editor, model });
  }

  console.log('[DSA Tutor Injected] getActiveCodeModel candidates:', candidates.map(c => c.model.uri.toString()));

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].model;

  let best = null;
  let bestArea = -1;
  for (const c of candidates) {
    try {
      const dom = c.editor.getDomNode ? c.editor.getDomNode() : null;
      if (!dom) continue;
      const rect = dom.getBoundingClientRect();
      const area = rect.width * rect.height;
      console.log('[DSA Tutor Injected] candidate area:', c.model.uri.toString(), area);
      if (area > bestArea) {
        bestArea = area;
        best = c.model;
      }
    } catch (e) { }
  }

  if (best) return best;
  return candidates[0].model;
};

const initMonacoListeners = () => {
  if (window.monaco && window.monaco.editor) {
    (window.monaco.editor.getModels() || []).forEach(captureInitialCodeForModel);

    window.monaco.editor.onDidCreateModel((model) => {
      captureInitialCodeForModel(model);
    });

    window.monaco.editor.onDidCreateEditor((editor) => {
      if (window.__dsaTutorReadOnly) {
        editor.updateOptions({ readOnly: true });
      }
    });

    applyReadOnlyState(window.__dsaTutorReadOnly);
  }
};

const pollInterval = setInterval(() => {
  if (window.monaco && window.monaco.editor) {
    initMonacoListeners();
    clearInterval(pollInterval);
  }
}, 200);

window.__dsaTutorAssessmentLocked = false;
window.__dsaTutorLockReason = "";

let recentSubmitAt = 0;
const SUBMIT_GRACE_MS = 15000;

function markSubmitIntent() {
  recentSubmitAt = Date.now();
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

const injectLockCSS = (isLocked) => {
  let styleEl = document.getElementById("dsa-tutor-fairplay-css");
  if (isLocked) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dsa-tutor-fairplay-css";
      styleEl.textContent = `
        a[href*="/solution"], a[href*="/solutions"], a[href*="/editorial"], a[href*="/editorials"], a[href*="/discussion"], a[href*="/discussions"], a[href*="/comments"], a[href*="/community"], a[href*="/submissions"], a[href*="/submission"],
        div[data-layout-path*="solution"], div[data-layout-path*="solutions"], div[data-layout-path*="editorial"], div[data-layout-path*="editorials"], div[data-layout-path*="discussion"], div[data-layout-path*="discussions"], div[data-layout-path*="community"],
        [data-track-load*="discussion"], [data-track-load*="discussions"], [data-track-load*="solution"], [data-track-load*="solutions"], [data-track-load*="editorial"], [data-track-load*="editorials"],
        [data-key*="solution"], [data-key*="solutions"], [data-key*="editorial"], [data-key*="editorials"], [data-key*="discussion"], [data-key*="discussions"],
        div[class*="hint-"], details[class*="hint"], div[class*="Hint"],
        div[class*="discussion-"], div[class*="discussions-"], div[class*="comment-"], div[class*="comments-"],
        div[class*="submissions-list"], div[class*="submission-list"], div[class*="past-submissions"],
        div[class*="submission-detail"]:not([data-e2e-locator="submission-result"]):not(.testcase-panel):not(.result-container),
        section[class*="discussion"], section[class*="comment"], section[class*="community"],
        section[class*="submission"]:not([data-e2e-locator="submission-result"]) {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  } else {
    if (styleEl) {
      styleEl.remove();
    }
  }
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

const isForbiddenElement = (el) => {
  if (!el || el === document.body) return false;
  if (isProtectedFromLock(el)) return false;
  if (el.closest && el.closest("#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container, .monaco-editor, .CodeMirror, [data-layout-path*='editor'], [data-layout-path*='console'], [data-layout-path*='terminal'], [data-e2e-locator*='console'], [data-e2e-locator*='submission-result'], [class*='result'], [class*='verdict'], [class*='status'], [class*='testcase']")) {
    return false;
  }

  let curr = el;
  let depth = 0;
  while (curr && curr !== document.body && depth < 8) {
    if (curr.id && (curr.id.startsWith("dsa-tutor") || curr.id.includes("dsa-tutor"))) return false;

    const text = (curr.textContent || "").trim().toLowerCase();
    const href = (curr.getAttribute ? curr.getAttribute("href") || "" : "").toLowerCase();
    const dataPath = (curr.getAttribute ? curr.getAttribute("data-layout-path") || "" : "").toLowerCase();
    const dataKey = (curr.getAttribute ? curr.getAttribute("data-key") || "" : "").toLowerCase();
    const dataTrack = (curr.getAttribute ? curr.getAttribute("data-track-load") || "" : "").toLowerCase();
    const ariaLabel = (curr.getAttribute ? curr.getAttribute("aria-label") || "" : "").toLowerCase();
    const title = (curr.getAttribute ? curr.getAttribute("title") || "" : "").toLowerCase();
    const idStr = (curr.id || "").toLowerCase();
    const role = (curr.getAttribute ? curr.getAttribute("role") || "" : "").toLowerCase();
    const cls = (curr.className && typeof curr.className === "string" ? curr.className : "").toLowerCase();

    const isSubmitActionBtn = (
      curr.getAttribute?.("data-e2e-locator") === "console-submit-button" ||
      curr.getAttribute?.("data-cypress") === "submit-code-btn" ||
      text === "submit" ||
      text === "submit code" ||
      ((ariaLabel === "submit" || title === "submit") && (curr.tagName === "BUTTON" || role === "button"))
    );
    if (isSubmitActionBtn) {
      return false;
    }

    if (
      href.includes("/editorial") || href.includes("/solution") || href.includes("/solutions") ||
      href.includes("/discussion") || href.includes("/discussions") || href.includes("/community") ||
      href.includes("/comments") || href.includes("/submissions") || href.includes("/submission") ||
      dataPath.includes("editorial") || dataPath.includes("solution") || dataPath.includes("discussion") ||
      dataPath.includes("community") || dataPath.includes("submission") ||
      dataKey.includes("editorial") || dataKey.includes("solution") || dataKey.includes("discussion") ||
      dataKey.includes("community") || dataKey.includes("submission") ||
      dataTrack.includes("editorial") || dataTrack.includes("solution") || dataTrack.includes("discussion") ||
      dataTrack.includes("submission") ||
      (ariaLabel.includes("solution") && !ariaLabel.includes("submit")) ||
      ariaLabel.includes("editorial") || ariaLabel.includes("discussion") ||
      ariaLabel.includes("community") || ariaLabel.includes("comment") ||
      ariaLabel.includes("past submission") || (ariaLabel.includes("submission") && !ariaLabel.includes("submit")) ||
      (title.includes("solution") && !title.includes("submit")) ||
      title.includes("editorial") || title.includes("discussion") ||
      (title.includes("submission") && !title.includes("submit")) ||
      idStr.includes("editorial") || idStr.includes("discussion") || idStr.includes("submission") ||
      cls.includes("editorial") || cls.includes("solution") || cls.includes("discussion") ||
      cls.includes("submissions-list") || cls.includes("submission-list") || cls.includes("past-submissions") ||
      cls.includes("submission-detail")
    ) {
      return true;
    }

    if (
      curr.tagName === "A" || curr.tagName === "BUTTON" || role === "tab" ||
      cls.includes("tab") || cls.includes("nav") || cls.includes("btn") || dataPath || dataKey
    ) {
      if (
        text === "editorial" || text.startsWith("editorial") ||
        text === "solutions" || text === "solution" || text.startsWith("solutions") ||
        text === "discussion" || text === "discussions" || text.startsWith("discussion") ||
        text === "submissions" || text === "submission" || text.startsWith("submission") ||
        text === "past submissions" || text === "submission history" ||
        text === "community" || text === "comments"
      ) {
        return true;
      }
    }

    curr = curr.parentElement;
    depth++;
  }

  return false;
};

const applyAssessmentTabLocking = (isLocked, reason = "Assessment Mode") => {
  window.__dsaTutorAssessmentLocked = !!isLocked;
  window.__dsaTutorLockReason = reason || "";
  injectLockCSS(isLocked);

  try {
    let lockOverlay = document.getElementById("dsa-tutor-tab-lock-overlay");

    if (isLocked) {
      const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"], [data-layout-path], [data-key], [data-track-load], div[class*="tab"], div[class*="nav"], li'));
      tabs.forEach(el => {
        if (el.closest("#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container")) return;

        if (isForbiddenElement(el)) {
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("pointer-events", "none", "important");
          el.style.setProperty("opacity", "0", "important");
          el.style.setProperty("height", "0", "important");
          el.style.setProperty("width", "0", "important");
          el.style.setProperty("overflow", "hidden", "important");
          el.setAttribute("data-dsa-tab-locked", "true");
        }
      });

      const panelContainer = document.querySelector(
        "div[data-layout-path*='editorial'], div[data-layout-path*='solution'], div[data-layout-path*='solutions'], div[data-layout-path*='discussion'], div[data-layout-path*='discussions']"
      );

      const currentPath = window.location.pathname.toLowerCase();
      const isForbiddenRoute = /\/(editorial|solutions?|discuss(ion)?s?|submissions)(\/|$)/.test(currentPath);

      if ((isForbiddenRoute || panelContainer) && !document.getElementById("dsa-tutor-tab-lock-overlay")) {
        const mountTarget = panelContainer || document.querySelector(".elfjS, [data-track-load='description_content']")?.parentElement || document.body;
        if (mountTarget && mountTarget !== document.body) {
          lockOverlay = document.createElement("div");
          lockOverlay.id = "dsa-tutor-tab-lock-overlay";
          Object.assign(lockOverlay.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(14, 14, 16, 0.96)",
            backdropFilter: "blur(6px)",
            webkitBackdropFilter: "blur(6px)",
            zIndex: "99999",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#f4f4f5",
            fontFamily: "'Inter', -apple-system, sans-serif",
            pointerEvents: "all"
          });
          lockOverlay.innerHTML = `
            <div style="background: #18181b; border: 1px solid #27272a; padding: 24px 32px; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); text-align: center; max-width: 360px;">
              <div style="font-size: 32px; margin-bottom: 8px;">🔒</div>
              <div style="font-size: 15px; font-weight: 700; color: #ef4444; margin-bottom: 8px;">Solutions, Editorial, Discussion & Submissions Locked</div>
              <div style="font-size: 12px; color: #a1a1aa; line-height: 1.5;">
                Access to official solutions, editorials, community discussions, and past submissions is disabled during <strong>${reason}</strong> to maintain test integrity.
              </div>
            </div>
          `;
          if (getComputedStyle(mountTarget).position === "static") {
            mountTarget.style.position = "relative";
          }
          mountTarget.appendChild(lockOverlay);
        }
      } else if (!isForbiddenRoute && !panelContainer) {
        if (lockOverlay) lockOverlay.remove();
      }
    } else {
      if (lockOverlay) lockOverlay.remove();

      document.querySelectorAll('[data-dsa-tab-locked="true"]').forEach(el => {
        el.style.removeProperty("display");
        el.style.removeProperty("visibility");
        el.style.removeProperty("pointer-events");
        el.style.removeProperty("opacity");
        el.style.removeProperty("height");
        el.style.removeProperty("width");
        el.style.removeProperty("overflow");
        el.removeAttribute("data-dsa-tab-locked");
      });
    }
  } catch (e) {
    console.warn("[DSA Tutor Injected] Error applying tab locking:", e);
  }
};

document.addEventListener("click", (e) => {
  if (!window.__dsaTutorAssessmentLocked) return;

  const path = e.composedPath ? e.composedPath() : [];
  for (const el of path) {
    if (el && el.id && (el.id === "dsa-tutor-panel-root" || el.id === "dsa-tutor-react-container" || el.id === "dsa-tutor-panel-container")) {
      return;
    }
  }

  if (isForbiddenElement(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    applyAssessmentTabLocking(true, window.__dsaTutorLockReason);
    return false;
  }
}, true);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data && event.data.type === "REQUEST_CODE") {
    try {
      let code = "";
      const bestModel = getActiveCodeModel();
      if (bestModel) {
        code = bestModel.getValue();
      }

      if (!code) {
        const viewLines = document.querySelectorAll(".view-lines .view-line");
        if (viewLines.length > 0) {
          code = Array.from(viewLines).map(el => el.textContent || "").join("\n");
        } else {
          const area = document.querySelector("textarea.inputarea, .CodeMirror");
          if (area) code = area.value || area.textContent || "";
        }
      }

      window.postMessage({ type: "CODE_VALUE", code: code }, window.location.origin);
    } catch (e) {
      console.error("[DSA Tutor Injected] Error reading Monaco editor:", e);
      window.postMessage({ type: "CODE_VALUE", code: "", error: e.message }, window.location.origin);
    }
  }

  if (event.data && event.data.type === "SET_READ_ONLY") {
    applyReadOnlyState(event.data.readOnly);
  }

  if (event.data && event.data.type === "SET_ASSESSMENT_LOCKED") {
    applyAssessmentTabLocking(event.data.locked, event.data.reason);
  }

  if (event.data && event.data.type === "PING_INJECTED") {
    window.__dsaTutorInjectedReady = true;
    window.postMessage({ type: 'DSA_TUTOR_INJECTED_READY' }, '*');
  }

  if (event.data && event.data.type === "RESET_EDITOR") {
    try {
      const getCsrfToken = () => {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
      };

      const fetchStarterSnippetAndApply = async () => {
        try {
          const slugMatch = window.location.pathname.match(/problems\/([^/]+)/);
          const titleSlug = slugMatch ? slugMatch[1] : '';
          if (!titleSlug) return false;

          const csrfToken = getCsrfToken();
          const headers = { 'Content-Type': 'application/json' };
          if (csrfToken) {
            headers['x-csrftoken'] = csrfToken;
          }

          const res = await fetch('/graphql', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              query: `
                query questionEditorData($titleSlug: String!) {
                  question(titleSlug: $titleSlug) {
                    codeSnippets {
                      lang
                      langSlug
                      code
                    }
                  }
                }
              `,
              variables: { titleSlug }
            })
          });

          if (!res.ok) return false;
          const json = await res.json();
          const snippets = json?.data?.question?.codeSnippets;
          if (!snippets || !Array.isArray(snippets) || snippets.length === 0) return false;

          const bestModel = getActiveCodeModel();
          if (!bestModel) return false;

          const modelLang = (bestModel.getLanguageId ? bestModel.getLanguageId() : '').toLowerCase();
          let match = snippets.find(s => {
            const slug = (s.langSlug || '').toLowerCase();
            const langName = (s.lang || '').toLowerCase();
            return slug === modelLang || langName.includes(modelLang) || modelLang.includes(slug);
          });

          if (!match && modelLang === 'python') {
            match = snippets.find(s => s.langSlug === 'python3' || s.langSlug === 'python');
          }
          if (!match && (modelLang === 'javascript' || modelLang === 'typescript')) {
            match = snippets.find(s => s.langSlug === 'javascript' || s.langSlug === 'typescript');
          }
          if (!match) {
            match = snippets[0];
          }

          if (match && match.code) {
            console.log('[DSA Tutor Injected] Applied official starter code via GraphQL for', titleSlug, match.langSlug);
            bestModel.setValue(match.code);
            [20, 80, 200, 500, 1000].forEach(delay => setTimeout(tryConfirmModal, delay));
            return true;
          }
        } catch (e) {
          console.warn('[DSA Tutor Injected] Failed to fetch starter snippet from GraphQL:', e);
        }
        return false;
      };

      const debugReset = (msg, data) => {
        console.log(`[DSA Tutor DEBUG] ${msg}`, data !== undefined ? data : '');
      };

      // Temporarily auto-approve native window.confirm dialogs during reset so user is never prompted
      const origConfirm = window.confirm;
      if (origConfirm) {
        window.confirm = function (...args) {
          debugReset('Auto-approving window.confirm dialog during reset', args);
          return true;
        };
        setTimeout(() => {
          window.confirm = origConfirm;
        }, 4000);
      }

      let resetAttempts = 0;
      let resetDone = false;
      let resetTriggerClicked = false;

      const fallbackToSnapshot = () => {
        try {
          const bestModel = getActiveCodeModel();
          if (bestModel) {
            const key = bestModel.uri.toString();
            const initialCode = window.__dsaTutorInitialCodeByUri?.get(key);
            if (initialCode !== undefined) {
              debugReset('Snapshot fallback applied', { uri: key, length: initialCode.length });
              console.warn('[DSA Tutor Injected] Native reset button not found — falling back to snapshot');
              bestModel.setValue(initialCode);
              [20, 80, 200, 500, 1000].forEach(delay => setTimeout(tryConfirmModal, delay));
            }
          }
        } catch (e) {
          console.warn('[DSA Tutor Injected] Snapshot fallback failed:', e);
        }
      };

      const triggerClick = (el) => {
        if (!el) return;
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
          try {
            const evt = new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window });
            el.dispatchEvent(evt);
          } catch (e) { }
        });
        try { el.click(); } catch (e) { }
      };

      const findResetButton = () => {
        const allButtons = Array.from(document.querySelectorAll(
          'button, [role="button"], [data-cypress*="Reset" i], [data-cy*="reset" i], [data-e2e-locator*="reset" i], [data-track-name*="reset" i], [data-track-load*="reset" i], [aria-label*="Reset" i], [aria-label*="default code" i], [aria-label*="Retrieve" i], [title*="Reset" i], [title*="default code" i], [title*="Retrieve" i]'
        ));

        debugReset('candidate buttons found', allButtons.length);

        let resetBtn = allButtons.find(el => {
          if (el.closest("#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container")) return false;
          const str = (
            (el.getAttribute('title') || '') + ' ' +
            (el.getAttribute('aria-label') || '') + ' ' +
            (el.getAttribute('data-cypress') || '') + ' ' +
            (el.getAttribute('data-cy') || '') + ' ' +
            (el.getAttribute('data-track-name') || '') + ' ' +
            (el.getAttribute('data-track-load') || '') + ' ' +
            (el.textContent || '') + ' ' +
            (el.innerHTML || '')
          ).toLowerCase();

          return str.includes('reset') || str.includes('restore') || str.includes('revert') || str.includes('default code') || str.includes('retrieve') || str.includes('arrow-rotate-left') || str.includes('rotate-left');
        });

        debugReset('resetBtn from primary search', resetBtn);

        if (!resetBtn) {
          const editorToolbars = document.querySelectorAll('[class*="editor"] [class*="tools"], [class*="editor-header"], .monaco-editor, [class*="action-btn"], [class*="toolbar"], [class*="editor-actions"]');
          debugReset('toolbar candidates', editorToolbars.length);
          for (const bar of editorToolbars) {
            const btns = bar.querySelectorAll('button, svg, [role="button"]');
            for (const b of btns) {
              if (b.closest("#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container")) continue;
              const html = (b.outerHTML || '').toLowerCase();
              if (html.includes('reset') || html.includes('default code') || html.includes('arrow-rotate-left') || html.includes('rotate-left')) {
                resetBtn = b.closest('button, [role="button"]') || b;
                break;
              }
            }
            if (resetBtn) break;
          }
        }

        debugReset('final resetBtn', resetBtn);
        return resetBtn;
      };

      const dismissLeetcodeDialogs = () => {
        try {
          const dialogs = Array.from(document.querySelectorAll(
            '[role="dialog"], [role="alertdialog"], [aria-modal="true"], div[id*="headlessui-dialog"], div[data-headlessui-state*="open"], div[class*="modal"], div[class*="dialog"], div[class*="popup"], .ant-modal, .ant-modal-wrap, .ant-modal-root'
          ));

          for (const dlg of dialogs) {
            if (dlg.closest("#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container")) continue;
            if (dlg.id && dlg.id.startsWith("dsa-tutor")) continue;

            const text = (dlg.textContent || '').toLowerCase();
            if (text.includes('reset') || text.includes('discard') || text.includes('default code') || text.includes('changes') || text.includes('revert') || text.includes('restore') || text.includes('lose')) {
              debugReset('Found LeetCode reset/discard dialog', dlg);

              const buttons = Array.from(dlg.querySelectorAll('button, div[role="button"], a[role="button"]'));
              let actionBtn = buttons.find(b => {
                const bTxt = (b.textContent || '').trim().toLowerCase();
                const bCls = (b.className || '').toLowerCase();
                const bCy = ((b.getAttribute('data-cy') || '') + ' ' + (b.getAttribute('data-cypress') || '')).toLowerCase();
                return (
                  bTxt === 'confirm' || bTxt === 'discard' || bTxt === 'reset' || bTxt === 'restore' || bTxt === 'yes' || bTxt === 'ok' || bTxt === 'overwrite' ||
                  bTxt.includes('discard') || bTxt.includes('reset') || bTxt.includes('confirm') ||
                  bCls.includes('confirm') || bCls.includes('discard') || bCls.includes('danger') || bCls.includes('brand-orange') || bCls.includes('primary') ||
                  bCy.includes('confirm') || bCy.includes('discard')
                );
              });

              if (!actionBtn) {
                actionBtn = buttons.find(b => {
                  const bTxt = (b.textContent || '').trim().toLowerCase();
                  return bTxt !== 'cancel' && bTxt !== 'close' && bTxt !== 'no' && !bTxt.includes('cancel') && !bTxt.includes('close');
                });
              }

              if (actionBtn) {
                debugReset('Auto-clicking dialog action button', actionBtn);
                triggerClick(actionBtn);
              }

              setTimeout(() => {
                try {
                  dlg.style.setProperty("display", "none", "important");
                  dlg.style.setProperty("visibility", "hidden", "important");
                  dlg.style.setProperty("opacity", "0", "important");
                  dlg.style.setProperty("pointer-events", "none", "important");
                } catch (e) { }
              }, 60);
            }
          }
        } catch (e) { }
      };

      const tryConfirmModal = () => {
        dismissLeetcodeDialogs();
        const confirmBtns = Array.from(document.querySelectorAll(
          'button, div[role="button"], [data-cy*="confirm" i], [data-cy*="discard" i], [data-cypress*="confirm" i], [data-cypress*="discard" i], [data-e2e-locator*="confirm" i], [data-e2e-locator*="discard" i], [class*="modal"] button, [class*="dialog"] button, [class*="popup"] button, [class*="confirm"], [class*="discard"], [class*="danger"], [role="dialog"] button, button.ant-btn-primary, button.ant-btn-dangerous'
        ));
        const confirmBtn = confirmBtns.find(b => {
          if (b.closest("#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container, #dsa-tutor-panel-container")) return false;
          const txt = (b.textContent || '').trim().toLowerCase();
          const cls = (b.className || '').toLowerCase();
          const cy = ((b.getAttribute('data-cy') || '') + ' ' + (b.getAttribute('data-cypress') || '')).toLowerCase();
          return (
            txt === 'confirm' || txt === 'discard' || txt === 'reset' || txt === 'restore' || txt === 'yes' || txt === 'overwrite' ||
            txt.includes('discard') || txt.includes('reset code') || txt.includes('confirm') || txt.includes('overwrite') ||
            cls.includes('confirm') || cls.includes('discard') || cls.includes('danger') || cls.includes('brand-orange') ||
            cy.includes('confirm') || cy.includes('discard')
          );
        });
        if (confirmBtn) {
          debugReset('tryConfirmModal found confirm/discard button', confirmBtn);
          triggerClick(confirmBtn);
          resetDone = true;
          return true;
        }
        return false;
      };

      const executeReset = () => {
        if (resetDone || resetTriggerClicked) return;
        const resetBtn = findResetButton();
        if (resetBtn) {
          debugReset('Triggering click on native reset button', resetBtn);
          resetTriggerClicked = true;
          triggerClick(resetBtn);
          [20, 60, 120, 250, 450, 750, 1200, 2000].forEach(delay => {
            setTimeout(() => {
              tryConfirmModal();
              dismissLeetcodeDialogs();
            }, delay);
          });
        }
      };

      const startResetFlow = async () => {
        debugReset('Attempting instant GraphQL starter snippet reset');
        const fetched = await fetchStarterSnippetAndApply();
        if (fetched) {
          debugReset('Instant GraphQL starter snippet reset applied successfully');
          [20, 60, 150, 300, 600, 1000].forEach(delay => setTimeout(dismissLeetcodeDialogs, delay));
          return;
        }

        debugReset('GraphQL snippet reset unavailable, attempting native reset button polling');
        executeReset();
        const resetPollInterval = setInterval(() => {
          resetAttempts++;
          executeReset();
          dismissLeetcodeDialogs();
          if (resetAttempts > 10 || resetDone) {
            clearInterval(resetPollInterval);
            debugReset('Polling loop completed', { resetAttempts, resetDone });
            if (!resetDone) {
              fallbackToSnapshot();
            }
          }
        }, 250);
      };

      startResetFlow();

      if (window.__dsaTutorReadOnly) {
        setTimeout(() => {
          applyReadOnlyState(true);
        }, 400);
      }
    } catch (e) {
      console.error("[DSA Tutor Injected] Error resetting editor:", e);
    }
  }
});

setInterval(() => {
  if (window.__dsaTutorReadOnly) {
    applyReadOnlyState(true);
  }
}, 400);

setInterval(() => {
  if (window.__dsaTutorAssessmentLocked) {
    applyAssessmentTabLocking(true, window.__dsaTutorLockReason);
  }
}, 1000);

window.__dsaTutorInjectedReady = true;
window.postMessage({ type: 'DSA_TUTOR_INJECTED_READY' }, '*');

