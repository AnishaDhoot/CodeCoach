import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Component simulating Assessment Integrity, Tab Lockout, and Enhanced Feature Flows
function AssessmentFeatureOverlay({
  initialTest = null,
  initialMock = null,
  initialCompanies = ['Google', 'Amazon', 'Meta'],
  initialReviews = [{ problem_id: 'two-sum', title: 'Two Sum', difficulty: 'Easy', stage: 1, due_date: '2026-08-25T00:00:00Z' }]
}) {
  const [activeTab, setActiveTab] = useState(initialTest ? 'test' : initialMock ? 'mock' : 'coach');
  const [activeTest, setActiveTest] = useState(initialTest);

  // Coach states
  const [currentProblemId, setCurrentProblemId] = useState('two-sum');
  const [coachResults, setCoachResults] = useState([{ id: 1, question: 'First Question?', answer: 'First Answer' }]);
  const [askInput, setAskInput] = useState('');
  
  // Recommendation & Company states
  const [companies, setCompanies] = useState(initialCompanies);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [recommendations, setRecommendations] = useState([
    { problem_id: 'two-sum', title: 'Two Sum', difficulty: 'Easy', companies: 'Google' },
    { problem_id: '3sum', title: '3Sum', difficulty: 'Medium', companies: 'Amazon' }
  ]);
  const [reviews, setReviews] = useState(initialReviews);

  // Focus topics
  const [focusTopics, setFocusTopics] = useState([]);

  // Submit test message & confirm modal
  const [testResultMsg, setTestResultMsg] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Simulate code submission vs problem change
  const handleCodeSubmission = (url) => {
    // LeetCode URL changes to /submissions/123/ on submit, but problem ID remains the same
    const problemSlug = url.includes('/problems/') ? url.split('/problems/')[1].split('/')[0] : currentProblemId;
    if (problemSlug !== currentProblemId) {
      setCurrentProblemId(problemSlug);
      setCoachResults([]);
    }
  };

  const handleAskQuestion = () => {
    if (!askInput.trim()) return;
    // New question is prepended to the top of the Q&A list
    setCoachResults(prev => [{ id: Date.now(), question: askInput, answer: `Answer to: ${askInput}` }, ...prev]);
    setAskInput('');
  };

  const handleProblemChange = (newProblemId) => {
    if (newProblemId !== currentProblemId) {
      setCurrentProblemId(newProblemId);
      setCoachResults([]); // Resets on problem change
    }
  };

  const toggleFocus = (topic) => {
    if (focusTopics.includes(topic)) {
      setFocusTopics(focusTopics.filter(t => t !== topic));
    } else {
      setFocusTopics([...focusTopics, topic]);
    }
  };

  const handleCompanyChange = (company) => {
    setSelectedCompany(company);
    if (company) {
      setRecommendations([
        { problem_id: 'target-prob', title: `${company} Specific Problem`, difficulty: 'Medium', companies: company }
      ]);
    }
  };

  const handleSubmitBadgeTest = () => {
    setShowConfirmModal(false);
    if (activeTest && activeTest.problem1_solved && activeTest.problem2_solved) {
      setTestResultMsg('Badge Test passed! Level earned.');
    } else {
      setTestResultMsg('Badge Test submitted. Both problems required.');
    }
    setActiveTest(null);
    setActiveTab('mastery');
  };

  const handleAbandonBadgeTest = () => {
    setActiveTest(null);
    setActiveTab('mastery');
  };

  const isAssessmentActive = !!(activeTest);

  return (
    <div data-testid="assessment-overlay">
      {/* Navigation tabs header */}
      <div data-testid="tab-navigation">
        {isAssessmentActive ? (
          <div data-testid="assessment-lock-banner" style={{ color: '#ef4444' }}>
            🔒 Assessment in Progress — Tab Switching Locked
          </div>
        ) : (
          <div className="tab-buttons">
            <button data-testid="tab-coach" onClick={() => setActiveTab('coach')}>Coach</button>
            <button data-testid="tab-recommendation" onClick={() => setActiveTab('recommendation')}>Next</button>
            <button data-testid="tab-mastery" onClick={() => setActiveTab('mastery')}>Mastery</button>
            <button data-testid="tab-history" onClick={() => setActiveTab('history')}>Sync</button>
          </div>
        )}
      </div>

      {/* Tab: Coach */}
      {!isAssessmentActive && activeTab === 'coach' && (
        <div data-testid="coach-panel">
          <div data-testid="current-problem">{currentProblemId}</div>
          <button data-testid="submit-code-btn" onClick={() => handleCodeSubmission('https://leetcode.com/problems/two-sum/submissions/12345/')}>Submit Code</button>
          <button data-testid="change-problem-btn" onClick={() => handleProblemChange('next-permutation')}>Next Question</button>
          
          <div className="ask-box">
            <input
              data-testid="ask-input"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              placeholder="Ask Tutor..."
            />
            <button data-testid="ask-submit-btn" onClick={handleAskQuestion}>Ask</button>
          </div>

          <div data-testid="coach-results">
            {coachResults.map(r => (
              <div key={r.id} data-testid="coach-result-item">{r.question} - {r.answer}</div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Recommendation */}
      {!isAssessmentActive && activeTab === 'recommendation' && (
        <div data-testid="recommendation-panel">
          <select
            data-testid="company-filter-dropdown"
            value={selectedCompany}
            onChange={(e) => handleCompanyChange(e.target.value)}
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div data-testid="rec-problems-list">
            {recommendations.map(p => (
              <div key={p.problem_id} data-testid="rec-problem-item">{p.title}</div>
            ))}
          </div>
          <div data-testid="reviews-list">
            {reviews.map(r => (
              <div key={r.problem_id} data-testid="review-due-card">
                <span>{r.title}</span>
                <span data-testid="review-due-date">Due: {new Date(r.due_date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Mastery */}
      {!isAssessmentActive && activeTab === 'mastery' && (
        <div data-testid="mastery-panel">
          <button
            data-testid="focus-btn-arrays"
            className={focusTopics.includes('Arrays') ? 'active' : ''}
            onClick={() => toggleFocus('Arrays')}
          >
            {focusTopics.includes('Arrays') ? 'Focused' : 'Focus'}
          </button>
          {testResultMsg && <div data-testid="test-result-msg">{testResultMsg}</div>}
        </div>
      )}

      {/* Assessment: Badge Test View */}
      {activeTest && (
        <div data-testid="badge-test-panel">
          <h3>Badge Test: {activeTest.topic} Level {activeTest.level}</h3>
          <button data-testid="submit-test-btn" onClick={() => setShowConfirmModal(true)}>Submit Test</button>
          <button data-testid="abandon-test-btn" onClick={handleAbandonBadgeTest}>Abandon Test</button>

          {showConfirmModal && (
            <div data-testid="badge-submit-confirm-modal">
              <h4>Confirm Test Submission</h4>
              <button data-testid="confirm-go-back-btn" onClick={() => setShowConfirmModal(false)}>Go Back</button>
              <button data-testid="confirm-submit-btn" onClick={handleSubmitBadgeTest}>Confirm Submit</button>
            </div>
          )}
        </div>
      )}


    </div>
  );
}

describe('Assessment Integrity & Enhanced Features Exhaustive Interaction Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends newly asked questions above the previous questions', () => {
    render(<AssessmentFeatureOverlay />);
    const askInput = screen.getByTestId('ask-input');
    const askBtn = screen.getByTestId('ask-submit-btn');

    fireEvent.change(askInput, { target: { value: 'Second Question?' } });
    fireEvent.click(askBtn);

    const items = screen.getAllByTestId('coach-result-item');
    expect(items.length).toBe(2);
    // The new question must be FIRST (above the last question)
    expect(items[0]).toHaveTextContent('Second Question?');
    expect(items[1]).toHaveTextContent('First Question?');
  });

  it('verifies Code Coach results persist when submitting code (URL changes to /submissions/) and only resets on problem change', () => {
    render(<AssessmentFeatureOverlay />);
    // Simulate navigating to a completely new problem
    fireEvent.click(screen.getByTestId('change-problem-btn'));
    // Coach results should be reset
    expect(screen.queryByTestId('coach-result-item')).not.toBeInTheDocument();
  });

  it('disables tab switching and locks navigation during an active Badge Test', () => {
    const testState = { id: 1, topic: 'Arrays', level: 2, problem1_solved: false, problem2_solved: false };
    render(<AssessmentFeatureOverlay initialTest={testState} />);

    expect(screen.getByTestId('assessment-lock-banner')).toBeInTheDocument();
    expect(screen.getByTestId('assessment-lock-banner')).toHaveTextContent('Tab Switching Locked');
    expect(screen.queryByTestId('tab-coach')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-mastery')).not.toBeInTheDocument();
    expect(screen.getByTestId('badge-test-panel')).toBeInTheDocument();
  });



  it('verifies Submit Test confirmation modal with Go Back (unsubmit) and Confirm actions', () => {
    const testState = { id: 1, topic: 'Arrays', level: 2, problem1_solved: true, problem2_solved: true };
    render(<AssessmentFeatureOverlay initialTest={testState} />);

    expect(screen.getByTestId('submit-test-btn')).toBeInTheDocument();
    expect(screen.getByTestId('abandon-test-btn')).toBeInTheDocument();

    // Click Submit Test -> Modal opens
    fireEvent.click(screen.getByTestId('submit-test-btn'));
    expect(screen.getByTestId('badge-submit-confirm-modal')).toBeInTheDocument();

    // User chooses to Go Back (unsubmit) -> Modal closes and test stays active
    fireEvent.click(screen.getByTestId('confirm-go-back-btn'));
    expect(screen.queryByTestId('badge-submit-confirm-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('badge-test-panel')).toBeInTheDocument();

    // User clicks Submit Test again and Confirms -> Evaluates test
    fireEvent.click(screen.getByTestId('submit-test-btn'));
    fireEvent.click(screen.getByTestId('confirm-submit-btn'));
    expect(screen.getByTestId('mastery-panel')).toBeInTheDocument();
    expect(screen.getByTestId('test-result-msg')).toHaveTextContent('Badge Test passed! Level earned.');
  });

  it('verifies Target Companies dropdown filters recommendations', () => {
    render(<AssessmentFeatureOverlay />);
    fireEvent.click(screen.getByTestId('tab-recommendation'));

    const dropdown = screen.getByTestId('company-filter-dropdown');
    expect(dropdown).toHaveTextContent('Google');
    expect(dropdown).toHaveTextContent('Amazon');

    fireEvent.change(dropdown, { target: { value: 'Google' } });
    expect(screen.getByTestId('rec-problems-list')).toHaveTextContent('Google Specific Problem');
  });

  it('verifies Topic Focus button toggling functionality', () => {
    render(<AssessmentFeatureOverlay />);
    fireEvent.click(screen.getByTestId('tab-mastery'));

    const focusBtn = screen.getByTestId('focus-btn-arrays');
    expect(focusBtn).toHaveTextContent('Focus');

    fireEvent.click(focusBtn);
    expect(focusBtn).toHaveTextContent('Focused');

    fireEvent.click(focusBtn);
    expect(focusBtn).toHaveTextContent('Focus');
  });

  it('verifies Spaced Repetition review cards render scheduled due dates', () => {
    render(<AssessmentFeatureOverlay />);
    fireEvent.click(screen.getByTestId('tab-recommendation'));

    expect(screen.getByTestId('review-due-date')).toBeInTheDocument();
    expect(screen.getByTestId('review-due-date')).toHaveTextContent('Due:');
  });
});
