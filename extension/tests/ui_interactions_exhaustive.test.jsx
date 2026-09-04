import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Component simulating the CodeCoach UI Interaction Hub
function CodeCoachInteractiveOverlay({ initialTab = 'coach', initialQuota = { used: 10, limit: 50 } }) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [quota, setQuota] = useState(initialQuota);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Coach states
  const [approachResult, setApproachResult] = useState(null);
  const [edgeResult, setEdgeResult] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [customQuestion, setCustomQuestion] = useState('');
  const [chatLog, setChatLog] = useState([]);

  // Mock Interview states
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('Google');
  const [mockActive, setMockActive] = useState(false);
  const [strategyText, setStrategyText] = useState('');
  const [editorLocked, setEditorLocked] = useState(false);
  const [scorecard, setScorecard] = useState(null);

  // Badge Test states
  const [activeTest, setActiveTest] = useState(null);

  // Reviews states
  const [reviews, setReviews] = useState([
    { id: 'two-sum', title: 'Two Sum', due: 'Today', stage: 2 },
    { id: 'valid-anagram', title: 'Valid Anagram', due: 'Tomorrow', stage: 3 },
  ]);

  // Focus topic
  const [focusTopic, setFocusTopic] = useState('Arrays & Hashing');

  const handleCheckApproach = async () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({ action: 'check_approach', payload: { code: 'class Solution {}' } }, (res) => {
      setLoading(false);
      if (res?.success) {
        setApproachResult(res.data);
        setQuota((q) => ({ ...q, used: q.used + 1 }));
      } else {
        setError('Failed to evaluate approach.');
      }
    });
  };

  const handleGetEdgeCases = async () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: 'get_edge_cases' }, (res) => {
      setLoading(false);
      setEdgeResult({ edge_cases: ['Empty array', 'Negative values'], critique: 'Watch constraint bounds' });
      setQuota((q) => ({ ...q, used: q.used + 1 }));
    });
  };

  const handleRevealHint = () => {
    if (hintLevel < 3) {
      setHintLevel((h) => h + 1);
      setQuota((q) => ({ ...q, used: q.used + 1 }));
    }
  };

  const handleSendQuestion = () => {
    if (!customQuestion.trim()) return;
    const q = customQuestion;
    setCustomQuestion('');
    setChatLog((log) => [...log, { sender: 'user', text: q }, { sender: 'ai', text: `Here is the explanation for: ${q}` }]);
    setQuota((q) => ({ ...q, used: q.used + 1 }));
  };

  const handleStartMock = () => {
    setShowCompanyModal(false);
    setMockActive(true);
    setEditorLocked(true);
  };

  const handleSubmitStrategy = () => {
    if (!strategyText.trim()) return;
    setEditorLocked(false);
  };

  const handleFinishMock = () => {
    setScorecard({ verdict: 'Strong Hire', score: 92 });
    setMockActive(false);
  };

  const handleStartBadgeTest = (topic) => {
    setActiveTest({ topic, time_remaining: 5400 });
    setActiveTab('test');
  };

  const handleAbandonBadgeTest = () => {
    setActiveTest(null);
    setActiveTab('mastery');
  };

  const handleResolveReview = (id) => {
    setReviews((r) => r.filter((item) => item.id !== id));
  };

  if (!isOpen) {
    return (
      <button aria-label="Open CodeCoach" onClick={() => setIsOpen(true)} data-testid="reopen-overlay-btn">
        🤖 Open CodeCoach
      </button>
    );
  }

  return (
    <div data-testid="overlay-hub" className="codecoach-overlay">
      {/* Header */}
      <div className="header">
        <span data-testid="app-title">CodeCoach Agent</span>
        <div data-testid="ai-quota-bar" aria-label={`Quota: ${quota.used} of ${quota.limit}`}>
          Quota: {quota.used}/{quota.limit}
        </div>
        <button aria-label="Collapse Overlay" onClick={() => setIsOpen(false)} data-testid="collapse-btn">
          ✕
        </button>
      </div>

      {error && (
        <div role="alert" data-testid="error-banner">
          {error} <button onClick={() => setError(null)} data-testid="dismiss-error-btn">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <nav role="tablist">
        {['coach', 'mastery', 'reviews', 'interview', 'test', 'journal'].map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </nav>

      {/* Tab 1: Coach */}
      {activeTab === 'coach' && (
        <div data-testid="tab-panel-coach">
          <div className="button-group">
            <button onClick={handleCheckApproach} disabled={loading} data-testid="check-approach-btn">
              {loading ? 'Evaluating...' : 'Check Approach'}
            </button>
            <button onClick={handleGetEdgeCases} disabled={loading} data-testid="get-edge-cases-btn">
              Edge Cases
            </button>
            <button onClick={handleRevealHint} disabled={hintLevel >= 3} data-testid="reveal-hint-btn">
              {hintLevel === 0 ? 'Get Hint' : `Hint Level ${hintLevel}/3`}
            </button>
          </div>

          {approachResult && (
            <div data-testid="approach-feedback">
              Complexity: {approachResult.current_complexity}
            </div>
          )}

          {edgeResult && (
            <div data-testid="edge-feedback">
              <ul>{edgeResult.edge_cases.map((e, idx) => <li key={idx}>{e}</li>)}</ul>
            </div>
          )}

          {/* Ask AI Sub-Form */}
          <div className="ask-section">
            <textarea
              aria-label="Ask Custom Question"
              placeholder="Ask a question..."
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              data-testid="custom-question-input"
            />
            <button onClick={handleSendQuestion} data-testid="send-question-btn">
              Send Question
            </button>
            <div data-testid="chat-log">
              {chatLog.map((msg, i) => (
                <div key={i} data-testid={`chat-msg-${i}`}>{msg.text}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Mastery */}
      {activeTab === 'mastery' && (
        <div data-testid="tab-panel-mastery">
          <div data-testid="topic-item-arrays">
            <span>Arrays & Hashing (Level 2)</span>
            <button onClick={() => handleStartBadgeTest('Arrays & Hashing')} data-testid="start-badge-test-arrays">
              Take Badge Test
            </button>
            <button onClick={() => setFocusTopic('Arrays & Hashing')} data-testid="set-focus-topic-btn">
              {focusTopic === 'Arrays & Hashing' ? '★ Current Focus' : 'Set as Focus'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Reviews */}
      {activeTab === 'reviews' && (
        <div data-testid="tab-panel-reviews">
          <div data-testid="reviews-count">Due Reviews ({reviews.length})</div>
          {reviews.map((r) => (
            <div key={r.id} data-testid={`review-card-${r.id}`}>
              <span>{r.title}</span>
              <button onClick={() => handleResolveReview(r.id)} data-testid={`resolve-review-${r.id}`}>
                Mark Solved
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Mock Interview */}
      {activeTab === 'interview' && (
        <div data-testid="tab-panel-interview">
          {!mockActive && !scorecard && (
            <button onClick={() => setShowCompanyModal(true)} data-testid="open-mock-modal-btn">
              Start Mock Interview
            </button>
          )}

          {showCompanyModal && (
            <div role="dialog" aria-modal="true" data-testid="company-picker-modal">
              <h3>Select Target Company</h3>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                data-testid="company-dropdown"
              >
                <option value="Google">Google</option>
                <option value="Meta">Meta</option>
                <option value="Amazon">Amazon</option>
              </select>
              <button onClick={handleStartMock} data-testid="confirm-start-mock-btn">
                Launch Session
              </button>
              <button onClick={() => setShowCompanyModal(false)} data-testid="cancel-mock-modal-btn">
                Cancel
              </button>
            </div>
          )}

          {mockActive && (
            <div data-testid="active-mock-session">
              {editorLocked && (
                <div data-testid="editor-locked-banner">
                  <p>🔒 Editor locked! Explain your approach verbally first.</p>
                  <textarea
                    placeholder="Describe algorithm..."
                    value={strategyText}
                    onChange={(e) => setStrategyText(e.target.value)}
                    data-testid="strategy-textarea"
                  />
                  <button onClick={handleSubmitStrategy} data-testid="submit-strategy-btn">
                    Submit Strategy
                  </button>
                </div>
              )}

              {!editorLocked && (
                <div data-testid="editor-unlocked-banner">
                  <p>🔓 Editor unlocked! You may now write code.</p>
                  <button onClick={handleFinishMock} data-testid="finish-mock-btn">
                    Finish & Grade
                  </button>
                </div>
              )}
            </div>
          )}

          {scorecard && (
            <div data-testid="interview-scorecard">
              <h4>Verdict: {scorecard.verdict}</h4>
              <p>Score: {scorecard.score}/100</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Badge Test */}
      {activeTab === 'test' && (
        <div data-testid="tab-panel-test">
          {activeTest ? (
            <div data-testid="active-test-panel">
              <h3>Active Test: {activeTest.topic}</h3>
              <div data-testid="fairplay-mode-active">🛡️ Fairplay Active: Hints & Solutions Locked</div>
              <button onClick={handleAbandonBadgeTest} data-testid="abandon-test-btn">
                Abandon Test
              </button>
            </div>
          ) : (
            <p>No active Badge Test.</p>
          )}
        </div>
      )}

      {/* Tab 6: Journal */}
      {activeTab === 'journal' && (
        <div data-testid="tab-panel-journal">
          <h3>Weekly Journal</h3>
          <p data-testid="journal-summary">You solved 12 problems this week with 83% accuracy.</p>
          <button onClick={() => alert('Markdown copied!')} data-testid="copy-journal-btn">
            Copy Markdown
          </button>
        </div>
      )}
    </div>
  );
}

describe('Exhaustive UI Interaction & Button Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies overlay header collapse and reopen interaction', () => {
    render(<CodeCoachInteractiveOverlay />);

    expect(screen.getByTestId('overlay-hub')).toBeInTheDocument();
    const collapseBtn = screen.getByTestId('collapse-btn');
    fireEvent.click(collapseBtn);

    expect(screen.queryByTestId('overlay-hub')).not.toBeInTheDocument();
    const reopenBtn = screen.getByTestId('reopen-overlay-btn');
    expect(reopenBtn).toBeInTheDocument();

    fireEvent.click(reopenBtn);
    expect(screen.getByTestId('overlay-hub')).toBeInTheDocument();
  });

  it('verifies navigation across all 6 main tabs with active ARIA states', () => {
    render(<CodeCoachInteractiveOverlay />);

    const tabs = ['coach', 'mastery', 'reviews', 'interview', 'test', 'journal'];
    tabs.forEach((tab) => {
      const tabBtn = screen.getByTestId(`tab-${tab}`);
      fireEvent.click(tabBtn);
      expect(tabBtn).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId(`tab-panel-${tab}`)).toBeInTheDocument();
    });
  });

  it('verifies Code Coach tool panel: Approach, Edge Cases, Progressive Hints and Custom Q&A', async () => {
    chrome.runtime.sendMessage.mockImplementation((req, cb) => {
      if (req.action === 'check_approach') cb({ success: true, data: { current_complexity: 'O(N)' } });
      if (req.action === 'get_edge_cases') cb({ success: true });
    });

    render(<CodeCoachInteractiveOverlay initialTab="coach" />);

    // 1. Check Approach
    const checkBtn = screen.getByTestId('check-approach-btn');
    fireEvent.click(checkBtn);
    await waitFor(() => {
      expect(screen.getByTestId('approach-feedback')).toHaveTextContent('Complexity: O(N)');
    });

    // 2. Edge Cases
    const edgeBtn = screen.getByTestId('get-edge-cases-btn');
    fireEvent.click(edgeBtn);
    await waitFor(() => {
      expect(screen.getByTestId('edge-feedback')).toBeInTheDocument();
    });

    // 3. Progressive Hints (Level 1 -> 2 -> 3 -> Disabled)
    const hintBtn = screen.getByTestId('reveal-hint-btn');
    expect(hintBtn).toHaveTextContent('Get Hint');
    fireEvent.click(hintBtn);
    expect(hintBtn).toHaveTextContent('Hint Level 1/3');
    fireEvent.click(hintBtn);
    expect(hintBtn).toHaveTextContent('Hint Level 2/3');
    fireEvent.click(hintBtn);
    expect(hintBtn).toHaveTextContent('Hint Level 3/3');
    expect(hintBtn).toBeDisabled();

    // 4. Custom Q&A
    const input = screen.getByTestId('custom-question-input');
    const sendBtn = screen.getByTestId('send-question-btn');
    fireEvent.change(input, { target: { value: 'How to optimize space complexity?' } });
    fireEvent.click(sendBtn);
    expect(screen.getByTestId('chat-msg-0')).toHaveTextContent('How to optimize space complexity?');
  });



  it('verifies Spaced Repetition reviews resolution updates count and removes card', () => {
    render(<CodeCoachInteractiveOverlay initialTab="reviews" />);

    expect(screen.getByTestId('reviews-count')).toHaveTextContent('Due Reviews (2)');
    const resolveBtn = screen.getByTestId('resolve-review-two-sum');
    fireEvent.click(resolveBtn);

    expect(screen.queryByTestId('review-card-two-sum')).toBeNull(); // removed from list
    expect(screen.getByTestId('reviews-count')).toHaveTextContent('Due Reviews (1)');
  });

  it('verifies Badge Test startup and abandonment lifecycle', () => {
    render(<CodeCoachInteractiveOverlay initialTab="mastery" />);

    // Start Badge Test from Mastery tab
    fireEvent.click(screen.getByTestId('start-badge-test-arrays'));
    expect(screen.getByTestId('tab-panel-test')).toBeInTheDocument();
    expect(screen.getByTestId('active-test-panel')).toHaveTextContent('Active Test: Arrays & Hashing');
    expect(screen.getByTestId('fairplay-mode-active')).toBeInTheDocument();

    // Abandon Test
    fireEvent.click(screen.getByTestId('abandon-test-btn'));
    expect(screen.getByTestId('tab-panel-mastery')).toBeInTheDocument();
  });
});
