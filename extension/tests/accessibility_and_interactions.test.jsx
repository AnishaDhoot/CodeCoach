import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Component Mock representing an Accessible Action Modal
function AccessibleModal({ isOpen, onClose, onConfirm, title, children }) {
  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      data-testid="modal-container"
    >
      <h2 id="modal-title">{title}</h2>
      <div data-testid="modal-body">{children}</div>
      <button aria-label="Close dialog" onClick={onClose} data-testid="modal-close-btn">
        ✕
      </button>
      <button onClick={onConfirm} data-testid="modal-confirm-btn">
        Confirm Action
      </button>
    </div>
  );
}

// Component Mock representing Double-Click Protected Action Button
function DebouncedActionButton({ onClick, label }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      data-testid="protected-action-btn"
    >
      {loading ? 'Processing...' : label}
    </button>
  );
}

describe('Frontend Accessibility & Interaction Rigor Tests', () => {
  it('closes accessible modal upon pressing Escape key', () => {
    const onClose = vi.fn();
    render(
      <AccessibleModal isOpen={true} onClose={onClose} onConfirm={() => {}} title="Test Dialog">
        Modal Content
      </AccessibleModal>
    );

    const modal = screen.getByTestId('modal-container');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(modal, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prevents multiple dispatches on rapid double-clicking of action buttons', async () => {
    const asyncAction = vi.fn().mockImplementation(() => new Promise((res) => setTimeout(res, 50)));
    render(<DebouncedActionButton onClick={asyncAction} label="Submit Code" />);

    const btn = screen.getByTestId('protected-action-btn');
    expect(btn).toHaveTextContent('Submit Code');

    // Rapid double click
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(asyncAction).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('verifies ARIA accessibility landmarks and labels on interactive controls', () => {
    render(
      <AccessibleModal isOpen={true} onClose={() => {}} onConfirm={() => {}} title="Start Assessment">
        <p>Your editor will be locked until strategy approval.</p>
      </AccessibleModal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Start Assessment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close dialog/i })).toBeInTheDocument();
  });
});
