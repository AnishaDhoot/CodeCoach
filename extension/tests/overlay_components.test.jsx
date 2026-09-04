import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Component Mock representing Diagnostic Card (Tier 1 AI Diagnosis)
function DiagnosticCard({ diagnosis, onClear }) {
  if (!diagnosis) return null;
  const categoryLabels = {
    wrong_approach: 'Algorithmic Flaw (Wrong Approach)',
    implementation_bug: 'Implementation / Off-by-one Bug',
    edge_case_miss: 'Unhandled Edge Case',
    complexity_issue: 'Time / Space Complexity Issue',
    unclear: 'Syntax / Compilation Issue',
  };

  return (
    <div data-testid="diagnostic-card" className="diagnostic-modal">
      <h3>Root Cause Diagnosis</h3>
      <span data-testid="diagnosis-badge">{categoryLabels[diagnosis.root_cause_category] || 'General Issue'}</span>
      <p data-testid="diagnosis-explanation">{diagnosis.explanation}</p>
      <div data-testid="diagnosis-action">{diagnosis.suggested_action}</div>
      <button onClick={onClear} data-testid="close-diagnosis-btn">Close</button>
    </div>
  );
}

// Component Mock representing Progressive Hints (Tier 3.1)
function ProgressiveHintCard({ onRevealNext, currentHint, currentLevel, hasNext, quotaLeft }) {
  return (
    <div data-testid="progressive-hint-card">
      <h4>Progressive Hints</h4>
      <div data-testid="hint-level-indicator">Level {currentLevel} of 3</div>
      {currentHint ? (
        <div data-testid="hint-content">{currentHint}</div>
      ) : (
        <div data-testid="hint-placeholder">Stuck? Reveal a gentle conceptual hint.</div>
      )}
      {hasNext && (
        <button
          data-testid="reveal-hint-btn"
          disabled={quotaLeft <= 0}
          onClick={() => onRevealNext(currentLevel + 1)}
        >
          Reveal Level {currentLevel + 1} Hint
        </button>
      )}
    </div>
  );
}

// Component Mock representing Mock Interview Verbal Strategy Gate (Tier 4.2)
function MockInterviewGate({ isLocked, onApprove, onReject }) {
  const [approach, setApproach] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    if (approach.trim().length < 8) {
      onReject('Please provide a specific algorithmic strategy.');
      setSubmitting(false);
      return;
    }
    // Simulate AI strategy evaluation
    onApprove();
    setSubmitting(false);
  };

  return (
    <div data-testid="mock-interview-gate">
      {isLocked ? (
        <div data-testid="editor-locked-banner">
          <h3>Editor Locked — Explain Strategy First</h3>
          <textarea
            data-testid="strategy-input"
            value={approach}
            onChange={(e) => setApproach(e.target.value)}
            placeholder="Describe your algorithm (e.g. Two Pointers O(N))..."
          />
          <button data-testid="submit-strategy-btn" onClick={handleSubmit} disabled={submitting}>
            Submit Strategy to Interviewer
          </button>
        </div>
      ) : (
        <div data-testid="editor-unlocked-banner">
          <h3>Editor Unlocked! Good luck.</h3>
        </div>
      )}
    </div>
  );
}

describe('CodeCoach React UI Overlay Components', () => {
  it('renders DiagnosticCard with category, plain-English explanation, and suggested action', () => {
    const mockDiagnosis = {
      root_cause_category: 'edge_case_miss',
      explanation: 'Your loop does not check for empty or single-element inputs before indexing nums[1].',
      suggested_action: 'Add an early return check if nums.length < 2.',
    };
    const onClear = vi.fn();

    render(<DiagnosticCard diagnosis={mockDiagnosis} onClear={onClear} />);

    expect(screen.getByTestId('diagnostic-card')).toBeInTheDocument();
    expect(screen.getByTestId('diagnosis-badge')).toHaveTextContent('Unhandled Edge Case');
    expect(screen.getByTestId('diagnosis-explanation')).toHaveTextContent('does not check for empty or single-element inputs');
    expect(screen.getByTestId('diagnosis-action')).toHaveTextContent('Add an early return check');

    fireEvent.click(screen.getByTestId('close-diagnosis-btn'));
    expect(onClear).toHaveBeenCalled();
  });

  it('steps through progressive hint levels 1 -> 2 -> 3 correctly', async () => {
    function HintWorkflow() {
      const [level, setLevel] = useState(0);
      const [hint, setHint] = useState('');

      const handleReveal = (nextLevel) => {
        setLevel(nextLevel);
        if (nextLevel === 1) setHint('Notice that numbers can be negative.');
        else if (nextLevel === 2) setHint('Use a sliding window with two pointers left and right.');
        else if (nextLevel === 3) setHint('Initialize left=0, iterate right, expand until sum > k then shrink left.');
      };

      return (
        <ProgressiveHintCard
          currentHint={hint}
          currentLevel={level}
          hasNext={level < 3}
          quotaLeft={50}
          onRevealNext={handleReveal}
        />
      );
    }

    render(<HintWorkflow />);

    expect(screen.getByTestId('hint-level-indicator')).toHaveTextContent('Level 0 of 3');
    expect(screen.getByTestId('reveal-hint-btn')).toHaveTextContent('Reveal Level 1 Hint');

    // Reveal Level 1
    fireEvent.click(screen.getByTestId('reveal-hint-btn'));
    expect(screen.getByTestId('hint-content')).toHaveTextContent('Notice that numbers can be negative.');
    expect(screen.getByTestId('hint-level-indicator')).toHaveTextContent('Level 1 of 3');

    // Reveal Level 2
    fireEvent.click(screen.getByTestId('reveal-hint-btn'));
    expect(screen.getByTestId('hint-content')).toHaveTextContent('Use a sliding window');
    expect(screen.getByTestId('hint-level-indicator')).toHaveTextContent('Level 2 of 3');

    // Reveal Level 3
    fireEvent.click(screen.getByTestId('reveal-hint-btn'));
    expect(screen.getByTestId('hint-content')).toHaveTextContent('Initialize left=0');
    expect(screen.queryByTestId('reveal-hint-btn')).not.toBeInTheDocument();
  });


});
