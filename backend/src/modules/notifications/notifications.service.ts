import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  NotificationListResult,
  NotificationType,
  ResolvedNotification,
} from '../../contracts/notifications.js';
import { db } from '../../db/index.js';
import {
  agreements,
  creativeProfiles,
  conversations,
  notifications,
  offers,
  organizations,
  postings,
  users,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import type { Notification } from '../../db/schema/notifications.js';

export type { NotificationType, ResolvedNotification } from '../../contracts/notifications.js';

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

const TITLES: Record<NotificationType, string> = {
  profile_approved: 'Your creative profile was approved',
  profile_rejected: 'Your creative profile needs changes',
  profile_edit_acknowledged: 'Your profile edit was reviewed',
  posting_replied: 'A creative replied to your posting',
  agreement_issued: 'You received a work agreement',
  agreement_revision_requested: 'Changes were requested on a work agreement',
  agreement_accepted: 'Your work agreement was accepted',
  // Kept for rows written before plan 0020; no longer emitted.
  agreement_event: 'A work agreement was updated',
  agreement_delivered: 'Work was marked delivered — confirm to close it',
  agreement_completed: 'Your work was confirmed complete',
  agreement_cancelled: 'A work agreement was cancelled',
  rating_received: 'A client rated your work',
  organization_approved: 'Your organisation was approved',
  organization_rejected: 'Your organisation needs changes',
  organization_invited: 'You were invited to join an organisation',
  organization_invitation_accepted: 'Someone joined your organisation',
  id_verified: 'Your ID was verified',
  offer_approved: 'Your offer was approved',
  offer_rejected: 'Your offer was not approved',
  avatar_rejected: 'Your new photo was not approved',
  logo_rejected: 'Your new organisation logo was not approved',
  cover_rejected: 'Your new cover photo was not approved',
  attachment_expiring: 'A file in a conversation expires in 3 days',
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
    // Points at the creative's own profile: that is where the rating is, and
    // where the appeal control sits (ADR 0033).
    'rating_received',
  ]);
  const conversationIds = byType(['posting_replied', 'attachment_expiring']);
  const agreementIds = byType([
    'agreement_issued',
    'agreement_revision_requested',
    'agreement_accepted',
    'agreement_event',
    'agreement_delivered',
    'agreement_completed',
    'agreement_cancelled',
  ]);

  // Every organisation notification points at the organisation itself, so a
  // closed one tombstones exactly like a deleted profile does.
  const organizationIds = byType([
    'organization_approved',
    'organization_rejected',
    'organization_invited',
    'organization_invitation_accepted',
  ]);

  // Content review (ADR 0058). The reason is read from the offer, account or
  // organisation when the centre is opened — never copied into the row — so a
  // reason the creative has since acted on is not shown again.
  const offerIds = byType(['offer_approved', 'offer_rejected']);
  const avatarOwnerIds = byType(['avatar_rejected']);
  const logoOrganizationIds = byType(['logo_rejected']);
  const coverProfileIds = byType(['cover_rejected']);

  const [profiles, threads, agreementRows, organizationRows, offerRows, avatarRows, logoRows, coverRows] = await Promise.all([
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
    organizationIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, organizationIds)),
    offerIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: offers.id,
            title: offers.title,
            rejectionReason: offers.rejectionReason,
            revisionRejectionReason: offers.revisionRejectionReason,
          })
          .from(offers)
          .where(inArray(offers.id, offerIds)),
    avatarOwnerIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: users.id, reason: users.avatarRejectionReason })
          .from(users)
          .where(inArray(users.id, avatarOwnerIds)),
    logoOrganizationIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: organizations.id, slug: organizations.slug, reason: organizations.logoRejectionReason })
          .from(organizations)
          .where(inArray(organizations.id, logoOrganizationIds)),
    coverProfileIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: creativeProfiles.id, reason: creativeProfiles.coverRejectionReason })
          .from(creativeProfiles)
          .where(inArray(creativeProfiles.id, coverProfileIds)),
  ]);

  return {
    profiles: new Map(profiles.map((p) => [p.id, p])),
    threads: new Map(threads.map((t) => [t.id, t])),
    agreements: new Map(agreementRows.map((a) => [a.id, a])),
    organizations: new Map(organizationRows.map((o) => [o.id, o])),
    offers: new Map(offerRows.map((o) => [o.id, o])),
    avatars: new Map(avatarRows.map((a) => [a.id, a])),
    logos: new Map(logoRows.map((l) => [l.id, l])),
    covers: new Map(coverRows.map((c) => [c.id, c])),
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
): Promise<NotificationListResult> {
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
      case 'profile_edit_acknowledged':
      case 'rating_received': {
        const profile = targets.profiles.get(row.targetId);
        if (profile) {
          link = `/creatives/${profile.slug}`;
          detail =
            row.type === 'profile_rejected'
              ? 'Open your profile to see what needs changing.'
              : row.type === 'rating_received'
                ? 'Open your profile to read it.'
                : null;
        }
        break;
      }
      case 'posting_replied': {
        const thread = targets.threads.get(row.targetId);
        if (thread) link = `/messages/${thread.id}`;
        break;
      }
      case 'attachment_expiring': {
        const thread = targets.threads.get(row.targetId);
        if (thread) {
          link = `/messages/${thread.id}`;
          detail = 'Download it to keep a copy.';
        }
        break;
      }
      case 'agreement_issued':
      case 'agreement_revision_requested':
      case 'agreement_accepted':
      case 'agreement_event':
      case 'agreement_delivered':
      case 'agreement_completed':
      case 'agreement_cancelled': {
        const agreement = targets.agreements.get(row.targetId);
        if (agreement) {
          link = `/agreements/${agreement.id}`;
          detail = agreement.packageTitle;
        }
        break;
      }
      case 'organization_approved':
      case 'organization_rejected':
      case 'organization_invited':
      case 'organization_invitation_accepted': {
        const organization = targets.organizations.get(row.targetId);
        if (organization) {
          // An invitation is answered in the account hub, where pending ones
          // are listed; everything else opens the organisation — the public
          // page once approved, the team's own view otherwise.
          link =
            row.type === 'organization_invited'
              ? '/account'
              : row.type === 'organization_approved'
                ? `/organizations/${organization.slug}`
                : `/organizations/${organization.slug}/manage`;
          detail =
            row.type === 'organization_rejected'
              ? 'Open your organisation to see what needs changing.'
              : organization.name;
        }
        break;
      }
      // Points at the id_verifications row, but needs no lookup: a verified
      // account's next step is always the directory, and the row's contents
      // are never shown to the account (ADR 0057).
      case 'id_verified': {
        link = '/directory';
        detail = 'You can now message creatives, save offers and post work.';
        break;
      }
      // All of these open where the creative acts on them: their offers, their
      // profile photo, or the organisation's own page.
      case 'offer_approved':
      case 'offer_rejected': {
        const offer = targets.offers.get(row.targetId);
        if (offer) {
          link = '/account/offers';
          detail =
            row.type === 'offer_rejected'
              ? (offer.rejectionReason ?? offer.revisionRejectionReason ?? offer.title)
              : offer.title;
        }
        break;
      }
      case 'avatar_rejected': {
        const avatar = targets.avatars.get(row.targetId);
        if (avatar) {
          link = '/account/profile';
          detail = avatar.reason ?? 'Upload another photo to try again.';
        }
        break;
      }
      case 'logo_rejected': {
        const logo = targets.logos.get(row.targetId);
        if (logo) {
          link = `/organizations/${logo.slug}/manage`;
          detail = logo.reason ?? 'Upload another logo to try again.';
        }
        break;
      }
      case 'cover_rejected': {
        const cover = targets.covers.get(row.targetId);
        if (cover) {
          link = '/account/profile';
          detail = cover.reason ?? 'Upload another cover to try again.';
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
