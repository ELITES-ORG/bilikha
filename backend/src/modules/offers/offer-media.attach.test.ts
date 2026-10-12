import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { mediaUploads, offerImages, offers } from '../../db/schema/index.js';
import { createSignedUpload, discardObject, readFirstBytes, storedObject } from '../../lib/storage.js';
import { makeCreative, makeOffer } from '../../test/factories.js';
import { issueUploadTicket, type UploadTicketInput } from '../media/media.service.js';
import { addOfferImage, attachOfferMedia } from './offers.service.js';

/**
 * Storage is mocked: what it holds is exactly what each ticket allowed, so
 * every reservation verifies. The key builders stay real.
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
const POSTER_BYTES = 40_000;
const SIGNATURES: Record<string, Uint8Array> = {
  'media-audio': new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]),
  'media-video': new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  'media-documents': new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  media: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
};
const STORED_TYPES: Record<string, string> = {
  'media-audio': 'audio/mpeg',
  'media-video': 'video/mp4',
  'media-documents': 'application/pdf',
  media: 'image/webp',
};

const original = {
  url: env.SUPABASE_URL,
  key: env.SUPABASE_SERVICE_ROLE_KEY,
  kinds: env.MEDIA_UPLOAD_KINDS,
};

/** Main-file sizes by bucket, set by each ticket so storage reports the size it was given. */
let sizes: Record<string, number> = {};

beforeEach(() => {
  env.SUPABASE_URL = 'http://storage.test';
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
  env.MEDIA_UPLOAD_KINDS = ['audio', 'video', 'document'];
  sizes = {};
  signUpload.mockReset().mockImplementation(async (objectKey: string, bucket?: string) => ({
    uploadUrl: `http://storage.test/upload/${bucket}/${objectKey}?token=t`,
    objectKey,
    token: 't',
  }));
  stored.mockReset().mockImplementation(async (bucket: string, objectKey: string) => ({
    name: objectKey,
    updatedAt: null,
    size: bucket === 'media' ? POSTER_BYTES : (sizes[bucket] ?? null),
    mimetype: STORED_TYPES[bucket] ?? null,
  }));
  firstBytes.mockReset().mockImplementation(async (bucket: string) => SIGNATURES[bucket] ?? new Uint8Array());
  discard.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  env.SUPABASE_URL = original.url;
  env.SUPABASE_SERVICE_ROLE_KEY = original.key;
  env.MEDIA_UPLOAD_KINDS = original.kinds;
});

const BUCKET = { audio: 'media-audio', video: 'media-video', document: 'media-documents' } as const;

const UPLOADS = {
  audio: { kind: 'audio', mimeType: 'audio/mpeg', sizeBytes: 4 * MB, durationSeconds: 120 },
  video: { kind: 'video', mimeType: 'video/mp4', sizeBytes: 40 * MB, durationSeconds: 90, thumbSizeBytes: POSTER_BYTES },
  document: { kind: 'document', mimeType: 'application/pdf', sizeBytes: 2 * MB },
} as const;

async function reserve(userId: string, offerId: string, kind: keyof typeof UPLOADS) {
  const input = { destination: 'offer', offerId, ...UPLOADS[kind] } as UploadTicketInput;
  sizes[BUCKET[kind]] = input.sizeBytes;
  return (await issueUploadTicket(userId, input)).reservationId;
}

const offerRow = async (offerId: string) => (await db.select().from(offers).where(eq(offers.id, offerId)))[0]!;
const mediaRow = async (id: string) => (await db.select().from(offerImages).where(eq(offerImages.id, id)))[0]!;

describe('attaching a verified upload to an offer', () => {
  it('attaching to an offer under review adds a live item', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { status: 'pending_review', reviewedAt: null });
    const reservationId = await reserve(user.id, offer.id, 'audio');

    const attached = await attachOfferMedia(user.id, offer.id, { reservationId, title: 'Demo song' });

    expect(attached.kind).toBe('audio');
    expect(await mediaRow(attached.id)).toMatchObject({
      offerId: offer.id,
      kind: 'audio',
      state: 'live',
      title: 'Demo song',
      mimeType: 'audio/mpeg',
      sizeBytes: 4 * MB,
      durationSeconds: 120,
      thumbKey: null,
    });
    expect(await db.select().from(mediaUploads).where(eq(mediaUploads.id, reservationId))).toEqual([]);
    expect((await offerRow(offer.id)).status).toBe('pending_review');
  });

  it("attaching to a published offer adds a pending_add item and clears the last change's rejection reason", async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { revisionRejectionReason: 'The last photo was blurry.' });
    const reservationId = await reserve(user.id, offer.id, 'video');

    const attached = await attachOfferMedia(user.id, offer.id, { reservationId });

    const row = await mediaRow(attached.id);
    expect(row).toMatchObject({ kind: 'video', state: 'pending_add', title: null, sizeBytes: 40 * MB + POSTER_BYTES });
    expect(row.thumbKey).toMatch(new RegExp(`^offers/${profile.id}/`));
    expect(await offerRow(offer.id)).toMatchObject({ status: 'published', revisionRejectionReason: null });
  });

  it('attaching to a rejected offer sends it back to review', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { status: 'rejected', rejectionReason: 'No contact details, please.' });
    const reservationId = await reserve(user.id, offer.id, 'document');

    const attached = await attachOfferMedia(user.id, offer.id, { reservationId });

    expect((await mediaRow(attached.id)).state).toBe('live');
    expect(await offerRow(offer.id)).toMatchObject({ status: 'pending_review', rejectionReason: null });
  });

  it("refuses another user's reservation (410) and a reservation for a different offer (409)", async () => {
    const owner = await makeCreative();
    const offer = await makeOffer(owner.profile.id);
    const otherOffer = await makeOffer(owner.profile.id);
    const stranger = await makeCreative();
    const strangersOffer = await makeOffer(stranger.profile.id);

    const strangersReservation = await reserve(stranger.user.id, strangersOffer.id, 'audio');
    await expect(
      attachOfferMedia(owner.user.id, offer.id, { reservationId: strangersReservation }),
    ).rejects.toMatchObject({ status: 410, code: 'MEDIA_UPLOAD_EXPIRED' });

    const forOtherOffer = await reserve(owner.user.id, otherOffer.id, 'audio');
    await expect(
      attachOfferMedia(owner.user.id, offer.id, { reservationId: forOtherOffer }),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT', message: 'That upload belongs to a different offer.' });

    await expect(
      attachOfferMedia(stranger.user.id, offer.id, { reservationId: strangersReservation }),
    ).rejects.toMatchObject({ status: 404 });

    expect(await db.select().from(offerImages)).toEqual([]);
  });

  it('refuses when the offer filled up between ticket and attach (409 MEDIA_LIMIT_REACHED)', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { status: 'pending_review', reviewedAt: null });
    const insertAudio = (n: number) =>
      db.insert(offerImages).values({
        offerId: offer.id,
        kind: 'audio',
        objectKey: `offers/${profile.id}/song-${n}.mp3`,
        mimeType: 'audio/mpeg',
        sizeBytes: 1_000,
        sortOrder: n,
      });
    for (let n = 0; n < 4; n += 1) await insertAudio(n);
    const reservationId = await reserve(user.id, offer.id, 'audio');

    await insertAudio(4);

    await expect(attachOfferMedia(user.id, offer.id, { reservationId })).rejects.toMatchObject({
      status: 409,
      code: 'MEDIA_LIMIT_REACHED',
      details: { perTarget: 5 },
    });
    expect(await db.select().from(offerImages).where(eq(offerImages.offerId, offer.id))).toHaveLength(5);
  });

  it('the legacy image route now allows 10 images and refuses the 11th', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { status: 'pending_review', reviewedAt: null });
    const keys = (n: number) => ({
      objectKey: `offers/${profile.id}/img-${n}.webp`,
      thumbKey: `offers/${profile.id}/img-${n}-thumb.webp`,
    });

    for (let n = 0; n < 10; n += 1) await addOfferImage(user.id, offer.id, keys(n));

    await expect(addOfferImage(user.id, offer.id, keys(10))).rejects.toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'An offer can have at most 10 images',
    });
  });
});
