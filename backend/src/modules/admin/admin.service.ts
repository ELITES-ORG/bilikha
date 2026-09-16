import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  portfolioItems,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { deleteObject, publicUrl } from '../../lib/storage.js';

type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
type ProfileQueueStatus = ProfileStatus | 'edited';

export async function listProfiles(options: {
  status: ProfileQueueStatus;
  page: number;
  limit: number;
}) {
  const offset = (options.page - 1) * options.limit;

  const rows = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      status: creativeProfiles.status,
      editedSinceReviewAt: creativeProfiles.editedSinceReviewAt,
      createdAt: creativeProfiles.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      municipality: municipalities.name,
      subdomainCount: sql<number>`(
        select count(*)::int from creative_profile_subdomains cps
        where cps.profile_id = ${creativeProfiles.id}
      )`.mapWith(Number),
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(
      options.status === 'edited'
        ? and(
            eq(creativeProfiles.status, 'published'),
            isNotNull(creativeProfiles.editedSinceReviewAt),
          )
        : eq(creativeProfiles.status, options.status),
    )
    // Oldest first: a review queue is a queue. Newest-first silently starves
    // the people who have waited longest.
    .orderBy(
      options.status === 'edited'
        ? creativeProfiles.editedSinceReviewAt
        : creativeProfiles.createdAt,
    )
    .limit(options.limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(creativeProfiles)
    .where(
      options.status === 'edited'
        ? and(
            eq(creativeProfiles.status, 'published'),
            isNotNull(creativeProfiles.editedSinceReviewAt),
          )
        : eq(creativeProfiles.status, options.status),
    );

  return { rows, total: totals?.total ?? 0 };
}

/** Counts for the queue tabs, in one round trip rather than three. */
export async function statusCounts() {
  const rows = await db
    .select({
      status: creativeProfiles.status,
      total: count(),
      edited: sql<number>`count(*) filter (
        where ${creativeProfiles.status} = 'published'
          and ${creativeProfiles.editedSinceReviewAt} is not null
      )::int`.mapWith(Number),
    })
    .from(creativeProfiles)
    .groupBy(creativeProfiles.status);

  const counts = Object.fromEntries(rows.map((r) => [r.status, r.total])) as Record<
    string,
    number
  >;
  counts.edited = rows.find((row) => row.status === 'published')?.edited ?? 0;
  return counts;
}

export async function getProfile(id: string) {
  const [profile] = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      status: creativeProfiles.status,
      editedSinceReviewAt: creativeProfiles.editedSinceReviewAt,
      rejectionReason: creativeProfiles.rejectionReason,
      reviewedAt: creativeProfiles.reviewedAt,
      createdAt: creativeProfiles.createdAt,
      userId: users.id,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      username: users.username,
      email: users.email,
      phone: users.phone,
      birthDate: users.birthDate,
      municipality: municipalities.name,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(eq(creativeProfiles.id, id))
    .limit(1);

  if (!profile) throw AppError.notFound('No such profile.');

  const subdomains = await db
    .select({
      name: creativeSubdomains.name,
      slug: creativeSubdomains.slug,
      isPrimary: creativeProfileSubdomains.isPrimary,
    })
    .from(creativeProfileSubdomains)
    .innerJoin(
      creativeSubdomains,
      eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id),
    )
    .where(eq(creativeProfileSubdomains.profileId, id));

  const history = await db
    .select({
      action: moderationActions.action,
      reason: moderationActions.reason,
      createdAt: moderationActions.createdAt,
      adminUsername: users.username,
    })
    .from(moderationActions)
    .leftJoin(users, eq(moderationActions.adminId, users.id))
    .where(eq(moderationActions.profileId, id))
    .orderBy(desc(moderationActions.createdAt));

  return { ...profile, subdomains, history };
}

/**
 * All status transitions and edit acknowledgements go through one function so
 * every moderation decision writes its audit row in the same transaction.
 */
export async function moderate(input: {
  profileId: string;
  adminId: string;
  action: 'approved' | 'rejected' | 'returned_to_pending' | 'acknowledged_edit';
  reason?: string;
}) {
  if (input.action === 'rejected' && !input.reason?.trim()) {
    throw AppError.badRequest('A reason is required when rejecting.', { field: 'reason' });
  }

  if (input.action === 'acknowledged_edit') {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: null, updatedAt: new Date() })
        .where(eq(creativeProfiles.id, input.profileId))
        .returning({ id: creativeProfiles.id, status: creativeProfiles.status });

      if (!updated) throw AppError.notFound('No such profile.');

      await tx.insert(moderationActions).values({
        profileId: input.profileId,
        adminId: input.adminId,
        action: input.action,
        reason: input.reason?.trim() ?? null,
      });

      return updated;
    });
  }

  const nextStatus: ProfileStatus =
    input.action === 'approved'
      ? 'published'
      : input.action === 'rejected'
        ? 'suspended'
        : 'pending_review';

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(creativeProfiles)
      .set({
        status: nextStatus,
        rejectionReason: input.action === 'rejected' ? input.reason!.trim() : null,
        reviewedAt: new Date(),
        reviewedBy: input.adminId,
        updatedAt: new Date(),
      })
      .where(eq(creativeProfiles.id, input.profileId))
      .returning({ id: creativeProfiles.id, status: creativeProfiles.status });

    if (!updated) throw AppError.notFound('No such profile.');

    await tx.insert(moderationActions).values({
      profileId: input.profileId,
      adminId: input.adminId,
      action: input.action,
      reason: input.reason?.trim() ?? null,
    });

    return updated;
  });
}

export async function listUnreviewedMedia(options: { page: number; limit: number }) {
  const offset = (options.page - 1) * options.limit;

  const portfolioRows = await db
    .select({
      id: portfolioItems.id,
      kind: sql<'portfolio'>`'portfolio'`,
      createdAt: portfolioItems.createdAt,
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
      caption: portfolioItems.caption,
      ownerName: sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`,
      profileSlug: creativeProfiles.slug,
      profileId: creativeProfiles.id,
    })
    .from(portfolioItems)
    .innerJoin(creativeProfiles, eq(portfolioItems.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .where(sql`${portfolioItems.reviewedAt} is null`)
    .orderBy(desc(portfolioItems.createdAt));

  const avatarRows = await db
    .select({
      id: users.id,
      kind: sql<'avatar'>`'avatar'`,
      createdAt: users.updatedAt,
      objectKey: users.avatarKey,
      thumbKey: sql<string | null>`null`,
      caption: sql<string | null>`null`,
      ownerName: sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`,
      profileSlug: creativeProfiles.slug,
      profileId: creativeProfiles.id,
    })
    .from(users)
    .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
    .where(and(isNotNull(users.avatarKey), sql`${users.avatarReviewedAt} is null`))
    .orderBy(desc(users.updatedAt));

  const merged = [...portfolioRows, ...avatarRows]
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
      url: row.objectKey ? publicUrl(row.objectKey) : null,
      thumbUrl: row.thumbKey ? publicUrl(row.thumbKey) : row.objectKey ? publicUrl(row.objectKey) : null,
      caption: row.caption,
      ownerName: row.ownerName,
      profileSlug: row.profileSlug,
      profileId: row.profileId,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const total = merged.length;
  const data = merged.slice(offset, offset + options.limit);
  return { data, total };
}

export async function reviewMedia(input: {
  kind: 'avatar' | 'portfolio';
  id: string;
  adminId: string;
  action: 'approve' | 'remove';
}) {
  if (input.kind === 'avatar') {
    const [user] = await db
      .select({
        id: users.id,
        avatarKey: users.avatarKey,
        profileId: creativeProfiles.id,
      })
      .from(users)
      .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
      .where(eq(users.id, input.id))
      .limit(1);

    if (!user?.avatarKey) throw AppError.notFound('No such avatar.');

    if (input.action === 'approve') {
      await db
        .update(users)
        .set({ avatarReviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));
      return { ok: true as const };
    }

    const key = user.avatarKey;
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ avatarKey: null, avatarReviewedAt: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      if (user.profileId) {
        await tx.insert(moderationActions).values({
          profileId: user.profileId,
          adminId: input.adminId,
          action: 'media_removed',
          reason: 'Avatar removed by admin',
        });
      }
    });
    await deleteObject(key);
    return { ok: true as const };
  }

  const [item] = await db
    .select({
      id: portfolioItems.id,
      profileId: portfolioItems.profileId,
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
    })
    .from(portfolioItems)
    .where(eq(portfolioItems.id, input.id))
    .limit(1);

  if (!item) throw AppError.notFound('No such portfolio item.');

  if (input.action === 'approve') {
    await db
      .update(portfolioItems)
      .set({ reviewedAt: new Date() })
      .where(eq(portfolioItems.id, item.id));
    return { ok: true as const };
  }

  await db.transaction(async (tx) => {
    await tx.delete(portfolioItems).where(eq(portfolioItems.id, item.id));
    await tx.insert(moderationActions).values({
      profileId: item.profileId,
      adminId: input.adminId,
      action: 'media_removed',
      reason: 'Portfolio image removed by admin',
    });
  });
  await Promise.all([deleteObject(item.objectKey), deleteObject(item.thumbKey)]);
  return { ok: true as const };
}
