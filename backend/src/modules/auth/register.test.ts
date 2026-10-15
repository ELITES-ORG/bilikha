import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, count, eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { db, sql } from '../../db/index.js';
import { barangays, idVerifications, municipalities, users } from '../../db/schema/index.js';
import { normalizePhone } from '../../lib/contact.js';
import { createSignedUpload, idStorageReady } from '../../lib/storage.js';
import { makeUser } from '../../test/factories.js';
import { CONSENT_VERSION } from './auth.service.js';

/**
 * Registration with ID verification switched on (ADR 0057, plan 0053 Step
 * 5.1), through the real app. A new account gets its first ID verification row
 * in the same transaction, so it is browse-only from its first request.
 *
 * The register limiter allows 5 successful registrations per hour from one
 * address, shared by every test in this file: only two here succeed.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return { ...actual, idStorageReady: vi.fn(), createSignedUpload: vi.fn() };
});

const ready = vi.mocked(idStorageReady);
const signUpload = vi.mocked(createSignedUpload);

describe('POST /api/v1/auth/register', () => {
  let server: Server;
  let base: string;
  let place: { municipalitySlug: string; barangaySlug: string };

  beforeAll(async () => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    // Any seeded municipality and one of its barangays.
    const [row] = await db
      .select({ municipalitySlug: municipalities.slug, barangaySlug: barangays.slug })
      .from(barangays)
      .innerJoin(municipalities, eq(municipalities.id, barangays.municipalityId))
      .orderBy(asc(municipalities.slug), asc(barangays.slug))
      .limit(1);
    place = row!;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    ready.mockReset().mockResolvedValue(true);
    signUpload.mockReset().mockImplementation(async (objectKey: string) => ({
      uploadUrl: `http://storage.test/upload/${objectKey}?token=t`,
      objectKey,
      token: 't',
    }));
  });

  let serial = 0;
  function body(overrides: Record<string, unknown> = {}) {
    serial += 1;
    const stamp = `${Date.now().toString(36)}${serial}`;
    return {
      firstName: 'Ana',
      lastName: 'Santos',
      username: `ana${stamp}`,
      email: `ana${stamp}@example.test`,
      phone: `0917${String(1_000_000 + serial).slice(-7)}`,
      birthDate: '1995-04-12',
      ...place,
      password: 'a long enough password',
      confirmPassword: 'a long enough password',
      privacyConsent: true,
      termsAccepted: true,
      ...overrides,
    };
  }

  async function post(path: string, payload: unknown, cookie?: string) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as { data?: any; error?: any }) : {};
    return { status: response.status, ...json, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }

  const rowsFor = (userId: string) =>
    db.select().from(idVerifications).where(eq(idVerifications.userId, userId));

  it('creates the account with one waiting, unsubmitted ID row, browse-only from the first request', async () => {
    const result = await post('/auth/register', body());

    expect(result.status).toBe(201);
    expect(result.data.idVerification).toEqual({
      status: 'pending',
      submitted: false,
      reason: null,
      decidedAt: null,
    });
    const rows = await rowsFor(result.data.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'pending',
      submittedAt: null,
      idConsentAt: null,
      frontKey: null,
      backKey: null,
    });
    const [account] = await db.select().from(users).where(eq(users.id, result.data.id));
    expect(account!.consentVersion).toBe(CONSENT_VERSION);

    // The same session: anything that changes something waits for the ID;
    // sending the ID does not.
    const write = await post('/me/profile', {}, result.cookie);
    expect(write.status).toBe(403);
    expect(write.error.code).toBe('VERIFICATION_PENDING');
    const upload = await post('/verification/upload-url', { side: 'front', contentType: 'image/webp' }, result.cookie);
    expect(upload.status).toBe(200);
    expect(upload.data.objectKey).toMatch(new RegExp(`^ids/${result.data.id}/`));
  });

  it('refuses a taken username or phone, and leaves no account and no ID row behind', async () => {
    const takenPhone = '09179999999';
    const existing = await makeUser({ phone: normalizePhone(takenPhone) });
    const [{ before }] = (await db.select({ before: count() }).from(users)) as [{ before: number }];

    const sameName = await post('/auth/register', body({ username: existing.username }));
    const samePhone = await post('/auth/register', body({ phone: takenPhone }));

    expect(sameName.status).toBe(409);
    expect(sameName.error.details).toMatchObject({ field: 'username' });
    expect(samePhone.status).toBe(409);
    expect(samePhone.error.details).toMatchObject({ field: 'phone' });
    const [{ after }] = (await db.select({ after: count() }).from(users)) as [{ after: number }];
    expect(after).toBe(before);
    expect(await db.select().from(idVerifications)).toHaveLength(0);
  });

  it('writes the account and its ID row together, or neither', async () => {
    // A failure on the second insert must undo the first: otherwise an account
    // would exist with no row, which means "no ID required".
    await sql`
      create or replace function test_refuse_id_row() returns trigger as $$
      begin raise exception 'refused for the test'; end;
      $$ language plpgsql
    `;
    await sql`
      create trigger test_refuse_id_row before insert on id_verifications
      for each row execute function test_refuse_id_row()
    `;
    try {
      const payload = body();
      const result = await post('/auth/register', payload);

      expect(result.status).toBe(500);
      const left = await db.select().from(users).where(eq(users.username, payload.username));
      expect(left).toHaveLength(0);
    } finally {
      await sql`drop trigger if exists test_refuse_id_row on id_verifications`;
      await sql`drop function if exists test_refuse_id_row()`;
    }

    // And registration works again once nothing refuses it.
    expect((await post('/auth/register', body())).status).toBe(201);
  });
});
