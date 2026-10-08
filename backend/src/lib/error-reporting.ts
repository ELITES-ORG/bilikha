import type { RequestHandler, Response } from 'express';
import {
  captureException,
  captureMessage,
  createStackParser,
  createTransport,
  dedupeIntegration,
  flush,
  getClient,
  initAndBind,
  linkedErrorsIntegration,
  withScope,
  type BaseTransportOptions,
  type ErrorEvent,
} from '@sentry/core';
import {
  nodeStackLineParser,
  ServerRuntimeClient,
  type ServerRuntimeClientOptions,
} from '@sentry/core/server';
import { env } from '../config/env.js';

/**
 * Reports failures nobody would otherwise see: a 500 from a request handler, a
 * 5xx answered directly, and a crash of the process itself. ADR 0053 has the
 * reasoning; the short version is below.
 *
 * Built on `@sentry/core` alone, not `@sentry/node`. The Node SDK is ~50 MB of
 * OpenTelemetry, a bundler CLI and a native parser, and does its work by
 * instrumenting every module at load. This needs none of that: the error
 * handler already sees every failed request, so it reports from there. It is
 * the same construction Sentry uses for its own edge runtimes.
 *
 * **Nothing personal leaves this file.** No request body, no headers, no
 * cookies, no user, no query string, no literal path. A report carries the
 * error, its stack, the method, the route pattern and the status. That is
 * enforced twice: every SDK collection switch is off, and `scrubEvent` keeps
 * only allowlisted fields of whatever is left, so a future SDK default that
 * starts collecting something new still cannot send it.
 */

type Environment = 'production' | 'staging' | 'local';

/**
 * Production deploys from the `production` branch and staging from `main`
 * (ADR 0042). Off Render — a laptop, CI — there is no branch, and nothing
 * there may ever be filed as production.
 */
export function deploymentEnvironment(branch: string | undefined): Environment {
  if (!branch) return 'local';
  return branch === 'production' ? 'production' : 'staging';
}

/** Same 12 characters the frontend uses for its build id, so the two line up. */
export function releaseName(commit: string | undefined): string | undefined {
  return commit ? commit.slice(0, 12) : undefined;
}

/**
 * The route a request matched, as written in the router — `/api/v1/creatives/:slug`,
 * never `/api/v1/creatives/juan-cruz`. Groups every failure of one handler into
 * one issue, and keeps usernames, ids and search terms out of the report.
 *
 * Express does not keep the full pattern: the mount prefix is lost by the time
 * an error unwinds to the app-level handler. The matched route's own path is
 * kept, though, and no route here uses wildcards or optional segments, so the
 * prefix is the leading segments of the URL that the route's path does not
 * cover. Anything that does not line up — no route matched, or a shape this
 * cannot account for — falls back to the module prefix alone.
 */
export function routePattern(originalUrl: string, routePath: string | undefined): string {
  const segments = originalUrl.split(/[?#]/)[0]!.split('/').filter(Boolean);
  const fallback = `/${segments.slice(0, 3).join('/')}${segments.length > 3 ? '/…' : ''}`;
  if (typeof routePath !== 'string') return fallback;

  const routeSegments = routePath.split('/').filter(Boolean);
  const prefixLength = segments.length - routeSegments.length;
  if (prefixLength < 0) return fallback;

  const lines = routeSegments.every(
    (segment, i) => segment.startsWith(':') || segment === segments[prefixLength + i],
  );
  if (!lines) return fallback;

  return `/${[...segments.slice(0, prefixLength), ...routeSegments].join('/')}`;
}

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

/** Runtime version and trace id. Nothing about the host or the person. */
const ALLOWED_CONTEXTS = new Set(['runtime', 'trace']);

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed = Object.fromEntries(
    Object.entries(event).filter(([key]) => ALLOWED_EVENT_FIELDS.has(key)),
  ) as ErrorEvent;

  if (scrubbed.contexts) {
    scrubbed.contexts = Object.fromEntries(
      Object.entries(scrubbed.contexts).filter(([key]) => ALLOWED_CONTEXTS.has(key)),
    );
  }
  // Local variables and source lines are opt-in integrations not installed
  // here. Stripped anyway: a variable is exactly where a phone number lives.
  for (const exception of scrubbed.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
      delete frame.pre_context;
      delete frame.context_line;
      delete frame.post_context;
    }
  }
  return scrubbed;
}

/** Node 22's own fetch. A report that cannot be sent in 5 s is dropped. */
function makeFetchTransport(options: BaseTransportOptions) {
  return createTransport(options, async (request) => {
    const response = await fetch(options.url, {
      method: 'POST',
      body: request.body,
      headers: options.headers,
      signal: AbortSignal.timeout(5_000),
    });
    return {
      statusCode: response.status,
      headers: {
        'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
        'retry-after': response.headers.get('Retry-After'),
      },
    };
  });
}

export function errorReportingOptions(dsn: string): ServerRuntimeClientOptions {
  return {
    dsn,
    environment: deploymentEnvironment(env.RENDER_GIT_BRANCH),
    release: releaseName(env.RENDER_GIT_COMMIT),
    platform: 'node',
    runtime: { name: 'node', version: process.version },
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: makeFetchTransport,
    // Every switch off. These default to on in SDK 11; see scrubEvent for why
    // this is not the only line of defence.
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
    sendClientReports: false,
    beforeSend: scrubEvent,
  };
}

/**
 * Start reporting, if a DSN is configured. Returns the environment it reports
 * as, or null when it is off. Call once, before the app takes requests.
 */
export function initErrorReporting(): Environment | null {
  if (!env.SENTRY_DSN) return null;
  const options = errorReportingOptions(env.SENTRY_DSN);
  initAndBind(ServerRuntimeClient, options);
  return options.environment as Environment;
}

/** The thrown error behind a 500, held until the response has gone out. */
const unhandledErrors = new WeakMap<Response, unknown>();

/** Called by the error handler, which is the only place that sees the error. */
export function recordUnhandledError(res: Response, error: unknown): void {
  unhandledErrors.set(res, error);
}

/**
 * Reports every 5xx response once it has been sent, whatever produced it: an
 * error that reached the error handler (reported with its stack), an `AppError`
 * with a 5xx status, or a handler that answered 5xx itself. One place, so a new
 * route that sets its own 503 is covered without knowing this exists.
 */
export const reportServerErrors: RequestHandler = (req, res, next) => {
  if (!getClient()) {
    next();
    return;
  }

  res.on('finish', () => {
    if (res.statusCode < 500) return;

    const route = routePattern(req.originalUrl, req.route?.path);
    withScope((scope) => {
      scope.setTransactionName(`${req.method} ${route}`);
      scope.setTags({ method: req.method, route, status: String(res.statusCode) });

      if (unhandledErrors.has(res)) {
        captureException(unhandledErrors.get(res));
      } else {
        captureMessage(`${req.method} ${route} answered ${res.statusCode}`, 'error');
      }
    });
  });

  next();
};

/**
 * For a crash of the process: report it, and wait briefly for it to be sent,
 * because the caller is about to exit. Never throws and never waits long — a
 * crash must not hang on an unreachable tracker.
 */
export async function reportCrash(
  error: unknown,
  kind: 'uncaughtException' | 'unhandledRejection',
): Promise<void> {
  if (!getClient()) return;
  captureException(error, { mechanism: { type: `auto.node.${kind}`, handled: false } });
  await flush(2_000).catch(() => false);
}
