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

async function markPublishedProfileEdited(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id, status: creativeProfiles.status })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (profile?.status === 'published') {
    await db
      .update(creativeProfiles)
      .set({ editedSinceReviewAt: new Date(), updatedAt: new Date() })
      .where(eq(creativeProfiles.id, profile.id));
  }
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

export async function setAvatar(userId: string, objectKey: string) {
  assertOwnAvatarKey(userId, objectKey);

  const [current] = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current) throw AppError.unauthorized();

  const previousKey = current.avatarKey;

  await db
    .update(users)
    .set({
      avatarKey: objectKey,
      avatarReviewedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await markPublishedProfileEdited(userId);

  if (previousKey && previousKey !== objectKey) {
    await deleteObject(previousKey);
  }

  return { objectKey };
}

export async function clearAvatar(userId: string) {
  const [current] = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current) throw AppError.unauthorized();

  const previousKey = current.avatarKey;

  await db
    .update(users)
    .set({
      avatarKey: null,
      avatarReviewedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await markPublishedProfileEdited(userId);

  if (previousKey) {
    await deleteObject(previousKey);
  }

  return { ok: true as const };
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
