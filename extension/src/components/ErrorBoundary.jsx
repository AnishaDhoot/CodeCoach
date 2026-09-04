import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DSA Tutor] Caught in ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '16px',
          margin: '12px',
          background: '#18181b',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          color: '#f4f4f5',
          fontSize: '12px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ fontWeight: '600', color: '#f87171', marginBottom: '6px' }}>
            ⚠️ DSA Tutor encountered a display error
          </div>
          <p style={{ margin: '0 0 10px 0', color: '#a1a1aa', fontSize: '11px', lineHeight: '1.4' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (window.dsaTutor?.refreshData) window.dsaTutor.refreshData();
            }}
            style={{
              background: '#27272a',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            Reload Extension Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
