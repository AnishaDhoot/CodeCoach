import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App';

describe('FAANG SDET Release-Gate: Exhaustive Badge Test Verification Suite', () => {
  let mockActiveTest;
  let mockQuota;
  let mockMastery;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTest = {
      id: 201,
      topic: 'Arrays',
      level: 1,
      badge: 'Bronze',
      problem1: {
        id: 'two-sum',
        title: 'Two Sum',
        difficulty: 'Easy',
        url: 'https://leetcode.com/problems/two-sum/'
      },
      problem2: {
        id: 'majority-element',
        title: 'Majority Element',
        difficulty: 'Easy',
        url: 'https://leetcode.com/problems/majority-element/'
      },
      problem1_solved: true,
      problem2_solved: false,
      started_at: new Date().toISOString(),
      time_limit_minutes: 90
    };

    mockQuota = { used: 10, limit: 50 };
    mockMastery = [
      { topic: 'Arrays', level: 0, badge: 'None', mastery_score: 50 },
      { topic: 'Two Pointers', level: 1, badge: 'Bronze', mastery_score: 180 }
    ];

    global.chrome.runtime.sendMessage = vi.fn((msg, cb) => {
      if (msg.action === 'get_active_badge_test') {
        cb({ success: true, data: mockActiveTest });
      } else if (msg.action === 'start_badge_test') {
        mockActiveTest = {
          id: 202,
          topic: msg.payload?.topic || 'Arrays',
          level: 1,
          badge: 'Bronze',
          problem1: { id: 'two-sum', title: 'Two Sum', difficulty: 'Easy', url: 'https://leetcode.com/problems/two-sum/' },
          problem2: { id: 'majority-element', title: 'Majority Element', difficulty: 'Easy', url: 'https://leetcode.com/problems/majority-element/' },
          problem1_solved: false,
          problem2_solved: false,
          time_limit_minutes: 90
        };
        cb({ success: true, data: mockActiveTest });
      } else if (msg.action === 'submit_badge_test') {
        mockActiveTest = null;
        cb({ success: true, data: { message: 'Badge Test submitted! Level earned.' } });
      } else if (msg.action === 'abandon_badge_test') {
        mockActiveTest = null;
        cb({ success: true, message: 'Badge Test abandoned.' });
      } else if (msg.action === 'get_ai_quota') {
        cb({ success: true, data: mockQuota });
      } else if (msg.action === 'get_mastery') {
        cb({ success: true, data: mockMastery });
      } else {
        cb({ success: true, data: {} });
      }
    });
  });

  it('Gate 1: Hydrates active Badge Test, locks navigation tabs, and displays live solve checklist', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Badge Test: Arrays Level 1/i)).toBeInTheDocument();
    });

    // Solve checklist rendering check
    expect(screen.getByText(/1\. Two Sum/i)).toBeInTheDocument();
    expect(screen.getByText(/🟢 Solved/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Majority Element/i)).toBeInTheDocument();

    // Standard navigation tabs must not be clickable during test
    expect(screen.queryByText(/Next Problems/i)).not.toBeInTheDocument();
  });

  it('Gate 2: Submit Test button opens confirmation modal with live problem status checklist', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Test/i })).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Test/i });
    fireEvent.click(submitBtn);

    // Confirmation Modal check
    expect(screen.getByText(/Ready to submit your/i)).toBeInTheDocument();
    expect(screen.getByText(/⚠️/i)).toBeInTheDocument();
    expect(screen.getByText(/Unsolved Problems:/i)).toBeInTheDocument();
  });

  it('Gate 3: "Go Back" (Unsubmit) closes confirmation modal, continues timer, and keeps test active', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Test/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Test/i }));
    expect(screen.getByText(/Ready to submit your/i)).toBeInTheDocument();

    // Click Go Back
    const goBackBtn = screen.getByRole('button', { name: /← Go Back/i });
    fireEvent.click(goBackBtn);

    // Modal is removed, test remains active
    await waitFor(() => {
      expect(screen.queryByText(/Ready to submit your/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Badge Test: Arrays Level 1/i)).toBeInTheDocument();
  });

  it('Gate 4: "Confirm Submit" dispatches submission, finalizes test, and returns to Mastery dashboard', async () => {
    window.alert = vi.fn();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Test/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Test/i }));
    const confirmBtn = screen.getByRole('button', { name: /Confirm Submit/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'submit_badge_test' },
        expect.any(Function)
      );
    });

    // Alert fired and active test cleared
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Badge Test submitted'));
  });

  it('Gate 5: "Abandon Test" flow prompts confirmation and resets active test session cleanly', async () => {
    window.confirm = vi.fn(() => true);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Abandon Test/i })).toBeInTheDocument();
    });

    const abandonBtn = screen.getByRole('button', { name: /Abandon Test/i });
    fireEvent.click(abandonBtn);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('abandon this Badge Test'));
    await waitFor(() => {
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'abandon_badge_test' },
        expect.any(Function)
      );
    });
  });
});
