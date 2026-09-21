import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App';

const KEY = 'dsaTutorActiveBadgeTest';
const cachedTest = {
  id: 501,
  topic: 'Graphs',
  level: 1,
  problem1: { id: 'a', title: 'Problem A', difficulty: 'Easy', url: 'https://leetcode.com/problems/a/' },
  problem2: { id: 'b', title: 'Problem B', difficulty: 'Medium', url: 'https://leetcode.com/problems/b/' },
  time_limit_seconds: 5400,
  elapsed_seconds: 10
};

describe('Badge Test local cache', () => {
  beforeEach(() => {
    window.dsaTutor = { setAssessmentLocked: vi.fn(), resetEditor: vi.fn(), getIdentity: vi.fn(() => ({})) };
  });

  it('renders Badge Test view immediately from cache, before the backend answers', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: cachedTest, cachedAt: Date.now() }));
    // Backend never answers during this test.
    global.chrome.runtime.sendMessage = vi.fn();
    const { container } = render(<App />);
    expect(container.querySelector('.test-mode-container')).not.toBeNull();
    expect(container.querySelector('.tabs-container')).toBeNull();
  });

  it('drops a stale cached test when the backend confirms none is active', async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: cachedTest, cachedAt: Date.now() }));
    const posted = vi.spyOn(window, 'postMessage');
    global.chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      cb && cb({ success: true, data: msg.action === 'get_active_badge_test' ? null : [] });
    });
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.test-mode-container')).toBeNull());
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(posted).toHaveBeenCalledWith({ type: 'REVEAL_EDITOR' }, '*');
  });

  it('ignores an expired cached test', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: { ...cachedTest, elapsed_seconds: 5399 }, cachedAt: Date.now() - 10000 }));
    global.chrome.runtime.sendMessage = vi.fn();
    const { container } = render(<App />);
    expect(container.querySelector('.test-mode-container')).toBeNull();
  });
});
