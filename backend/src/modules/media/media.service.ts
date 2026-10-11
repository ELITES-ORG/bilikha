import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { creativeProfiles, users } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import {
  assertSafeObjectKey,
  avatarKey,
  createSignedUpload,
  deleteObject,
  discardObject,
  offerKey,
} from '../../lib/storage.js';

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
    return { kind: 'avatar' as const, ...ticket };
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
