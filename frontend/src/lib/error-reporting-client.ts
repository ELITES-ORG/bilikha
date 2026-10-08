import {
  BrowserClient,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
  Scope,
  type ErrorEvent,
} from '@sentry/browser';
import type { DeploymentEnvironment } from '@/lib/site-host';
import type { ErrorReport } from '@/lib/error-reporting';

/**
 * The Sentry half of error reporting. Loaded only by `error-reporting.ts`, and
 * only once there is an error to send — never on first paint (ADR 0053).
 *
 * A bare client, not `Sentry.init`: init installs breadcrumbs, which record
 * every click, every request URL and every console line before an error. That
 * is exactly where a search term or a typed message would leak, and it is the
 * bulk of the SDK's weight. What is installed here is the minimum to send a
 * clean, deduplicated stack trace.
 */

/** The fields of an event that may leave. Everything else is dropped. */
const ALLOWED_EVENT_FIELDS = new Set([
  'event_id',
  'timestamp',
  'platform',
  'level',
  'logger',
  'type',
  'transaction',
  'release',
  'environment',
  'exception',
  'message',
  'logentry',
  'tags',
  'fingerprint',
  'sdk',
  'contexts',
]);

/** The component stack React gives, and the trace id. */
const ALLOWED_CONTEXTS = new Set(['react', 'trace']);

/**
 * An error's message is sent as written — it is what identifies the bug — but
 * a library can quote its input in one: some browsers' JSON.parse quotes the
 * text it choked on. Anything shaped like an email or a Philippine mobile
 * number is blanked first. A capture group rather than a lookbehind: iOS
 * WebKit before 16.4 cannot parse lookbehind, and a syntax error here would
 * stop this chunk loading at all — in Facebook's in-app browser on iPhones.
 */
const EMAIL = /[^\s@<>"'`()[\],;:]+@[^\s@<>"'`()[\],;:]+\.[a-z]{2,}/gi;
const PH_MOBILE = /(^|[^\d+])(?:\+?63|0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

export function redactText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PH_MOBILE, '$1[phone]');
}

/**
 * Whatever the SDK collected, only allowlisted fields survive. The browser and
 * OS are read by Sentry from the User-Agent, which is put back on its own — it
 * is how a failure in Facebook's in-app browser is told apart from Chrome's
 * (constraint 4). Not the URL, not the referrer, not the IP, not a cookie.
 */
export function scrubEvent(event: ErrorEvent, userAgent: string): ErrorEvent {
  const scrubbed = Object.fromEntries(
    Object.entries(event).filter(([key]) => ALLOWED_EVENT_FIELDS.has(key)),
  ) as ErrorEvent;

  if (scrubbed.contexts) {
    scrubbed.contexts = Object.fromEntries(
      Object.entries(scrubbed.contexts).filter(([key]) => ALLOWED_CONTEXTS.has(key)),
    );
  }
  if (scrubbed.message) scrubbed.message = redactText(scrubbed.message);
  if (scrubbed.logentry) {
    scrubbed.logentry = scrubbed.logentry.message
      ? { message: redactText(scrubbed.logentry.message) }
      : {};
  }
  for (const exception of scrubbed.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
      delete frame.pre_context;
      delete frame.context_line;
      delete frame.post_context;
    }
  }
  scrubbed.request = { headers: { 'User-Agent': userAgent } };
  return scrubbed;
}

interface CaptureOptions {
  dsn: string;
  environment: DeploymentEnvironment;
  release: string;
  /**
   * An error whose stack names another site's script — an extension, code a
   * webview injects — is not reported. One naming no file at all still is.
   */
  origin: string;
}

export function createCapture({ dsn, environment, release, origin }: CaptureOptions) {
  const client = new BrowserClient({
    dsn,
    environment,
    release,
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [
      eventFiltersIntegration({ allowUrls: [origin] }),
      dedupeIntegration(),
      linkedErrorsIntegration(),
    ],
    // Every switch off. These default to on in SDK 11; scrubEvent is the
    // second line, for anything a later SDK version starts collecting.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    // Client reports are a beacon on every page hide. Not on metered data.
    sendClientReports: false,
    beforeSend: (event) => scrubEvent(event, navigator.userAgent),
  });

  // Its own scope rather than the global one: nothing else in the page can
  // attach data to these reports by accident.
  const scope = new Scope();
  scope.setClient(client);
  client.init();

  return (error: unknown, { route, componentStack }: ErrorReport) => {
    scope.captureException(error, {
      captureContext: {
        tags: { route },
        contexts: componentStack ? { react: { componentStack } } : {},
      },
    });
  };
}
