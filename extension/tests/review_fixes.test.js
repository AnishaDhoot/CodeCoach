// Regression tests for the pre-publish review fixes. These load the REAL
// public/background.js and public/injected.js sources (not mocks).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', 'public', f), 'utf8');

describe('background.js', () => {
  let listener;
  let fetchMock;
  let store;

  const load = () => {
    store = {};
    listener = null;
    global.chrome = {
      runtime: {
        id: 'ext-id',
        onMessage: { addListener: (fn) => { listener = fn; } },
      },
      storage: {
        local: {
          get: vi.fn(async (k) => ({ [k]: store[k] })),
          set: vi.fn(async (o) => { Object.assign(store, o); }),
          remove: vi.fn(async (k) => { delete store[k]; }),
          clear: vi.fn(async () => { store = {}; }),
        },
      },
      alarms: {
        get: vi.fn(async () => undefined),
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
      tabs: { update: vi.fn(async () => ({})), query: vi.fn(async () => []) },
      scripting: { executeScript: vi.fn() },
    };
    global.fetch = fetchMock;
    new Function(read('background.js'))();
  };

  const send = (request, sender = { id: 'ext-id', tab: { id: 7 } }) =>
    new Promise((resolve) => listener(request, sender, resolve));

  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

  let originalChrome;
  beforeEach(() => { fetchMock = vi.fn(); originalChrome = global.chrome; });
  afterEach(() => { delete global.fetch; global.chrome = originalChrome; });

  it('re-registers and retries once when the stored token is rejected (401)', async () => {
    fetchMock.mockImplementation(async (url, opts = {}) => {
      if (url.endsWith('/auth/register')) return json(200, { token: 'fresh' });
      if (url.endsWith('/reviews/count')) return json(200, { due_count: 0 });
      if (url.endsWith('/topics/mastery')) {
        return opts.headers?.Authorization === 'Bearer fresh' ? json(200, [{ topic: 'Arrays' }]) : json(401, { detail: 'bad token' });
      }
      return json(404, {});
    });
    load();
    store.authToken = 'stale';
    const res = await send({ action: 'get_mastery' });
    expect(res).toEqual({ success: true, data: [{ topic: 'Arrays' }] });
    expect(store.authToken).toBe('fresh');
  });

  it('refuses to navigate to non-LeetCode URLs and uses the sender tab', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    load();
    const bad = await send({ action: 'navigate_tab', url: 'javascript:alert(1)' });
    expect(bad.success).toBe(false);
    const good = await send({ action: 'navigate_tab', url: 'https://leetcode.com/problems/two-sum/' });
    expect(good.success).toBe(true);
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { url: 'https://leetcode.com/problems/two-sum/' });
  });

  it('ignores messages from other extensions', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    load();
    const ret = listener({ action: 'get_mastery' }, { id: 'someone-else' }, () => {});
    expect(ret).toBeUndefined();
  });

  it('reports CSV export HTTP errors instead of downloading the error body', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/register')) return json(200, { token: 't' });
      if (url.includes('/export/solved-csv')) return json(500, { detail: 'boom' });
      return json(200, { due_count: 0 });
    });
    load();
    const res = await send({ action: 'export_solved_csv', payload: { timeframe: 'all_time' } });
    expect(res.success).toBe(false);
  });
});

describe('injected.js editor-reset guard', () => {
  const TEST = {
    id: 42,
    problem1: { id: 'two-sum', url: 'https://leetcode.com/problems/two-sum/' },
    problem2: { id: 'coin-change', url: 'https://leetcode.com/problems/coin-change/' },
    time_limit_seconds: 5400,
    elapsed_seconds: 0,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.history.pushState({}, '', '/problems/two-sum/');
    new Function(read('injected.js'))();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('never resets when no Badge Test is active', () => {
    expect(window.__dsaBadgeResetAllowed()).toBe(false);
  });

  it('never resets a problem that is not part of the active test', () => {
    window.localStorage.setItem('dsaTutorActiveBadgeTest', JSON.stringify({ data: TEST, cachedAt: Date.now() }));
    window.history.pushState({}, '', '/problems/some-other-problem/');
    expect(window.__dsaBadgeResetAllowed()).toBe(false);
  });

  it('allows resets only in the first few seconds on a test problem, then protects the user\'s code', () => {
    window.localStorage.setItem('dsaTutorActiveBadgeTest', JSON.stringify({ data: TEST, cachedAt: Date.now() }));
    expect(window.__dsaBadgeResetAllowed()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(window.__dsaBadgeResetAllowed()).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(window.__dsaBadgeResetAllowed()).toBe(false);
  });

  it('always restores the original window.confirm after overlapping resets', () => {
    const original = window.confirm;
    window.localStorage.setItem('dsaTutorActiveBadgeTest', JSON.stringify({ data: TEST, cachedAt: Date.now() }));
    const fire = () => window.dispatchEvent(new MessageEvent('message', { data: { type: 'RESET_EDITOR' }, source: window }));
    fire();
    vi.advanceTimersByTime(250);
    fire();
    vi.advanceTimersByTime(10000);
    expect(window.confirm).toBe(original);
  });
});

describe('injected.js Badge Test: switching problems and coming back', () => {
  const TEST = {
    id: 77,
    problem1: { id: 'two-sum', url: 'https://leetcode.com/problems/two-sum/' },
    problem2: { id: 'coin-change', url: 'https://leetcode.com/problems/coin-change/' },
    time_limit_seconds: 5400,
    elapsed_seconds: 0,
  };
  const STARTER = { 'two-sum': 'class Solution:\n    def twoSum(self):', 'coin-change': 'class Solution:\n    def coinChange(self):' };
  let model;

  const makeModel = (value) => {
    const listeners = [];
    const m = {
      value,
      uri: { toString: () => 'inmemory://model/1' },
      getValue: () => m.value,
      getValueLength: () => m.value.length,
      getLanguageId: () => 'python',
      // Programmatic replace (our reset or LeetCode restoring saved code).
      setValue: (v) => { m.value = v; listeners.forEach((fn) => fn({ isFlush: true, changes: [] })); },
      onDidChangeContent: (fn) => { listeners.push(fn); return { dispose() {} }; },
      // Simulates the user typing (a small, non-flush edit).
      type: (text) => {
        m.value += text;
        listeners.forEach((fn) => fn({ isFlush: false, changes: [{ text, rangeLength: 0 }] }));
      },
    };
    return m;
  };

  const goTo = async (slug, leetcodeRestores) => {
    window.history.pushState({}, '', `/problems/${slug}/`);
    if (leetcodeRestores !== undefined) model.setValue(leetcodeRestores); // LeetCode hydrates old code
    await vi.advanceTimersByTimeAsync(5000);
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.localStorage.setItem('dsaTutorActiveBadgeTest', JSON.stringify({ data: TEST, cachedAt: Date.now() }));
    window.history.pushState({}, '', '/problems/two-sum/');
    model = makeModel('OLD ANSWER FROM LAST MONTH');
    const editor = { getModel: () => model, getDomNode: () => null, updateOptions() {} };
    window.monaco = { editor: { getEditors: () => [editor], getModels: () => [model], onDidCreateModel() {}, onDidCreateEditor() {} } };
    // jsdom's postMessage leaves event.source empty; real Chrome sets it to window.
    window.postMessage = (data) => setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: window.location.origin })), 0);
    global.fetch = vi.fn(async (url, opts) => {
      const slug = JSON.parse(opts.body).variables.titleSlug;
      return { ok: true, json: async () => ({ data: { question: { codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: STARTER[slug] }] } } }) };
    });
    new Function(read('injected.js'))();
    await vi.advanceTimersByTimeAsync(5000); // early pre-reset on page load
  });
  afterEach(() => { vi.useRealTimers(); delete window.monaco; delete global.fetch; });

  it('shows starter code on first visit instead of the old answer', () => {
    expect(model.getValue()).toBe(STARTER['two-sum']);
  });

  it('restores the code typed during the test when the user comes back', async () => {
    model.type('\n        return [0, 1]');
    const typed = model.getValue();
    await goTo('coin-change', 'OLD COIN CHANGE ANSWER');
    expect(model.getValue()).toBe(STARTER['coin-change']);
    await goTo('two-sum', 'OLD ANSWER FROM LAST MONTH');
    expect(model.getValue()).toBe(typed);
  });

  it('shows starter code again when the user comes back without having typed', async () => {
    await goTo('coin-change', 'OLD COIN CHANGE ANSWER');
    await goTo('two-sum', 'OLD ANSWER FROM LAST MONTH');
    expect(model.getValue()).toBe(STARTER['two-sum']);
  });

  it('never overwrites what the user is typing (e.g. after a Wrong Answer refresh)', async () => {
    model.type('\n        pass  # work in progress');
    const typed = model.getValue();
    window.postMessage({ type: 'RESET_EDITOR' }, window.location.origin);
    await vi.advanceTimersByTimeAsync(20000);
    expect(model.getValue()).toBe(typed);
  });
});
