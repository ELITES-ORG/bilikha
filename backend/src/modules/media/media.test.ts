import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { mediaUploads, offerImages } from '../../db/schema/index.js';
import type { MediaLimits, UploadTicket } from '../../contracts/media.js';
import { hashPassword } from '../../lib/password.js';
import {
  createSignedUpload,
  discardObject,
  readFirstBytes,
  storedObject,
  type StoredObject,
} from '../../lib/storage.js';
import { makeCreative, makeOffer, makeUser, PASSWORD } from '../../test/factories.js';
import { verifyReservation } from './media.service.js';

/**
 * Storage is mocked: route tests never stub `fetch`, they call the app with it
 * (plan 0053 rules). The key builders and `tusEndpoint` stay real, because what
 * is under test is which keys and buckets a ticket names.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return {
    ...actual,
    createSignedUpload: vi.fn(),
    storedObject: vi.fn(),
    readFirstBytes: vi.fn(),
    discardObject: vi.fn(),
  };
});

const signUpload = vi.mocked(createSignedUpload);
const stored = vi.mocked(storedObject);
const firstBytes = vi.mocked(readFirstBytes);
const discard = vi.mocked(discardObject);

const MB = 1_000_000;
const ID3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const original = {
  url: env.SUPABASE_URL,
  key: env.SUPABASE_SERVICE_ROLE_KEY,
  kinds: env.MEDIA_UPLOAD_KINDS,
};

type ApiReply = {
  status: number;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

describe('/api/v1/media upload pipeline', () => {
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
    env.SUPABASE_URL = 'http://storage.test';
    env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
    env.MEDIA_UPLOAD_KINDS = ['audio', 'video', 'document'];
    signUpload.mockReset().mockImplementation(async (objectKey: string, bucket?: string) => ({
      uploadUrl: `http://storage.test/upload/${bucket}/${objectKey}?token=t`,
      objectKey,
      token: 't',
    }));
    stored.mockReset().mockResolvedValue(null);
    firstBytes.mockReset().mockResolvedValue(new Uint8Array());
    discard.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    env.SUPABASE_URL = original.url;
    env.SUPABASE_SERVICE_ROLE_KEY = original.key;
    env.MEDIA_UPLOAD_KINDS = original.kinds;
  });

  async function signIn(username: string): Promise<string> {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    await response.text();
    return response.headers.get('set-cookie')!.split(';')[0]!;
  }

  /** A signed-in creative with one offer. A new account per test keeps each rate-limit count apart. */
  async function signedIn() {
    const { user, profile } = await makeCreative({ user: { passwordHash: await hashPassword(PASSWORD) } });
    const offer = await makeOffer(profile.id);
    return { user, profile, offer, cookie: await signIn(user.username) };
  }

  async function call(cookie: string | null, method: string, path: string, body?: unknown): Promise<ApiReply> {
    const response = await fetch(`${base}/media${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as Omit<ApiReply, 'status'>;
    return { status: response.status, ...json };
  }

  const ticket = (cookie: string, body: Record<string, unknown>) => call(cookie, 'POST', '/uploads', body);

  const audio = (offerId: string, overrides: Record<string, unknown> = {}) => ({
    destination: 'offer',
    offerId,
    kind: 'audio',
    mimeType: 'audio/mpeg',
    sizeBytes: 4 * MB,
    durationSeconds: 120,
    ...overrides,
  });

  const video = (offerId: string, overrides: Record<string, unknown> = {}) => ({
    destination: 'offer',
    offerId,
    kind: 'video',
    mimeType: 'video/mp4',
    sizeBytes: 40 * MB,
    durationSeconds: 90,
    ...overrides,
  });

  const image = (offerId: string, overrides: Record<string, unknown> = {}) => ({
    destination: 'offer',
    offerId,
    kind: 'image',
    mimeType: 'image/webp',
    sizeBytes: 500_000,
    thumbSizeBytes: 40_000,
    ...overrides,
  });

  async function reservationsOf(userId: string) {
    return db.select().from(mediaUploads).where(eq(mediaUploads.userId, userId));
  }

  async function insertItem(offerId: string, overrides: Partial<typeof offerImages.$inferInsert> = {}) {
    const key = `offers/x/${randomUUID()}`;
    await db.insert(offerImages).values({
      offerId,
      objectKey: `${key}.webp`,
      thumbKey: `${key}-thumb.webp`,
      ...overrides,
    });
  }

  /** A reservation written directly, for the verification tests. */
  async function reserve(
    userId: string,
    offerId: string,
    overrides: Partial<typeof mediaUploads.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(mediaUploads)
      .values({
        userId,
        destination: 'offer',
        offerId,
        kind: 'audio',
        bucket: 'media-audio',
        objectKey: `offers/x/${randomUUID()}.mp3`,
        mimeType: 'audio/mpeg',
        sizeBytes: 500_000,
        durationSeconds: 120,
        reservedBytes: 15 * MB,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ...overrides,
      })
      .returning();
    return row!;
  }

  const object = (name: string, size: number, mimetype: string): StoredObject => ({
    name,
    updatedAt: new Date().toISOString(),
    size,
    mimetype,
  });

  it('issues an image ticket with two signed PUT URLs and a reservation', async () => {
    const { user, profile, offer, cookie } = await signedIn();

    const result = await ticket(cookie, image(offer.id));

    expect(result.status).toBe(201);
    const data = result.data as Extract<UploadTicket, { kind: 'image' }>;
    expect(data.kind).toBe('image');
    expect(data.transport).toBe('put');
    expect(data.file.objectKey).toMatch(new RegExp(`^offers/${profile.id}/[0-9a-f-]{36}\\.webp$`));
    expect(data.thumb.objectKey).toBe(data.file.objectKey.replace(/\.webp$/, '-thumb.webp'));
    expect(data.file.uploadUrl).toContain('/upload/media/');
    expect(signUpload).toHaveBeenCalledWith(data.file.objectKey, 'media');
    expect(signUpload).toHaveBeenCalledWith(data.thumb.objectKey, 'media');

    const [row] = await reservationsOf(user.id);
    expect(row).toMatchObject({
      id: data.reservationId,
      offerId: offer.id,
      kind: 'image',
      bucket: 'media',
      objectKey: data.file.objectKey,
      thumbKey: data.thumb.objectKey,
      sizeBytes: 500_000,
      thumbSizeBytes: 40_000,
      reservedBytes: 4 * MB,
    });
    expect(row!.expiresAt.toISOString()).toBe(data.expiresAt);
  });

  it('issues an audio ticket with a TUS endpoint, token, bucket and key', async () => {
    const { user, profile, offer, cookie } = await signedIn();

    const result = await ticket(cookie, audio(offer.id, { mimeType: 'audio/x-m4a', durationSeconds: 125.2 }));

    expect(result.status).toBe(201);
    const data = result.data as Extract<UploadTicket, { transport: 'tus' }>;
    expect(data.transport).toBe('tus');
    expect(data.tus).toEqual({
      endpoint: 'http://storage.test/storage/v1/upload/resumable/sign',
      token: 't',
      bucket: 'media-audio',
      objectKey: expect.stringMatching(new RegExp(`^offers/${profile.id}/[0-9a-f-]{36}\\.m4a$`)),
    });
    expect(data.poster).toBeUndefined();
    expect(signUpload).toHaveBeenCalledWith(data.tus.objectKey, 'media-audio');

    const [row] = await reservationsOf(user.id);
    expect(row).toMatchObject({ mimeType: 'audio/mp4', durationSeconds: 126, reservedBytes: 15 * MB });
  });

  it('issues a video ticket with a poster URL only when a poster size is declared', async () => {
    const { profile, offer, cookie } = await signedIn();

    const withPoster = await ticket(cookie, video(offer.id, { thumbSizeBytes: 80_000 }));
    const without = await ticket(cookie, video(offer.id, { mimeType: 'video/webm' }));

    expect(withPoster.status).toBe(201);
    const posted = withPoster.data as Extract<UploadTicket, { transport: 'tus' }>;
    expect(posted.tus.bucket).toBe('media-video');
    expect(posted.tus.objectKey).toMatch(/\.mp4$/);
    expect(posted.poster?.objectKey).toMatch(new RegExp(`^offers/${profile.id}/[0-9a-f-]{36}-poster\\.webp$`));
    expect(signUpload).toHaveBeenCalledWith(posted.poster!.objectKey, 'media');

    expect(without.status).toBe(201);
    const bare = without.data as Extract<UploadTicket, { transport: 'tus' }>;
    expect(bare.tus.objectKey).toMatch(/\.webm$/);
    expect(bare.poster).toBeUndefined();
  });

  it('refuses a kind that is switched off with 403 MEDIA_KIND_DISABLED', async () => {
    const { user, offer, cookie } = await signedIn();
    env.MEDIA_UPLOAD_KINDS = [];

    const result = await ticket(cookie, audio(offer.id));

    expect(result.status).toBe(403);
    expect(result.error?.code).toBe('MEDIA_KIND_DISABLED');
    expect(result.error?.details).toEqual({ enabledKinds: ['image'] });
    expect(await reservationsOf(user.id)).toHaveLength(0);
    expect(signUpload).not.toHaveBeenCalled();
  });

  it('refuses a disallowed type with 422 MEDIA_TYPE_NOT_ALLOWED', async () => {
    const { offer, cookie } = await signedIn();

    const mov = await ticket(cookie, video(offer.id, { mimeType: 'video/quicktime' }));
    const svg = await ticket(cookie, image(offer.id, { mimeType: 'image/svg+xml' }));

    expect(mov.status).toBe(422);
    expect(mov.error?.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
    expect(mov.error?.details).toEqual({ mimeTypes: ['video/mp4', 'video/webm'] });
    expect(svg.status).toBe(422);
    expect(svg.error?.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
  });

  it('refuses an oversized file with 422 MEDIA_TOO_LARGE and the limit in details', async () => {
    const { offer, cookie } = await signedIn();

    const big = await ticket(cookie, audio(offer.id, { sizeBytes: 15 * MB + 1 }));
    const bigPoster = await ticket(cookie, video(offer.id, { thumbSizeBytes: 2 * MB + 1 }));
    const noThumb = await ticket(cookie, image(offer.id, { thumbSizeBytes: undefined }));
    const bigVideo = await ticket(cookie, video(offer.id, { sizeBytes: 300 * MB + 1 }));

    expect(big.status).toBe(422);
    expect(big.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 15 * MB } });
    expect(bigPoster.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 2 * MB } });
    expect(noThumb.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 2 * MB } });
    expect(bigVideo.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 300 * MB } });
  });

  it('refuses audio or video without a duration, or over it, with 422 MEDIA_TOO_LONG', async () => {
    const { offer, cookie } = await signedIn();

    const noDuration = await ticket(cookie, audio(offer.id, { durationSeconds: undefined }));
    const longAudio = await ticket(cookie, audio(offer.id, { durationSeconds: 600.5 }));
    const longVideo = await ticket(cookie, video(offer.id, { durationSeconds: 301 }));

    expect(noDuration.status).toBe(422);
    expect(noDuration.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 600 } });
    expect(longAudio.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 600 } });
    expect(longVideo.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 300 } });
  });

  it('counts reservations toward the per-offer limit (409 MEDIA_LIMIT_REACHED on the third video)', async () => {
    const { user, offer, cookie } = await signedIn();

    expect((await ticket(cookie, video(offer.id))).status).toBe(201);
    expect((await ticket(cookie, video(offer.id))).status).toBe(201);
    const third = await ticket(cookie, video(offer.id));

    expect(third.status).toBe(409);
    expect(third.error).toMatchObject({ code: 'MEDIA_LIMIT_REACHED', details: { perTarget: 2 } });
    expect(await reservationsOf(user.id)).toHaveLength(2);
  });

  it('does not count pending_remove items toward the limit', async () => {
    const { offer, cookie } = await signedIn();
    await insertItem(offer.id, { kind: 'video', state: 'live' });
    await insertItem(offer.id, { kind: 'video', state: 'pending_remove' });

    expect((await ticket(cookie, video(offer.id))).status).toBe(201);
    const next = await ticket(cookie, video(offer.id));

    expect(next.status).toBe(409);
    expect(next.error?.code).toBe('MEDIA_LIMIT_REACHED');
  });

  it('refuses over the quota with 409 MEDIA_QUOTA_EXCEEDED', async () => {
    const { user, profile, cookie } = await signedIn();
    const other = await makeOffer(profile.id);
    await insertItem(other.id, { kind: 'video', sizeBytes: 999_000_000 });
    const offer = await makeOffer(profile.id);

    const result = await ticket(cookie, audio(offer.id));

    expect(result.status).toBe(409);
    expect(result.error).toMatchObject({ code: 'MEDIA_QUOTA_EXCEEDED', details: { quotaBytes: 1_000 * MB } });
    expect(await reservationsOf(user.id)).toHaveLength(0);
  });

  it("answers 404 for another creative's offer, and 403 without a creative profile", async () => {
    const { cookie } = await signedIn();
    const stranger = await makeCreative();
    const theirs = await makeOffer(stranger.profile.id);
    const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const clientCookie = await signIn(client.username);

    const foreign = await ticket(cookie, audio(theirs.id));
    const noProfile = await ticket(clientCookie, audio(theirs.id));

    expect(foreign.status).toBe(404);
    expect(foreign.error?.message).toBe('No such offer.');
    expect(noProfile.status).toBe(403);
    expect(noProfile.error?.message).toBe('A creative profile is required to manage offers');
  });

  it("clears the caller's expired reservations when issuing a ticket, and discards their objects", async () => {
    const { user, offer, cookie } = await signedIn();
    const stale = await reserve(user.id, offer.id, {
      kind: 'video',
      bucket: 'media-video',
      objectKey: `offers/x/${randomUUID()}.mp4`,
      thumbKey: `offers/x/${randomUUID()}-poster.webp`,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await ticket(cookie, audio(offer.id));

    expect(result.status).toBe(201);
    const rows = await reservationsOf(user.id);
    expect(rows.map((row) => row.id)).not.toContain(stale.id);
    expect(rows).toHaveLength(1);
    expect(discard).toHaveBeenCalledWith(stale.objectKey, 'media-video');
    expect(discard).toHaveBeenCalledWith(stale.thumbKey, 'media');
  });

  it("abandons a reservation: deletes the row and discards its objects; 404 for someone else's", async () => {
    const { user, offer, cookie } = await signedIn();
    const issued = (await ticket(cookie, video(offer.id, { thumbSizeBytes: 80_000 }))).data as Extract<
      UploadTicket,
      { transport: 'tus' }
    >;
    const other = await signedIn();

    const foreign = await call(other.cookie, 'DELETE', `/uploads/${issued.reservationId}`);
    expect(foreign.status).toBe(404);
    expect(foreign.error?.message).toBe('No such upload.');
    expect(await reservationsOf(user.id)).toHaveLength(1);

    const result = await call(cookie, 'DELETE', `/uploads/${issued.reservationId}`);

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ ok: true });
    expect(await reservationsOf(user.id)).toHaveLength(0);
    expect(discard).toHaveBeenCalledWith(issued.tus.objectKey, 'media-video');
    expect(discard).toHaveBeenCalledWith(issued.poster!.objectKey, 'media');
  });

  it('serves the limits publicly with images enabled and the rest following the switch', async () => {
    env.MEDIA_UPLOAD_KINDS = ['audio'];

    const result = await call(null, 'GET', '/limits');

    expect(result.status).toBe(200);
    const limits = result.data as MediaLimits;
    expect(limits.quotaBytes).toBe(1_000 * MB);
    const offer = limits.destinations.offer;
    expect(offer.image).toMatchObject({ enabled: true, maxBytes: 2 * MB, maxPickedBytes: 20 * MB, perTarget: 10 });
    expect(offer.audio).toMatchObject({ enabled: true, maxBytes: 15 * MB, maxDurationSeconds: 600, transport: 'tus' });
    expect(offer.video).toMatchObject({ enabled: false, maxBytes: 300 * MB, maxDurationSeconds: 300, perTarget: 2 });
    expect(offer.document).toMatchObject({ enabled: false, mimeTypes: ['application/pdf'], perTarget: 3 });
  });

  it('reports usage: recorded sizes plus unexpired reservations', async () => {
    const { user, offer, cookie } = await signedIn();
    await insertItem(offer.id, { kind: 'audio', sizeBytes: 3 * MB });
    await insertItem(offer.id);
    await reserve(user.id, offer.id);
    await reserve(user.id, offer.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await call(cookie, 'GET', '/usage');
    const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const none = await call(await signIn(client.username), 'GET', '/usage');

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ usedBytes: 3 * MB, reservedBytes: 15 * MB, quotaBytes: 1_000 * MB });
    expect(none.data).toEqual({ usedBytes: 0, reservedBytes: 0, quotaBytes: 1_000 * MB });
  });

  it('limits tickets to 30 an hour (the 31st answers 429)', async () => {
    const { cookie } = await signedIn();

    for (let index = 0; index < 30; index += 1) {
      const result = await ticket(cookie, {});
      expect(result.status, `ticket ${index + 1}`).toBe(400);
    }
    const last = await ticket(cookie, {});

    expect(last.status).toBe(429);
    expect(last.error?.code).toBe('RATE_LIMITED');
  });

  describe('verifyReservation', () => {
    it('verifies a stored upload and returns its facts without deleting the reservation', async () => {
      const { user, offer } = await signedIn();
      const row = await reserve(user.id, offer.id, {
        kind: 'video',
        bucket: 'media-video',
        objectKey: `offers/x/${randomUUID()}.mp4`,
        thumbKey: `offers/x/${randomUUID()}-poster.webp`,
        mimeType: 'video/mp4',
        sizeBytes: 1_000_000,
        thumbSizeBytes: 50_000,
        durationSeconds: 61,
      });
      stored.mockImplementation(async (bucket, key) =>
        bucket === 'media-video' && key === row.objectKey
          ? object(key, 1_000_000, 'video/mp4')
          : bucket === 'media' && key === row.thumbKey
            ? object(key, 50_000, 'image/webp')
            : null,
      );
      firstBytes.mockImplementation(async (bucket) => (bucket === 'media-video' ? MP4 : WEBP));

      const verified = await verifyReservation(user.id, row.id);

      expect(verified).toEqual({
        reservationId: row.id,
        destination: 'offer',
        offerId: offer.id,
        kind: 'video',
        bucket: 'media-video',
        objectKey: row.objectKey,
        thumbKey: row.thumbKey,
        mimeType: 'video/mp4',
        sizeBytes: 1_050_000,
        durationSeconds: 61,
      });
      expect(await reservationsOf(user.id)).toHaveLength(1);
      expect(discard).not.toHaveBeenCalled();
    });

    it('fails verification when the object is missing, deleting the reservation and objects', async () => {
      const { user, offer } = await signedIn();
      const row = await reserve(user.id, offer.id, {
        kind: 'video',
        bucket: 'media-video',
        objectKey: `offers/x/${randomUUID()}.mp4`,
        thumbKey: `offers/x/${randomUUID()}-poster.webp`,
        mimeType: 'video/mp4',
      });

      await expect(verifyReservation(user.id, row.id)).rejects.toMatchObject({
        status: 422,
        code: 'MEDIA_VERIFICATION_FAILED',
        details: { reason: 'missing' },
      });
      expect(await reservationsOf(user.id)).toHaveLength(0);
      expect(discard).toHaveBeenCalledWith(row.objectKey, 'media-video');
      expect(discard).toHaveBeenCalledWith(row.thumbKey, 'media');
    });

    it('fails verification when the stored size differs from the declared size', async () => {
      const { user, offer } = await signedIn();
      const row = await reserve(user.id, offer.id);
      stored.mockResolvedValue(object(row.objectKey, 499_999, 'audio/mpeg'));
      firstBytes.mockResolvedValue(ID3);

      await expect(verifyReservation(user.id, row.id)).rejects.toMatchObject({
        status: 422,
        details: { reason: 'size' },
      });
      expect(await reservationsOf(user.id)).toHaveLength(0);
      expect(discard).toHaveBeenCalledWith(row.objectKey, 'media-audio');
    });

    it('fails verification when the stored type differs, or the signature does not match', async () => {
      const { user, offer } = await signedIn();
      const relabelled = await reserve(user.id, offer.id);
      const forged = await reserve(user.id, offer.id);
      stored.mockImplementation(async (_bucket, key) =>
        object(key, 500_000, key === relabelled.objectKey ? 'audio/ogg' : 'audio/mpeg'),
      );
      firstBytes.mockResolvedValue(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]));

      await expect(verifyReservation(user.id, relabelled.id)).rejects.toMatchObject({
        status: 422,
        details: { reason: 'type' },
      });
      await expect(verifyReservation(user.id, forged.id)).rejects.toMatchObject({
        status: 422,
        details: { reason: 'signature' },
      });
      expect(await reservationsOf(user.id)).toHaveLength(0);
    });

    it('accepts a JPEG fallback stored under a .webp image key', async () => {
      const { user, offer } = await signedIn();
      const key = `offers/x/${randomUUID()}`;
      const row = await reserve(user.id, offer.id, {
        kind: 'image',
        bucket: 'media',
        objectKey: `${key}.webp`,
        thumbKey: `${key}-thumb.webp`,
        mimeType: 'image/jpeg',
        sizeBytes: 600_000,
        thumbSizeBytes: 60_000,
        durationSeconds: null,
        reservedBytes: 4 * MB,
      });
      stored.mockImplementation(async (_bucket, name) =>
        object(name, name.endsWith('-thumb.webp') ? 55_000 : 590_000, 'image/jpeg'),
      );
      firstBytes.mockResolvedValue(JPEG);

      const verified = await verifyReservation(user.id, row.id);

      expect(verified).toMatchObject({ kind: 'image', mimeType: 'image/jpeg', sizeBytes: 645_000 });
    });

    it('answers 410 MEDIA_UPLOAD_EXPIRED for an expired or unknown reservation', async () => {
      const { user, offer } = await signedIn();
      const lapsed = await reserve(user.id, offer.id, { expiresAt: new Date(Date.now() - 1000) });
      const other = await signedIn();
      const theirs = await reserve(other.user.id, other.offer.id);

      await expect(verifyReservation(user.id, lapsed.id)).rejects.toMatchObject({
        status: 410,
        code: 'MEDIA_UPLOAD_EXPIRED',
      });
      await expect(verifyReservation(user.id, randomUUID())).rejects.toMatchObject({ status: 410 });
      await expect(verifyReservation(user.id, theirs.id)).rejects.toMatchObject({ status: 410 });
      expect(await reservationsOf(user.id)).toHaveLength(0);
      expect(discard).toHaveBeenCalledWith(lapsed.objectKey, 'media-audio');
      expect(await reservationsOf(other.user.id)).toHaveLength(1);
      expect(stored).not.toHaveBeenCalled();
    });
  });
});
