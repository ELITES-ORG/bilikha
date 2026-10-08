import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { Router } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransport, getClient, getCurrentScope, initAndBind, type ErrorEvent } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core/server';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js';
import {
  deploymentEnvironment,
  errorReportingOptions,
  redactText,
  releaseName,
  reportServerErrors,
  routePattern,
  NO_LOCATION,
  scrubEvent,
} from './error-reporting.js';
import { AppError } from './http-error.js';

describe('deploymentEnvironment', () => {
  it('is production only on the production branch', () => {
    expect(deploymentEnvironment('production')).toBe('production');
  });

  it('is staging on main and on any other branch Render builds', () => {
    expect(deploymentEnvironment('main')).toBe('staging');
    expect(deploymentEnvironment('feat/anything')).toBe('staging');
  });

  it('is local off Render, so nothing there is ever filed as production', () => {
    expect(deploymentEnvironment(undefined)).toBe('local');
    expect(deploymentEnvironment('')).toBe('local');
  });
});

describe('releaseName', () => {
  it('is the first 12 characters of the commit, matching the frontend build id', () => {
    expect(releaseName('d10b699a1b2c3d4e5f60718293a4b5c6d7e8f901')).toBe('d10b699a1b2c');
  });

  it('is absent when there is no commit', () => {
    expect(releaseName(undefined)).toBeUndefined();
  });
});

describe('routePattern', () => {
  it('puts the mount prefix back in front of the matched route', () => {
    expect(routePattern('/api/v1/creatives/juan-cruz/ratings', '/:slug/ratings')).toBe(
      '/api/v1/creatives/:slug/ratings',
    );
    expect(routePattern('/api/v1/admin/accounts/42/status', '/accounts/:id/status')).toBe(
      '/api/v1/admin/accounts/:id/status',
    );
  });

  it('drops the query string and the hash', () => {
    expect(routePattern('/api/v1/offers?q=juan&municipality=naval', '/')).toBe('/api/v1/offers');
  });

  it('falls back to the module prefix when no route matched', () => {
    expect(routePattern('/api/v1/creatives/juan-cruz', undefined)).toBe('/api/v1/creatives/…');
    expect(routePattern('/api/v1/me', undefined)).toBe('/api/v1/me');
  });

  it('falls back when the route does not line up with the URL', () => {
    expect(routePattern('/api/v1/me/profile', '/:id/messages')).toBe('/api/v1/me/…');
    expect(routePattern('/api', '/a/b/c')).toBe('/api');
  });
});

describe('redactText', () => {
  it('blanks Philippine mobile numbers in every common spelling', () => {
    for (const phone of ['09171234567', '+639171234567', '639171234567', '0917 123 4567', '0917-123-4567', '+63 917 123 4567']) {
      expect(redactText(`value "${phone}" is invalid`)).toBe('value "[phone]" is invalid');
    }
    expect(redactText('09171234567')).toBe('[phone]');
  });

  it('blanks email addresses', () => {
    expect(redactText('duplicate juan.cruz+bilikha@example.com.ph found')).toBe('duplicate [email] found');
  });

  it('leaves the numbers a bug report needs', () => {
    for (const text of [
      'Request failed with status code 500',
      'Unexpected token at position 12345',
      'timestamp 1709171234567 is out of range',
      'invalid input syntax for type uuid: "3f2a9c1e-0000-4000-8000-000000000000"',
      'value 091712345678 has twelve digits',
    ]) {
      expect(redactText(text)).toBe(text);
    }
  });
});

describe('scrubEvent', () => {
  it('keeps the error and drops everything that could identify a person', () => {
    const event = {
      event_id: 'abc',
      environment: 'staging',
      tags: { route: '/api/v1/offers' },
      user: { id: '1', email: 'juan@example.com', ip_address: '203.0.113.9' },
      request: { cookies: { 'bilikha.sid': 's' }, data: '{"phone":"09171234567"}' },
      extra: { body: 'hello' },
      breadcrumbs: [{ message: 'typed hello' }],
      server_name: 'render-host',
      contexts: { runtime: { name: 'node' }, os: { name: 'Linux' }, device: { arch: 'x64' } },
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: {
              frames: [{ filename: 'a.js', vars: { phone: '09171234567' }, context_line: 'x' }],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(Object.keys(scrubbed).sort()).toEqual(
      ['contexts', 'environment', 'event_id', 'exception', 'tags', 'user'].sort(),
    );
    // The user is replaced, not kept: no id, no email, no IP, and a location
    // that stops Sentry working one out from the connection.
    expect(scrubbed.user).toEqual({ geo: { region: 'Not collected' } });
    expect(scrubbed.contexts).toEqual({ runtime: { name: 'node' } });
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: 'a.js' });
  });
});

/**
 * The whole path, through the real SDK, with only the network replaced: what
 * would have been sent to Sentry is captured here instead.
 */
describe('reportServerErrors', () => {
  const sent: string[] = [];
  let server: Server;
  let base: string;

  // Everything a request could carry that must never reach a report.
  const SECRETS = ['secret-session-value', '09171234567', 'juan@example.com', 'hello neighbour', 'juan-search', 'juan-cruz'];

  beforeAll(async () => {
    initAndBind(ServerRuntimeClient, {
      ...errorReportingOptions('https://public@o0.ingest.sentry.io/0'),
      transport: (options) =>
        createTransport(options, async (request) => {
          sent.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
          return { statusCode: 200 };
        }),
    });

    // Mounted the way the real app is: a router under /api/v1, and a module's
    // router under that, so the prefix has to be recovered.
    const things = Router();
    things.post('/:id', () => {
      throw new Error('boom');
    });
    things.get('/:id/upstream', () => {
      throw new AppError(502, 'STORAGE_ERROR', 'Storage did not answer');
    });
    things.get('/:id/ready', (_req, res) => {
      res.status(503).json({ status: 'not_ready' });
    });
    // Used only by the 4xx test: the dedupe integration drops an event identical
    // to the one before it, so that test needs a failure no other test sends.
    // How Postgres reports a malformed value: by quoting it.
    things.get('/:id/echo', (req) => {
      throw new Error(`invalid input syntax for type uuid: "${req.params.id}"`);
    });
    things.get('/:id/gateway', (_req, res) => {
      res.status(504).end();
    });
    things.get('/:id/invalid', () => {
      throw AppError.badRequest('That is not allowed');
    });
    const api = Router();
    api.use('/things', things);

    const app = express();
    app.use(reportServerErrors);
    app.use(express.json());
    app.use('/api/v1', api);
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.close();
    await getClient()?.close();
    getCurrentScope().setClient(undefined);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  function events(): ErrorEvent[] {
    // An envelope is: header line, item header line, payload line.
    return sent.map((body) => JSON.parse(body.split('\n')[2]!) as ErrorEvent);
  }

  it('reports an unhandled error with its route and method, and nothing personal', async () => {
    const response = await fetch(`${base}/api/v1/things/juan-cruz?q=juan-search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'bilikha.sid=secret-session-value' },
      body: JSON.stringify({ phone: '09171234567', email: 'juan@example.com', message: 'hello neighbour' }),
    });
    expect(response.status).toBe(500);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [event] = events();

    expect(event?.exception?.values?.[0]?.value).toBe('boom');
    expect(event?.tags).toMatchObject({ method: 'POST', route: '/api/v1/things/:id', status: '500' });
    expect(event?.environment).toBe('local');
    expect(event?.request).toBeUndefined();
    expect(event?.user).toEqual(NO_LOCATION);
    for (const secret of SECRETS) expect(sent[0]).not.toContain(secret);
  });

  it('reports an AppError that carries a 5xx status', async () => {
    await fetch(`${base}/api/v1/things/juan-cruz/upstream`);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [event] = events();
    expect(event?.exception?.values?.[0]?.value).toBe('Storage did not answer');
    expect(event?.tags).toMatchObject({ route: '/api/v1/things/:id/upstream', status: '502' });
  });

  it('reports a 5xx a handler answered itself, as a message', async () => {
    await fetch(`${base}/api/v1/things/juan-cruz/ready`);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [event] = events();
    expect(event?.message).toBe('GET /api/v1/things/:id/ready answered 503');
    expect(sent[0]).not.toContain('juan-cruz');
  });

  it('blanks a phone number an error message quotes back', async () => {
    await fetch(`${base}/api/v1/things/09171234567/echo`);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [event] = events();
    expect(event?.exception?.values?.[0]?.value).toBe('invalid input syntax for type uuid: "[phone]"');
    expect(sent[0]).not.toContain('09171234567');
  });

  it('does not report a 4xx', async () => {
    expect((await fetch(`${base}/api/v1/things/juan-cruz/invalid`)).status).toBe(400);
    expect((await fetch(`${base}/api/v1/nowhere`)).status).toBe(404);
    // Followed by a failure, so the reports are known to have arrived.
    await fetch(`${base}/api/v1/things/juan-cruz/gateway`);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(events()[0]?.tags).toMatchObject({ status: '504' });
  });
});
