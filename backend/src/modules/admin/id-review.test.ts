import type { AddressInfo } from 'node:net';
import { IncomingMessage, ServerResponse, type Server } from 'node:http';
import { inspect } from 'node:util';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createApp, requestLogFields } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { idVerifications, moderationActions, notifications, sessions } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { hashPassword } from '../../lib/password.js';
import { createSignedDownload, idStorageReady } from '../../lib/storage.js';
import { makeAdmin, makeIdVerification, makeUser, PASSWORD, suspend } from '../../test/factories.js';

/**
 * ID review (ADR 0057, plan 0053 Phase 3), through the real app: the admin
 * guard, the limiter and the session gate are part of what is under test.
 * Storage is mocked — route tests never stub fetch.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return { ...actual, idStorageReady: vi.fn(), createSignedDownload: vi.fn() };
});

const ready = vi.mocked(idStorageReady);
const signDownload = vi.mocked(createSignedDownload);

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'c'.repeat(64);
const savedSecret = env.ID_HASH_SECRET;

/** A number that must never appear in a response, a row or a log line. */
const ID_NUMBER = '9876-5432-1012';

describe('ID review', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    env.ID_HASH_SECRET = SECRET;
    ready.mockReset().mockResolvedValue(true);
    signDownload.mockReset().mockImplementation(
      async (_bucket: string, key: string, seconds: number) => `http://storage.test/signed/${key}?ttl=${seconds}`,
    );
  });

  afterEach(() => {
    env.ID_HASH_SECRET = savedSecret;
    vi.restoreAllMocks();
  });

  async function signIn(username: string): Promise<string> {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    // The session row is written as the body finishes; read it to the end.
    await response.text();
    return response.headers.get('set-cookie')!.split(';')[0]!;
  }

  async function admin() {
    const user = await makeAdmin({ passwordHash: await hashPassword(PASSWORD) });
    return { user, cookie: await signIn(user.username) };
  }

  async function person() {
    return makeUser({ passwordHash: await hashPassword(PASSWORD) });
  }

  /** A submitted row with both photos, waiting for a decision. */
  async function submitted(userId: string, overrides: Parameters<typeof makeIdVerification>[1] = {}) {
    return makeIdVerification(userId, {
      idType: 'drivers_license',
      frontKey: `ids/${userId}/${randomUUID()}-front.webp`,
      backKey: `ids/${userId}/${randomUUID()}-back.webp`,
      idConsentAt: new Date(),
      submittedAt: new Date(),
      ...overrides,
    });
  }

  async function call(cookie: string | null, method: string, path: string, body?: unknown) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as { data?: any; meta?: any; error?: any }) : {};
    return { status: response.status, text, ...json };
  }

  /** The decision alone, without opening the review first. */
  const decideUnseen = (cookie: string, id: string, body: Record<string, unknown>) =>
    call(cookie, 'POST', `/admin/id-verifications/${id}/decision`, body);

  /** As an administrator decides: the review is opened, then the decision sent. */
  async function decide(cookie: string, id: string, body: Record<string, unknown>) {
    await call(cookie, 'GET', `/admin/id-verifications/${id}`);
    return decideUnseen(cookie, id, body);
  }

  async function auditRows(idVerificationId: string) {
    return db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.idVerificationId, idVerificationId));
  }

  /** The decision's own audit rows, leaving out the looks that came before. */
  async function decisionRows(idVerificationId: string) {
    return (await auditRows(idVerificationId)).filter((audit) => audit.action !== 'id_viewed');
  }

  describe('who may use it', () => {
    it('is not there for an ordinary account or for nobody', async () => {
      const user = await person();
      const row = await submitted(user.id);
      const cookie = await signIn(user.username);

      for (const path of ['/admin/id-verifications', `/admin/id-verifications/${row.id}`]) {
        expect((await call(cookie, 'GET', path)).status, path).toBe(404);
        expect((await call(null, 'GET', path)).status, path).toBe(404);
      }
    });
  });

  describe('the queue', () => {
    it('lists submitted IDs oldest first, flags suspended accounts, and leaves out unsubmitted ones', async () => {
      const { cookie } = await admin();
      const older = await person();
      const newer = await person();
      const waiting = await person();
      await submitted(older.id, { submittedAt: new Date(Date.now() - 2 * DAY) });
      await submitted(newer.id, { submittedAt: new Date(Date.now() - DAY) });
      await makeIdVerification(waiting.id);
      await suspend(newer.id);

      const result = await call(cookie, 'GET', '/admin/id-verifications?view=pending');

      expect(result.status).toBe(200);
      expect(result.data.map((row: { username: string }) => row.username)).toEqual([
        older.username,
        newer.username,
      ]);
      expect(result.data[1].accountSuspended).toBe(true);
      expect(result.meta.total).toBe(2);
      expect(result.text).not.toContain('ids/');
    });

    it('shows decisions from the last 7 days only', async () => {
      const { cookie } = await admin();
      const recent = await person();
      const old = await person();
      await submitted(recent.id, { status: 'verified', decidedAt: new Date(Date.now() - DAY) });
      await submitted(old.id, { status: 'verified', decidedAt: new Date(Date.now() - 8 * DAY) });

      const result = await call(cookie, 'GET', '/admin/id-verifications?view=decided');

      expect(result.data.map((row: { username: string }) => row.username)).toEqual([recent.username]);
    });
  });

  describe('the review', () => {
    it('signs both sides for at most five minutes, and records each look', async () => {
      const { user: reviewer, cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);

      const first = await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);
      await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);

      expect(first.status).toBe(200);
      expect(first.data.frontUrl).toContain(row.frontKey);
      expect(first.data.backUrl).toContain(row.backKey);
      expect(first.data.urlsExpireAt).not.toBeNull();
      for (const [bucket, , seconds] of signDownload.mock.calls) {
        expect(bucket).toBe(env.SUPABASE_ID_BUCKET);
        expect(seconds).toBeLessThanOrEqual(300);
        expect(seconds).toBeGreaterThan(0);
      }
      const views = (await auditRows(row.id)).filter((audit) => audit.action === 'id_viewed');
      expect(views).toHaveLength(2);
      expect(views.every((audit) => audit.adminId === reviewer.id && audit.subjectUserId === user.id)).toBe(true);
    });

    it('issues no link once the 7 days are over, even with the images still there', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id, {
        status: 'verified',
        decidedAt: new Date(Date.now() - 7 * DAY - 60 * 1000),
      });

      const result = await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);

      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ frontUrl: null, backUrl: null, urlsExpireAt: null });
      expect(result.data.decision.status).toBe('verified');
      expect(signDownload).not.toHaveBeenCalled();
      expect(await auditRows(row.id)).toHaveLength(0);
    });

    it('never outlives the 7 days: a link near the end is cut short', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id, {
        status: 'declined_retry',
        decidedAt: new Date(Date.now() - 7 * DAY + 90 * 1000),
        decisionReason: 'Blurred.',
      });

      await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);

      const seconds = signDownload.mock.calls[0]![2];
      expect(seconds).toBeLessThanOrEqual(90);
      expect(seconds).toBeGreaterThan(0);
    });

    it('issues no link for images already deleted', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id, {
        status: 'verified',
        decidedAt: new Date(Date.now() - DAY),
        frontKey: null,
        backKey: null,
        imagesDeletedAt: new Date(),
      });

      const result = await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);

      expect(result.data.frontUrl).toBeNull();
      expect(signDownload).not.toHaveBeenCalled();
    });

    it('still loads the record and the decision when a photo cannot be signed', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);
      signDownload.mockImplementation(async (_bucket: string, key: string) => {
        if (key === row.backKey) throw new Error('NoSuchKey');
        return `http://storage.test/signed/${key}`;
      });

      const oneSide = await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);
      expect(oneSide.status).toBe(200);
      expect(oneSide.data.frontUrl).toContain(row.frontKey);
      expect(oneSide.data.backUrl).toBeNull();
      expect(await auditRows(row.id)).toHaveLength(1);

      signDownload.mockRejectedValue(new Error('NoSuchKey'));
      const neither = await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);
      expect(neither.status).toBe(200);
      expect(neither.data).toMatchObject({ frontUrl: null, backUrl: null, urlsExpireAt: null, status: 'pending' });
      // No photo was shown, so no look is recorded.
      expect(await auditRows(row.id)).toHaveLength(1);
    });

    it('answers 503, and records no look, while the ID bucket is not ready', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);
      ready.mockResolvedValue(false);

      const result = await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);

      expect(result.status).toBe(503);
      expect(result.error.code).toBe('ID_STORAGE_UNAVAILABLE');
      expect(await auditRows(row.id)).toHaveLength(0);
    });
  });

  describe('the decision', () => {
    it('verifies with a number, records it as a hash only, notifies, and lifts browse-only on the same session', async () => {
      const { user: reviewer, cookie } = await admin();
      const user = await person();
      const userCookie = await signIn(user.username);
      const row = await submitted(user.id);
      // Browse-only before.
      expect((await call(userCookie, 'PATCH', '/me/profile', {})).error?.code).toBe('VERIFICATION_PENDING');

      const result = await decide(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER });

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('verified');
      expect(result.data.idNumberRecorded).toBe(true);
      const [after] = await db.select().from(idVerifications).where(eq(idVerifications.id, row.id));
      expect(after!.idNumberHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(after)).not.toContain('98765432');
      expect(JSON.stringify(after)).not.toContain(ID_NUMBER);
      const audit = await decisionRows(row.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: 'id_verified', adminId: reviewer.id, subjectUserId: user.id });
      const told = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.type, 'id_verified')));
      expect(told).toHaveLength(1);
      // The gate reads the latest row on every request: no sign-in needed.
      expect((await call(userCookie, 'PATCH', '/me/profile', {})).error?.code).not.toBe('VERIFICATION_PENDING');
    });

    it('a decline ends every session, legacy ones included, and the next request says why', async () => {
      const { cookie } = await admin();
      const user = await person();
      const userCookie = await signIn(user.username);
      const row = await submitted(user.id);
      // A session an earlier build signed in without user_id.
      await db.insert(sessions).values({
        sid: `legacy-${randomUUID()}`,
        data: JSON.stringify({ cookie: { originalMaxAge: 1000 }, userId: user.id }),
        expiresAt: new Date(Date.now() + DAY),
        userId: null,
      });

      const result = await decide(cookie, row.id, {
        decision: 'retry',
        reason: 'The back is too blurred to read.',
      });

      expect(result.status).toBe(200);
      const rewritten = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rewritten).toHaveLength(0);
      const all = await db.select().from(sessions);
      const theirs = all.filter((session) => session.data.includes('The back is too blurred'));
      expect(theirs.length).toBeGreaterThanOrEqual(2);
      for (const session of theirs) {
        const data = JSON.parse(session.data) as Record<string, unknown>;
        expect(data.userId).toBeUndefined();
        expect(data.declineNotice).toEqual({ kind: 'retry', reason: 'The back is too blurred to read.' });
        expect(data.cookie).toBeDefined();
      }
      const next = await call(userCookie, 'GET', '/auth/me');
      expect(next.status).toBe(401);
      expect(next.error.code).toBe('ID_DECLINED');
      expect(next.error.details).toEqual({ kind: 'retry', reason: 'The back is too blurred to read.' });
      expect((await decisionRows(row.id))[0]).toMatchObject({
        action: 'id_declined_retry',
        reason: 'The back is too blurred to read.',
      });
    });

    it('a final decline needs the number or the no-number box, and a reason', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);

      expect((await decide(cookie, row.id, { decision: 'final', reason: 'Outside Biliran.' })).status).toBe(400);
      expect((await decide(cookie, row.id, { decision: 'final', noIdNumber: true })).status).toBe(400);
      const result = await decide(cookie, row.id, {
        decision: 'final',
        noIdNumber: true,
        reason: 'The address is outside Biliran.',
      });

      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ status: 'declined_final', idNumberAbsent: true, idNumberRecorded: false });
    });

    it('refuses the wrong decisions', async () => {
      const { user: reviewer, cookie } = await admin();
      const user = await person();
      const suspended = await person();
      const unsubmitted = await person();
      const row = await submitted(user.id);
      const suspendedRow = await submitted(suspended.id);
      await suspend(suspended.id);
      const unsubmittedRow = await makeIdVerification(unsubmitted.id);
      const own = await submitted(reviewer.id);

      expect((await decide(cookie, own.id, { decision: 'retry', reason: 'x' })).status).toBe(409);
      expect((await decide(cookie, suspendedRow.id, { decision: 'retry', reason: 'x' })).status).toBe(409);
      expect((await decide(cookie, unsubmittedRow.id, { decision: 'retry', reason: 'x' })).status).toBe(409);
      expect((await decide(cookie, row.id, { decision: 'retry' })).status).toBe(400);
      expect((await decide(cookie, row.id, { decision: 'retry', reason: 'x'.repeat(501) })).status).toBe(400);
      expect((await decide(cookie, row.id, { decision: 'verify' })).status).toBe(400);
      expect(
        (await decide(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER, noIdNumber: true })).status,
      ).toBe(400);
      expect((await decide(cookie, randomUUID(), { decision: 'retry', reason: 'x' })).status).toBe(404);
    });

    it('settles an ID only for an administrator who was shown it', async () => {
      const { cookie } = await admin();
      const { cookie: other } = await admin();
      const user = await person();
      const row = await submitted(user.id);

      // Never opened.
      const unseen = await decideUnseen(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER });
      expect(unseen.status).toBe(409);
      expect(unseen.error.message).toMatch(/Open the ID photos/);
      expect(
        (await decideUnseen(cookie, row.id, { decision: 'final', noIdNumber: true, reason: 'Outside.' })).status,
      ).toBe(409);

      // Opened, but no photo could be shown: no look was recorded.
      signDownload.mockRejectedValue(new Error('Object not found'));
      await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);
      expect((await decideUnseen(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER })).status).toBe(409);

      // Another administrator's look does not count for this one.
      signDownload.mockImplementation(async (_bucket: string, key: string) => `http://storage.test/signed/${key}`);
      await call(other, 'GET', `/admin/id-verifications/${row.id}`);
      expect((await decideUnseen(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER })).status).toBe(409);

      const [still] = await db.select().from(idVerifications).where(eq(idVerifications.id, row.id));
      expect(still!.status).toBe('pending');

      // Shown it: decided.
      await call(cookie, 'GET', `/admin/id-verifications/${row.id}`);
      expect((await decideUnseen(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER })).status).toBe(200);
    });

    it('sends an ID back to try again without it being seen, when the photos will not load', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);

      const result = await decideUnseen(cookie, row.id, { decision: 'retry', reason: 'The photos did not load.' });

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('declined_retry');
    });

    it('takes one decision: two at once answer 200 and 409', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);

      const outcomes = await Promise.all([
        decide(cookie, row.id, { decision: 'retry', reason: 'Blurred.' }),
        decide(cookie, row.id, { decision: 'retry', reason: 'Blurred.' }),
      ]);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
      expect(await decisionRows(row.id)).toHaveLength(1);
    });
  });

  describe('a repeated ID', () => {
    it('warns about another account with the same number, written differently', async () => {
      const { cookie } = await admin();
      const first = await person();
      const second = await person();
      const firstRow = await submitted(first.id);
      expect((await decide(cookie, firstRow.id, { decision: 'verify', idNumber: '1234 5678' })).status).toBe(200);
      const secondRow = await submitted(second.id);

      const warned = await decide(cookie, secondRow.id, { decision: 'verify', idNumber: '12345678' });

      expect(warned.status).toBe(409);
      expect(warned.error.code).toBe('ID_NUMBER_MATCH');
      expect(warned.error.details.matches).toEqual([
        { username: first.username, status: 'verified', decidedAt: expect.any(String) },
      ]);
      expect(warned.text).not.toContain('12345678');
      const [still] = await db.select().from(idVerifications).where(eq(idVerifications.id, secondRow.id));
      expect(still!.status).toBe('pending');
    });

    it('verifies despite a match only with a reason, and says so on the record', async () => {
      const { cookie } = await admin();
      const first = await person();
      const second = await person();
      await decide(cookie, (await submitted(first.id)).id, { decision: 'verify', idNumber: '55667788' });
      const row = await submitted(second.id);

      const noReason = await decide(cookie, row.id, {
        decision: 'verify',
        idNumber: '55667788',
        acknowledgeMatch: true,
      });
      const withReason = await decide(cookie, row.id, {
        decision: 'verify',
        idNumber: '55667788',
        acknowledgeMatch: true,
        reason: 'Siblings share a household ID card.',
      });

      expect(noReason.status).toBe(400);
      expect(withReason.status).toBe(200);
      expect((await decisionRows(row.id))[0]!.reason).toBe(
        'Verified despite 1 matching account(s): Siblings share a household ID card.',
      );
    });

    it("never counts the person's own earlier rows", async () => {
      const { cookie } = await admin();
      const user = await person();
      const earlier = await submitted(user.id);
      await decide(cookie, earlier.id, { decision: 'final', idNumber: '44332211', reason: 'Outside Biliran.' });
      // Reopened by hand: a later row of the same account, as after an appeal.
      const later = await submitted(user.id);

      const result = await decide(cookie, later.id, { decision: 'verify', idNumber: '44332211' });

      expect(result.status).toBe(200);
    });

    it('answers 503 when ID numbers cannot be hashed, and leaves the row waiting', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);
      env.ID_HASH_SECRET = undefined;

      const result = await decide(cookie, row.id, { decision: 'verify', idNumber: ID_NUMBER });

      expect(result.status).toBe(503);
      expect(result.error.code).toBe('ID_HASH_UNAVAILABLE');
      const [still] = await db.select().from(idVerifications).where(eq(idVerifications.id, row.id));
      expect(still!.status).toBe('pending');
    });

    it('lets try-again through with no number at all', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await submitted(user.id);

      expect((await decide(cookie, row.id, { decision: 'retry', reason: 'Glare over the text.' })).status).toBe(200);
    });

    it('never puts the number in a response or a log line', async () => {
      // The request log's own fields: the body is never among them.
      const fields = requestLogFields({
        id: 1,
        method: 'POST',
        url: '/api/v1/admin/id-verifications/x/decision',
        body: { decision: 'verify', idNumber: ID_NUMBER },
      } as Parameters<typeof requestLogFields>[0]);
      expect(Object.keys(fields).sort()).toEqual(['id', 'method', 'url']);
      expect(JSON.stringify(fields)).not.toContain(ID_NUMBER);

      const spies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((level) =>
        vi.spyOn(logger, level),
      );
      const { cookie } = await admin();
      const first = await person();
      const second = await person();
      const answers = [
        await decide(cookie, (await submitted(first.id)).id, { decision: 'verify', idNumber: ID_NUMBER }),
        await decide(cookie, (await submitted(second.id)).id, { decision: 'verify', idNumber: ID_NUMBER }),
      ];

      for (const answer of answers) {
        expect(answer.text).not.toContain(ID_NUMBER);
        expect(answer.text).not.toContain('98765432');
      }
      // The request logger is handed the raw request and response, then keeps
      // only requestLogFields from them; those raw objects are checked above,
      // through the fields actually written. Every other log call is checked
      // whole.
      const isRawHttp = (value: unknown) =>
        value instanceof IncomingMessage || value instanceof ServerResponse;
      const calls = spies
        .flatMap((spy) => spy.mock.calls)
        .map((args) =>
          args.map((arg) =>
            arg && typeof arg === 'object'
              ? Object.fromEntries(Object.entries(arg).filter(([, value]) => !isRawHttp(value)))
              : arg,
          ),
        );
      const logged = inspect(calls, { depth: 8 });
      expect(logged).not.toContain(ID_NUMBER);
      expect(logged).not.toContain('98765432');
    });
  });
});
