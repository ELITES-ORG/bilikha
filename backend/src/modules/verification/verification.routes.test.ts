import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { db } from '../../db/index.js';
import { idVerifications } from '../../db/schema/index.js';
import { hashPassword } from '../../lib/password.js';
import { createSignedUpload, idStorageReady, listObjects, type StoredObject } from '../../lib/storage.js';
import { makeIdVerification, makeUser, PASSWORD, suspend } from '../../test/factories.js';

/**
 * Storage is mocked: route tests never stub `fetch`, they call the app with it
 * (plan 0053 rules). The key helpers stay real, because what is under test is
 * how a submitted key is checked.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return {
    ...actual,
    idStorageReady: vi.fn(),
    createSignedUpload: vi.fn(),
    listObjects: vi.fn(),
  };
});

const ready = vi.mocked(idStorageReady);
const signUpload = vi.mocked(createSignedUpload);
const list = vi.mocked(listObjects);

const keyFor = (userId: string, side: 'front' | 'back', ext: 'webp' | 'jpg' = 'webp') =>
  `ids/${userId}/${randomUUID()}-${side}.${ext}`;

const stored = (name: string, overrides: Partial<StoredObject> = {}): StoredObject => ({
  name,
  updatedAt: new Date().toISOString(),
  size: 250_000,
  mimetype: name.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
  ...overrides,
});

describe('/api/v1/verification', () => {
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
    ready.mockReset().mockResolvedValue(true);
    signUpload.mockReset().mockImplementation(async (objectKey: string) => ({
      uploadUrl: `http://storage.test/upload/${objectKey}?token=t`,
      objectKey,
    }));
    list.mockReset().mockResolvedValue([]);
  });

  async function signedIn(): Promise<{ id: string; cookie: string }> {
    const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user.username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    await response.text();
    return { id: user.id, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
  }

  async function post(cookie: string, path: string, body: unknown) {
    const response = await fetch(`${base}/verification${path}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { data?: unknown; error?: { code: string; message: string } };
    return { status: response.status, ...json };
  }

  /** A submission whose objects storage will report as uploaded. */
  function card(userId: string) {
    const frontKey = keyFor(userId, 'front');
    const backKey = keyFor(userId, 'back', 'jpg');
    list.mockResolvedValue([stored(frontKey), stored(backKey)]);
    return { idType: 'drivers_license', frontKey, backKey, idConsent: true };
  }

  describe('POST /upload-url', () => {
    it("signs an upload under the account's own prefix, in the ID bucket", async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);

      const result = await post(user.cookie, '/upload-url', { side: 'back', contentType: 'image/jpeg' });

      expect(result.status).toBe(200);
      const ticket = result.data as { uploadUrl: string; objectKey: string };
      expect(ticket.objectKey).toMatch(new RegExp(`^ids/${user.id}/[0-9a-f-]{36}-back\\.jpg$`));
      expect(signUpload).toHaveBeenCalledWith(ticket.objectKey, 'ids');
    });

    it('answers 503 while the ID bucket is not ready, and signs nothing', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      ready.mockResolvedValue(false);

      const result = await post(user.cookie, '/upload-url', { side: 'front', contentType: 'image/webp' });

      expect(result.status).toBe(503);
      expect(result.error?.code).toBe('ID_STORAGE_UNAVAILABLE');
      expect(signUpload).not.toHaveBeenCalled();
    });

    it('refuses an account that needs no ID, and one already submitted', async () => {
      const legacy = await signedIn();
      const submitted = await signedIn();
      await makeIdVerification(submitted.id, { submittedAt: new Date(), idType: 'umid' });

      for (const user of [legacy, submitted]) {
        const result = await post(user.cookie, '/upload-url', { side: 'front', contentType: 'image/webp' });
        expect(result.status).toBe(409);
      }
    });
  });

  describe('POST /submission', () => {
    it('fills the open row and answers with no key in it', async () => {
      const user = await signedIn();
      const row = await makeIdVerification(user.id);
      const body = card(user.id);

      const result = await post(user.cookie, '/submission', body);

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ status: 'pending', submitted: true, reason: null });
      expect(JSON.stringify(result)).not.toContain('ids/');

      const [after] = await db.select().from(idVerifications).where(eq(idVerifications.id, row.id));
      expect(after).toMatchObject({ idType: 'drivers_license', frontKey: body.frontKey, backKey: body.backKey });
      expect(after?.submittedAt).not.toBeNull();
      expect(after?.idConsentAt).not.toBeNull();
      expect(list).toHaveBeenCalledWith(`ids/${user.id}/`, 'ids');
    });

    it('takes the front alone for a single-page document', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      const frontKey = keyFor(user.id, 'front');
      list.mockResolvedValue([stored(frontKey)]);

      const result = await post(user.cookie, '/submission', {
        idType: 'barangay_certificate_of_residency',
        frontKey,
        idConsent: true,
      });

      expect(result.status).toBe(200);
    });

    it('starts a new row after a try-again decline, leaving the declined one as it was', async () => {
      const user = await signedIn();
      const declined = await makeIdVerification(user.id, {
        status: 'declined_retry',
        submittedAt: new Date(),
        decidedAt: new Date(),
        decisionReason: 'The back is unreadable.',
        frontKey: keyFor(user.id, 'front'),
      });

      const result = await post(user.cookie, '/submission', card(user.id));

      expect(result.status).toBe(200);
      const rows = await db.select().from(idVerifications).where(eq(idVerifications.userId, user.id));
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.id === declined.id)?.status).toBe('declined_retry');
      expect(rows.find((r) => r.id !== declined.id)?.status).toBe('pending');
    });

    it("refuses another account's photo with 403", async () => {
      const user = await signedIn();
      const other = await makeUser();
      await makeIdVerification(user.id);
      const body = { ...card(user.id), frontKey: keyFor(other.id, 'front') };

      expect((await post(user.cookie, '/submission', body)).status).toBe(403);
    });

    it('refuses a photo from an earlier submission', async () => {
      const user = await signedIn();
      const reused = keyFor(user.id, 'front');
      await makeIdVerification(user.id, {
        status: 'declined_retry',
        submittedAt: new Date(),
        decidedAt: new Date(),
        frontKey: reused,
      });
      const body = { ...card(user.id), frontKey: reused };

      expect((await post(user.cookie, '/submission', body)).status).toBe(400);
    });

    it('refuses a card without its back, and a certificate with one', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      const body = card(user.id);

      const noBack = await post(user.cookie, '/submission', { ...body, backKey: undefined });
      const certificateWithBack = await post(user.cookie, '/submission', {
        ...body,
        idType: 'barangay_clearance',
      });

      expect(noBack.status).toBe(400);
      expect(certificateWithBack.status).toBe(400);
    });

    it('refuses sides swapped, and a key that is not one Bilikha issues', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      const body = card(user.id);

      const swapped = await post(user.cookie, '/submission', {
        ...body,
        frontKey: body.backKey,
        backKey: body.frontKey,
      });
      const madeUp = await post(user.cookie, '/submission', {
        ...body,
        frontKey: `ids/${user.id}/front.webp`,
      });
      const traversal = await post(user.cookie, '/submission', {
        ...body,
        frontKey: `ids/${user.id}/../other/x-front.webp`,
      });

      expect(swapped.status).toBe(400);
      expect(madeUp.status).toBe(400);
      expect(traversal.status).toBe(400);
    });

    it('refuses a photo that never finished uploading, one too large, and one of the wrong type', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      const body = card(user.id);

      list.mockResolvedValue([stored(body.frontKey)]);
      expect((await post(user.cookie, '/submission', body)).status).toBe(400);

      list.mockResolvedValue([stored(body.frontKey), stored(body.backKey, { size: 11 * 1024 * 1024 })]);
      expect((await post(user.cookie, '/submission', body)).status).toBe(400);

      list.mockResolvedValue([stored(body.frontKey), stored(body.backKey, { mimetype: 'image/png' })]);
      expect((await post(user.cookie, '/submission', body)).status).toBe(400);
    });

    it('answers 503 while the ID bucket is not ready', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      const body = card(user.id);
      ready.mockResolvedValue(false);

      const result = await post(user.cookie, '/submission', body);

      expect(result.status).toBe(503);
      expect(result.error?.code).toBe('ID_STORAGE_UNAVAILABLE');
    });

    it('takes a submission once: a second answers 409', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      const body = card(user.id);

      const [first, second] = await Promise.all([
        post(user.cookie, '/submission', body),
        post(user.cookie, '/submission', body),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
    });

    it('refuses without the ID consent, and for an account that needs no ID', async () => {
      const user = await signedIn();
      const legacy = await signedIn();
      await makeIdVerification(user.id);

      expect((await post(user.cookie, '/submission', { ...card(user.id), idConsent: false })).status).toBe(400);
      expect((await post(legacy.cookie, '/submission', card(legacy.id))).status).toBe(409);
    });

    it('refuses a suspended account with 401', async () => {
      const user = await signedIn();
      await makeIdVerification(user.id);
      await suspend(user.id);

      expect((await post(user.cookie, '/submission', card(user.id))).status).toBe(401);
    });
  });
});
