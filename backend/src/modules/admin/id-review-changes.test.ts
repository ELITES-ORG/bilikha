import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { idVerifications, moderationActions, notifications } from '../../db/schema/index.js';
import { hashPassword } from '../../lib/password.js';
import { createSignedDownload, idStorageReady } from '../../lib/storage.js';
import { makeAdmin, makeIdVerification, makeUser, PASSWORD, suspend } from '../../test/factories.js';
import { hashIdNumber } from '../verification/id-number.js';

/**
 * Changing an ID decision within its 7 days, and answering an appeal (ADR
 * 0057, plan 0053 Steps 4.1 and 4.3), through the real app. Storage is mocked
 * — route tests never stub fetch. The first decision is id-review.test.ts.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return { ...actual, idStorageReady: vi.fn(), createSignedDownload: vi.fn() };
});

const ready = vi.mocked(idStorageReady);
const signDownload = vi.mocked(createSignedDownload);

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'd'.repeat(64);
const savedSecret = env.ID_HASH_SECRET;

describe('ID decisions after the first', () => {
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

  async function signIn(username: string) {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: JSON.parse(text) as { error?: { code: string; details?: any } },
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null,
    };
  }

  async function admin() {
    const user = await makeAdmin({ passwordHash: await hashPassword(PASSWORD) });
    return { user, cookie: (await signIn(user.username)).cookie! };
  }

  async function person() {
    return makeUser({ passwordHash: await hashPassword(PASSWORD) });
  }

  /** A decided row with both photos, decided `ago` milliseconds before now. */
  async function decided(
    userId: string,
    status: 'verified' | 'declined_retry' | 'declined_final',
    overrides: Parameters<typeof makeIdVerification>[1] = {},
    ago = DAY,
  ) {
    return makeIdVerification(userId, {
      status,
      idType: 'drivers_license',
      frontKey: `ids/${userId}/${randomUUID()}-front.webp`,
      backKey: `ids/${userId}/${randomUUID()}-back.webp`,
      idConsentAt: new Date(Date.now() - ago - DAY),
      submittedAt: new Date(Date.now() - ago - DAY),
      decidedAt: new Date(Date.now() - ago),
      decisionReason: status === 'verified' ? null : 'The address is outside Biliran.',
      idNumberAbsent: status !== 'declined_retry',
      ...overrides,
    });
  }

  async function appealed(userId: string, overrides: Parameters<typeof makeIdVerification>[1] = {}) {
    return decided(userId, 'declined_final', {
      status: 'appealed',
      appealMessage: 'I moved to Naval last year.',
      appealedAt: new Date(Date.now() - 60 * 60 * 1000),
      ...overrides,
    });
  }

  const look = (cookie: string, id: string) => call(cookie, 'GET', `/admin/id-verifications/${id}`);

  /** As an administrator acts: the review is opened, then the change sent on the decision it shows. */
  async function change(cookie: string, id: string, body: Record<string, unknown>) {
    const seen = await look(cookie, id);
    return call(cookie, 'POST', `/admin/id-verifications/${id}/decision`, {
      expectedDecidedAt: seen.data.decision.decidedAt,
      ...body,
    });
  }

  async function answer(cookie: string, id: string, body: Record<string, unknown>) {
    await look(cookie, id);
    return call(cookie, 'POST', `/admin/id-verifications/${id}/appeal`, body);
  }

  async function reload(id: string) {
    const [row] = await db.select().from(idVerifications).where(eq(idVerifications.id, id));
    return row!;
  }

  async function decisionRows(id: string) {
    return (
      await db.select().from(moderationActions).where(eq(moderationActions.idVerificationId, id))
    ).filter((audit) => audit.action !== 'id_viewed');
  }

  describe('changing a decision', () => {
    it('undoes a mistaken not-from-Biliran: the account signs in and can write', async () => {
      const { user: reviewer, cookie } = await admin();
      const user = await person();
      const row = await decided(user.id, 'declined_final');

      const result = await change(cookie, row.id, {
        decision: 'verify',
        reason: 'Second look: the barangay is Caucab, Almeria.',
      });

      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ status: 'verified' });
      const after = await reload(row.id);
      expect(after).toMatchObject({ status: 'verified', decisionReason: null, reviewedBy: reviewer.id });
      // The 7 days start again.
      expect(after.decidedAt!.getTime()).toBeGreaterThan(row.decidedAt!.getTime());
      expect(await decisionRows(row.id)).toEqual([
        expect.objectContaining({
          action: 'id_decision_reversed',
          reason: 'Changed from not from Biliran to verified: Second look: the barangay is Caucab, Almeria.',
        }),
      ]);
      const told = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.type, 'id_verified')));
      expect(told).toHaveLength(1);

      const signedIn = await signIn(user.username);
      expect(signedIn.status).toBe(200);
      const write = await call(signedIn.cookie, 'PATCH', '/me/profile', {});
      expect(write.error?.code).not.toBe('VERIFICATION_PENDING');
    });

    it('turns a verify into try again: the open session ends with the reason', async () => {
      const { cookie } = await admin();
      const user = await person();
      await decided(user.id, 'verified');
      const session = (await signIn(user.username)).cookie;
      const row = (await db.select().from(idVerifications).where(eq(idVerifications.userId, user.id)))[0]!;

      const result = await change(cookie, row.id, {
        decision: 'retry',
        reason: 'The back photo is of a different card.',
      });

      expect(result.status).toBe(200);
      const next = await call(session, 'GET', '/auth/me');
      expect(next.status).toBe(401);
      expect(next.error.details).toEqual({ kind: 'retry', reason: 'The back photo is of a different card.' });
    });

    it('turns a verify into not from Biliran, and the notice offers the appeal', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await decided(user.id, 'verified');
      const session = (await signIn(user.username)).cookie;

      const before = Date.now();
      await change(cookie, row.id, { decision: 'final', reason: 'The licence was issued in Ormoc.' });
      const next = await call(session, 'GET', '/auth/me');

      expect(next.error.details).toMatchObject({ kind: 'final', reason: 'The licence was issued in Ormoc.' });
      const until = new Date(next.error.details.appealUntil).getTime();
      expect(until).toBeGreaterThanOrEqual(before + 7 * DAY);
      expect(until).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    });

    it('is refused after the 7 days, under appeal, after a resubmission, and for the same decision', async () => {
      const { cookie } = await admin();
      const late = await decided((await person()).id, 'declined_final', {}, 7 * DAY + 60 * 1000);
      const underAppeal = await appealed((await person()).id);
      const resubmitter = await person();
      const old = await decided(resubmitter.id, 'declined_retry', {}, 2 * DAY);
      await makeIdVerification(resubmitter.id, {
        idType: 'drivers_license',
        frontKey: `ids/${resubmitter.id}/new-front.webp`,
        backKey: `ids/${resubmitter.id}/new-back.webp`,
        submittedAt: new Date(),
      });
      const same = await decided((await person()).id, 'verified');

      const results = {
        late: await change(cookie, late.id, { decision: 'verify', reason: 'Too late.' }),
        underAppeal: await change(cookie, underAppeal.id, { decision: 'verify', reason: 'Use the appeal.' }),
        old: await change(cookie, old.id, { decision: 'final', reason: 'Old row.', noIdNumber: true }),
        same: await change(cookie, same.id, { decision: 'verify', reason: 'Again.' }),
      };

      expect(results.late.status).toBe(409);
      expect(results.late.error.message).toMatch(/7 days/);
      expect(results.underAppeal.status).toBe(409);
      expect(results.underAppeal.error.message).toMatch(/appeal/);
      expect(results.old.status).toBe(409);
      expect(results.old.error.message).toMatch(/new ID/);
      expect(results.same.status).toBe(400);
      for (const row of [late, underAppeal, old, same]) {
        expect(await decisionRows(row.id)).toHaveLength(0);
      }
    });

    it('refuses a change sent from a page that shows a decision changed since', async () => {
      const { cookie: first } = await admin();
      const { cookie: second } = await admin();
      const row = await decided((await person()).id, 'verified');
      const seen = await look(second, row.id);
      expect((await change(first, row.id, { decision: 'final', reason: 'Issued in Ormoc.' })).status).toBe(200);

      const late = await call(second, 'POST', `/admin/id-verifications/${row.id}/decision`, {
        decision: 'retry',
        reason: 'Blurred.',
        expectedDecidedAt: seen.data.decision.decidedAt,
      });

      expect(late.status).toBe(409);
      expect(late.error.message).toMatch(/changed a moment ago/);
      expect((await reload(row.id)).status).toBe('declined_final');
      expect(await decisionRows(row.id)).toHaveLength(1);
    });

    it('needs a reason, and refuses your own ID and a suspended account', async () => {
      const { user: reviewer, cookie } = await admin();
      const row = await decided((await person()).id, 'declined_retry');
      const own = await decided(reviewer.id, 'declined_retry');
      const suspendedUser = await person();
      const suspendedRow = await decided(suspendedUser.id, 'declined_retry');
      await suspend(suspendedUser.id);

      expect((await change(cookie, row.id, { decision: 'final', noIdNumber: true })).status).toBe(400);
      expect((await change(cookie, own.id, { decision: 'final', noIdNumber: true, reason: 'x' })).status).toBe(409);
      expect(
        (await change(cookie, suspendedRow.id, { decision: 'final', noIdNumber: true, reason: 'x' })).status,
      ).toBe(409);
    });

    it('needs a fresh look at the photos to verify or decline as not from Biliran, but not to send back', async () => {
      const { user: reviewer, cookie } = await admin();
      const row = await decided((await person()).id, 'declined_final');
      // A look from before the decision does not count for changing it.
      await db.insert(moderationActions).values({
        subjectUserId: row.userId,
        adminId: reviewer.id,
        action: 'id_viewed',
        idVerificationId: row.id,
        createdAt: new Date(row.decidedAt!.getTime() - 60 * 1000),
      });
      const post = (body: Record<string, unknown>) =>
        call(cookie, 'POST', `/admin/id-verifications/${row.id}/decision`, {
          expectedDecidedAt: row.decidedAt!.toISOString(),
          ...body,
        });

      const unseen = await post({ decision: 'verify', reason: 'Looks fine.' });
      expect(unseen.status).toBe(409);
      expect(unseen.error.message).toMatch(/Open the ID photos again/);

      const sentBack = await post({ decision: 'retry', reason: 'Please take the photos again.' });
      expect(sentBack.status).toBe(200);
    });

    it('checks a number already on the row against other accounts before verifying', async () => {
      const { cookie } = await admin();
      const hash = hashIdNumber('drivers_license', 'N01-23-456789', SECRET);
      const first = await person();
      await decided(first.id, 'verified', { idNumberHash: hash, idNumberAbsent: false });
      const row = await decided((await person()).id, 'declined_final', { idNumberHash: hash, idNumberAbsent: false });

      const warned = await change(cookie, row.id, { decision: 'verify', reason: 'Siblings share a card.' });
      expect(warned.status).toBe(409);
      expect(warned.error.code).toBe('ID_NUMBER_MATCH');
      expect(warned.error.details.matches).toEqual([
        { username: first.username, status: 'verified', decidedAt: expect.any(String) },
      ]);

      const verified = await change(cookie, row.id, {
        decision: 'verify',
        reason: 'Siblings share a card.',
        acknowledgeMatch: true,
      });
      expect(verified.status).toBe(200);
      expect((await decisionRows(row.id))[0]!.reason).toBe(
        'Changed from not from Biliran to verified: Verified despite 1 matching account(s): Siblings share a card.',
      );
    });

    it('says in the review until when a decision can be changed', async () => {
      const { cookie } = await admin();
      const open = await decided((await person()).id, 'verified');
      const late = await decided((await person()).id, 'verified', {}, 7 * DAY + 60 * 1000);
      const underAppeal = await appealed((await person()).id);

      const openView = await look(cookie, open.id);
      const lateView = await look(cookie, late.id);
      const appealView = await look(cookie, underAppeal.id);

      expect(openView.data.changeableUntil).toBe(new Date(open.decidedAt!.getTime() + 7 * DAY).toISOString());
      expect(lateView.data.changeableUntil).toBeNull();
      expect(appealView.data.changeableUntil).toBeNull();
    });
  });

  describe('answering an appeal', () => {
    it('lists open appeals oldest first, apart from the waiting and the decided', async () => {
      const { cookie } = await admin();
      const older = await appealed((await person()).id, { appealedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
      const newer = await appealed((await person()).id);

      const appeals = await call(cookie, 'GET', '/admin/id-verifications?view=appeals');
      const decidedView = await call(cookie, 'GET', '/admin/id-verifications?view=decided');

      const ids = appeals.data.map((row: { id: string }) => row.id);
      expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
      expect(appeals.data.find((row: { id: string }) => row.id === older.id).appealedAt).toBe(
        older.appealedAt!.toISOString(),
      );
      expect(decidedView.data.map((row: { id: string }) => row.id)).not.toContain(older.id);
    });

    it('grants: the account is verified, signs in, and is told', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await appealed(user.id);

      const result = await answer(cookie, row.id, {
        outcome: 'grant',
        reason: 'The new barangay certificate shows Naval.',
      });

      expect(result.status).toBe(200);
      const after = await reload(row.id);
      expect(after).toMatchObject({ status: 'verified', decisionReason: null });
      expect(after.appealDecidedAt).not.toBeNull();
      expect(after.decidedAt!.getTime()).toBeGreaterThan(row.decidedAt!.getTime());
      expect(await decisionRows(row.id)).toEqual([
        expect.objectContaining({ action: 'id_appeal_granted', reason: 'The new barangay certificate shows Naval.' }),
      ]);
      expect((await signIn(user.username)).status).toBe(200);
      const told = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.type, 'id_verified')));
      expect(told).toHaveLength(1);
    });

    it('upholds: sign-in shows the new reason, with no second appeal', async () => {
      const { cookie } = await admin();
      const user = await person();
      const row = await appealed(user.id);

      const result = await answer(cookie, row.id, {
        outcome: 'uphold',
        reason: 'The certificate is for Ormoc City, not Biliran.',
      });
      const signedIn = await signIn(user.username);
      const again = await call(null, 'POST', '/auth/id-appeal', {
        username: user.username,
        password: PASSWORD,
        message: 'Please look again, I really do live here.',
      });

      expect(result.status).toBe(200);
      expect(await reload(row.id)).toMatchObject({
        status: 'declined_final',
        decisionReason: 'The certificate is for Ormoc City, not Biliran.',
      });
      expect(signedIn.status).toBe(403);
      expect(signedIn.body.error?.details).toEqual({
        kind: 'final',
        reason: 'The certificate is for Ormoc City, not Biliran.',
      });
      expect(again.status).toBe(409);
      expect(again.error.code).toBe('ID_APPEAL_CLOSED');
      expect(await decisionRows(row.id)).toEqual([expect.objectContaining({ action: 'id_appeal_upheld' })]);
    });

    it('needs a look at the photos since the appeal', async () => {
      const { user: reviewer, cookie } = await admin();
      const row = await appealed((await person()).id);
      await db.insert(moderationActions).values({
        subjectUserId: row.userId,
        adminId: reviewer.id,
        action: 'id_viewed',
        idVerificationId: row.id,
        createdAt: new Date(row.appealedAt!.getTime() - 60 * 1000),
      });

      const result = await call(cookie, 'POST', `/admin/id-verifications/${row.id}/appeal`, {
        outcome: 'grant',
        reason: 'Looks right.',
      });

      expect(result.status).toBe(409);
      expect((await reload(row.id)).status).toBe('appealed');
    });

    it('is refused for anyone but an administrator, for your own ID, and for a row with no appeal', async () => {
      const { user: reviewer, cookie } = await admin();
      const user = await person();
      const row = await appealed(user.id);
      const own = await appealed(reviewer.id);
      const notAppealed = await decided((await person()).id, 'declined_final');
      const userSession = (await signIn((await person()).username)).cookie;

      const body = { outcome: 'grant', reason: 'x' };
      expect((await call(userSession, 'POST', `/admin/id-verifications/${row.id}/appeal`, body)).status).toBe(404);
      expect((await call(null, 'POST', `/admin/id-verifications/${row.id}/appeal`, body)).status).toBe(404);
      expect((await answer(cookie, own.id, body)).status).toBe(409);
      expect((await answer(cookie, notAppealed.id, body)).status).toBe(409);
      expect((await answer(cookie, row.id, { outcome: 'grant', reason: '  ' })).status).toBe(400);
      expect((await answer(cookie, row.id, { outcome: 'grant', reason: 'x'.repeat(501) })).status).toBe(400);
      expect((await reload(row.id)).status).toBe('appealed');
    });

    it('warns before granting an ID whose number is on another account', async () => {
      const { cookie } = await admin();
      const hash = hashIdNumber('drivers_license', 'N01-23-456789', SECRET);
      const first = await person();
      await decided(first.id, 'verified', { idNumberHash: hash, idNumberAbsent: false });
      const row = await appealed((await person()).id, { idNumberHash: hash, idNumberAbsent: false });

      const warned = await answer(cookie, row.id, { outcome: 'grant', reason: 'Same household.' });
      const granted = await answer(cookie, row.id, {
        outcome: 'grant',
        reason: 'Same household.',
        acknowledgeMatch: true,
      });

      expect(warned.status).toBe(409);
      expect(warned.error.code).toBe('ID_NUMBER_MATCH');
      expect(granted.status).toBe(200);
      expect((await decisionRows(row.id))[0]!.reason).toBe('Granted despite 1 matching account(s): Same household.');
    });

    it('answers once: two answers at once give one 200 and one 409', async () => {
      const { cookie } = await admin();
      const row = await appealed((await person()).id);
      await look(cookie, row.id);

      const outcomes = await Promise.all([
        call(cookie, 'POST', `/admin/id-verifications/${row.id}/appeal`, { outcome: 'grant', reason: 'Yes.' }),
        call(cookie, 'POST', `/admin/id-verifications/${row.id}/appeal`, { outcome: 'uphold', reason: 'No.' }),
      ]);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
      expect(await decisionRows(row.id)).toHaveLength(1);
    });
  });
});
