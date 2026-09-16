import { and, asc, count, eq, inArray, max } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { creativeProfiles, portfolioItems, users } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import {
  assertSafeObjectKey,
  avatarKey,
  createSignedUpload,
  deleteObject,
  portfolioKey,
  publicUrl,
} from '../../lib/storage.js';

export const PORTFOLIO_LIMIT = 10;

export const uploadUrlBodySchema = z.object({
  kind: z.enum(['avatar', 'portfolio']),
});

export const setAvatarBodySchema = z.object({
  objectKey: z.string().min(1).max(512),
});

export const createPortfolioBodySchema = z.object({
  objectKey: z.string().min(1).max(512),
  thumbKey: z.string().min(1).max(512),
  caption: z.string().trim().max(280).optional(),
});

export const patchPortfolioBodySchema = z.object({
  caption: z.string().trim().max(280).nullable(),
});

export const reorderPortfolioBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(PORTFOLIO_LIMIT),
});

export type UploadUrlBody = z.infer<typeof uploadUrlBodySchema>;

async function requireOwnCreativeProfile(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id, status: creativeProfiles.status })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    throw AppError.forbidden('A creative profile is required to upload portfolio images');
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

function assertOwnPortfolioKey(profileId: string, objectKey: string) {
  assertSafeObjectKey(objectKey);
  const expectedPrefix = `portfolio/${profileId}/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw AppError.forbidden('That image does not belong to your profile');
  }
}

function toPortfolioPublic(row: {
  id: string;
  objectKey: string;
  thumbKey: string;
  caption: string | null;
}) {
  return {
    id: row.id,
    url: publicUrl(row.objectKey),
    thumbUrl: publicUrl(row.thumbKey),
    caption: row.caption,
  };
}

export async function issueUploadUrl(userId: string, input: UploadUrlBody) {
  if (input.kind === 'avatar') {
    const objectKey = avatarKey(userId);
    const ticket = await createSignedUpload(objectKey);
    return { kind: 'avatar' as const, ...ticket };
  }

  const profile = await requireOwnCreativeProfile(userId);

  const [tally] = await db
    .select({ total: count() })
    .from(portfolioItems)
    .where(eq(portfolioItems.profileId, profile.id));

  if ((tally?.total ?? 0) >= PORTFOLIO_LIMIT) {
    throw AppError.badRequest(`A portfolio can hold at most ${PORTFOLIO_LIMIT} images`);
  }

  const base = portfolioKey(profile.id);
  const fullKey = `${base}.webp`;
  const thumbKey = `${base}-thumb.webp`;

  const [full, thumb] = await Promise.all([
    createSignedUpload(fullKey),
    createSignedUpload(thumbKey),
  ]);

  return {
    kind: 'portfolio' as const,
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

/** Deletes an uploaded object that never got a row — half-finished portfolio pairs. */
export async function abandonObject(userId: string, objectKey: string) {
  assertSafeObjectKey(objectKey);

  if (objectKey.startsWith(`avatars/${userId}/`)) {
    assertOwnAvatarKey(userId, objectKey);
    await deleteObject(objectKey);
    return { ok: true as const };
  }

  const profile = await requireOwnCreativeProfile(userId);
  assertOwnPortfolioKey(profile.id, objectKey);
  await deleteObject(objectKey);
  return { ok: true as const };
}

export async function listOwnPortfolio(userId: string) {
  const profile = await requireOwnCreativeProfile(userId);
  const rows = await db
    .select({
      id: portfolioItems.id,
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
      caption: portfolioItems.caption,
      sortOrder: portfolioItems.sortOrder,
    })
    .from(portfolioItems)
    .where(eq(portfolioItems.profileId, profile.id))
    .orderBy(asc(portfolioItems.sortOrder), asc(portfolioItems.createdAt));

  return rows.map((row) => ({
    ...toPortfolioPublic(row),
    sortOrder: row.sortOrder,
  }));
}

export async function createPortfolioItem(
  userId: string,
  input: z.infer<typeof createPortfolioBodySchema>,
) {
  const profile = await requireOwnCreativeProfile(userId);
  assertOwnPortfolioKey(profile.id, input.objectKey);
  assertOwnPortfolioKey(profile.id, input.thumbKey);

  const created = await db.transaction(async (tx) => {
    const [tally] = await tx
      .select({ total: count() })
      .from(portfolioItems)
      .where(eq(portfolioItems.profileId, profile.id));

    if ((tally?.total ?? 0) >= PORTFOLIO_LIMIT) {
      throw AppError.badRequest(`A portfolio can hold at most ${PORTFOLIO_LIMIT} images`);
    }

    const [peak] = await tx
      .select({ maxOrder: max(portfolioItems.sortOrder) })
      .from(portfolioItems)
      .where(eq(portfolioItems.profileId, profile.id));

    const [row] = await tx
      .insert(portfolioItems)
      .values({
        profileId: profile.id,
        objectKey: input.objectKey,
        thumbKey: input.thumbKey,
        caption: input.caption || null,
        sortOrder: (peak?.maxOrder ?? -1) + 1,
      })
      .returning({
        id: portfolioItems.id,
        objectKey: portfolioItems.objectKey,
        thumbKey: portfolioItems.thumbKey,
        caption: portfolioItems.caption,
      });

    if (profile.status === 'published') {
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: new Date(), updatedAt: new Date() })
        .where(eq(creativeProfiles.id, profile.id));
    }

    return row!;
  });

  return toPortfolioPublic(created);
}

export async function updatePortfolioCaption(
  userId: string,
  itemId: string,
  caption: string | null,
) {
  const profile = await requireOwnCreativeProfile(userId);

  const [row] = await db
    .update(portfolioItems)
    .set({ caption })
    .where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.profileId, profile.id)))
    .returning({
      id: portfolioItems.id,
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
      caption: portfolioItems.caption,
    });

  if (!row) throw AppError.notFound('No such portfolio item.');

  await markPublishedProfileEdited(userId);
  return toPortfolioPublic(row);
}

export async function deletePortfolioItem(userId: string, itemId: string) {
  const profile = await requireOwnCreativeProfile(userId);

  const [row] = await db
    .delete(portfolioItems)
    .where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.profileId, profile.id)))
    .returning({
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
    });

  if (!row) throw AppError.notFound('No such portfolio item.');

  await markPublishedProfileEdited(userId);
  await Promise.all([deleteObject(row.objectKey), deleteObject(row.thumbKey)]);

  return { ok: true as const };
}

export async function reorderPortfolio(userId: string, ids: string[]) {
  const profile = await requireOwnCreativeProfile(userId);

  const existing = await db
    .select({ id: portfolioItems.id })
    .from(portfolioItems)
    .where(eq(portfolioItems.profileId, profile.id));

  const existingIds = new Set(existing.map((row) => row.id));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
    throw AppError.notFound('No such portfolio item.');
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(portfolioItems)
        .set({ sortOrder: index })
        .where(and(eq(portfolioItems.id, id), eq(portfolioItems.profileId, profile.id)));
    }

    if (profile.status === 'published') {
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: new Date(), updatedAt: new Date() })
        .where(eq(creativeProfiles.id, profile.id));
    }
  });

  return listOwnPortfolio(userId);
}

/** First three thumbs per profile for directory cards — one query for the page. */
export async function portfolioThumbsForProfiles(profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, { id: string; url: string; thumbUrl: string; caption: string | null }[]>();
  }

  const rows = await db
    .select({
      id: portfolioItems.id,
      profileId: portfolioItems.profileId,
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
      caption: portfolioItems.caption,
      sortOrder: portfolioItems.sortOrder,
      createdAt: portfolioItems.createdAt,
    })
    .from(portfolioItems)
    .where(inArray(portfolioItems.profileId, profileIds))
    .orderBy(asc(portfolioItems.profileId), asc(portfolioItems.sortOrder), asc(portfolioItems.createdAt));

  const map = new Map<string, { id: string; url: string; thumbUrl: string; caption: string | null }[]>();
  for (const row of rows) {
    const list = map.get(row.profileId) ?? [];
    if (list.length >= 3) continue;
    list.push(toPortfolioPublic(row));
    map.set(row.profileId, list);
  }
  return map;
}

export async function portfolioForProfile(profileId: string) {
  const rows = await db
    .select({
      id: portfolioItems.id,
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
      caption: portfolioItems.caption,
    })
    .from(portfolioItems)
    .where(eq(portfolioItems.profileId, profileId))
    .orderBy(asc(portfolioItems.sortOrder), asc(portfolioItems.createdAt));

  return rows.map(toPortfolioPublic);
}
