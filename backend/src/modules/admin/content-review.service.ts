import { createHash } from 'node:crypto';
import { and, asc, count, eq, exists, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import type {
  AdminMediaImage,
  AdminMediaListResult,
  AdminMediaRow,
  ContentQueueCounts,
} from '../../contracts/admin.js';
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
import { bucketFor } from '../media/media.limits.js';
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

const STALE = 'This changed after you opened the queue. Reload to see what is waiting now.';

/**
 * Each offer's reviewable state — its text, any waiting change, and every
 * photo with its state — as one token. The queue hands it out and the review
 * action recomputes it under a row lock: a creative who edits while an
 * administrator is looking must not have that edit approved unseen.
 */
async function offerVersions(executor: Executor, offerIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (offerIds.length === 0) return result;

  const rows = await executor
    .select({
      id: offers.id,
      status: offers.status,
      subdomainId: offers.subdomainId,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      revisionSubdomainId: offerRevisions.subdomainId,
      revisionTitle: offerRevisions.title,
      revisionDescription: offerRevisions.description,
      revisionPriceMinCentavos: offerRevisions.priceMinCentavos,
      revisionPriceMaxCentavos: offerRevisions.priceMaxCentavos,
    })
    .from(offers)
    .leftJoin(offerRevisions, eq(offerRevisions.offerId, offers.id))
    .where(inArray(offers.id, offerIds));
  const images = await executor
    .select({ offerId: offerImages.offerId, id: offerImages.id, kind: offerImages.kind, state: offerImages.state })
    .from(offerImages)
    .where(inArray(offerImages.offerId, offerIds))
    .orderBy(asc(offerImages.id));

  for (const row of rows) {
    const photos = images
      .filter((image) => image.offerId === row.id)
      .map((image) => `${image.id}:${image.kind}:${image.state}`);
    const { id, ...content } = row;
    result.set(id, createHash('sha256').update(JSON.stringify([content, photos])).digest('hex').slice(0, 32));
  }
  return result;
}

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
      kind: offerImages.kind,
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
      sortOrder: offerImages.sortOrder,
      state: offerImages.state,
      title: offerImages.title,
      mimeType: offerImages.mimeType,
      sizeBytes: offerImages.sizeBytes,
      durationSeconds: offerImages.durationSeconds,
    })
    .from(offerImages)
    .where(inArray(offerImages.offerId, offerIds))
    .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

  for (const row of rows) {
    const list = result.get(row.offerId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      url: publicUrl(row.objectKey, bucketFor(row.kind)),
      // images always have a thumbnail (offer_images_image_has_thumb); a video's is its poster
      thumbUrl: row.thumbKey ? publicUrl(row.thumbKey) : row.kind === 'image' ? publicUrl(row.objectKey) : null,
      sortOrder: row.sortOrder,
      state: row.state,
      title: row.title,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      durationSeconds: row.durationSeconds,
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

/** A new offer, or a change to a published one (`change`). */
const NEW_OFFER = eq(offers.status, 'pending_review');
const CHANGED_OFFER = and(eq(offers.status, 'published'), or(isNotNull(offerRevisions.offerId), hasPendingImages));

/**
 * The queue, or one part of it. The admin area shows each kind under the
 * subject it belongs to (ADR 0059): offers on the Offers page, a profile photo
 * under People, a logo under Organisations. `change` narrows offers to new
 * ones or changes, and implies `kind: 'offer'`.
 */
export async function listContentQueue(options: {
  page: number;
  limit: number;
  kind?: AdminMediaRow['kind'];
  change?: 'new' | 'edit';
}): Promise<AdminMediaListResult> {
  const offset = (options.page - 1) * options.limit;
  const ownerName = sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`;
  const kind = options.change ? 'offer' : options.kind;
  const wants = (candidate: AdminMediaRow['kind']) => !kind || kind === candidate;

  const offerRows = !wants('offer') ? [] : await db
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
      options.change === 'new' ? NEW_OFFER : options.change === 'edit' ? CHANGED_OFFER : or(NEW_OFFER, CHANGED_OFFER),
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
  const versions = await offerVersions(db, offerRows.map((row) => row.id));

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
    const shown = images.filter((image) => image.kind === 'image' && image.state !== 'pending_remove');
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
      version: versions.get(row.id) ?? '',
      _flagged: flaggedAt != null,
    };
  });

  const avatarRows = !wants('avatar') ? [] : await db
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
    // A new upload is a new key, so the key is the version.
    version: row.pendingKey!,
    _flagged: false,
  }));

  const logoRows = !wants('logo') ? [] : await db
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
    version: row.pendingKey!,
    _flagged: false,
  }));

  const coverRows = !wants('cover') ? [] : await db
    .select({
      id: creativeProfiles.id,
      updatedAt: creativeProfiles.updatedAt,
      pendingKey: creativeProfiles.coverPendingKey,
      pendingSmallKey: creativeProfiles.coverPendingSmallKey,
      smallKey: creativeProfiles.coverSmallKey,
      ownerName,
      profileSlug: creativeProfiles.slug,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(users.id, creativeProfiles.userId))
    .where(isNotNull(creativeProfiles.coverPendingKey));

  const coverItems: QueueRow[] = coverRows.map((row) => ({
    id: row.id,
    kind: 'cover',
    createdAt: row.updatedAt.toISOString(),
    url: imageUrl(row.pendingKey),
    thumbUrl: imageUrl(row.pendingSmallKey),
    caption: null,
    ownerName: row.ownerName,
    profileSlug: row.profileSlug,
    profileId: row.id,
    currentUrl: imageUrl(row.smallKey),
    // A new upload is a new key, so the key is the version (ADR 0061).
    version: row.pendingKey!,
    _flagged: false,
  }));

  // Flagged offers first, then everything else oldest first: a queue is a queue.
  const merged = [...offerItems, ...avatarItems, ...logoItems, ...coverItems].sort((a, b) => {
    if (a._flagged !== b._flagged) return a._flagged ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  const total = merged.length;
  const data = merged.slice(offset, offset + options.limit).map(({ _flagged: _, ...row }) => row);
  return { data, total };
}

/**
 * How much of the queue is waiting, by subject, without building it: the
 * sidebar and the tab counts read this on every admin page.
 */
export async function contentQueueCounts(): Promise<ContentQueueCounts> {
  const [[newOffers], [changedOffers], [photos], [logos], [covers]] = await Promise.all([
    db.select({ total: count() }).from(offers).where(NEW_OFFER),
    db
      .select({ total: count() })
      .from(offers)
      .leftJoin(offerRevisions, eq(offerRevisions.offerId, offers.id))
      .where(CHANGED_OFFER),
    db.select({ total: count() }).from(users).where(isNotNull(users.avatarPendingKey)),
    db.select({ total: count() }).from(organizations).where(isNotNull(organizations.logoPendingKey)),
    db.select({ total: count() }).from(creativeProfiles).where(isNotNull(creativeProfiles.coverPendingKey)),
  ]);
  return {
    newOffers: newOffers?.total ?? 0,
    changedOffers: changedOffers?.total ?? 0,
    photos: photos?.total ?? 0,
    logos: logos?.total ?? 0,
    covers: covers?.total ?? 0,
  };
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
  kind: 'avatar' | 'offer' | 'logo' | 'cover';
  id: string;
  adminId: string;
  action: ReviewAction;
  reason?: string;
  /** The queue row's `version`: what the administrator decided on. */
  version: string;
}) {
  const reason = requireReason(input.action, input.reason);
  if (input.kind === 'offer') return reviewOffer({ ...input, reason });
  if (input.kind === 'avatar') return reviewAvatar({ ...input, reason });
  if (input.kind === 'cover') return reviewCover({ ...input, reason });
  return reviewLogo({ ...input, reason });
}

type ReviewInput = { id: string; adminId: string; action: ReviewAction; reason: string | null; version: string };

async function reviewOffer(input: ReviewInput) {
  const now = new Date();

  // One transaction under the offer's row lock: the creative's own writes take
  // the same lock (offers.service), so nothing changes between checking the
  // version and applying the decision.
  const outcome = await db.transaction(async (tx) => {
    const [offer] = await tx
      .select({ id: offers.id, status: offers.status, profileId: offers.profileId })
      .from(offers)
      .where(eq(offers.id, input.id))
      .for('update');
    if (!offer) throw AppError.notFound('No such offer.');
    if (offer.status === 'rejected') {
      // A rejected offer waits for its creative, not for review.
      throw AppError.conflict('This offer is waiting for its creative to change it.');
    }

    const [owner] = await tx
      .select({ userId: creativeProfiles.userId })
      .from(creativeProfiles)
      .where(eq(creativeProfiles.id, offer.profileId))
      .limit(1);
    const audit = {
      offerId: offer.id,
      profileId: offer.profileId,
      subjectUserId: owner?.userId ?? null,
      adminId: input.adminId,
      action: input.action === 'approve' ? ('approved' as const) : ('rejected' as const),
      reason: input.reason,
    };

    if (offer.status === 'pending_review') {
      if ((await offerVersions(tx, [offer.id])).get(offer.id) !== input.version) throw AppError.conflict(STALE);
      await tx
        .update(offers)
        .set(
          input.action === 'approve'
            ? { status: 'published', reviewedAt: now, rejectionReason: null, updatedAt: now }
            : { status: 'rejected', rejectionReason: input.reason, updatedAt: now },
        )
        .where(eq(offers.id, offer.id));
      await tx.insert(moderationActions).values(audit);
      return { ownerUserId: owner?.userId ?? null, discarded: [] as Array<{ key: string; bucket: string }> };
    }

    const [revision] = await tx.select().from(offerRevisions).where(eq(offerRevisions.offerId, offer.id)).limit(1);
    const pending = await tx
      .select({
        id: offerImages.id,
        kind: offerImages.kind,
        state: offerImages.state,
        objectKey: offerImages.objectKey,
        thumbKey: offerImages.thumbKey,
      })
      .from(offerImages)
      .where(and(eq(offerImages.offerId, offer.id), ne(offerImages.state, 'live')));
    if (!revision && pending.length === 0) {
      throw AppError.conflict('There is no change waiting on this offer.');
    }
    if ((await offerVersions(tx, [offer.id])).get(offer.id) !== input.version) throw AppError.conflict(STALE);

    const added = pending.filter((image) => image.state === 'pending_add');
    const removed = pending.filter((image) => image.state === 'pending_remove');

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
    // Files of a change that will never be shown; deleted once the rows are.
    // Each file is in its kind's bucket; a thumbnail or poster is in the image bucket.
    return {
      ownerUserId: owner?.userId ?? null,
      discarded: (input.action === 'approve' ? removed : added).flatMap((i) => [
        { key: i.objectKey, bucket: bucketFor(i.kind) },
        ...(i.thumbKey ? [{ key: i.thumbKey, bucket: bucketFor('image') }] : []),
      ]),
    };
  });

  await Promise.all(outcome.discarded.map(({ key, bucket }) => discardObject(key, bucket)));
  if (outcome.ownerUserId) {
    await notify({
      userId: outcome.ownerUserId,
      actorUserId: input.adminId,
      type: input.action === 'approve' ? 'offer_approved' : 'offer_rejected',
      targetId: input.id,
    });
  }
  return { ok: true as const };
}

async function reviewAvatar(input: ReviewInput) {
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
  // The pending key is the version: a new upload replaces it.
  if (user.pendingKey !== input.version) throw AppError.conflict(STALE);

  const now = new Date();
  // Each write is conditional on the key the administrator saw, so a photo
  // replaced in the meantime is neither published nor discarded.
  const stillPending = and(eq(users.id, user.id), eq(users.avatarPendingKey, input.version));

  if (input.action === 'approve') {
    const updated = await db
      .update(users)
      .set({ avatarKey: input.version, avatarPendingKey: null, avatarReviewedAt: now, avatarRejectionReason: null, updatedAt: now })
      .where(stillPending)
      .returning({ id: users.id });
    if (updated.length === 0) throw AppError.conflict(STALE);
    if (user.key && user.key !== input.version) await discardObject(user.key);
    return { ok: true as const };
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ avatarPendingKey: null, avatarRejectionReason: input.reason, updatedAt: now })
      .where(stillPending)
      .returning({ id: users.id });
    if (updated.length === 0) throw AppError.conflict(STALE);
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
  await discardObject(input.version);
  await notify({ userId: user.id, actorUserId: input.adminId, type: 'avatar_rejected', targetId: user.id });
  return { ok: true as const };
}

/**
 * A cover, as a profile photo (ADR 0061): approving swaps the waiting pair in
 * and discards the pair it replaces; rejecting keeps the approved cover,
 * stores the reason, discards the waiting pair and tells the creative. The
 * queue item's id is the creative profile.
 */
async function reviewCover(input: ReviewInput) {
  const [profile] = await db
    .select({
      id: creativeProfiles.id,
      userId: creativeProfiles.userId,
      key: creativeProfiles.coverKey,
      smallKey: creativeProfiles.coverSmallKey,
      pendingKey: creativeProfiles.coverPendingKey,
      pendingSmallKey: creativeProfiles.coverPendingSmallKey,
    })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.id, input.id))
    .limit(1);
  if (!profile?.pendingKey || !profile.pendingSmallKey) throw AppError.notFound('No cover is waiting for review.');
  // The pending key is the version: a new upload replaces it.
  if (profile.pendingKey !== input.version) throw AppError.conflict(STALE);
  const pendingSmallKey = profile.pendingSmallKey;

  const now = new Date();
  // Each write is conditional on the key the administrator saw, so a cover
  // replaced in the meantime is neither published nor discarded.
  const stillPending = and(eq(creativeProfiles.id, profile.id), eq(creativeProfiles.coverPendingKey, input.version));

  if (input.action === 'approve') {
    const updated = await db
      .update(creativeProfiles)
      .set({
        coverKey: input.version,
        coverSmallKey: pendingSmallKey,
        coverPendingKey: null,
        coverPendingSmallKey: null,
        coverRejectionReason: null,
        updatedAt: now,
      })
      .where(stillPending)
      .returning({ id: creativeProfiles.id });
    if (updated.length === 0) throw AppError.conflict(STALE);
    if (profile.key && profile.key !== input.version) await discardObject(profile.key);
    if (profile.smallKey && profile.smallKey !== pendingSmallKey) await discardObject(profile.smallKey);
    return { ok: true as const };
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(creativeProfiles)
      .set({ coverPendingKey: null, coverPendingSmallKey: null, coverRejectionReason: input.reason, updatedAt: now })
      .where(stillPending)
      .returning({ id: creativeProfiles.id });
    if (updated.length === 0) throw AppError.conflict(STALE);
    await tx.insert(moderationActions).values({
      profileId: profile.id,
      subjectUserId: profile.userId,
      adminId: input.adminId,
      action: 'media_removed',
      reason: input.reason,
    });
  });
  await discardObject(input.version);
  await discardObject(pendingSmallKey);
  await notify({ userId: profile.userId, actorUserId: input.adminId, type: 'cover_rejected', targetId: profile.id });
  return { ok: true as const };
}

async function reviewLogo(input: ReviewInput) {
  const [organization] = await db
    .select({ id: organizations.id, key: organizations.logoKey, pendingKey: organizations.logoPendingKey })
    .from(organizations)
    .where(eq(organizations.id, input.id))
    .limit(1);
  if (!organization?.pendingKey) throw AppError.notFound('No logo is waiting for review.');
  if (organization.pendingKey !== input.version) throw AppError.conflict(STALE);

  const now = new Date();
  const stillPending = and(eq(organizations.id, organization.id), eq(organizations.logoPendingKey, input.version));

  if (input.action === 'approve') {
    const updated = await db
      .update(organizations)
      .set({ logoKey: input.version, logoPendingKey: null, logoReviewedAt: now, logoRejectionReason: null, updatedAt: now })
      .where(stillPending)
      .returning({ id: organizations.id });
    if (updated.length === 0) throw AppError.conflict(STALE);
    if (organization.key && organization.key !== input.version) await discardObject(organization.key);
    return { ok: true as const };
  }

  const [founder] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.role, 'founder')))
    .limit(1);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(organizations)
      .set({ logoPendingKey: null, logoRejectionReason: input.reason, updatedAt: now })
      .where(stillPending)
      .returning({ id: organizations.id });
    if (updated.length === 0) throw AppError.conflict(STALE);
    await tx.insert(moderationActions).values({
      organizationId: organization.id,
      subjectUserId: founder?.userId ?? null,
      adminId: input.adminId,
      action: 'media_removed',
      reason: input.reason,
    });
  });
  await discardObject(input.version);
  // The founder answers for the page, as for the organisation's own review.
  if (founder) {
    await notify({ userId: founder.userId, actorUserId: input.adminId, type: 'logo_rejected', targetId: organization.id });
  }
  return { ok: true as const };
}
