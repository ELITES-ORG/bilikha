import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, reloadForNewBuildOnce } from '@/lib/app-update';

/**
 * The last thing between a thrown error and a white screen.
 *
 * There was no boundary at all until now, so any error during render took the
 * whole app down with nothing rendered and nothing said. The commonest cause is
 * not a bug in a component: it is a route chunk that no longer exists because a
 * deploy happened while this tab was open. That case is handled silently — one
 * reload picks up the new build and the person never learns anything went
 * wrong, which is the correct amount for them to learn.
 *
 * Everything else gets a plain message and a way out. No stack trace: nobody
 * reading this on a phone in Naval can act on one.
 */

interface State {
  failed: boolean;
  recovering: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, recovering: false };

  static getDerivedStateFromError(error: unknown): State {
    // A failed chunk is a stale tab, not a broken app. Render nothing while the
    // reload is in flight rather than flashing an error the person cannot act on.
    if (isChunkLoadError(error)) return { failed: true, recovering: true };
    return { failed: true, recovering: false };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadForNewBuildOnce()) return;

    // Already reloaded once for this build, or not a chunk error. Show the
    // message. Logged so it is visible in a console someone has open.
    if (this.state.recovering) this.setState({ recovering: false });
    console.error('Unhandled error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.recovering) return null;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-6">
        <div className="max-w-sm text-center">
          <h1 className="u-display text-2xl text-ink">Something went wrong</h1>
          <p className="mt-3 text-md text-ink-muted">
            The page could not be shown. Reloading usually fixes it — your account and
            your work are not affected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-sm bg-lawa-800 px-5 text-sm font-medium text-paper hover:bg-lawa-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
