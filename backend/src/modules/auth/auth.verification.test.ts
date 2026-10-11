import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { hashPassword } from '../../lib/password.js';
import { makeIdVerification, makeUser, PASSWORD } from '../../test/factories.js';

/**
 * Signing in, and the current user, for an account with an ID verification
 * (ADR 0057, plan 0053 Step 2.3). Through the real app: the login limiter and
 * the error handler are part of what is under test.
 */
describe('sign-in and the current user with ID verification', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  async function login(username: string, password = PASSWORD) {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      body: JSON.parse(text) as {
        data?: { idVerification: unknown };
        error?: { code: string; details?: unknown };
      },
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null,
    };
  }

  async function account() {
    return makeUser({ passwordHash: await hashPassword(PASSWORD) });
  }

  it('tells the reason only to the right password, and records no sign-in', async () => {
    const user = await account();
    await makeIdVerification(user.id, {
      status: 'declined_final',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decisionReason: 'The address is outside Biliran.',
    });

    const wrong = await login(user.username, 'not-the-password');
    const right = await login(user.username);

    expect(wrong.status).toBe(401);
    expect(wrong.text).not.toContain('Biliran');
    expect(right.status).toBe(403);
    expect(right.body.error?.code).toBe('ID_DECLINED');
    expect(right.body.error?.details).toEqual({
      kind: 'final',
      reason: 'The address is outside Biliran.',
    });
    expect(right.cookie).toBeNull();

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after?.lastLoginAt).toBeNull();
  });

  it('says an open appeal is under review', async () => {
    const user = await account();
    await makeIdVerification(user.id, {
      status: 'appealed',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decisionReason: 'The address is outside Biliran.',
      appealMessage: 'I moved to Naval last year.',
      appealedAt: new Date(),
    });

    const result = await login(user.username);

    expect(result.status).toBe(403);
    expect(result.body.error?.details).toMatchObject({ kind: 'appealed' });
  });

  it('never rate-limits someone reading their own reason again', async () => {
    const user = await account();
    await makeIdVerification(user.id, {
      status: 'declined_final',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decisionReason: 'The address is outside Biliran.',
    });

    // The limit is ten failures in fifteen minutes; these are not failures.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await login(user.username)).status).toBe(403);
    }
  });

  it('lets a try-again decline in, to resubmit', async () => {
    const user = await account();
    await makeIdVerification(user.id, {
      status: 'declined_retry',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decisionReason: 'The back is unreadable.',
    });

    const result = await login(user.username);

    expect(result.status).toBe(200);
    expect(result.body.data?.idVerification).toEqual({
      status: 'declined_retry',
      submitted: true,
      reason: 'The back is unreadable.',
    });
  });

  it('shows the status on /auth/me, null for an account that needs none, and never a key', async () => {
    const pending = await account();
    const legacy = await account();
    await makeIdVerification(pending.id, {
      submittedAt: new Date(),
      idType: 'drivers_license',
      frontKey: `ids/${pending.id}/a-front.webp`,
      backKey: `ids/${pending.id}/a-back.webp`,
    });

    const pendingLogin = await login(pending.username);
    const legacyLogin = await login(legacy.username);
    const me = await fetch(`${base}/auth/me`, { headers: { cookie: pendingLogin.cookie! } });
    const meText = await me.text();

    expect(JSON.parse(meText).data.idVerification).toEqual({
      status: 'pending',
      submitted: true,
      reason: null,
    });
    expect(legacyLogin.body.data?.idVerification).toBeNull();
    for (const text of [pendingLogin.text, meText]) {
      expect(text).not.toContain('ids/');
      expect(text).not.toContain('token=');
    }
  });
});
