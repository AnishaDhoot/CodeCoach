import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App';

const TEST = {
  id: 501,
  topic: 'Graphs',
  level: 1,
  problem1: { id: 'a', title: 'Problem A', difficulty: 'Easy', url: 'https://leetcode.com/problems/a/' },
  problem2: { id: 'b', title: 'Problem B', difficulty: 'Medium', url: 'https://leetcode.com/problems/b/' },
  problem1_solved: false,
  problem2_solved: false,
  time_limit_seconds: 5400,
  elapsed_seconds: 10,
};

describe('Abandon Test works on the first click', () => {
  let pendingStatusChecks;
  let abandonReply;

  beforeEach(() => {
    pendingStatusChecks = [];
    abandonReply = { success: true, data: { ok: true } };
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    window.dsaTutor = { setAssessmentLocked: vi.fn(), resetEditor: vi.fn(), getIdentity: vi.fn(() => ({})) };
    global.chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      if (msg.action === 'get_active_badge_test') {
        // Slow server: hold the reply so it arrives after the user's click.
        pendingStatusChecks.push(() => { if (cb) cb({ success: true, data: { ...TEST } }); });
        return;
      }
      if (msg.action === 'abandon_badge_test') { if (cb) cb(abandonReply); return; }
      if (cb) cb({ success: true, data: [] });
    });
  });

  const flushStatusChecks = () => act(() => {
    const pending = pendingStatusChecks.splice(0);
    pending.forEach((reply) => reply());
  });

  it('a status check that was already in flight does not bring the test back', async () => {
    render(<App />);
    flushStatusChecks(); // initial load shows the active test
    await waitFor(() => expect(screen.getByRole('button', { name: /Abandon Test/i })).toBeInTheDocument());

    // A status check goes out; before its (stale) reply arrives, the user abandons.
    await act(async () => { window.dsaTutor.fetchActiveTest(); });
    fireEvent.click(screen.getByRole('button', { name: /Abandon Test/i }));
    expect(screen.queryByRole('button', { name: /Abandon Test/i })).not.toBeInTheDocument();

    // The stale "still active" reply now arrives.
    flushStatusChecks();

    expect(screen.queryByRole('button', { name: /Abandon Test/i })).not.toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('if the server fails to abandon, the user is told and the test stays', async () => {
    abandonReply = { success: false, error: 'Server unavailable' };
    render(<App />);
    flushStatusChecks();
    await waitFor(() => expect(screen.getByRole('button', { name: /Abandon Test/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Abandon Test/i }));
    expect(window.alert).toHaveBeenCalledWith('Server unavailable');
    flushStatusChecks();
    await waitFor(() => expect(screen.getByRole('button', { name: /Abandon Test/i })).toBeInTheDocument());
  });
});
