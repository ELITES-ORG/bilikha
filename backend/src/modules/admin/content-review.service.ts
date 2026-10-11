import { and, asc, eq, exists, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import type { AdminMediaImage, AdminMediaListResult, AdminMediaRow } from '../../contracts/admin.js';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeSubdomains,
  moderationActions,
  offerImages,
  offerRevisions,
  offers,
  organizationMembers,
  organizations,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { discardObject, isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { notify } from '../notifications/notifications.service.js';

/**
 * Content review (ADR 0058, replacing ADR 0008's review-after-publishing).
 *
 * A new offer, a change to a published offer, a new profile photo and a new
 * organisation logo all wait here, unseen by the public, until an
 * administrator decides. Approving makes the item public — a change replaces
 * the published version, a photo replaces the approved one. Rejecting needs a
 * reason, which its owner is told: a new offer stays hidden until they change
 * it, and a rejected change or photo is simply dropped, leaving what was
 * already public exactly as it was. Nothing is deleted by a decision except
 * the files of a change that will never be shown.
 */

export type ReviewAction = 'approve' | 'reject';

/** The wire row plus the sort helper, which `listContentQueue` strips. */
type QueueRow = AdminMediaRow & { _flagged: boolean };

const imageUrl = (key: string | null) => (key && isStorageConfigured() ? publicUrl(key) : null);

async function imagesForQueue(offerIds: string[]) {
  const result = new Map<string, AdminMediaImage[]>();
  if (offerIds.length === 0 || !isStorageConfigured()) return result;

  const rows = await db
    .select({
      id: offerImages.id,
      offerId: offerImages.offerId,
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
      sortOrder: offerImages.sortOrder,
      state: offerImages.state,
    })
    .from(offerImages)
    .where(inArray(offerImages.offerId, offerIds))
    .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

  for (const row of rows) {
    const list = result.get(row.offerId) ?? [];
    list.push({
      id: row.id,
      url: publicUrl(row.objectKey),
      thumbUrl: publicUrl(row.thumbKey),
      sortOrder: row.sortOrder,
      state: row.state,
    });
    result.set(row.offerId, list);
  }
  return result;
}

/** A published offer with photos added or removed and not yet reviewed. */
const hasPendingImages = exists(
  db
    .select({ one: sql`1` })
    .from(offerImages)
    .where(and(eq(offerImages.offerId, offers.id), ne(offerImages.state, 'live'))),
);

export async function listContentQueue(options: { page: number; limit: number }): Promise<AdminMediaListResult> {
  const offset = (options.page - 1) * options.limit;
  const ownerName = sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`;

  const offerRows = await db
    .select({
      id: offers.id,
      status: offers.status,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      subdomain: creativeSubdomains.name,
      flaggedAt: offers.flaggedAt,
      createdAt: offers.createdAt,
      updatedAt: offers.updatedAt,
      revisionTitle: offerRevisions.title,
      revisionDescription: offerRevisions.description,
      revisionPriceMinCentavos: offerRevisions.priceMinCentavos,
      revisionPriceMaxCentavos: offerRevisions.priceMaxCentavos,
      revisionSubdomainId: offerRevisions.subdomainId,
      revisionFlaggedAt: offerRevisions.flaggedAt,
      revisionSubmittedAt: offerRevisions.submittedAt,
      ownerName,
      profileSlug: creativeProfiles.slug,
      profileId: creativeProfiles.id,
    })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .leftJoin(offerRevisions, eq(offerRevisions.offerId, offers.id))
    .where(
      or(
        eq(offers.status, 'pending_review'),
        and(eq(offers.status, 'published'), or(isNotNull(offerRevisions.offerId), hasPendingImages)),
      ),
    );

  // A change can move an offer to another sub-domain; name it as the change would.
  const revisionSubdomainIds = [
    ...new Set(offerRows.map((row) => row.revisionSubdomainId).filter((id): id is string => Boolean(id))),
  ];
  const revisionSubdomains = revisionSubdomainIds.length
    ? new Map(
        (
          await db
            .select({ id: creativeSubdomains.id, name: creativeSubdomains.name })
            .from(creativeSubdomains)
            .where(inArray(creativeSubdomains.id, revisionSubdomainIds))
        ).map((row) => [row.id, row.name]),
      )
    : new Map<string, string>();

  const imageMap = await imagesForQueue(offerRows.map((row) => row.id));

  const offerItems: QueueRow[] = offerRows.map((row) => {
    const images = imageMap.get(row.id) ?? [];
    const isEdit = row.status === 'published';
    const hasRevision = row.revisionTitle !== null;
    // The version under review: the new offer, or the published one with the
    // change applied.
    const proposed = isEdit && hasRevision
      ? {
          title: row.revisionTitle!,
          description: row.revisionDescription,
          priceMinCentavos: row.revisionPriceMinCentavos,
          priceMaxCentavos: row.revisionPriceMaxCentavos,
          subdomain: revisionSubdomains.get(row.revisionSubdomainId!) ?? row.subdomain,
        }
      : {
          title: row.title,
          description: row.description,
          priceMinCentavos: row.priceMinCentavos,
          priceMaxCentavos: row.priceMaxCentavos,
          subdomain: row.subdomain,
        };
    const shown = images.filter((image) => image.state !== 'pending_remove');
    const flaggedAt = (isEdit && hasRevision ? row.revisionFlaggedAt : row.flaggedAt) ?? null;
    return {
      id: row.id,
      kind: 'offer' as const,
      change: isEdit ? ('edit' as const) : ('new' as const),
      createdAt: (isEdit ? (row.revisionSubmittedAt ?? row.updatedAt) : row.createdAt).toISOString(),
      url: shown[0]?.url ?? null,
      thumbUrl: shown[0]?.thumbUrl ?? null,
      caption: null,
      ownerName: row.ownerName,
      profileSlug: row.profileSlug,
      profileId: row.profileId,
      ...proposed,
      flaggedAt: flaggedAt?.toISOString() ?? null,
      images,
      ...(isEdit
        ? {
            published: {
              title: row.title,
              description: row.description,
              priceMinCentavos: row.priceMinCentavos,
              priceMaxCentavos: row.priceMaxCentavos,
              subdomain: row.subdomain,
            },
          }
        : {}),
      _flagged: flaggedAt != null,
    };
  });

  const avatarRows = await db
    .select({
      id: users.id,
      updatedAt: users.updatedAt,
      pendingKey: users.avatarPendingKey,
      key: users.avatarKey,
      ownerName,
      profileSlug: creativeProfiles.slug,
      profileId: creativeProfiles.id,
    })
    .from(users)
    .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
    .where(isNotNull(users.avatarPendingKey));

  const avatarItems: QueueRow[] = avatarRows.map((row) => ({
    id: row.id,
    kind: 'avatar',
    createdAt: row.updatedAt.toISOString(),
    url: imageUrl(row.pendingKey),
    thumbUrl: imageUrl(row.pendingKey),
    caption: null,
    ownerName: row.ownerName,
    profileSlug: row.profileSlug,
    profileId: row.profileId,
    currentUrl: imageUrl(row.key),
    _flagged: false,
  }));

  const logoRows = await db
    .select({
      id: organizations.id,
      updatedAt: organizations.updatedAt,
      pendingKey: organizations.logoPendingKey,
      key: organizations.logoKey,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
    })
    .from(organizations)
    .where(isNotNull(organizations.logoPendingKey));

  const logoItems: QueueRow[] = logoRows.map((row) => ({
    id: row.id,
    kind: 'logo',
    createdAt: row.updatedAt.toISOString(),
    url: imageUrl(row.pendingKey),
    thumbUrl: imageUrl(row.pendingKey),
    caption: null,
    ownerName: row.name,
    profileSlug: null,
    profileId: null,
    currentUrl: imageUrl(row.key),
    // Only a published page can be opened; an unpublished one is reviewed in
    // the organisations queue, where its logo is seen with it.
    ...(row.status === 'published' ? { organizationSlug: row.slug } : {}),
    _flagged: false,
  }));

  // Flagged offers first, then everything else oldest first: a queue is a queue.
  const merged = [...offerItems, ...avatarItems, ...logoItems].sort((a, b) => {
    if (a._flagged !== b._flagged) return a._flagged ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  const total = merged.length;
  const data = merged.slice(offset, offset + options.limit).map(({ _flagged: _, ...row }) => row);
  return { data, total };
}

function requireReason(action: ReviewAction, reason: string | undefined): string | null {
  if (action === 'approve') return null;
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw AppError.badRequest('Say why, so its owner knows what to change.', { field: 'reason' });
  }
  return trimmed;
}

export async function reviewContent(input: {
  kind: 'avatar' | 'offer' | 'logo';
  id: string;
  adminId: string;
  action: ReviewAction;
  reason?: string;
}) {
  const reason = requireReason(input.action, input.reason);
  if (input.kind === 'offer') return reviewOffer({ ...input, reason });
  if (input.kind === 'avatar') return reviewAvatar({ ...input, reason });
  return reviewLogo({ ...input, reason });
}

async function reviewOffer(input: { id: string; adminId: string; action: ReviewAction; reason: string | null }) {
  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      profileId: offers.profileId,
      ownerUserId: creativeProfiles.userId,
    })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .where(eq(offers.id, input.id))
    .limit(1);
  if (!offer) throw AppError.notFound('No such offer.');

  const audit = {
    offerId: offer.id,
    profileId: offer.profileId,
    subjectUserId: offer.ownerUserId,
    adminId: input.adminId,
    action: input.action === 'approve' ? ('approved' as const) : ('rejected' as const),
    reason: input.reason,
  };
  const now = new Date();
  // Files of a change that will never be shown; deleted once the rows are.
  let discarded: string[] = [];

  if (offer.status === 'pending_review') {
    await db.transaction(async (tx) => {
      await tx
        .update(offers)
        .set(
          input.action === 'approve'
            ? { status: 'published', reviewedAt: now, rejectionReason: null, updatedAt: now }
            : { status: 'rejected', rejectionReason: input.reason, updatedAt: now },
        )
        .where(eq(offers.id, offer.id));
      await tx.insert(moderationActions).values(audit);
    });
  } else if (offer.status === 'published') {
    const [revision] = await db.select().from(offerRevisions).where(eq(offerRevisions.offerId, offer.id)).limit(1);
    const pending = await db
      .select({ id: offerImages.id, state: offerImages.state, objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
      .from(offerImages)
      .where(and(eq(offerImages.offerId, offer.id), ne(offerImages.state, 'live')));
    if (!revision && pending.length === 0) {
      throw AppError.conflict('There is no change waiting on this offer.');
    }

    const added = pending.filter((image) => image.state === 'pending_add');
    const removed = pending.filter((image) => image.state === 'pending_remove');

    await db.transaction(async (tx) => {
      if (input.action === 'approve') {
        if (revision) {
          await tx
            .update(offers)
            .set({
              subdomainId: revision.subdomainId,
              title: revision.title,
              description: revision.description,
              priceMinCentavos: revision.priceMinCentavos,
              priceMaxCentavos: revision.priceMaxCentavos,
              flaggedAt: revision.flaggedAt,
            })
            .where(eq(offers.id, offer.id));
        }
        if (added.length) {
          await tx.update(offerImages).set({ state: 'live' }).where(inArray(offerImages.id, added.map((i) => i.id)));
        }
        if (removed.length) {
          await tx.delete(offerImages).where(inArray(offerImages.id, removed.map((i) => i.id)));
        }
        await tx
          .update(offers)
          .set({ reviewedAt: now, revisionRejectionReason: null, updatedAt: now })
          .where(eq(offers.id, offer.id));
      } else {
        if (added.length) {
          await tx.delete(offerImages).where(inArray(offerImages.id, added.map((i) => i.id)));
        }
        if (removed.length) {
          await tx.update(offerImages).set({ state: 'live' }).where(inArray(offerImages.id, removed.map((i) => i.id)));
        }
        await tx
          .update(offers)
          .set({ revisionRejectionReason: input.reason, updatedAt: now })
          .where(eq(offers.id, offer.id));
      }
      await tx.delete(offerRevisions).where(eq(offerRevisions.offerId, offer.id));
      await tx.insert(moderationActions).values(audit);
    });
    discarded = (input.action === 'approve' ? removed : added).flatMap((i) => [i.objectKey, i.thumbKey]);
  } else {
    // A rejected offer waits for its creative, not for review.
    throw AppError.conflict('This offer is waiting for its creative to change it.');
  }

  await Promise.all(discarded.map((key) => discardObject(key)));
  await notify({
    userId: offer.ownerUserId,
    actorUserId: input.adminId,
    type: input.action === 'approve' ? 'offer_approved' : 'offer_rejected',
    targetId: offer.id,
  });
  return { ok: true as const };
}

async function reviewAvatar(input: { id: string; adminId: string; action: ReviewAction; reason: string | null }) {
  const [user] = await db
    .select({
      id: users.id,
      key: users.avatarKey,
      pendingKey: users.avatarPendingKey,
      profileId: creativeProfiles.id,
    })
    .from(users)
    .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
    .where(eq(users.id, input.id))
    .limit(1);
  if (!user?.pendingKey) throw AppError.notFound('No photo is waiting for review.');

  const now = new Date();
  if (input.action === 'approve') {
    await db
      .update(users)
      .set({ avatarKey: user.pendingKey, avatarPendingKey: null, avatarReviewedAt: now, avatarRejectionReason: null, updatedAt: now })
      .where(eq(users.id, user.id));
    if (user.key && user.key !== user.pendingKey) await discardObject(user.key);
    return { ok: true as const };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ avatarPendingKey: null, avatarRejectionReason: input.reason, updatedAt: now })
      .where(eq(users.id, user.id));
    // profileId stays null for a client with no creative profile; the decision
    // is still recorded against the account.
    await tx.insert(moderationActions).values({
      profileId: user.profileId,
      subjectUserId: user.id,
      adminId: input.adminId,
      action: 'media_removed',
      reason: input.reason,
    });
  });
  await discardObject(user.pendingKey);
  await notify({ userId: user.id, actorUserId: input.adminId, type: 'avatar_rejected', targetId: user.id });
  return { ok: true as const };
}

async function reviewLogo(input: { id: string; adminId: string; action: ReviewAction; reason: string | null }) {
  const [organization] = await db
    .select({ id: organizations.id, key: organizations.logoKey, pendingKey: organizations.logoPendingKey })
    .from(organizations)
    .where(eq(organizations.id, input.id))
    .limit(1);
  if (!organization?.pendingKey) throw AppError.notFound('No logo is waiting for review.');

  const now = new Date();
  if (input.action === 'approve') {
    await db
      .update(organizations)
      .set({ logoKey: organization.pendingKey, logoPendingKey: null, logoReviewedAt: now, logoRejectionReason: null, updatedAt: now })
      .where(eq(organizations.id, organization.id));
    if (organization.key && organization.key !== organization.pendingKey) await discardObject(organization.key);
    return { ok: true as const };
  }

  const [founder] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.role, 'founder')))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({ logoPendingKey: null, logoRejectionReason: input.reason, updatedAt: now })
      .where(eq(organizations.id, organization.id));
    await tx.insert(moderationActions).values({
      organizationId: organization.id,
      subjectUserId: founder?.userId ?? null,
      adminId: input.adminId,
      action: 'media_removed',
      reason: input.reason,
    });
  });
  await discardObject(organization.pendingKey);
  // The founder answers for the page, as for the organisation's own review.
  if (founder) {
    await notify({ userId: founder.userId, actorUserId: input.adminId, type: 'logo_rejected', targetId: organization.id });
  }
  return { ok: true as const };
}
