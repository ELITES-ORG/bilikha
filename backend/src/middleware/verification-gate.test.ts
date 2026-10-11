import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createApp } from '../app.js';
import { hashPassword } from '../lib/password.js';
import { makeIdVerification, makeUser, PASSWORD } from '../test/factories.js';
import { requireAuth } from './require-auth.js';

/**
 * The browse-only gate (ADR 0057, plan 0053 Step 2.2), through the real app: a
 * routing guard only means something with the routers mounted behind it.
 */

const SOME_ID = randomUUID();

/** One write per router that sits behind requireAuth. */
const WRITES: { method: string; path: string; body?: unknown }[] = [
  { method: 'POST', path: '/me/blocks', body: {} },
  { method: 'POST', path: '/media/upload-url', body: { kind: 'avatar' } },
  { method: 'POST', path: '/offers', body: {} },
  { method: 'POST', path: '/postings', body: {} },
  { method: 'POST', path: '/conversations', body: {} },
  { method: 'POST', path: `/agreements/${SOME_ID}/accept`, body: {} },
  { method: 'POST', path: `/ratings/${SOME_ID}/report`, body: {} },
  { method: 'POST', path: '/organizations', body: {} },
];

/** Reads on the same routers that a brand-new account can make. */
const READS = [
  '/postings/mine',
  '/conversations',
  '/agreements',
  '/notifications',
  '/organizations/mine',
  '/auth/me',
];

describe('the browse-only gate', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  async function signedInUser(): Promise<{ id: string; cookie: string }> {
    const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user.username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    // The session row is written as the body finishes; read it to the end.
    await response.text();
    return { id: user.id, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
  }

  async function call(cookie: string, method: string, path: string, body?: unknown) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const code = text ? ((JSON.parse(text) as { error?: { code?: string } }).error?.code ?? null) : null;
    return { status: response.status, code, text };
  }

  for (const status of ['pending', 'declined_retry'] as const) {
    it(`refuses a write on every router while the latest row is ${status}`, async () => {
      const user = await signedInUser();
      await makeIdVerification(user.id, {
        status,
        ...(status === 'declined_retry' ? { decidedAt: new Date(), decisionReason: 'Blurred.' } : {}),
      });

      for (const write of WRITES) {
        const result = await call(user.cookie, write.method, write.path, write.body);
        expect({ path: write.path, status: result.status, code: result.code }).toEqual({
          path: write.path,
          status: 403,
          code: 'VERIFICATION_PENDING',
        });
      }
    });

    it(`still lets every read through while the latest row is ${status}`, async () => {
      const user = await signedInUser();
      await makeIdVerification(user.id, { status });

      for (const path of READS) {
        const result = await call(user.cookie, 'GET', path);
        expect({ path, status: result.status }).toEqual({ path, status: 200 });
      }
    });
  }

  it('lets the allowlist through, query string and trailing slash included, and nothing near it', async () => {
    const user = await signedInUser();
    await makeIdVerification(user.id);

    // Through the gate means whatever the route itself answers — here a
    // validation error, never VERIFICATION_PENDING.
    for (const path of [
      '/verification/submission',
      '/verification/submission?x=1',
      '/verification/upload-url/',
      '/me/password',
    ]) {
      const result = await call(user.cookie, 'POST', path, {});
      expect({ path, code: result.code }).not.toEqual({ path, code: 'VERIFICATION_PENDING' });
    }

    for (const path of ['/verification/submissions', '/me/password-reset', '/me/profile']) {
      const result = await call(user.cookie, 'POST', path, {});
      expect({ path, code: result.code }).toEqual({ path, code: 'VERIFICATION_PENDING' });
    }
  });

  it('lets an account choose its view and read its own notifications, and nothing that looks like them', async () => {
    const user = await signedInUser();
    await makeIdVerification(user.id);

    // Private to the account: nobody else sees either.
    for (const [method, path, body] of [
      ['PATCH', '/me/view-mode', { viewMode: 'creative' }],
      ['POST', '/notifications/read-all', undefined],
      ['POST', `/notifications/${SOME_ID}/read`, undefined],
    ] as const) {
      const result = await call(user.cookie, method, path, body);
      expect({ path, code: result.code }).not.toEqual({ path, code: 'VERIFICATION_PENDING' });
    }

    for (const [method, path] of [
      ['POST', `/notifications/${SOME_ID}/read/extra`],
      ['POST', `/notifications/${SOME_ID}`],
      ['PUT', '/me/view-mode/x'],
    ] as const) {
      const result = await call(user.cookie, method, path, {});
      expect({ path, code: result.code }).toEqual({ path, code: 'VERIFICATION_PENDING' });
    }
  });

  it('never touches an account with no row, or a verified one', async () => {
    const legacy = await signedInUser();
    const verified = await signedInUser();
    await makeIdVerification(verified.id, { status: 'verified', decidedAt: new Date() });

    for (const user of [legacy, verified]) {
      const result = await call(user.cookie, 'PATCH', '/me/view-mode', { viewMode: 'hiring' });
      expect(result.code).not.toBe('VERIFICATION_PENDING');
    }
  });

  it('ends a session whose ID was declined as not from Biliran, with the reason', async () => {
    const user = await signedInUser();
    await makeIdVerification(user.id, {
      status: 'declined_final',
      decidedAt: new Date(),
      decisionReason: 'The address is outside Biliran.',
    });

    const first = await call(user.cookie, 'GET', '/auth/me');
    expect(first.status).toBe(401);
    expect(first.code).toBe('ID_DECLINED');
    expect(JSON.parse(first.text).error.details).toEqual({
      kind: 'final',
      reason: 'The address is outside Biliran.',
    });

    // The session is gone: the next request is an ordinary signed-out 401.
    const second = await call(user.cookie, 'GET', '/auth/me');
    expect(second.status).toBe(401);
    expect(second.code).not.toBe('ID_DECLINED');
  });
});

describe('a session carrying a decline notice', () => {
  function run(req: Request): Promise<unknown> {
    return new Promise((resolve) => {
      requireAuth(req, {} as Response, ((error?: unknown) => resolve(error)) as NextFunction);
    });
  }

  it('answers 401 ID_DECLINED with the notice, before asking whether anyone is signed in', async () => {
    const destroy = vi.fn((cb: (err?: unknown) => void) => cb());
    const req = {
      session: { declineNotice: { kind: 'retry', reason: 'The back is unreadable.' }, destroy },
    } as unknown as Request;

    const error = (await run(req)) as { status: number; code: string; details: unknown };

    expect(error.status).toBe(401);
    expect(error.code).toBe('ID_DECLINED');
    expect(error.details).toEqual({ kind: 'retry', reason: 'The back is unreadable.' });
    expect(destroy).toHaveBeenCalled();
  });
});
