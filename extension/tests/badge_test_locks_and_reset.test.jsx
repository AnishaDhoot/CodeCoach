import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '../src/App';

describe('Badge Test Integrity: Solutions, Editorial, Discussion & Submissions Lock and Code Reset Suite', () => {
  let mockActiveTest;
  let mockQuota;
  let mockMastery;

  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    mockActiveTest = {
      id: 301,
      topic: 'Dynamic Programming',
      level: 2,
      badge: 'Silver',
      problem1: {
        id: 'climbing-stairs',
        title: 'Climbing Stairs',
        difficulty: 'Easy',
        url: 'https://leetcode.com/problems/climbing-stairs/'
      },
      problem2: {
        id: 'coin-change',
        title: 'Coin Change',
        difficulty: 'Medium',
        url: 'https://leetcode.com/problems/coin-change/'
      },
      problem1_solved: false,
      problem2_solved: false,
      started_at: new Date().toISOString(),
      time_limit_seconds: 5400
    };

    mockQuota = { used: 5, limit: 50 };
    mockMastery = [
      { topic: 'Dynamic Programming', level: 1, badge: 'Bronze', mastery_score: 220 }
    ];

    window.dsaTutor = {
      setAssessmentLocked: vi.fn(),
      resetEditor: vi.fn(),
      setEditorReadOnly: vi.fn(),
      getIdentity: vi.fn(() => ({ problemId: 'climbing-stairs' }))
    };

    global.chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      if (msg.action === 'get_active_badge_test') {
        cb({ success: true, data: mockActiveTest });
      } else if (msg.action === 'start_badge_test') {
        const newTest = {
          id: 302,
          topic: msg.payload?.topic || 'Dynamic Programming',
          level: 2,
          badge: 'Silver',
          problem1: { id: 'climbing-stairs', title: 'Climbing Stairs', difficulty: 'Easy', url: 'https://leetcode.com/problems/climbing-stairs/' },
          problem2: { id: 'coin-change', title: 'Coin Change', difficulty: 'Medium', url: 'https://leetcode.com/problems/coin-change/' },
          problem1_solved: false,
          problem2_solved: false,
          time_limit_seconds: 5400
        };
        mockActiveTest = newTest;
        cb({ success: true, data: newTest });
      } else if (msg.action === 'get_active_mock') {
        cb({ success: true, data: null });
      } else if (msg.action === 'submit_badge_test') {
        mockActiveTest = null;
        cb({ success: true, data: { message: 'Badge Test submitted! Level earned.' } });
      } else if (msg.action === 'abandon_badge_test') {
        mockActiveTest = null;
        cb({ success: true, message: 'Badge Test abandoned.' });
      } else if (msg.action === 'get_ai_quota') {
        cb({ success: true, data: mockQuota });
      } else if (msg.action === 'get_streak') {
        cb({ success: true, data: { current_streak_days: 3, longest_streak_days: 7 } });
      } else if (msg.action === 'get_mastery') {
        cb({ success: true, data: mockMastery });
      } else {
        cb({ success: true, data: null });
      }
    });
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  describe('1. Fairplay Tab & Route Locking: Solutions, Editorial, Discussions, Submissions', () => {
    // Helper function simulating injected.js lock CSS logic
    const injectLockCSS = (isLocked) => {
      let styleEl = document.getElementById('dsa-tutor-fairplay-css');
      if (isLocked) {
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'dsa-tutor-fairplay-css';
          styleEl.textContent = `
            a[href*="/solution"], a[href*="/solutions"], a[href*="/editorial"], a[href*="/editorials"], a[href*="/discussion"], a[href*="/discussions"], a[href*="/comments"], a[href*="/community"], a[href*="/submissions"], a[href*="/submission"],
            div[data-layout-path*="solution"], div[data-layout-path*="solutions"], div[data-layout-path*="editorial"], div[data-layout-path*="editorials"], div[data-layout-path*="discussion"], div[data-layout-path*="discussions"], div[data-layout-path*="community"], div[data-layout-path*="submissions"], div[data-layout-path*="submission"],
            [data-track-load*="discussion"], [data-track-load*="discussions"], [data-track-load*="solution"], [data-track-load*="solutions"], [data-track-load*="editorial"], [data-track-load*="editorials"], [data-track-load*="submissions"], [data-track-load*="submission"],
            [data-key*="solution"], [data-key*="solutions"], [data-key*="editorial"], [data-key*="editorials"], [data-key*="discussion"], [data-key*="discussions"], [data-key*="submissions"], [data-key*="submission"],
            div[class*="hint-"], details[class*="hint"], div[class*="Hint"],
            div[class*="discussion-"], div[class*="discussions-"], div[class*="comment-"], div[class*="comments-"],
            section[class*="discussion"], section[class*="comment"], section[class*="community"], section[class*="submission"], section[class*="submissions"] {
              display: none !important;
              visibility: hidden !important;
              pointer-events: none !important;
              opacity: 0 !important;
            }
          `;
          document.head.appendChild(styleEl);
        }
      } else if (styleEl) {
        styleEl.remove();
      }
    };

    // Helper function simulating injected.js DOM tab locking logic
    const applyAssessmentTabLocking = (isLocked, reason = 'Badge Test') => {
      window.__dsaTutorAssessmentLocked = !!isLocked;
      window.__dsaTutorLockReason = reason || '';
      injectLockCSS(isLocked);

      const isForbiddenRoute = (
        window.location.href.includes('/solution') ||
        window.location.href.includes('/solutions') ||
        window.location.href.includes('/editorial') ||
        window.location.href.includes('/editorials') ||
        window.location.href.includes('/discussion') ||
        window.location.href.includes('/discussions') ||
        window.location.href.includes('/comments') ||
        window.location.href.includes('/community') ||
        window.location.href.includes('/submissions') ||
        window.location.href.includes('/submission')
      );

      let lockOverlay = document.getElementById('dsa-tutor-tab-lock-overlay');

      if (isLocked) {
        const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"], [data-layout-path]'));
        tabs.forEach(el => {
          if (el.closest('#dsa-tutor-panel-root, #dsa-tutor-root, #dsa-tutor-react-container')) return;

          const text = (el.textContent || '').trim().toLowerCase();
          const href = (el.getAttribute('href') || '').toLowerCase();
          const dataPath = (el.getAttribute('data-layout-path') || '').toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          const idStr = (el.id || '').toLowerCase();

          const isForbiddenTab = (
            (href.includes('/solution') || href.includes('/editorial') || href.includes('/discussion') || href.includes('/community') || href.includes('/submission')) ||
            (dataPath.includes('solution') || dataPath.includes('editorial') || dataPath.includes('discussion') || dataPath.includes('submission')) ||
            (el.getAttribute('role') === 'tab' && (text.includes('editorial') || text.includes('solution') || text.includes('discussion') || text.includes('community') || text.includes('submission') || text.includes('comment'))) ||
            (ariaLabel.includes('editorial') || (ariaLabel.includes('solution') && !ariaLabel.includes('submit')) || ariaLabel.includes('discussion') || ariaLabel.includes('submission')) ||
            (idStr.includes('editorial') || idStr.includes('discussion') || idStr.includes('submission'))
          );

          if (isForbiddenTab) {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.setAttribute('data-dsa-tab-locked', 'true');
          }
        });

        const panelContainer = document.querySelector(
          "div[data-layout-path*='editorial'], div[data-layout-path*='solution'], div[data-layout-path*='solutions'], div[data-layout-path*='discussion'], div[data-layout-path*='discussions'], div[data-layout-path*='submissions'], div[data-layout-path*='submission']"
        );

        if ((isForbiddenRoute || panelContainer) && !document.getElementById('dsa-tutor-tab-lock-overlay')) {
          const mountTarget = panelContainer || document.body;
          lockOverlay = document.createElement('div');
          lockOverlay.id = 'dsa-tutor-tab-lock-overlay';
          lockOverlay.innerHTML = `
            <div class="lock-card">
              <div class="lock-title">Solutions, Editorial, Discussion & Submissions Locked</div>
              <div class="lock-desc">
                Access to official solutions, editorials, community discussions, and past submissions is disabled during <strong>${reason}</strong> to maintain test integrity.
              </div>
            </div>
          `;
          mountTarget.appendChild(lockOverlay);
        }
      } else {
        if (lockOverlay) lockOverlay.remove();
        document.querySelectorAll('[data-dsa-tab-locked="true"]').forEach(el => {
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('pointer-events');
          el.style.removeProperty('opacity');
          el.removeAttribute('data-dsa-tab-locked');
        });
      }
    };

    it('injects lock stylesheet hiding solutions, editorial, discussions, and submissions selectors', () => {
      injectLockCSS(true);
      const style = document.getElementById('dsa-tutor-fairplay-css');
      expect(style).not.toBeNull();
      expect(style.textContent).toContain('a[href*="/solution"]');
      expect(style.textContent).toContain('a[href*="/editorial"]');
      expect(style.textContent).toContain('a[href*="/discussion"]');
      expect(style.textContent).toContain('a[href*="/submissions"]');

      injectLockCSS(false);
      expect(document.getElementById('dsa-tutor-fairplay-css')).toBeNull();
    });

    it('hides Solutions, Editorial, Discussions, and Submissions DOM tab elements during Badge Test', () => {
      // Create mockup LeetCode DOM navigation tabs
      const solutionTab = document.createElement('a');
      solutionTab.setAttribute('href', '/problems/climbing-stairs/solutions/');
      solutionTab.textContent = 'Solutions';

      const editorialTab = document.createElement('div');
      editorialTab.setAttribute('data-layout-path', 'editorial');
      editorialTab.textContent = 'Editorial';

      const discussionTab = document.createElement('button');
      discussionTab.setAttribute('role', 'tab');
      discussionTab.textContent = 'Discussion';

      const submissionTab = document.createElement('a');
      submissionTab.setAttribute('href', '/problems/climbing-stairs/submissions/');
      submissionTab.textContent = 'Submissions';

      const descriptionTab = document.createElement('a');
      descriptionTab.setAttribute('href', '/problems/climbing-stairs/description/');
      descriptionTab.textContent = 'Description';

      document.body.appendChild(solutionTab);
      document.body.appendChild(editorialTab);
      document.body.appendChild(discussionTab);
      document.body.appendChild(submissionTab);
      document.body.appendChild(descriptionTab);

      applyAssessmentTabLocking(true, 'Badge Test');

      expect(solutionTab.getAttribute('data-dsa-tab-locked')).toBe('true');
      expect(editorialTab.getAttribute('data-dsa-tab-locked')).toBe('true');
      expect(discussionTab.getAttribute('data-dsa-tab-locked')).toBe('true');
      expect(submissionTab.getAttribute('data-dsa-tab-locked')).toBe('true');
      expect(descriptionTab.getAttribute('data-dsa-tab-locked')).toBeNull();

      // When unlocked, all are restored
      applyAssessmentTabLocking(false);
      expect(solutionTab.getAttribute('data-dsa-tab-locked')).toBeNull();
      expect(editorialTab.getAttribute('data-dsa-tab-locked')).toBeNull();
      expect(discussionTab.getAttribute('data-dsa-tab-locked')).toBeNull();
      expect(submissionTab.getAttribute('data-dsa-tab-locked')).toBeNull();
    });

    it('displays lock overlay when user opens solutions, editorial, discussion, or submissions panel', () => {
      const subPanel = document.createElement('div');
      subPanel.setAttribute('data-layout-path', 'submissions');
      document.body.appendChild(subPanel);

      applyAssessmentTabLocking(true, 'Badge Test');

      const overlay = document.getElementById('dsa-tutor-tab-lock-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay.textContent).toContain('Solutions, Editorial, Discussion & Submissions Locked');
      expect(overlay.textContent).toContain('Badge Test');
    });
  });

  describe('2. Code Reset Mechanics during Badge Tests', () => {
    it('calls resetEditor and setAssessmentLocked immediately upon starting a Badge Test', async () => {
      mockActiveTest = null;
      render(<App />);

      await waitFor(() => {
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
          { action: 'get_active_badge_test' },
          expect.any(Function)
        );
      });

      // Switch to mastery tab and start a test
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Mastery/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Mastery/i }));

      // Find Test Level button
      const startBtns = screen.getAllByRole('button', { name: /Test L/i });
      expect(startBtns.length).toBeGreaterThan(0);
      fireEvent.click(startBtns[0]);

      // Verifies start_badge_test dispatched
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'start_badge_test' }),
        expect.any(Function)
      );

      // Verifies resetEditor was invoked to wipe stale code
      expect(window.dsaTutor.resetEditor).toHaveBeenCalled();
      expect(window.dsaTutor.setAssessmentLocked).toHaveBeenCalledWith(true, 'Badge Test');
    });

    it('hydrating an active Badge Test on page load immediately locks tabs and triggers code reset', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/Badge Test: Dynamic Programming Level 2/i)).toBeInTheDocument();
      });

      expect(window.dsaTutor.resetEditor).toHaveBeenCalled();
      expect(window.dsaTutor.setAssessmentLocked).toHaveBeenCalledWith(true, 'Badge Test');
    });

    it('triggers code reset when clicking Problem 1 or Problem 2 in Badge Test problem cards', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/1\. Climbing Stairs/i)).toBeInTheDocument();
      });

      const prob1Link = screen.getByText(/1\. Climbing Stairs/i);
      const prob2Link = screen.getByText(/2\. Coin Change/i);

      fireEvent.click(prob1Link);
      expect(window.dsaTutor.resetEditor).toHaveBeenCalled();

      fireEvent.click(prob2Link);
      expect(window.dsaTutor.resetEditor).toHaveBeenCalled();
    });

    it('simulates injected.js RESET_EDITOR finding native LeetCode reset button and confirming modal', async () => {
      // Mock LeetCode reset button and modal in DOM
      const resetBtn = document.createElement('button');
      resetBtn.setAttribute('data-cypress', 'ResetCode');
      resetBtn.setAttribute('title', 'Reset to default code definition');
      const resetBtnClickSpy = vi.fn();
      resetBtn.addEventListener('click', resetBtnClickSpy);
      document.body.appendChild(resetBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.setAttribute('data-cy', 'confirm-btn');
      confirmBtn.textContent = 'Confirm';
      const confirmBtnClickSpy = vi.fn();
      confirmBtn.addEventListener('click', confirmBtnClickSpy);
      document.body.appendChild(confirmBtn);

      // Helper simulating injected.js event handling for RESET_EDITOR
      const handleResetEditor = () => {
        const resetCandidates = Array.from(document.querySelectorAll(
          'button, div[role="button"], span[role="button"], [data-keyup="reset-code"], [data-track-name="reset_code"], [aria-label*="Reset"], [aria-label*="reset"], [title*="Reset"], [title*="reset"], [data-cypress="ResetCode"], [data-cy="reset-code-btn"]'
        ));
        const foundReset = resetCandidates.find(el => {
          const title = (el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('data-cy') || el.getAttribute('data-cypress') || el.textContent || '').toLowerCase();
          return title.includes('reset') || title.includes('restore') || title.includes('revert');
        });

        if (foundReset) {
          foundReset.click();
          const confirmBtns = Array.from(document.querySelectorAll('button, div[role="button"], [data-cy="confirm-btn"], [class*="modal"] button'));
          const foundConfirm = confirmBtns.find(b => {
            const txt = (b.textContent || '').trim().toLowerCase();
            return txt === 'confirm' || txt === 'reset' || txt === 'restore' || txt === 'yes';
          });
          if (foundConfirm) foundConfirm.click();
        }
      };

      handleResetEditor();

      expect(resetBtnClickSpy).toHaveBeenCalled();
      expect(confirmBtnClickSpy).toHaveBeenCalled();
    });
  });
});
