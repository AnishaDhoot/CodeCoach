import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

describe('Progressive Hints and Assessment Tab Locks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.dsaTutor = {
      getIdentity: () => ({ problemId: 'two-sum', problemTitle: 'Two Sum' }),
      getCode: async () => 'def twoSum(): pass',
      getLanguage: () => 'python3',
      getConstraints: () => ['2 <= nums.length <= 10^4'],
      resetEditor: vi.fn(),
      setAssessmentLocked: vi.fn(),
      setEditorReadOnly: vi.fn(),
      hintsUsed: 0
    };

    global.chrome = {
      runtime: {
        sendMessage: vi.fn((msg, callback) => {
          if (msg.action === 'get_ai_quota') {
            callback({ success: true, data: { used: 0, limit: 50 } });
          } else if (msg.action === 'get_active_badge_test') {
            callback({ success: true, data: null });
          } else if (msg.action === 'get_active_mock') {
            callback({ success: true, data: null });
          } else if (msg.action === 'get_mastery') {
            callback({ success: true, data: [] });
          } else if (msg.action === 'get_recommendation') {
            callback({ success: true, data: { recommendations: [], reviews: [] } });
          } else if (msg.action === 'get_companies') {
            callback({ success: true, data: ['Cisco', 'Google', 'Meta'] });
          } else if (msg.action === 'get_focus') {
            callback({ success: true, data: { focus_topics: [] } });
          } else if (msg.action === 'get_streak') {
            callback({ success: true, data: { current_streak_days: 1, problems_today: 0, solved_today: 0 } });
          } else if (msg.action === 'reveal_hint') {
            const lvl = msg.payload.level || 1;
            callback({
              success: true,
              data: {
                level: lvl,
                hint: `Hint text for Level ${lvl}`,
                has_next: lvl < 3
              }
            });
          } else {
            callback({ success: true, data: {} });
          }
        })
      }
    };
  });

  it('progressively advances from Level 1 -> Level 2 -> Level 3 hint sequentially', async () => {
    render(<App />);

    // Click "Get a Hint" button
    const getHintBtn = await screen.findByText('Get a Hint');
    fireEvent.click(getHintBtn);

    // Verify first request was level 1
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reveal_hint',
          payload: expect.objectContaining({ level: 1 })
        }),
        expect.any(Function)
      );
    });

    // Verify Level 1 badge is displayed
    expect(await screen.findByText(/Level 1: Conceptual Strategy/i)).toBeInTheDocument();
    expect(screen.getByText('Hint text for Level 1')).toBeInTheDocument();

    // Click "Reveal Next Hint (Level 2)"
    const nextHintBtn = await screen.findByText(/Reveal Next Hint \(Level 2\)/i);
    fireEvent.click(nextHintBtn);

    // Verify second request was level 2
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reveal_hint',
          payload: expect.objectContaining({ level: 2 })
        }),
        expect.any(Function)
      );
    });

    // Verify Level 2 badge is displayed
    expect(await screen.findByText(/Level 2: Algorithmic Strategy/i)).toBeInTheDocument();
    expect(screen.getByText('Hint text for Level 2')).toBeInTheDocument();

    // Click "Reveal Next Hint (Level 3)"
    const level3Btn = await screen.findByText(/Reveal Next Hint \(Level 3\)/i);
    fireEvent.click(level3Btn);

    // Verify third request was level 3
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reveal_hint',
          payload: expect.objectContaining({ level: 3 })
        }),
        expect.any(Function)
      );
    });

    // Verify Level 3 badge is displayed
    expect(await screen.findByText(/Level 3: Pseudocode Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText('Hint text for Level 3')).toBeInTheDocument();
  });
});
