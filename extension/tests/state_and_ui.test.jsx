import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Component Mock representing Quota & Fairplay Status Bar
function StatusBar({ quotaUsed, quotaLimit, isTestActive, isContestActive }) {
  const remaining = Math.max(0, quotaLimit - quotaUsed);
  const percent = Math.min(100, (quotaUsed / quotaLimit) * 100);
  const isLocked = isTestActive || isContestActive;

  return (
    <div data-testid="status-bar" className="status-bar">
      <div data-testid="quota-counter">
        AI Quota: <span>{remaining}</span>/{quotaLimit}
      </div>
      <div
        data-testid="quota-progress"
        style={{ width: `${percent}%` }}
        role="progressbar"
        aria-valuenow={quotaUsed}
        aria-valuemax={quotaLimit}
      />
      {isLocked && (
        <div data-testid="fairplay-locked-badge" className="fairplay-tag">
          {isContestActive ? 'CONTEST MODE — AI LOCKED' : 'BADGE TEST — FAIRPLAY ACTIVE'}
        </div>
      )}
    </div>
  );
}

// Component Mock representing Spaced Repetition Reviews List (Tier 2.3)
function ReviewQueue({ reviews, onSolveReview }) {
  if (!reviews || reviews.length === 0) {
    return <div data-testid="no-reviews-msg">All caught up! No reviews due today. 🎉</div>;
  }

  return (
    <div data-testid="review-queue-list">
      <h3>Due For Review ({reviews.length})</h3>
      {reviews.map((r) => (
        <div key={r.problem_id} data-testid={`review-item-${r.problem_id}`} className="review-card">
          <span className="review-title">{r.title}</span>
          <span className="review-stage">Stage {r.stage}/4</span>
          <button
            data-testid={`solve-review-btn-${r.problem_id}`}
            onClick={() => onSolveReview(r.problem_id)}
          >
            Practice Now
          </button>
        </div>
      ))}
    </div>
  );
}

// Component Mock representing Topic Mastery Badges (Tier 1.2)
function TopicMasteryList({ topics }) {
  const badgeColors = {
    Locked: '#6B7280',
    Bronze: '#D97706',
    Silver: '#9CA3AF',
    Gold: '#F59E0B',
    Platinum: '#06B6D4',
    Diamond: '#8B5CF6',
  };

  return (
    <div data-testid="topic-mastery-list">
      {topics.map((t) => (
        <div key={t.topic} data-testid={`topic-badge-${t.topic}`} className="badge-item">
          <span className="topic-name">{t.topic}</span>
          <span
            data-testid={`badge-level-${t.topic}`}
            style={{ color: badgeColors[t.badge] || '#fff' }}
          >
            {t.badge} (Lv. {t.level})
          </span>
          <span className="mastery-percent">{Math.round(t.mastery_score * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

describe('Frontend State Machine & Status UI Tests', () => {
  it('correctly computes and displays AI quota progress bar and remaining requests', () => {
    render(<StatusBar quotaUsed={10} quotaLimit={50} isTestActive={false} isContestActive={false} />);

    expect(screen.getByTestId('quota-counter')).toHaveTextContent('AI Quota: 40/50');
    const progressBar = screen.getByTestId('quota-progress');
    expect(progressBar).toHaveStyle({ width: '20%' });
    expect(screen.queryByTestId('fairplay-locked-badge')).not.toBeInTheDocument();
  });

  it('displays Fairplay Lock badge when active in contest or badge test', () => {
    const { rerender } = render(
      <StatusBar quotaUsed={5} quotaLimit={50} isTestActive={true} isContestActive={false} />
    );
    expect(screen.getByTestId('fairplay-locked-badge')).toHaveTextContent('BADGE TEST — FAIRPLAY ACTIVE');

    rerender(<StatusBar quotaUsed={5} quotaLimit={50} isTestActive={false} isContestActive={true} />);
    expect(screen.getByTestId('fairplay-locked-badge')).toHaveTextContent('CONTEST MODE — AI LOCKED');
  });

  it('renders Spaced Repetition queue with due items and triggers practice action', () => {
    const mockReviews = [
      { problem_id: 'two-sum', title: 'Two Sum', stage: 1, difficulty: 'Easy' },
      { problem_id: '3sum', title: '3Sum', stage: 2, difficulty: 'Medium' },
    ];
    const onSolve = vi.fn();

    const { rerender } = render(<ReviewQueue reviews={mockReviews} onSolveReview={onSolve} />);

    expect(screen.getByTestId('review-item-two-sum')).toHaveTextContent('Two Sum');
    expect(screen.getByTestId('review-item-two-sum')).toHaveTextContent('Stage 1/4');
    expect(screen.getByTestId('review-item-3sum')).toHaveTextContent('3Sum');

    fireEvent.click(screen.getByTestId('solve-review-btn-two-sum'));
    expect(onSolve).toHaveBeenCalledWith('two-sum');

    // Test empty state
    rerender(<ReviewQueue reviews={[]} onSolveReview={onSolve} />);
    expect(screen.getByTestId('no-reviews-msg')).toHaveTextContent('All caught up!');
  });

  it('renders Topic Mastery Badges with correct levels and badge names', () => {
    const mockTopics = [
      { topic: 'Arrays & Hashing', level: 3, badge: 'Gold', mastery_score: 0.6 },
      { topic: 'Dynamic Programming', level: 0, badge: 'Locked', mastery_score: 0.0 },
      { topic: 'Binary Search', level: 5, badge: 'Diamond', mastery_score: 1.0 },
    ];

    render(<TopicMasteryList topics={mockTopics} />);

    expect(screen.getByTestId('badge-level-Arrays & Hashing')).toHaveTextContent('Gold (Lv. 3)');
    expect(screen.getByTestId('badge-level-Dynamic Programming')).toHaveTextContent('Locked (Lv. 0)');
    expect(screen.getByTestId('badge-level-Binary Search')).toHaveTextContent('Diamond (Lv. 5)');
  });
});
