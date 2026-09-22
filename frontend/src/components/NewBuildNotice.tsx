import { useEffect, useState } from 'react';
import { watchForNewBuild } from '@/lib/app-update';

/**
 * A quiet line when the tab has been open across a deploy.
 *
 * Deliberately not a modal and not automatic. Somebody halfway through writing
 * a message does not want the page reloaded under them, and an app that
 * reloads itself while you are typing is worse than one running last week's
 * code. So: offer, do not act.
 *
 * It sits above the bottom nav, which is fixed, and disappears for good once
 * dismissed — the chunk-error path in AppErrorBoundary still catches anyone who
 * ignores it and later hits a route the old build cannot load.
 */
export function NewBuildNotice() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => watchForNewBuild(() => setAvailable(true)), []);

  if (!available || dismissed) return null;

  return (
    <div
      role="status"
      /*
        Top, under the header, at the same offset the toasts use — a notice
        about the app itself belongs where the app's other notices appear, and
        at the bottom it sat on the bottom nav's doorstep and read as part of
        the page rather than about it.

        z-30 keeps it under the header (z-40) rather than over it, which it
        never overlaps anyway, and under toasts (z-50): a toast is transient and
        answers something you just did, so it wins the rare collision.
      */
      className="pointer-events-none fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top,0px)+0.75rem)] z-30 flex justify-center px-4"
    >
      {/* The wrapper is click-through so it never blocks the page behind it;
          the card itself takes clicks back. */}
      <div className="pointer-events-auto flex items-center gap-3 rounded-sm border border-hairline bg-surface px-4 py-3 shadow-sm">
        <p className="text-sm text-ink">A newer version of Bilikha is available.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 text-sm font-medium text-lawa-700 hover:text-lawa-800"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-sm text-ink-subtle hover:text-ink"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
