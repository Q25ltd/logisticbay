import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional fallback. Defaults to a generic recovery card. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches unhandled render errors in child components so an isolated crash
 * doesn't white-screen the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in dev; replace with Sentry.captureException(error, { extra: info }) once Sentry is wired.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
          <div className="card max-w-md w-full p-6 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-black text-primary mb-2">Something went wrong</h2>
            <p className="text-sm text-muted mb-4">
              An unexpected error occurred. Your data has not been lost.
            </p>
            <button
              className="btn btn-primary text-sm px-4 py-2"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
