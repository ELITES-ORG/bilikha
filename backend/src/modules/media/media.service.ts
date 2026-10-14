import { and, count, eq, gt, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { MediaKind, MediaUsage, UploadDestination, UploadTicket } from '../../contracts/media.js';
import { db } from '../../db/index.js';
import { creativeProfiles, mediaUploads, offerImages, offers, users } from '../../db/schema/index.js';
import type { MediaUpload } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import {
  assertSafeObjectKey,
  avatarKey,
  createSignedUpload,
  deleteObject,
  discardObject,
  offerKey,
  offerMediaKey,
  offerPosterKey,
  messageKey,
  messageMediaKey,
  messagePosterKey,
  readFirstBytes,
  storedObject,
  tusEndpoint,
} from '../../lib/storage.js';
import {
  FILES_PER_MESSAGE,
  QUOTA_BYTES,
  RESERVATION_MS,
  UPLOAD_LIMITS,
  bucketFor,
  enabledKinds,
  isKindEnabled,
  normaliseMimeType,
} from './media.limits.js';
import { matchesSignature } from './media.sniff.js';
import { assertCanMessage, requireParticipant } from '../conversations/conversations.service.js';

export const uploadUrlBodySchema = z.object({
  kind: z.enum(['avatar', 'offer']),
});

export const setAvatarBodySchema = z.object({
  objectKey: z.string().min(1).max(512),
});

export type UploadUrlBody = z.infer<typeof uploadUrlBodySchema>;

async function requireOwnCreativeProfile(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id, status: creativeProfiles.status })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    throw AppError.forbidden('A creative profile is required to upload offer images');
  }

  return profile;
}

function assertOwnAvatarKey(userId: string, objectKey: string) {
  // Must run before the prefix test — see assertSafeObjectKey.
  assertSafeObjectKey(objectKey);
  const expectedPrefix = `avatars/${userId}/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw AppError.forbidden('That image does not belong to your account');
  }
}

export function assertOwnOfferKey(profileId: string, objectKey: string) {
  // Must run before the prefix test — see assertSafeObjectKey.
  assertSafeObjectKey(objectKey);
  const expectedPrefix = `offers/${profileId}/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw AppError.forbidden('That image does not belong to your profile');
  }
}

export async function issueUploadUrl(userId: string, input: UploadUrlBody) {
  if (input.kind === 'avatar') {
    const objectKey = avatarKey(userId);
    const ticket = await createSignedUpload(objectKey);
    return { kind: 'avatar' as const, uploadUrl: ticket.uploadUrl, objectKey: ticket.objectKey };
  }

  const profile = await requireOwnCreativeProfile(userId);
  const base = offerKey(profile.id);
  const fullKey = `${base}.webp`;
  const thumbKey = `${base}-thumb.webp`;

  const [full, thumb] = await Promise.all([
    createSignedUpload(fullKey),
    createSignedUpload(thumbKey),
  ]);

  return {
    kind: 'offer' as const,
    full: { uploadUrl: full.uploadUrl, objectKey: full.objectKey },
    thumb: { uploadUrl: thumb.uploadUrl, objectKey: thumb.objectKey },
  };
}

/**
 * A new photo waits for review (ADR 0058). It goes into the pending slot, seen
 * only by its owner; the approved photo, if there is one, stays public until an
 * administrator approves the new one — and stays if they reject it. Uploading
 * again replaces the pending photo, and clears the reason the last one was
 * declined.
 */
export async function setAvatar(userId: string, objectKey: string) {
  assertOwnAvatarKey(userId, objectKey);

  const [current] = await db
    .select({ pendingKey: users.avatarPendingKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current) throw AppError.unauthorized();

  await db
    .update(users)
    .set({ avatarPendingKey: objectKey, avatarRejectionReason: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  if (current.pendingKey && current.pendingKey !== objectKey) {
    await discardObject(current.pendingKey);
  }

  return { objectKey };
}

/**
 * Removing. A photo waiting for review is withdrawn; with none waiting, the
 * approved photo is taken down. Taking a photo away needs no review.
 */
export async function clearAvatar(userId: string) {
  const [current] = await db
    .select({ key: users.avatarKey, pendingKey: users.avatarPendingKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current) throw AppError.unauthorized();

  const removing = current.pendingKey ?? current.key;
  await db
    .update(users)
    .set(
      current.pendingKey
        ? { avatarPendingKey: null, updatedAt: new Date() }
        : { avatarKey: null, avatarReviewedAt: null, updatedAt: new Date() },
    )
    .where(eq(users.id, userId));

  if (removing) await discardObject(removing);

  return { ok: true as const, removed: current.pendingKey ? ('pending' as const) : ('approved' as const) };
}

/** Deletes an uploaded object that never got attached to an avatar or offer. */
export async function abandonObject(userId: string, objectKey: string) {
  assertSafeObjectKey(objectKey);

  if (objectKey.startsWith(`avatars/${userId}/`)) {
    assertOwnAvatarKey(userId, objectKey);
    await deleteObject(objectKey);
    return { ok: true as const };
  }

  const profile = await requireOwnCreativeProfile(userId);
  assertOwnOfferKey(profile.id, objectKey);
  await deleteObject(objectKey);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// The upload pipeline (ADR 0046): a ticket reserves room for one upload, the
// browser sends the file straight to storage, and the stored object is checked
// before anything records it.
// ---------------------------------------------------------------------------

const ticketFileFields = {
  kind: z.enum(['image', 'audio', 'video', 'document']),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  thumbSizeBytes: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
};

export const uploadTicketBodySchema = z.discriminatedUnion('destination', [
  z.object({ destination: z.literal('offer'), offerId: z.string().uuid(), ...ticketFileFields }),
  z.object({ destination: z.literal('message'), conversationId: z.string().uuid(), ...ticketFileFields }),
]);

export type UploadTicketInput = z.infer<typeof uploadTicketBodySchema>;

/** What the uploader is told. Each code's `details` carries the limit it hit. */
const MEDIA_MESSAGES = {
  MEDIA_KIND_DISABLED: "This kind of file can't be uploaded yet.",
  MEDIA_TYPE_NOT_ALLOWED: "This file type isn't allowed.",
  MEDIA_TOO_LARGE: 'This file is too large.',
  MEDIA_TOO_LONG: 'This recording is too long.',
  MEDIA_LIMIT_REACHED: 'This offer already has as many of these as it can hold.',
  MEDIA_MESSAGE_FULL: `A message can carry at most ${FILES_PER_MESSAGE} files.`,
  MEDIA_QUOTA_EXCEEDED: 'Your storage is full. Remove something first.',
  MEDIA_UPLOAD_EXPIRED: 'This upload expired. Start it again.',
  MEDIA_VERIFICATION_FAILED: "This file didn't upload correctly. Try again.",
} as const;

type MediaCode = keyof typeof MEDIA_MESSAGES;

function throwMedia(status: number, code: MediaCode, message: string, details: unknown): AppError {
  return new AppError(status, code, message, details);
}

export const mediaError = (status: number, code: MediaCode, details: unknown) =>
  throwMedia(status, code, MEDIA_MESSAGES[code], details);

const expired = () =>
  mediaError(410, 'MEDIA_UPLOAD_EXPIRED', { expiresAfterSeconds: RESERVATION_MS / 1000 });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The image bucket, where every thumbnail and poster lives. */
const imageBucket = (destination: UploadDestination) => bucketFor('image', destination);

/** Best-effort: anything missed is found by `media:prune`. */
async function discardReservedObjects(row: Pick<MediaUpload, 'destination' | 'bucket' | 'objectKey' | 'thumbKey'>) {
  await discardObject(row.objectKey, row.bucket);
  if (row.thumbKey) await discardObject(row.thumbKey, imageBucket(row.destination));
}

async function creativeProfileOf(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

/** Bytes recorded on a creative's offers. Images from before ADR 0046 have no size and count as none. */
async function recordedBytes(executor: Tx | typeof db, profileId: string): Promise<number> {
  const [row] = await executor
    .select({ total: sql<string>`coalesce(sum(${offerImages.sizeBytes}), 0)` })
    .from(offerImages)
    .innerJoin(offers, eq(offers.id, offerImages.offerId))
    .where(eq(offers.profileId, profileId));
  return Number(row?.total ?? 0);
}

/**
 * Bytes held by a user's offer reservations that have not expired. A message's
 * files count toward no quota (ADR 0060).
 */
async function reservedBytesOf(executor: Tx | typeof db, userId: string, now: Date): Promise<number> {
  const [row] = await executor
    .select({ total: sql<string>`coalesce(sum(${mediaUploads.reservedBytes}), 0)` })
    .from(mediaUploads)
    .where(
      and(
        eq(mediaUploads.userId, userId),
        eq(mediaUploads.destination, 'offer'),
        gt(mediaUploads.expiresAt, now),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * The declared file against its destination's limits, the first failure
 * answering: switched on, an allowed type, small enough, short enough.
 */
function checkDeclaredFile(input: UploadTicketInput) {
  const { kind, destination } = input;
  if (!isKindEnabled(kind, destination)) {
    throw mediaError(403, 'MEDIA_KIND_DISABLED', { enabledKinds: enabledKinds(destination) });
  }

  const limit = UPLOAD_LIMITS[destination][kind];
  const mimeType = normaliseMimeType(input.mimeType);
  if (!limit.mimeTypes.includes(mimeType)) {
    throw mediaError(422, 'MEDIA_TYPE_NOT_ALLOWED', { mimeTypes: [...limit.mimeTypes] });
  }

  if (input.sizeBytes > limit.maxBytes) {
    throw mediaError(422, 'MEDIA_TOO_LARGE', { maxBytes: limit.maxBytes });
  }
  if (kind === 'image' && (input.thumbSizeBytes === undefined || input.thumbSizeBytes > limit.maxBytes)) {
    throw mediaError(422, 'MEDIA_TOO_LARGE', { maxBytes: limit.maxBytes });
  }
  const posterLimit = UPLOAD_LIMITS[destination].image.maxBytes;
  if (kind === 'video' && input.thumbSizeBytes !== undefined && input.thumbSizeBytes > posterLimit) {
    throw mediaError(422, 'MEDIA_TOO_LARGE', { maxBytes: posterLimit });
  }

  const timed = kind === 'audio' || kind === 'video';
  if (timed && (input.durationSeconds === undefined || input.durationSeconds > (limit.maxDurationSeconds ?? 0))) {
    throw mediaError(422, 'MEDIA_TOO_LONG', { maxDurationSeconds: limit.maxDurationSeconds });
  }

  return { limit, mimeType, timed };
}

/**
 * Who the upload is for, checked before any limit: the caller's own offer, or
 * a conversation they are in, where the other person has not blocked them
 * (ADR 0060). Returns how to name the keys, what to lock on, and how the target
 * is recorded on the reservation.
 */
async function resolveTarget(userId: string, input: UploadTicketInput) {
  if (input.destination === 'offer') {
    const profile = await creativeProfileOf(userId);
    if (!profile) throw AppError.forbidden('A creative profile is required to manage offers');

    const [offer] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.id, input.offerId), eq(offers.profileId, profile.id)))
      .limit(1);
    if (!offer) throw AppError.notFound('No such offer.');

    return {
      lockKey: profile.id,
      profileId: profile.id,
      record: { offerId: offer.id, conversationId: null },
      keys: {
        image: () => offerKey(profile.id),
        media: (ext: string) => offerMediaKey(profile.id, ext),
        poster: () => offerPosterKey(profile.id),
      },
    };
  }

  const conversation = await requireParticipant(input.conversationId, userId);
  const otherUserId =
    conversation.clientUserId === userId ? conversation.creativeUserId : conversation.clientUserId;
  await assertCanMessage(userId, otherUserId);

  return {
    lockKey: `${conversation.id}:${userId}`,
    profileId: null,
    record: { offerId: null, conversationId: conversation.id },
    keys: {
      image: () => messageKey(conversation.id),
      media: (ext: string) => messageMediaKey(conversation.id, ext),
      poster: () => messagePosterKey(conversation.id),
    },
  };
}

/**
 * Issues a ticket for one upload to an offer or a message. The limits are
 * checked in a fixed order, the first failure answering; the reservation is
 * then written under a lock on the target, so two tickets at once cannot both
 * take the last place or the last of the quota.
 */
export async function issueUploadTicket(userId: string, input: UploadTicketInput): Promise<UploadTicket> {
  const target = await resolveTarget(userId, input);
  const { limit, mimeType, timed } = checkDeclaredFile(input);
  const { kind, destination } = input;

  const bucket = bucketFor(kind, destination);
  let objectKey: string;
  let thumbKey: string | null = null;
  if (kind === 'image') {
    const base = target.keys.image();
    objectKey = `${base}.webp`;
    thumbKey = `${base}-thumb.webp`;
  } else {
    objectKey = target.keys.media(limit.extensions[mimeType]!);
    if (kind === 'video' && input.thumbSizeBytes !== undefined) thumbKey = target.keys.poster();
  }

  const now = new Date();
  const { reservation, cleared } = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${target.lockKey}))`);

    const cleared = await tx
      .delete(mediaUploads)
      .where(and(eq(mediaUploads.userId, userId), lte(mediaUploads.expiresAt, now)))
      .returning({
        destination: mediaUploads.destination,
        bucket: mediaUploads.bucket,
        objectKey: mediaUploads.objectKey,
        thumbKey: mediaUploads.thumbKey,
      });

    if (target.record.offerId) {
      const offerId = target.record.offerId;
      const [recorded] = await tx
        .select({ total: count() })
        .from(offerImages)
        .where(
          and(
            eq(offerImages.offerId, offerId),
            eq(offerImages.kind, kind),
            ne(offerImages.state, 'pending_remove'),
          ),
        );
      const [held] = await tx
        .select({ total: count() })
        .from(mediaUploads)
        .where(
          and(eq(mediaUploads.offerId, offerId), eq(mediaUploads.kind, kind), gt(mediaUploads.expiresAt, now)),
        );
      if ((recorded?.total ?? 0) + (held?.total ?? 0) >= limit.perTarget) {
        throw mediaError(409, 'MEDIA_LIMIT_REACHED', { perTarget: limit.perTarget });
      }

      const used = (await recordedBytes(tx, target.profileId!)) + (await reservedBytesOf(tx, userId, now));
      if (used + limit.reservedBytes > QUOTA_BYTES) {
        throw mediaError(409, 'MEDIA_QUOTA_EXCEEDED', { quotaBytes: QUOTA_BYTES });
      }
    } else {
      // A message's files are held until it is sent: at most five, any mix.
      const [held] = await tx
        .select({ total: count() })
        .from(mediaUploads)
        .where(
          and(
            eq(mediaUploads.conversationId, target.record.conversationId!),
            eq(mediaUploads.userId, userId),
            gt(mediaUploads.expiresAt, now),
          ),
        );
      if ((held?.total ?? 0) >= FILES_PER_MESSAGE) {
        throw mediaError(409, 'MEDIA_MESSAGE_FULL', { filesPerMessage: FILES_PER_MESSAGE });
      }
    }

    const [reservation] = await tx
      .insert(mediaUploads)
      .values({
        userId,
        destination,
        ...target.record,
        kind,
        bucket,
        objectKey,
        thumbKey,
        mimeType,
        sizeBytes: input.sizeBytes,
        thumbSizeBytes: thumbKey ? (input.thumbSizeBytes ?? null) : null,
        durationSeconds: timed ? Math.ceil(input.durationSeconds!) : null,
        reservedBytes: limit.reservedBytes,
        expiresAt: new Date(now.getTime() + RESERVATION_MS),
      })
      .returning();
    return { reservation: reservation!, cleared };
  });

  for (const row of cleared) await discardReservedObjects(row);

  try {
    const head = {
      reservationId: reservation.id,
      expiresAt: reservation.expiresAt.toISOString(),
    };
    if (kind === 'image') {
      const [file, thumb] = await Promise.all([
        createSignedUpload(objectKey, bucket),
        createSignedUpload(thumbKey!, imageBucket(destination)),
      ]);
      return {
        ...head,
        kind,
        transport: 'put',
        file: { uploadUrl: file.uploadUrl, objectKey: file.objectKey },
        thumb: { uploadUrl: thumb.uploadUrl, objectKey: thumb.objectKey },
      };
    }

    const signed = await createSignedUpload(objectKey, bucket);
    const poster = thumbKey ? await createSignedUpload(thumbKey, imageBucket(destination)) : null;
    return {
      ...head,
      kind,
      transport: 'tus',
      tus: { endpoint: tusEndpoint(), token: signed.token, bucket, objectKey },
      ...(poster ? { poster: { uploadUrl: poster.uploadUrl, objectKey: poster.objectKey } } : {}),
    };
  } catch (error) {
    // A ticket the browser never received must not hold a place for a day.
    await db.delete(mediaUploads).where(eq(mediaUploads.id, reservation.id));
    throw error;
  }
}

/** Cancels an upload: the reservation goes, and anything already stored with it. */
export async function abandonUploadTicket(userId: string, reservationId: string) {
  const [row] = await db
    .delete(mediaUploads)
    .where(and(eq(mediaUploads.id, reservationId), eq(mediaUploads.userId, userId)))
    .returning();
  if (!row) throw AppError.notFound('No such upload.');

  await discardReservedObjects(row);
  return { ok: true as const };
}

export interface VerifiedUpload {
  reservationId: string;
  destination: UploadDestination;
  offerId: string | null;
  conversationId: string | null;
  kind: MediaKind;
  bucket: string;
  objectKey: string;
  thumbKey: string | null;
  mimeType: string;
  /** The main file plus its thumbnail or poster, as stored. */
  sizeBytes: number;
  durationSeconds: number | null;
}

type VerificationFailure = 'missing' | 'size' | 'type' | 'signature';

/**
 * Checks what storage holds against what the ticket allowed, before anything
 * records it: size, type and file signature, for the file and for its
 * thumbnail or poster. Runs outside any caller's transaction, because a
 * failure deletes the reservation and its objects, and that must stick. The
 * reservation itself is left for the caller to consume with what it records.
 */
export async function verifyReservation(userId: string, reservationId: string): Promise<VerifiedUpload> {
  const [row] = await db
    .select()
    .from(mediaUploads)
    .where(and(eq(mediaUploads.id, reservationId), eq(mediaUploads.userId, userId)))
    .limit(1);
  if (!row) throw expired();

  const fail = async (reason: VerificationFailure) => {
    await db.delete(mediaUploads).where(eq(mediaUploads.id, row.id));
    await discardReservedObjects(row);
    return mediaError(422, 'MEDIA_VERIFICATION_FAILED', { reason });
  };

  if (row.expiresAt <= new Date()) {
    await db.delete(mediaUploads).where(eq(mediaUploads.id, row.id));
    await discardReservedObjects(row);
    throw expired();
  }

  const limits = UPLOAD_LIMITS[row.destination];
  const imageTypes = limits.image.mimeTypes;

  const main = await storedObject(row.bucket, row.objectKey);
  if (!main) throw await fail('missing');
  const mainType = normaliseMimeType(main.mimetype ?? '');
  if (row.kind === 'image') {
    if (main.size === null || main.size > limits.image.maxBytes) throw await fail('size');
    if (!imageTypes.includes(mainType)) throw await fail('type');
  } else {
    if (main.size !== row.sizeBytes) throw await fail('size');
    if (mainType !== row.mimeType) throw await fail('type');
  }
  if (!matchesSignature(mainType, await readFirstBytes(row.bucket, row.objectKey))) {
    throw await fail('signature');
  }

  let thumbSize = 0;
  if (row.thumbKey) {
    const bucket = imageBucket(row.destination);
    const thumb = await storedObject(bucket, row.thumbKey);
    if (!thumb) throw await fail('missing');
    if (thumb.size === null || thumb.size > limits.image.maxBytes) throw await fail('size');
    const thumbType = normaliseMimeType(thumb.mimetype ?? '');
    if (!imageTypes.includes(thumbType)) throw await fail('type');
    if (!matchesSignature(thumbType, await readFirstBytes(bucket, row.thumbKey))) {
      throw await fail('signature');
    }
    thumbSize = thumb.size;
  }

  return {
    reservationId: row.id,
    destination: row.destination,
    offerId: row.offerId,
    conversationId: row.conversationId,
    kind: row.kind,
    bucket: row.bucket,
    objectKey: row.objectKey,
    thumbKey: row.thumbKey,
    mimeType: mainType,
    sizeBytes: main.size + thumbSize,
    durationSeconds: row.durationSeconds,
  };
}

/**
 * Deletes a verified reservation inside the transaction that records its
 * upload. A reservation already gone — attached by a second request racing
 * this one — rolls that transaction back rather than recording the file twice.
 */
export async function consumeReservation(tx: Tx, reservationId: string): Promise<void> {
  const [row] = await tx
    .delete(mediaUploads)
    .where(eq(mediaUploads.id, reservationId))
    .returning({ id: mediaUploads.id });
  if (!row) throw expired();
}

/** How much of the quota a creative has used, and how much their pending uploads hold. */
export async function mediaUsage(userId: string): Promise<MediaUsage> {
  const profile = await creativeProfileOf(userId);
  if (!profile) return { usedBytes: 0, reservedBytes: 0, quotaBytes: QUOTA_BYTES };

  return {
    usedBytes: await recordedBytes(db, profile.id),
    reservedBytes: await reservedBytesOf(db, userId, new Date()),
    quotaBytes: QUOTA_BYTES,
  };
}
