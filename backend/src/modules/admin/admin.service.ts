import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';

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
