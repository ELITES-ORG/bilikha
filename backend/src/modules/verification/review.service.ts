import { and, asc, count, desc, eq, gt, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import type {
  AdminIdVerificationDetail,
  AdminIdVerificationRow,
  IdNumberMatch,
} from '../../contracts/verification.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import {
  barangays,
  idVerifications,
  moderationActions,
  municipalities,
  sessions,
  users,
  type IdVerification,
} from '../../db/schema/index.js';
import { accountSessionsWhere } from '../../lib/account-sessions.js';
import { AppError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import {
  createSignedDownload,
  idStorageReady,
  SIGNED_DOWNLOAD_MAX_SECONDS,
} from '../../lib/storage.js';
import { notify } from '../notifications/notifications.service.js';
import { formatFullName } from '../profiles/profiles.service.js';
import { hashIdNumber, idHashReady } from './id-number.js';

/**
 * The administrator's side of ID verification (ADR 0057, plan 0053 Phase 3):
 * the queue, the review with short-lived signed images, and the decision.
 *
 * An ID is sensitive personal information. Every look at one writes an audit
 * row naming the administrator, a signed URL never outlives the 7 days after a
 * decision, and the number an administrator types is kept only as a keyed hash.
 */

/** The 7 days after a decision: images kept, reversal and appeal possible. */
export const DECISION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A URL with less than this left is not worth issuing. */
const MIN_URL_SECONDS = 1;

/** The account and its registered facts, joined once for both list and detail. */
const accountFields = {
  username: users.username,
  firstName: users.firstName,
  middleName: users.middleName,
  lastName: users.lastName,
  suffix: users.suffix,
  birthDate: users.birthDate,
  accountStatus: users.status,
  municipality: municipalities.name,
};

function windowEndsAt(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + DECISION_WINDOW_MS);
}

/** Whole years between a birth date and today in the Philippines. */
export function ageOn(birthDate: string, now: Date): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * How long a signed URL for this row may live, in seconds, or null when none
 * may be issued: the images are gone, or the 7 days after the decision are
 * over. Decided here, not left to the sweep, so a late sweep never makes an ID
 * readable for longer.
 */
export function urlLifetimeSeconds(row: IdVerification, now: Date): number | null {
  if (row.imagesDeletedAt || !row.frontKey) return null;
  if (row.status === 'pending' || row.status === 'appealed') return SIGNED_DOWNLOAD_MAX_SECONDS;
  if (!row.decidedAt) return null;
  const left = Math.floor((windowEndsAt(row.decidedAt).getTime() - now.getTime()) / 1000);
  if (left < MIN_URL_SECONDS) return null;
  return Math.min(SIGNED_DOWNLOAD_MAX_SECONDS, left);
}

/** Submitted IDs waiting for a decision: the People badge's share (ADR 0059). */
export async function waitingIdCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(idVerifications)
    .where(and(eq(idVerifications.status, 'pending'), isNotNull(idVerifications.submittedAt)));
  return row?.value ?? 0;
}

export async function listIdVerifications(options: {
  view: 'pending' | 'decided';
  page: number;
  limit: number;
  now?: Date;
}): Promise<{ rows: AdminIdVerificationRow[]; total: number }> {
  const now = options.now ?? new Date();
  const where: SQL =
    options.view === 'pending'
      ? and(eq(idVerifications.status, 'pending'), isNotNull(idVerifications.submittedAt))!
      : and(
          inArray(idVerifications.status, ['verified', 'declined_retry', 'declined_final']),
          gt(idVerifications.decidedAt, new Date(now.getTime() - DECISION_WINDOW_MS)),
        )!;
  // Pending: oldest first, because nobody should wait longest. Decided: newest
  // first, because a second look is about what was just decided.
  const order =
    options.view === 'pending'
      ? [asc(idVerifications.submittedAt), asc(idVerifications.id)]
      : [desc(idVerifications.decidedAt), asc(idVerifications.id)];

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: idVerifications.id,
        userId: idVerifications.userId,
        idType: idVerifications.idType,
        status: idVerifications.status,
        submittedAt: idVerifications.submittedAt,
        decidedAt: idVerifications.decidedAt,
        ...accountFields,
      })
      .from(idVerifications)
      .innerJoin(users, eq(users.id, idVerifications.userId))
      .leftJoin(municipalities, eq(municipalities.id, users.municipalityId))
      .where(where)
      .orderBy(...order)
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ value: count() }).from(idVerifications).where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      fullName: formatFullName(row),
      municipality: row.municipality,
      idType: row.idType as AdminIdVerificationRow['idType'],
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      accountSuspended: row.accountStatus === 'suspended',
    })),
    total: totals?.value ?? 0,
  };
}

interface Loaded {
  row: IdVerification;
  username: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  birthDate: string;
  accountStatus: 'active' | 'suspended';
  municipality: string | null;
  barangay: string | null;
  reviewerUsername: string | null;
}

async function loadForReview(id: string): Promise<Loaded> {
  const [row] = await db.select().from(idVerifications).where(eq(idVerifications.id, id)).limit(1);
  if (!row) throw AppError.notFound('No such ID verification.');

  // The row cascades with its account, so the account is always there.
  const [account] = await db
    .select({ ...accountFields, barangay: barangays.name })
    .from(users)
    .leftJoin(municipalities, eq(municipalities.id, users.municipalityId))
    .leftJoin(barangays, eq(barangays.id, users.barangayId))
    .where(eq(users.id, row.userId))
    .limit(1);

  return {
    row,
    ...account!,
    reviewerUsername: row.reviewedBy ? await reviewerName(row.reviewedBy) : null,
  };
}

function toDetail(
  found: Loaded,
  now: Date,
  urls: { frontUrl: string | null; backUrl: string | null; urlsExpireAt: string | null },
): AdminIdVerificationDetail {
  const { row } = found;
  const decided = row.status !== 'pending' && row.decidedAt;
  return {
    id: row.id,
    userId: row.userId,
    username: found.username,
    fullName: formatFullName(found),
    birthDate: found.birthDate,
    age: ageOn(found.birthDate, now),
    municipality: found.municipality,
    barangay: found.barangay,
    idType: row.idType as AdminIdVerificationDetail['idType'],
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    ...urls,
    decision: decided
      ? {
          status: row.status as Exclude<IdVerification['status'], 'pending'>,
          decidedAt: row.decidedAt!.toISOString(),
          decidedBy: found.reviewerUsername,
          reason: row.decisionReason,
          windowEndsAt: windowEndsAt(row.decidedAt!).toISOString(),
        }
      : null,
    appeal:
      row.appealMessage && row.appealedAt
        ? {
            message: row.appealMessage,
            appealedAt: row.appealedAt.toISOString(),
            decidedAt: row.appealDecidedAt?.toISOString() ?? null,
          }
        : null,
    idNumberRecorded: row.idNumberHash !== null,
    idNumberAbsent: row.idNumberAbsent,
  };
}

const NO_URLS = { frontUrl: null, backUrl: null, urlsExpireAt: null };

/**
 * The review: the record always, and the images only while they may be read —
 * signed for at most 5 minutes, never past the 7 days, and every such look
 * recorded against the administrator.
 */
export async function getIdVerificationForReview(input: {
  id: string;
  adminId: string;
  now?: Date;
}): Promise<AdminIdVerificationDetail> {
  const now = input.now ?? new Date();
  const found = await loadForReview(input.id);
  const lifetime = urlLifetimeSeconds(found.row, now);
  if (lifetime === null) return toDetail(found, now, NO_URLS);

  if (!(await idStorageReady())) {
    throw new AppError(
      503,
      'ID_STORAGE_UNAVAILABLE',
      'ID images cannot be shown right now. Try again in a few minutes.',
    );
  }

  // Each side on its own: a photo storage cannot sign (deleted by hand, or a
  // storage hiccup) shows as unavailable, and the record and the decision
  // still load — otherwise the ID could not even be sent back to try again.
  const bucket = env.SUPABASE_ID_BUCKET;
  const sign = async (key: string | null): Promise<string | null> => {
    if (!key) return null;
    try {
      return await createSignedDownload(bucket, key, lifetime);
    } catch (error) {
      logger.warn({ err: error, idVerificationId: found.row.id }, 'Could not sign an ID photo');
      return null;
    }
  };
  const [frontUrl, backUrl] = await Promise.all([sign(found.row.frontKey), sign(found.row.backKey)]);
  if (!frontUrl && !backUrl) return toDetail(found, now, NO_URLS);

  // After the URLs exist, so a failed signing records no look that never happened.
  await db.insert(moderationActions).values({
    subjectUserId: found.row.userId,
    adminId: input.adminId,
    action: 'id_viewed',
    idVerificationId: found.row.id,
  });

  return toDetail(found, now, {
    frontUrl,
    backUrl,
    urlsExpireAt: new Date(now.getTime() + lifetime * 1000).toISOString(),
  });
}

export type IdDecision = 'verify' | 'retry' | 'final';

const ACTION_FOR = {
  verify: 'id_verified',
  retry: 'id_declined_retry',
  final: 'id_declined_final',
} as const;

const STATUS_FOR = {
  verify: 'verified',
  retry: 'declined_retry',
  final: 'declined_final',
} as const;

/** Other accounts whose ID carries the same number. The person's own rows never count. */
async function matchesFor(hash: string, userId: string): Promise<IdNumberMatch[]> {
  const rows = await db
    .select({
      username: users.username,
      status: idVerifications.status,
      decidedAt: idVerifications.decidedAt,
    })
    .from(idVerifications)
    .innerJoin(users, eq(users.id, idVerifications.userId))
    .where(and(eq(idVerifications.idNumberHash, hash), ne(idVerifications.userId, userId)))
    .orderBy(desc(idVerifications.createdAt));
  return rows.map((row) => ({
    username: row.username,
    status: row.status,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }));
}

export async function decideIdVerification(input: {
  id: string;
  adminId: string;
  decision: IdDecision;
  reason?: string;
  idNumber?: string;
  noIdNumber?: boolean;
  acknowledgeMatch?: boolean;
  now?: Date;
}): Promise<AdminIdVerificationDetail> {
  const now = input.now ?? new Date();
  const found = await loadForReview(input.id);
  const { row } = found;

  if (row.userId === input.adminId) {
    throw AppError.conflict('You cannot decide your own ID.');
  }
  if (found.accountStatus === 'suspended') {
    throw AppError.conflict('This account is suspended. Reinstate it before deciding its ID.');
  }
  if (row.status !== 'pending' || !row.submittedAt) {
    throw AppError.conflict('This ID is not waiting for a decision.');
  }

  // Verify and *not from Biliran* are judgements about the ID itself, so only
  // an administrator who was shown it may make them: an `id_viewed` row by
  // them on this row, which is written only when a photo was signed. *Try
  // again* stays open — it is the way out when the photos will not load.
  if (input.decision !== 'retry' && !(await hasLookedAt(row.id, input.adminId))) {
    throw AppError.conflict(
      'Open the ID photos before deciding. If they will not load, send it back to try again.',
    );
  }

  const reason = input.reason?.trim() || null;
  if (input.decision !== 'verify' && !reason) {
    throw AppError.badRequest('Write the reason the person will see.');
  }

  // A decision that settles who someone is records the number, so the same ID
  // is recognised if it comes back (plan 0053, Decided 5). *Try again* does
  // not: the photo may be unreadable.
  let idNumberHash: string | null = null;
  let idNumberAbsent = false;
  let matches: IdNumberMatch[] = [];
  if (input.decision !== 'retry') {
    if (input.noIdNumber) {
      idNumberAbsent = true;
    } else if (input.idNumber) {
      if (!idHashReady()) {
        throw new AppError(
          503,
          'ID_HASH_UNAVAILABLE',
          'ID numbers cannot be recorded right now. Try again later.',
        );
      }
      idNumberHash = hashIdNumber(row.idType as Parameters<typeof hashIdNumber>[0], input.idNumber);
      matches = await matchesFor(idNumberHash, row.userId);
    } else {
      throw AppError.badRequest(
        'Type the ID number from the photo, or tick that this document has none.',
      );
    }
  }

  if (matches.length > 0 && !input.acknowledgeMatch) {
    throw new AppError(
      409,
      'ID_NUMBER_MATCH',
      'This ID number is already on another account. Check the matches before deciding.',
      { matches },
    );
  }
  if (matches.length > 0 && input.decision === 'verify' && !reason) {
    throw AppError.badRequest('Say why this ID is verified despite matching another account.');
  }

  const auditReason =
    input.decision === 'verify'
      ? matches.length > 0
        ? `Verified despite ${matches.length} matching account(s): ${reason}`
        : reason
      : reason;

  const decided = await db.transaction(async (tx) => {
    // Guarded on the row still waiting, so two administrators deciding at once
    // cannot both land: the second updates nothing.
    const [updated] = await tx
      .update(idVerifications)
      .set({
        status: STATUS_FOR[input.decision],
        reviewedBy: input.adminId,
        decidedAt: now,
        decisionReason: input.decision === 'verify' ? null : reason,
        idNumberHash,
        idNumberAbsent,
        updatedAt: now,
      })
      .where(
        and(
          eq(idVerifications.id, row.id),
          eq(idVerifications.status, 'pending'),
          isNotNull(idVerifications.submittedAt),
        ),
      )
      .returning();
    if (!updated) {
      throw AppError.conflict('This ID was decided a moment ago. Reload to see the decision.');
    }

    await tx.insert(moderationActions).values({
      subjectUserId: row.userId,
      adminId: input.adminId,
      action: ACTION_FOR[input.decision],
      reason: auditReason,
      idVerificationId: row.id,
    });

    // A decline ends every session the account holds, and leaves the reason
    // in each so the open tab can say why (ADR 0057). Rewritten, not deleted:
    // the next request finds the notice, not a bare sign-out.
    if (input.decision !== 'verify') {
      const notice = sql`jsonb_build_object('declineNotice', jsonb_build_object('kind', ${input.decision}::text, 'reason', ${reason}::text))`;
      await tx
        .update(sessions)
        .set({
          data: sql`((${sessions.data})::jsonb - 'userId' || ${notice})::text`,
          userId: null,
        })
        .where(accountSessionsWhere(row.userId));
    }

    return updated;
  });

  if (input.decision === 'verify') {
    await notify({
      userId: row.userId,
      actorUserId: input.adminId,
      type: 'id_verified',
      targetId: row.id,
    });
  }

  return toDetail(
    { ...found, row: decided, reviewerUsername: await reviewerName(input.adminId) },
    now,
    NO_URLS,
  );
}

/**
 * Whether this administrator was shown this row's photos. A row is one
 * submission — a resubmission is a new row — so a look at it is a look at
 * these photos.
 */
async function hasLookedAt(idVerificationId: string, adminId: string): Promise<boolean> {
  const [look] = await db
    .select({ id: moderationActions.id })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.idVerificationId, idVerificationId),
        eq(moderationActions.adminId, adminId),
        eq(moderationActions.action, 'id_viewed'),
      ),
    )
    .limit(1);
  return Boolean(look);
}

async function reviewerName(adminId: string): Promise<string | null> {
  const [admin] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, adminId))
    .limit(1);
  return admin?.username ?? null;
}
