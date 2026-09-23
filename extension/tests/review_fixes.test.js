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
