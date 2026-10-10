import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm';
import type { AdminOrganizationRow, OrganizationStatus } from '../../contracts/organizations.js';
import { db } from '../../db/index.js';
import {
  moderationActions,
  municipalities,
  organizationMembers,
  organizations,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { notify } from '../notifications/notifications.service.js';

/**
 * Reviewing organisation pages (plan 0051 phase 2).
 *
 * The same review an individual profile gets, on the same page, writing to the
 * same `moderation_actions` audit — an organisation name is easier to
 * impersonate than a person's, so its page is held before it is public
 * (ADR 0054). `approved`, `rejected` and `acknowledged_edit` mean what they
 * mean for a profile; `organization_id` says what the decision was about.
 *
 * Rejection is a real `rejected` status, not `suspended` as for profiles: a
 * rejected page stops counting toward its founder's five-organisation cap, so
 * they can submit a new one. An abuse suspension must not have that effect.
 */

type QueueStatus = OrganizationStatus | 'edited';

function queueFilter(status: QueueStatus) {
  return status === 'edited'
    ? and(eq(organizations.status, 'published'), isNotNull(organizations.editedSinceReviewAt))
    : eq(organizations.status, status);
}

/** The founder's username, or null if the founder row is somehow missing. */
const FOUNDER_USERNAME = sql<string | null>`(
  select u.username from organization_members m
  join users u on u.id = m.user_id
  where m.organization_id = ${organizations.id} and m.role = 'founder'
  limit 1
)`;

const MEMBER_COUNT = sql<number>`(
  select count(*)::int from organization_members m
  where m.organization_id = ${organizations.id}
)`.mapWith(Number);

export async function listOrganizationsForReview(options: {
  status: QueueStatus;
  page: number;
  limit: number;
}): Promise<{ rows: AdminOrganizationRow[]; total: number }> {
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        status: organizations.status,
        founderUsername: FOUNDER_USERNAME,
        municipality: municipalities.name,
        memberCount: MEMBER_COUNT,
        createdAt: organizations.createdAt,
        editedSinceReviewAt: organizations.editedSinceReviewAt,
      })
      .from(organizations)
      .innerJoin(municipalities, eq(organizations.municipalityId, municipalities.id))
      .where(queueFilter(options.status))
      // Oldest first: a review queue is a queue.
      .orderBy(
        options.status === 'edited'
          ? asc(organizations.editedSinceReviewAt)
          : asc(organizations.createdAt),
      )
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ total: count() }).from(organizations).where(queueFilter(options.status)),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      founderUsername: row.founderUsername,
      municipality: row.municipality,
      memberCount: row.memberCount,
      createdAt: row.createdAt.toISOString(),
      editedSinceReviewAt: row.editedSinceReviewAt?.toISOString() ?? null,
    })),
    total: totals?.total ?? 0,
  };
}

/** Counts for the queue, in one round trip. */
export async function organizationReviewCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: organizations.status,
      total: count(),
      edited: sql<number>`count(*) filter (
        where ${organizations.status} = 'published'
          and ${organizations.editedSinceReviewAt} is not null
      )::int`.mapWith(Number),
    })
    .from(organizations)
    .groupBy(organizations.status);

  const counts: Record<string, number> = Object.fromEntries(rows.map((r) => [r.status, r.total]));
  counts.edited = rows.find((row) => row.status === 'published')?.edited ?? 0;
  return counts;
}

export async function moderateOrganization(input: {
  organizationId: string;
  adminId: string;
  action: 'approved' | 'rejected' | 'acknowledged_edit';
  reason?: string;
}) {
  if (input.action === 'rejected' && !input.reason?.trim()) {
    throw AppError.badRequest('A reason is required when rejecting.', { field: 'reason' });
  }

  const [founder] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, input.organizationId),
        eq(organizationMembers.role, 'founder'),
      ),
    )
    .limit(1);

  const now = new Date();
  const update =
    input.action === 'acknowledged_edit'
      ? { editedSinceReviewAt: null }
      : {
          status: (input.action === 'approved' ? 'published' : 'rejected') as OrganizationStatus,
          rejectionReason: input.action === 'rejected' ? input.reason!.trim() : null,
          reviewedAt: now,
          reviewedBy: input.adminId,
          editedSinceReviewAt: null,
        };

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(organizations)
      .set({ ...update, updatedAt: now })
      .where(eq(organizations.id, input.organizationId))
      .returning({ id: organizations.id, slug: organizations.slug, status: organizations.status });

    if (!row) throw AppError.notFound('No such organisation.');

    await tx.insert(moderationActions).values({
      organizationId: input.organizationId,
      subjectUserId: founder?.userId ?? null,
      adminId: input.adminId,
      action: input.action,
      reason: input.reason?.trim() || null,
    });

    return row;
  });

  // After the commit: the decision is what must stick, and notify never throws.
  // An acknowledged edit has no outcome for the team to act on, so it is silent.
  if (founder && input.action !== 'acknowledged_edit') {
    await notify({
      userId: founder.userId,
      actorUserId: input.adminId,
      type: input.action === 'approved' ? 'organization_approved' : 'organization_rejected',
      targetId: updated.id,
    });
  }

  return updated;
}
