import { AxiosError } from 'axios';
import { BUILD_ID, isChunkLoadError } from '@/lib/app-update';
import { deploymentEnvironment } from '@/lib/site-host';

/**
 * Reporting the errors a person hits, without making everyone else pay for it
 * (ADR 0053).
 *
 * An error-tracking SDK is 20–30 kB gzip, and most visitors are on prepaid data
 * (constraint 3). So nothing is loaded up front: this file only listens. The
 * SDK is fetched the first time there is something to report — by the few
 * people who hit an error, once, and never by anyone else.
 *
 * Off entirely when `VITE_SENTRY_DSN` is not set at build time.
 */

const DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN || undefined;

/** A render loop can throw on every frame. Enough to diagnose it, no more. */
const MAX_REPORTS_PER_PAGE = 5;

export interface ErrorReport {
  route: string;
  componentStack?: string;
}

type Capture = (error: unknown, report: ErrorReport) => void;

let reported = 0;
let client: Promise<Capture | null> | null = null;

/**
 * Every literal segment of a route in `App.tsx`. Any other segment is a slug,
 * an id or something typed into the address bar, and is reported as `:param` —
 * so `/creatives/juan-cruz` is filed as `/creatives/:param`. A route added
 * without updating this degrades to `:param` too, which is the safe direction.
 */
const ROUTE_WORDS = new Set([
  'account', 'accounts', 'admin', 'agreements', 'change-password', 'creatives',
  'directory', 'edit', 'history', 'inbox', 'inquiries', 'login', 'media',
  'messages', 'mine', 'new', 'notifications', 'offers', 'postings', 'privacy',
  'profile', 'profiles', 'ratings', 'register', 'security', 'styleguide',
  'submitted', 'taxonomy', 'terms', 'welcome', 'work',
]);

export function routePattern(pathname: string): string {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => (ROUTE_WORDS.has(segment.toLowerCase()) ? segment.toLowerCase() : ':param'));
  return `/${segments.join('/')}`;
}

/**
 * Not everything thrown is a bug worth a report:
 *
 * - An API failure is the API's to report, and it does, with the server-side
 *   stack. A dropped connection on a phone in Naval is not a bug at all.
 * - `null` is what a cross-origin script error leaves behind — a browser
 *   extension or Facebook's in-app browser, never this code.
 */
export function isReportable(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  return !(error instanceof AxiosError);
}

/**
 * The same, for an error nothing caught. A failed chunk there is a tab open
 * across a deploy, and is expected. The one that matters — a chunk still
 * failing after `AppErrorBoundary` has reloaded once — is reported by the
 * boundary, not here.
 */
export function isReportableUncaught(error: unknown): boolean {
  return isReportable(error) && !isChunkLoadError(error);
}

/** Load the SDK once, on first use. A failure to load means nothing is reported. */
function loadClient(dsn: string): Promise<Capture | null> {
  client ??= import('./error-reporting-client')
    .then(({ createCapture }) =>
      createCapture({
        dsn,
        environment: deploymentEnvironment(window.location.hostname),
        release: BUILD_ID,
        origin: window.location.origin,
      }),
    )
    .catch(() => null);
  return client;
}

/**
 * Report an error, with the route it happened on. Never throws and never
 * awaits: reporting must not be able to make a failure worse.
 */
export function reportError(error: unknown, componentStack?: string): void {
  if (!DSN || !isReportable(error) || reported >= MAX_REPORTS_PER_PAGE) return;
  reported += 1;

  const report: ErrorReport = { route: routePattern(window.location.pathname) };
  if (componentStack) report.componentStack = componentStack;

  void loadClient(DSN).then((capture) => capture?.(error, report));
}

/**
 * Listen for errors nothing else catches: a throw in an event handler, a timer,
 * a promise nobody awaited. Render errors are caught by `AppErrorBoundary`,
 * which reports them itself. Call once, before the first render.
 */
export function reportUncaughtErrors(): void {
  if (!DSN) return;

  window.addEventListener('error', (event) => {
    if (isReportableUncaught(event.error)) reportError(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isReportableUncaught(event.reason)) reportError(event.reason);
  });
}
