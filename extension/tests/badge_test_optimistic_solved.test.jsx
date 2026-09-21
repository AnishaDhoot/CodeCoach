import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App';

const test1 = {
  id: 601,
  topic: 'Graphs',
  level: 1,
  problem1: { id: 'a', title: 'Problem A', difficulty: 'Easy', url: 'https://leetcode.com/problems/two-sum/' },
  problem2: { id: 'b', title: 'Problem B', difficulty: 'Medium', url: 'https://leetcode.com/problems/two-sum-ii/' },
  problem1_solved: false,
  problem2_solved: false,
  time_limit_seconds: 5400,
  elapsed_seconds: 10
};

describe('Optimistic Badge Test solved state', () => {
  beforeEach(() => {
    window.dsaTutor = { setAssessmentLocked: vi.fn(), resetEditor: vi.fn(), getIdentity: vi.fn(() => ({})) };
    // Backend keeps reporting "unsolved" (slow to catch up).
    global.chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      cb && cb({ success: true, data: msg.action === 'get_active_badge_test' ? { ...test1 } : [] });
    });
  });

  it('marks only the exact matching problem solved immediately, and survives stale backend data', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll('.test-problem-card').length).toBe(2));

    act(() => { window.dsaTutor.markProblemSolvedOptimistic('two-sum'); });
    let cards = container.querySelectorAll('.test-problem-card');
    expect(cards[0].className).toContain('solved');
    expect(cards[0].className).not.toContain('unsolved');
    expect(cards[1].className).toContain('unsolved');

    // A backend refresh that still says unsolved must not undo the optimistic state.
    await act(async () => { window.dsaTutor.fetchActiveTest(); });
    cards = container.querySelectorAll('.test-problem-card');
    expect(cards[0].className).not.toContain('unsolved');
  });

  it('reverts to backend truth when the analyze call fails', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll('.test-problem-card').length).toBe(2));
    act(() => { window.dsaTutor.markProblemSolvedOptimistic('two-sum'); });
    await act(async () => { window.dsaTutor.revertOptimisticSolved(); });
    await waitFor(() => expect(container.querySelectorAll('.test-problem-card')[0].className).toContain('unsolved'));
  });
});
