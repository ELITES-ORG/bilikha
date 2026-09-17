import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  agreements,
  creativeProfiles,
  conversations,
  notifications,
  postings,
  users,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import type { Notification } from '../../db/schema/notifications.js';

export type NotificationType = Notification['type'];

/**
 * Raise a notification. Never throws.
 *
 * A notification is a side effect of something else succeeding — a moderation
 * decision, a reply. If the insert fails, the thing that caused it must still
 * stand, so this swallows and logs rather than propagating. Callers therefore
 * do not need try/catch, and must not put this inside a transaction whose
 * rollback would be surprising.
 */
export async function notify(input: {
  userId: string;
  actorUserId?: string | null;
  type: NotificationType;
  targetId: string;
}): Promise<void> {
  // Nobody is told about their own action. Enforced here rather than at every
  // call site, because the paths that notify both parties are exactly where it
  // is easy to forget.
  if (input.actorUserId && input.actorUserId === input.userId) return;

  try {
    await db.insert(notifications).values({
      userId: input.userId,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      targetId: input.targetId,
    });
  } catch (error) {
    logger.error({ err: error, type: input.type }, 'failed to write notification');
  }
}

/**
 * Raise a notification only if an unread one of the same type already points at
 * the same thing. Keeps "someone replied" to one row per conversation rather
 * than one per reply.
 */
export async function notifyOnce(input: {
  userId: string;
  actorUserId?: string | null;
  type: NotificationType;
  targetId: string;
}): Promise<void> {
  if (input.actorUserId && input.actorUserId === input.userId) return;

  try {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.type, input.type),
          eq(notifications.targetId, input.targetId),
          isNull(notifications.readAt),
        ),
      )
      .limit(1);

    if (existing) return;
  } catch (error) {
    logger.error({ err: error, type: input.type }, 'failed to check for existing notification');
    return;
  }

  await notify(input);
}

export interface ResolvedNotification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string | null;
  /** Null when the target no longer resolves — rendered as a tombstone. */
  link: string | null;
  actor: { name: string; avatarUrl: string | null } | null;
  readAt: string | null;
  createdAt: string;
}

const TITLES: Record<NotificationType, string> = {
  profile_approved: 'Your creative profile was approved',
  profile_rejected: 'Your creative profile needs changes',
  profile_edit_acknowledged: 'Your profile edit was reviewed',
  posting_replied: 'A creative replied to your posting',
  agreement_issued: 'You received a work agreement',
  agreement_revision_requested: 'Changes were requested on a work agreement',
  agreement_accepted: 'Your work agreement was accepted',
  agreement_event: 'A work agreement was updated',
};

/**
 * Resolves each notification's target to a link and a line of detail.
 *
 * One query per target type, never one per row. Anything that does not resolve
 * — deleted, or belonging to a suspended account — comes back without a link
 * and renders as a tombstone. Nothing is dropped: the fact that it happened is
 * still true.
 */
async function resolveTargets(rows: Notification[]) {
  const byType = (types: NotificationType[]) =>
    rows.filter((r) => types.includes(r.type)).map((r) => r.targetId);

  const profileIds = byType([
    'profile_approved',
    'profile_rejected',
    'profile_edit_acknowledged',
  ]);
  const conversationIds = byType(['posting_replied']);
  const agreementIds = byType([
    'agreement_issued',
    'agreement_revision_requested',
    'agreement_accepted',
    'agreement_event',
  ]);

  const [profiles, threads, agreementRows] = await Promise.all([
    profileIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: creativeProfiles.id, slug: creativeProfiles.slug })
          .from(creativeProfiles)
          .where(inArray(creativeProfiles.id, profileIds)),
    conversationIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: conversations.id })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds)),
    agreementIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: agreements.id, packageTitle: agreements.packageTitle })
          .from(agreements)
          .where(inArray(agreements.id, agreementIds)),
  ]);

  return {
    profiles: new Map(profiles.map((p) => [p.id, p])),
    threads: new Map(threads.map((t) => [t.id, t])),
    agreements: new Map(agreementRows.map((a) => [a.id, a])),
  };
}

/** Actors, filtered to active accounts so a suspended one tombstones (ADR 0028). */
async function resolveActors(rows: Notification[]) {
  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, { name: string; avatarUrl: string | null }>();

  const found = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarKey: users.avatarKey,
    })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, 'active')));

  return new Map(
    found.map((u) => [
      u.id,
      {
        name: `${u.firstName} ${u.lastName}`.trim(),
        avatarUrl: u.avatarKey && isStorageConfigured() ? publicUrl(u.avatarKey) : null,
      },
    ]),
  );
}

export async function listNotifications(
  userId: string,
  options: { page: number; limit: number },
): Promise<{ data: ResolvedNotification[]; total: number }> {
  const offset = (options.page - 1) * options.limit;

  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(options.limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(notifications)
      .where(eq(notifications.userId, userId)),
  ]);

  const [targets, actors] = await Promise.all([resolveTargets(rows), resolveActors(rows)]);

  const data = rows.map((row): ResolvedNotification => {
    let link: string | null = null;
    let detail: string | null = null;

    switch (row.type) {
      case 'profile_approved':
      case 'profile_rejected':
      case 'profile_edit_acknowledged': {
        const profile = targets.profiles.get(row.targetId);
        if (profile) {
          link = `/creatives/${profile.slug}`;
          detail =
            row.type === 'profile_rejected'
              ? 'Open your profile to see what needs changing.'
              : null;
        }
        break;
      }
      case 'posting_replied': {
        const thread = targets.threads.get(row.targetId);
        if (thread) link = `/messages/${thread.id}`;
        break;
      }
      case 'agreement_issued':
      case 'agreement_revision_requested':
      case 'agreement_accepted':
      case 'agreement_event': {
        const agreement = targets.agreements.get(row.targetId);
        if (agreement) {
          link = `/agreements/${agreement.id}`;
          detail = agreement.packageTitle;
        }
        break;
      }
    }

    return {
      id: row.id,
      type: row.type,
      title: TITLES[row.type],
      detail: link ? detail : 'This is no longer available.',
      link,
      actor: row.actorUserId ? (actors.get(row.actorUserId) ?? null) : null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return { data, total: totals?.value ?? 0 };
}

/** The cheapest query in the codebase: it is polled by every signed-in page. */
export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return row?.value ?? 0;
}

export async function markRead(userId: string, id: string): Promise<void> {
  // Scoped to the caller: an id belonging to someone else matches nothing
  // rather than marking their notification read.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/** Exported for the posting-reply emit site, which needs the poster's id. */
export async function posterOf(postingId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: postings.userId })
    .from(postings)
    .where(eq(postings.id, postingId))
    .limit(1);

  return row?.userId ?? null;
}
