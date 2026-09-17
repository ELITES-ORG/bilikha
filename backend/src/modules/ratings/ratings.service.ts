import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/index.js';
import {
  agreementEvents,
  agreements,
  conversations,
  creativeProfiles,
  moderationActions,
  ratingReports,
  ratings,
  users,
} from '../../db/schema/index.js';
import type { Rating } from '../../db/schema/ratings.js';
import { AppError } from '../../lib/http-error.js';
import { deriveState, requireAgreementAccess } from '../agreements/agreements.service.js';
import { notify } from '../notifications/notifications.service.js';

/**
 * How long a client may change their mind, in days (ADR 0033). A first
 * impression on the day of delivery is often wrong in both directions, and two
 * weeks is enough to settle; the freeze afterwards is the load-bearing half,
 * because a permanently editable rating is a lever a creative can be pressured
 * with in a place where the parties will meet again.
 *
 * Enforced here rather than by a trigger, unlike `agreement_acceptances`. That
 * asymmetry is deliberate (plan 0021 rule 7): an acceptance is evidence of a
 * commitment and the storage layer has to defend it, while a rating is an
 * opinion, and a clock-reading trigger would make every test of a product rule
 * depend on the wall clock.
 */
export const EDIT_WINDOW_DAYS = 14;

const EDIT_WINDOW_MS = EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface ProfileRating {
  id: string;
  stars: number;
  comment: string | null;
  raterName: string;
  createdAt: string;
  updatedAt: string;
}

export interface RatingSummary {
  /** Null when there is nothing to average. Never a column — ADR 0033. */
  average: number | null;
  count: number;
}

function shape(row: Rating) {
  return {
    id: row.id,
    agreementId: row.agreementId,
    stars: row.stars,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editableUntil: new Date(row.createdAt.getTime() + EDIT_WINDOW_MS).toISOString(),
  };
}

/**
 * Postgres 23505 on the one unique index this module has. The second rating on
 * an agreement is refused by that index rather than by a read-then-write check
 * that races itself (plan 0021 rule 2), so this is the refusal a client sees.
 */
function translateRatingConflict(error: unknown): unknown {
  let current: unknown = error;

  while (current && typeof current === 'object') {
    const candidate = current as { code?: string; cause?: unknown };
    if (candidate.code === '23505') {
      return AppError.conflict('You have already rated this engagement.');
    }
    current = candidate.cause;
  }

  return error;
}

/**
 * The agreement a caller is entitled to rate, or the reason they are not.
 *
 * A stranger never learns the agreement exists — `requireAgreementAccess`
 * answers 404 for both "no such agreement" and "not yours". Everything after
 * that is a refusal to someone who can already see the record.
 */
async function ratableAgreement(userId: string, agreementId: string) {
  const { agreement, conversation } = await requireAgreementAccess(userId, agreementId);

  // The creative cannot rate their own work, and a client cannot rate an
  // engagement they were not part of. ADR 0033: the agreement is what earns
  // the right to speak.
  if (conversation.clientUserId !== userId) {
    throw AppError.forbidden('Only the client on this engagement can rate it.');
  }

  if (agreement.status !== 'accepted') {
    throw AppError.badRequest('Only a completed engagement can be rated.');
  }

  const events = await db
    .select()
    .from(agreementEvents)
    .where(eq(agreementEvents.agreementId, agreement.id))
    .orderBy(asc(agreementEvents.createdAt));

  // Derived, never read from a status column — there is not one (ADR 0029).
  // Accepted is not enough: the client has to have confirmed the work done.
  const { state } = deriveState(agreement, events);
  if (state !== 'Completed') {
    throw AppError.badRequest(
      `Only a completed engagement can be rated. This one is ${state.toLowerCase()}.`,
    );
  }

  return { agreement, conversation };
}

export async function rateAgreement(input: {
  userId: string;
  agreementId: string;
  stars: number;
  comment?: string | null;
}) {
  const { conversation } = await ratableAgreement(input.userId, input.agreementId);

  let created: Rating;
  try {
    const [row] = await db
      .insert(ratings)
      .values({
        agreementId: input.agreementId,
        raterUserId: input.userId,
        stars: input.stars,
        comment: input.comment?.trim() || null,
      })
      .returning();
    created = row!;
  } catch (error) {
    throw translateRatingConflict(error);
  }

  // After the commit, and `notify` swallows its own failures — the rating
  // stands either way. It points at the creative's profile, which is where the
  // rating now is and where the appeal control lives.
  await notify({
    userId: conversation.creativeUserId,
    actorUserId: input.userId,
    type: 'rating_received',
    targetId: conversation.profileId,
  });

  return shape(created);
}

/**
 * The rating left on one agreement, for the record page to show instead of the
 * button. Either party may read it — it is published on the profile anyway —
 * and a non-party gets the 404 `requireAgreementAccess` gives them.
 */
export async function ratingForAgreement(input: { userId: string; agreementId: string }) {
  await requireAgreementAccess(input.userId, input.agreementId);

  const [row] = await db
    .select()
    .from(ratings)
    .where(eq(ratings.agreementId, input.agreementId))
    .limit(1);

  return row ? shape(row) : null;
}

/** The author's own rating, or 404. Somebody else's id matches nothing. */
async function ownRating(userId: string, ratingId: string): Promise<Rating> {
  const [row] = await db
    .select()
    .from(ratings)
    .where(and(eq(ratings.id, ratingId), eq(ratings.raterUserId, userId)))
    .limit(1);

  if (!row) throw AppError.notFound('No such rating.');
  return row;
}

function assertInsideWindow(rating: Rating): void {
  if (Date.now() - rating.createdAt.getTime() <= EDIT_WINDOW_MS) return;

  throw AppError.badRequest(
    `A rating can only be changed for ${EDIT_WINDOW_DAYS} days after it is left.`,
  );
}

export async function updateRating(input: {
  userId: string;
  ratingId: string;
  stars: number;
  comment?: string | null;
}) {
  const existing = await ownRating(input.userId, input.ratingId);
  assertInsideWindow(existing);

  const [row] = await db
    .update(ratings)
    .set({
      stars: input.stars,
      comment: input.comment?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(ratings.id, existing.id))
    .returning();

  return shape(row!);
}

export async function deleteRating(input: { userId: string; ratingId: string }) {
  const existing = await ownRating(input.userId, input.ratingId);
  assertInsideWindow(existing);

  await db.delete(ratings).where(eq(ratings.id, existing.id));
  return { ok: true as const };
}

/**
 * Every rating shown on a creative's profile, and nothing else.
 *
 * The join to `users` on the rater with `status = 'active'` is rule 6: a
 * suspended account's opinion leaves by derivation rather than by a recount.
 * `summaryForProfile` repeats exactly these joins, which is the only way the
 * count can be trusted to agree with the list.
 */
function scopedToProfile(slug: string) {
  return db
    .select({
      id: ratings.id,
      stars: ratings.stars,
      comment: ratings.comment,
      createdAt: ratings.createdAt,
      updatedAt: ratings.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(ratings)
    .innerJoin(agreements, eq(ratings.agreementId, agreements.id))
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .innerJoin(creativeProfiles, eq(conversations.profileId, creativeProfiles.id))
    .innerJoin(users, and(eq(users.id, ratings.raterUserId), eq(users.status, 'active')))
    .where(eq(creativeProfiles.slug, slug));
}

export async function listForProfile(
  slug: string,
  options: { page: number; limit: number },
): Promise<{ data: ProfileRating[]; total: number }> {
  const offset = (options.page - 1) * options.limit;

  const rows = await scopedToProfile(slug)
    .orderBy(desc(ratings.createdAt))
    .limit(options.limit)
    .offset(offset);

  // The total comes from the same function the profile header calls, rather
  // than a second count written beside it. A count that disagrees with the list
  // it is printed next to is the bug shape this codebase has shipped twice.
  const { count: total } = await summaryForProfile(slug);

  return {
    data: rows.map((row) => ({
      id: row.id,
      stars: row.stars,
      comment: row.comment,
      raterName: `${row.firstName} ${row.lastName}`.trim(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
  };
}

/**
 * `{ average, count }`, derived on read. The count travels with the score
 * everywhere it is shown — "5.0" alone is a lie in a thin market (rule 4).
 */
export async function summaryForProfile(slug: string): Promise<RatingSummary> {
  const [row] = await db
    .select({
      total: count(),
      // float8 so the driver hands back a number rather than numeric-as-string.
      average: sql<number | null>`avg(${ratings.stars})::float8`,
    })
    .from(ratings)
    .innerJoin(agreements, eq(ratings.agreementId, agreements.id))
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .innerJoin(creativeProfiles, eq(conversations.profileId, creativeProfiles.id))
    .innerJoin(users, and(eq(users.id, ratings.raterUserId), eq(users.status, 'active')))
    .where(eq(creativeProfiles.slug, slug));

  const total = row?.total ?? 0;
  if (total === 0 || row?.average == null) return { average: null, count: 0 };

  // Two decimals, so the profile can render one without carrying a long float
  // through the API. Rounded on the way out, never stored (rule 3).
  return { average: Math.round(row.average * 100) / 100, count: total };
}

/**
 * The creative's appeal, and their only recourse: there is no public reply
 * (ADR 0033). A rating on somebody else's profile is a 404 — the same answer a
 * rating that does not exist gets.
 */
export async function reportRating(input: {
  userId: string;
  ratingId: string;
  reason: string;
}) {
  const [row] = await db
    .select({ ratingId: ratings.id, creativeUserId: conversations.creativeUserId })
    .from(ratings)
    .innerJoin(agreements, eq(ratings.agreementId, agreements.id))
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .where(eq(ratings.id, input.ratingId))
    .limit(1);

  if (!row || row.creativeUserId !== input.userId) throw AppError.notFound('No such rating.');

  const [report] = await db
    .insert(ratingReports)
    .values({
      ratingId: row.ratingId,
      reporterUserId: input.userId,
      reason: input.reason.trim(),
    })
    .returning();

  return { id: report!.id, status: report!.status };
}

export async function adminListOpenReports(options: { page: number; limit: number }) {
  const offset = (options.page - 1) * options.limit;
  // Both parties come from `users`, so the rater needs its own alias.
  const rater = alias(users, 'rater');

  const rows = await db
    .select({
      id: ratingReports.id,
      reason: ratingReports.reason,
      createdAt: ratingReports.createdAt,
      ratingId: ratings.id,
      stars: ratings.stars,
      comment: ratings.comment,
      ratedAt: ratings.createdAt,
      agreementId: ratings.agreementId,
      packageTitle: agreements.packageTitle,
      profileSlug: creativeProfiles.slug,
      raterName: sql<string>`trim(concat(${rater.firstName}, ' ', ${rater.lastName}))`,
      creativeName: sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`,
    })
    .from(ratingReports)
    .innerJoin(ratings, eq(ratingReports.ratingId, ratings.id))
    .innerJoin(agreements, eq(ratings.agreementId, agreements.id))
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .innerJoin(creativeProfiles, eq(conversations.profileId, creativeProfiles.id))
    .innerJoin(users, eq(conversations.creativeUserId, users.id))
    .innerJoin(rater, eq(ratings.raterUserId, rater.id))
    .where(eq(ratingReports.status, 'open'))
    // Oldest first: an appeal is the creative's only recourse, so the queue is
    // a queue. It is worth nothing if it is not answered quickly.
    .orderBy(asc(ratingReports.createdAt))
    .limit(options.limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(ratingReports)
    .where(eq(ratingReports.status, 'open'));

  return {
    data: rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      rating: {
        id: row.ratingId,
        stars: row.stars,
        comment: row.comment,
        createdAt: row.ratedAt.toISOString(),
        agreementId: row.agreementId,
        packageTitle: row.packageTitle,
      },
      raterName: row.raterName,
      creativeName: row.creativeName,
      profileSlug: row.profileSlug,
    })),
    total: totals?.total ?? 0,
  };
}

/** The rating stands. The appeal is answered and closed. */
export async function adminDismissReport(reportId: string) {
  const [row] = await db
    .update(ratingReports)
    .set({ status: 'dismissed' })
    .where(and(eq(ratingReports.id, reportId), eq(ratingReports.status, 'open')))
    .returning({ id: ratingReports.id, status: ratingReports.status });

  if (!row) throw AppError.notFound('No such open report.');
  return row;
}

/**
 * Removal deletes the rating. There is no rewriting: ADR 0033 says an
 * administrator removes and nobody edits someone else's words.
 *
 * The audit row names the rater as the subject — the removed words are theirs —
 * and the profile the rating was shown on, so the decision reads the same way
 * as every other moderation action.
 */
export async function adminRemoveRating(input: {
  adminId: string;
  ratingId: string;
  reason: string;
}) {
  if (!input.reason.trim()) {
    throw AppError.badRequest('A reason is required when removing a rating.', {
      field: 'reason',
    });
  }

  const [row] = await db
    .select({
      ratingId: ratings.id,
      raterUserId: ratings.raterUserId,
      profileId: conversations.profileId,
    })
    .from(ratings)
    .innerJoin(agreements, eq(ratings.agreementId, agreements.id))
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .where(eq(ratings.id, input.ratingId))
    .limit(1);

  if (!row) throw AppError.notFound('No such rating.');

  await db.transaction(async (tx) => {
    await tx.insert(moderationActions).values({
      profileId: row.profileId,
      subjectUserId: row.raterUserId,
      adminId: input.adminId,
      action: 'rating_removed',
      reason: input.reason.trim(),
    });

    // Cascades to any report against it, including the one being answered.
    await tx.delete(ratings).where(eq(ratings.id, row.ratingId));
  });

  return { ok: true as const };
}
