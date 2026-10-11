import { and, asc, count, desc, eq, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import type {
  AccountStatus,
  AdminAccount,
  AdminProfileDetail,
  AdminProfileListResult,
  AdminProfileStatus,
  AdminQueueStatus,
} from '../../contracts/admin.js';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  sessions,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { hashPassword } from '../../lib/password.js';
import { generateTemporaryPassword } from '../../lib/temporary-password.js';
import { notify } from '../notifications/notifications.service.js';
import type { NotificationType } from '../notifications/notifications.service.js';

export type {
  AdminAccount,
  AdminProfileDetail,
  AdminQueueRow,
} from '../../contracts/admin.js';

type ProfileStatus = AdminProfileStatus;
type ProfileQueueStatus = AdminQueueStatus;

export async function listProfiles(options: {
  status: ProfileQueueStatus;
  page: number;
  limit: number;
}): Promise<AdminProfileListResult> {
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

  return {
    rows: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status as AdminProfileStatus,
      createdAt: row.createdAt.toISOString(),
      editedSinceReviewAt: row.editedSinceReviewAt?.toISOString() ?? null,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
      municipality: row.municipality,
      subdomainCount: row.subdomainCount,
    })),
    total: totals?.total ?? 0,
  };
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

export async function getProfile(id: string): Promise<AdminProfileDetail> {
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
      singularName: creativeSubdomains.singularName,
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

  return {
    id: profile.id,
    slug: profile.slug,
    status: profile.status as AdminProfileStatus,
    editedSinceReviewAt: profile.editedSinceReviewAt?.toISOString() ?? null,
    rejectionReason: profile.rejectionReason,
    reviewedAt: profile.reviewedAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    userId: profile.userId,
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    suffix: profile.suffix,
    username: profile.username,
    email: profile.email,
    phone: profile.phone,
    birthDate: profile.birthDate,
    municipality: profile.municipality,
    subdomains,
    history: history.map((entry) => ({
      action: entry.action,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
      adminUsername: entry.adminUsername,
    })),
  };
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
    const updated = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: null, updatedAt: new Date() })
        .where(eq(creativeProfiles.id, input.profileId))
        .returning({
          id: creativeProfiles.id,
          status: creativeProfiles.status,
          userId: creativeProfiles.userId,
        });

      if (!updated) throw AppError.notFound('No such profile.');

      await tx.insert(moderationActions).values({
        profileId: input.profileId,
        adminId: input.adminId,
        action: input.action,
        reason: input.reason?.trim() ?? null,
      });

      return updated;
    });

    await notifyOwner(updated.userId, input.adminId, input.action, updated.id);
    return updated;
  }

  const nextStatus: ProfileStatus =
    input.action === 'approved'
      ? 'published'
      : input.action === 'rejected'
        ? 'suspended'
        : 'pending_review';

  const updated = await db.transaction(async (tx) => {
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
      .returning({
        id: creativeProfiles.id,
        status: creativeProfiles.status,
        userId: creativeProfiles.userId,
      });

    if (!updated) throw AppError.notFound('No such profile.');

    await tx.insert(moderationActions).values({
      profileId: input.profileId,
      adminId: input.adminId,
      action: input.action,
      reason: input.reason?.trim() ?? null,
    });

    return updated;
  });

  await notifyOwner(updated.userId, input.adminId, input.action, updated.id);
  return updated;
}

/**
 * Tells a registrant what happened to their profile.
 *
 * Called after the transaction commits, not inside it: the decision is the
 * thing that must stick, and `notify` swallows its own failures so this cannot
 * affect it either way.
 *
 * `returned_to_pending` is deliberately silent. It puts a profile back in the
 * queue without any outcome for its owner to act on, so there is nothing worth
 * telling them yet.
 */
async function notifyOwner(
  ownerId: string,
  adminId: string,
  action: 'approved' | 'rejected' | 'returned_to_pending' | 'acknowledged_edit',
  profileId: string,
) {
  const type: NotificationType | null =
    action === 'approved'
      ? 'profile_approved'
      : action === 'rejected'
        ? 'profile_rejected'
        : action === 'acknowledged_edit'
          ? 'profile_edit_acknowledged'
          : null;

  if (!type) return;

  await notify({ userId: ownerId, actorUserId: adminId, type, targetId: profileId });
}

/**
 * Accounts an administrator can act on, found by username, name or email.
 * Deliberately a lookup rather than a browsable list: this exists to reach a
 * specific person after a report, not to page through everyone.
 */
export async function findAccounts(query: string): Promise<AdminAccount[]> {
  const term = `%${query.trim().toLowerCase()}%`;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      profileSlug: creativeProfiles.slug,
      profileStatus: creativeProfiles.status,
    })
    .from(users)
    .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
    .where(
      or(
        sql`lower(${users.username}) like ${term}`,
        sql`lower(${users.email}) like ${term}`,
        sql`lower(${users.firstName} || ' ' || ${users.lastName}) like ${term}`,
      ),
    )
    .orderBy(asc(users.username))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    fullName: [row.firstName, row.middleName, row.lastName, row.suffix]
      .filter(Boolean)
      .join(' '),
    email: row.email,
    role: row.role as 'member' | 'admin',
    status: row.status as AccountStatus,
    createdAt: row.createdAt.toISOString(),
    profileSlug: row.profileSlug,
    profileStatus: (row.profileStatus as AdminProfileStatus | null) ?? null,
  }));
}

/**
 * Suspend or reinstate an account. Suspending ends their sessions at the next
 * request and takes their work off every public surface; reinstating restores
 * both, because visibility is derived from this column rather than copied onto
 * each row.
 */
export async function setAccountStatus(input: {
  adminId: string;
  userId: string;
  action: 'suspend' | 'reinstate';
  reason?: string;
}) {
  if (input.action === 'suspend' && !input.reason?.trim()) {
    throw AppError.badRequest('A reason is required when suspending.', { field: 'reason' });
  }

  // Suspending yourself would end your own session and leave the queue with one
  // fewer administrator — possibly none.
  if (input.userId === input.adminId) {
    throw AppError.badRequest('You cannot suspend your own account.');
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!target) throw AppError.notFound('No such account.');

  // Administrators are not moderated through this surface. Removing one is a
  // deliberate act at the database, not a button next to everyone else's.
  if (target.role === 'admin') {
    throw AppError.badRequest('Administrator accounts cannot be suspended here.');
  }

  const nextStatus = input.action === 'suspend' ? 'suspended' : 'active';
  if (target.status === nextStatus) {
    return { id: target.id, status: nextStatus, changed: false as const };
  }

  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, input.userId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    await tx.insert(moderationActions).values({
      // Null for an account with no creative profile; subjectUserId is what
      // makes the row meaningful either way.
      profileId: profile?.id ?? null,
      subjectUserId: input.userId,
      adminId: input.adminId,
      action: input.action === 'suspend' ? 'account_suspended' : 'account_reinstated',
      reason: input.reason?.trim() ?? null,
    });
  });

  return { id: target.id, status: nextStatus, changed: true as const };
}

/**
 * Issue a temporary password for an account that cannot get in.
 *
 * There is no self-service reset and there cannot be one yet: nobody has proved
 * they own the email or phone on their account, so a link sent to either is an
 * account-takeover primitive rather than a recovery path (ADR 0051, and the
 * comment on `users.email`). Recovery therefore runs through an administrator
 * who verified the person out of band — which is what the existing developer
 * script already assumed, minus the database credentials and minus any record.
 *
 * Three things happen together, so none of them can be observed without the
 * others:
 *
 * 1. The password becomes a fresh random one, stored only as its argon2 hash.
 * 2. Every session the account holds is deleted. Suspension deliberately does
 *    not do this — it is enforced per request instead (ADR 0028) — but a
 *    password change is different in kind: those sessions are live credentials
 *    issued against a password that no longer exists, and nothing in a later
 *    request would notice.
 * 3. `mustChangePassword` is set, so the temporary password unlocks exactly one
 *    action: replacing itself. `requireAuth` enforces that.
 *
 * The returned `temporaryPassword` is the only time it exists outside the hash.
 * It is deliberately not logged, not stored, and not recoverable — a second
 * call mints a different one and invalidates this.
 */
export async function resetAccountPassword(input: {
  adminId: string;
  userId: string;
}): Promise<{ id: string; username: string; temporaryPassword: string }> {
  // Resetting yourself would delete the session you are holding, logging you
  // out mid-action with a password you then have to read back to yourself.
  if (input.userId === input.adminId) {
    throw AppError.badRequest('You cannot reset your own password here. Use Account → Security.');
  }

  const [target] = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!target) throw AppError.notFound('No such account.');

  // Same line as suspension: administrators are not administered through this
  // surface. One admin resetting another's password is a takeover of the
  // account that can reset everyone else's.
  if (target.role === 'admin') {
    throw AppError.badRequest('Administrator passwords cannot be reset here.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, input.userId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    // By `user_id`, and by the serialised session for any row still without
    // one — a session signed in by the previous build during a deploy, and not
    // used since, has not had `user_id` written yet. Missing it would let it
    // back in once the owner sets a new password. `userId` is a validated UUID,
    // so it carries no LIKE wildcards.
    await tx
      .delete(sessions)
      .where(
        or(
          eq(sessions.userId, input.userId),
          and(isNull(sessions.userId), like(sessions.data, `%"userId":"${input.userId}"%`)),
        ),
      );

    await tx.insert(moderationActions).values({
      profileId: profile?.id ?? null,
      subjectUserId: input.userId,
      adminId: input.adminId,
      action: 'password_reset',
      // Null on purpose. The row records that a reset happened and by whom;
      // the password itself must never reach this table, and there is nothing
      // else about a reset to explain.
      reason: null,
    });
  });

  return { id: target.id, username: target.username, temporaryPassword };
}
