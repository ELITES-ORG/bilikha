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
      className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+0.75rem)] z-30 flex justify-center px-4 sm:bottom-4"
    >
      <div className="flex items-center gap-3 rounded-sm border border-hairline bg-surface px-4 py-3 shadow-sm">
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
