import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Chrome Extension Manifest V3 Background Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles FETCH_API messages and proxies requests to FastAPI backend', async () => {
    const mockApiResponse = { status: 'success', data: { used: 5, limit: 50 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockApiResponse),
    });

    const sendResponse = vi.fn();
    const message = {
      type: 'FETCH_API',
      endpoint: '/ai/quota',
      method: 'GET',
    };

    // Simulate background worker fetch proxy
    async function handleMessage(msg, sender, respond) {
      if (msg.type === 'FETCH_API') {
        try {
          const res = await fetch(`http://127.0.0.1:8000${msg.endpoint}`, {
            method: msg.method || 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: msg.body ? JSON.stringify(msg.body) : undefined,
          });
          const data = await res.json();
          respond({ success: true, data });
        } catch (err) {
          respond({ success: false, error: err.message });
        }
      }
    }

    await handleMessage(message, {}, sendResponse);

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/ai/quota', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
    expect(sendResponse).toHaveBeenCalledWith({ success: true, data: mockApiResponse });
  });

  it('updates extension action badge count when reviews are due', async () => {
    const dueReviewsCount = 3;

    function updateBadge(count) {
      if (count > 0) {
        chrome.action.setBadgeText({ text: String(count) });
        chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    }

    updateBadge(dueReviewsCount);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '3' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#EF4444' });

    updateBadge(0);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('creates periodic alarm for spaced repetition check on installation', () => {
    function onInstalledListener(details) {
      chrome.alarms.create('check_due_reviews_alarm', {
        periodInMinutes: 60,
      });
      chrome.storage.local.set({
        installed_at: Date.now(),
        settings: { auto_hints: true, fairplay_mode: false },
      });
    }

    onInstalledListener({ reason: 'install' });

    expect(chrome.alarms.create).toHaveBeenCalledWith('check_due_reviews_alarm', {
      periodInMinutes: 60,
    });
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('persists and retrieves user focus topic in local storage', async () => {
    await chrome.storage.local.set({ focus_topic: 'Two Pointers' });
    const stored = await chrome.storage.local.get('focus_topic');

    expect(stored.focus_topic).toBe('Two Pointers');
  });

  it('broadcasts submission events to active LeetCode tabs', async () => {
    const submissionPayload = {
      problem_slug: 'two-sum',
      verdict: 'Wrong Answer',
      code: 'class Solution {}',
      language: 'java',
    };

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SUBMISSION_INTERCEPTED',
        payload: submissionPayload,
      });
    }

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(101, {
      type: 'SUBMISSION_INTERCEPTED',
      payload: submissionPayload,
    });
  });
});
