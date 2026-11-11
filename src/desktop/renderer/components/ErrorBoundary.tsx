import type { ReactNode } from 'react';
import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

/** Defines the content protected by the renderer error boundary. */
export interface ErrorBoundaryProps {
  /** Application content to render until a descendant throws. */
  children: ReactNode;
}

/** Defines the captured renderer failure state. */
interface ErrorBoundaryState {
  /** Error caught from a descendant render or lifecycle. */
  error: Error | null;
}

/**
 * Contains an unexpected renderer failure and offers a local recovery path.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  /**
   * Stores an error before the recovery UI is rendered.
   *
   * Args:
   *   error: Failure raised by a descendant component.
   *
   * Returns:
   *   The next error-boundary state.
   */
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /**
   * Clears the captured error and retries rendering the protected content.
   *
   * Returns:
   *   Nothing.
   */
  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  /**
   * Renders protected application content or a focused recovery screen.
   *
   * Returns:
   *   The protected descendants or recovery UI.
   */
  public override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error">
        <span className="fatal-error__icon"><AlertTriangle aria-hidden="true" size={26} /></span>
        <h1>Whisperer needs to restart this view</h1>
        <p>This window stopped responding. Try reloading the view; your saved local content is still available.</p>
        <Button tone="primary" onClick={this.retry}><RotateCcw aria-hidden="true" size={16} /> Try again</Button>
      </main>
    );
  }
}
