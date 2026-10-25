import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', color: '#ff5555', background: '#121212', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Application Render Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#1e1e1e', padding: '16px', borderRadius: '4px', border: '1px solid #333' }}>
            {this.state.error?.toString()}
          </pre>
          {this.state.errorInfo && (
            <details style={{ marginTop: '16px', color: '#aaa' }}>
              <summary>Component Stack</summary>
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.href = '/'}
            style={{ marginTop: '20px', padding: '8px 16px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer' }}
          >
            Go Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
