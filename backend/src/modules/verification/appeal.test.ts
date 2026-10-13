import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { db } from '../../db/index.js';
import { idVerifications } from '../../db/schema/index.js';
import { hashPassword } from '../../lib/password.js';
import { makeIdVerification, makeUser, PASSWORD } from '../../test/factories.js';

/**
 * A person appealing a *not from Biliran* decline (ADR 0057, plan 0053 Step
 * 4.2), through the real app. The account cannot sign in, so the appeal brings
 * its credentials; the login limiter is shared, and tested in
 * appeal-limit.test.ts, where its count starts clean.
 */

const DAY = 24 * 60 * 60 * 1000;
const MESSAGE = 'I moved to Naval last year; my new barangay ID is attached to my old address.';

describe('appealing an ID decline', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  async function post(path: string, body: unknown) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      body: JSON.parse(text) as { data?: unknown; error?: { code: string; message: string; details?: unknown } },
      cookie: response.headers.get('set-cookie'),
    };
  }

  const appeal = (username: string, message = MESSAGE, password = PASSWORD) =>
    post('/auth/id-appeal', { username, password, message });

  async function declined(overrides: Parameters<typeof makeIdVerification>[1] = {}) {
    const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const row = await makeIdVerification(user.id, {
      status: 'declined_final',
      idType: 'drivers_license',
      frontKey: `ids/${user.id}/front.webp`,
      backKey: `ids/${user.id}/back.webp`,
      submittedAt: new Date(Date.now() - DAY),
      decidedAt: new Date(Date.now() - 60 * 60 * 1000),
      decisionReason: 'The address on this licence is in Ormoc, not Biliran.',
      ...overrides,
    });
    return { user, row };
  }

  async function reload(id: string) {
    const [row] = await db.select().from(idVerifications).where(eq(idVerifications.id, id));
    return row!;
  }

  it('opens the appeal with the right password, and makes no session', async () => {
    const { user, row } = await declined();

    const result = await appeal(user.username);

    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ status: 'appealed' });
    expect(result.cookie).toBeNull();
    const after = await reload(row.id);
    expect(after).toMatchObject({ status: 'appealed', appealMessage: MESSAGE });
    expect(after.appealedAt).not.toBeNull();
    // The decline stays on the record beside the appeal.
    expect(after.decisionReason).toBe(row.decisionReason);
  });

  it('refuses a wrong password exactly as sign-in does, and changes nothing', async () => {
    const { user, row } = await declined();

    const result = await appeal(user.username, MESSAGE, 'not-the-password');

    expect(result.status).toBe(401);
    expect(result.text).not.toContain('Ormoc');
    expect((await reload(row.id)).status).toBe('declined_final');
  });

  it('then says it is under review at sign-in, and takes no second appeal', async () => {
    const { user } = await declined();
    await appeal(user.username);

    const signIn = await post('/auth/login', { username: user.username, password: PASSWORD });
    const again = await appeal(user.username);

    expect(signIn.status).toBe(403);
    expect(signIn.body.error?.code).toBe('ID_DECLINED');
    expect(signIn.body.error?.details).toMatchObject({ kind: 'appealed' });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe('ID_APPEAL_CLOSED');
    expect(again.body.error?.message).toMatch(/already being reviewed/);
  });

  it('is closed after the 7 days, once the photos are gone, and after an answer', async () => {
    const late = await declined({ decidedAt: new Date(Date.now() - 7 * DAY - 60 * 1000) });
    const gone = await declined({ frontKey: null, backKey: null, imagesDeletedAt: new Date() });
    const answered = await declined({
      appealMessage: 'Earlier appeal.',
      appealedAt: new Date(Date.now() - 2 * DAY),
      appealDecidedAt: new Date(Date.now() - DAY),
    });

    const results = await Promise.all([late, gone, answered].map(({ user }) => appeal(user.username)));

    expect(results.map((result) => result.status)).toEqual([409, 409, 409]);
    expect(results.map((result) => result.body.error?.code)).toEqual(
      Array(3).fill('ID_APPEAL_CLOSED'),
    );
    expect(results[0]!.body.error?.message).toMatch(/7 days/);
    expect(results[2]!.body.error?.message).toMatch(/only once/);
    for (const { row } of [late, gone, answered]) {
      expect((await reload(row.id)).status).toBe('declined_final');
    }
  });

  it('is only for a not-from-Biliran decline', async () => {
    const retry = await declined({ status: 'declined_retry' });
    const verified = await declined({ status: 'verified', decisionReason: null });
    const none = await makeUser({ passwordHash: await hashPassword(PASSWORD) });

    for (const username of [retry.user.username, verified.user.username, none.username]) {
      const result = await appeal(username);
      expect(result.status, username).toBe(409);
      expect(result.body.error?.code).toBe('ID_APPEAL_CLOSED');
    }
    expect((await reload(retry.row.id)).status).toBe('declined_retry');
  });

  it('needs a message of 20 to 1000 characters', async () => {
    const { user, row } = await declined();

    expect((await appeal(user.username, 'x'.repeat(19))).status).toBe(400);
    expect((await appeal(user.username, 'x'.repeat(1001))).status).toBe(400);
    expect((await appeal(user.username, `   ${'x'.repeat(20)}   `)).status).toBe(200);
    expect((await reload(row.id)).appealMessage).toBe('x'.repeat(20));
  });

  it('tells sign-in until when a decline can be appealed, and stops once it cannot', async () => {
    const open = await declined();
    const late = await declined({ decidedAt: new Date(Date.now() - 7 * DAY - 60 * 1000) });

    const offered = await post('/auth/login', { username: open.user.username, password: PASSWORD });
    const closed = await post('/auth/login', { username: late.user.username, password: PASSWORD });

    expect(offered.body.error?.details).toMatchObject({
      kind: 'final',
      appealUntil: new Date(open.row.decidedAt!.getTime() + 7 * DAY).toISOString(),
    });
    expect(closed.body.error?.details).toEqual({ kind: 'final', reason: late.row.decisionReason });
  });
});
