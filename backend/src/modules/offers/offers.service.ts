import { and, asc, count, desc, eq, gt, inArray, max, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { MediaBadge, OfferMediaItem } from '../../contracts/media.js';
import type {
  OfferImage,
  PublishedOfferDetail,
  PublishedOfferListResult,
} from '../../contracts/offers.js';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  mediaUploads,
  municipalities,
  offerImages,
  offerRevisions,
  offers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { discardObject, isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { UPLOAD_LIMITS, bucketFor } from '../media/media.limits.js';
import { assertOwnOfferKey, consumeReservation, mediaError, verifyReservation } from '../media/media.service.js';
import { summaryForProfile } from '../ratings/ratings.service.js';
import type { AttachOfferMediaBody, ListOffersQuery, OfferBody, PatchOfferBody } from './offers.schema.js';

export type {
  ProfileOffer,
  PublishedOfferCard,
  PublishedOfferDetail,
} from '../../contracts/offers.js';
import { recordMiss } from '../search/search-misses.js';
import { offerSearch } from '../search/search-sql.js';

export const OFFER_LIMIT = 6;

type ProfileOwner = {
  id: string;
  status: 'draft' | 'pending_review' | 'published' | 'suspended';
};

async function requireOwnProfile(userId: string): Promise<ProfileOwner> {
  const [profile] = await db
    .select({ id: creativeProfiles.id, status: creativeProfiles.status })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    throw AppError.forbidden('A creative profile is required to manage offers');
  }
  return profile;
}

/**
 * The sub-domain an offer is filed under: one registered on the profile, and
 * in circulation. A creative keeps an archived sub-domain on their profile
 * (ADR 0049), but a new offer may not be filed under it, or it would appear in
 * the directory under a category no filter shows. The offer that already has
 * it (`keepSubdomainId`) may keep it through an edit.
 */
export async function assertRegisteredSubdomain(
  profileId: string,
  subdomainSlug: string,
  keepSubdomainId?: string,
) {
  const [subdomain] = await db
    .select({
      id: creativeSubdomains.id,
      name: creativeSubdomains.name,
      subdomainArchivedAt: creativeSubdomains.archivedAt,
      domainArchivedAt: creativeDomains.archivedAt,
    })
    .from(creativeProfileSubdomains)
    .innerJoin(
      creativeSubdomains,
      eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id),
    )
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(
      and(
        eq(creativeProfileSubdomains.profileId, profileId),
        eq(creativeSubdomains.slug, subdomainSlug),
      ),
    )
    .limit(1);

  if (!subdomain) {
    throw AppError.badRequest(
      `The sub-domain "${subdomainSlug}" is not registered on your profile.`,
      { field: 'subdomainSlug' },
    );
  }
  const archived = subdomain.subdomainArchivedAt !== null || subdomain.domainArchivedAt !== null;
  if (archived && subdomain.id !== keepSubdomainId) {
    throw AppError.badRequest(
      `The sub-domain "${subdomainSlug}" is no longer offered, so a new offer cannot be filed under it.`,
      { field: 'subdomainSlug' },
    );
  }
  return subdomain;
}

export function detectContactDetails(description: string | null | undefined): boolean {
  if (!description) return false;
  const phone = /(?:\+?63|0)?9(?:[\s().-]*\d){9}\b/i;
  const url = /\b(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|ph)(?:\/|\b))/i;
  const social = /\b(?:facebook|fb\.com|instagram|tiktok|telegram|whatsapp|viber|x\.com|twitter)\b|@[a-z0-9._]{2,}/i;
  return phone.test(description) || url.test(description) || social.test(description);
}

function imagePublic(row: { id: string; objectKey: string; thumbKey: string | null; sortOrder: number }) {
  return {
    id: row.id,
    url: publicUrl(row.objectKey),
    // images always have a thumbnail (offer_images_image_has_thumb)
    thumbUrl: publicUrl(row.thumbKey ?? row.objectKey),
    sortOrder: row.sortOrder,
  };
}

type ImageState = (typeof offerImages.$inferSelect)['state'];

/**
 * An offer's photos. The public sees what is approved: `live`, and
 * `pending_remove` — a photo the creative removed stays until the change is
 * reviewed. Its owner, and review, see everything, with each photo's state.
 */
async function imagesForOffers(
  offerIds: string[],
  options: { firstOnly?: boolean; audience?: 'public' | 'owner' } = {},
) {
  const result = new Map<string, Array<ReturnType<typeof imagePublic> & { state: ImageState }>>();
  if (offerIds.length === 0 || !isStorageConfigured()) return result;

  const visible = options.audience === 'owner'
    ? and(inArray(offerImages.offerId, offerIds), eq(offerImages.kind, 'image'))
    : and(
        inArray(offerImages.offerId, offerIds),
        eq(offerImages.kind, 'image'),
        ne(offerImages.state, 'pending_add'),
      );

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
    .where(visible)
    .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

  for (const row of rows) {
    const list = result.get(row.offerId) ?? [];
    if (options.firstOnly && list.length > 0) continue;
    list.push({ ...imagePublic(row), state: row.state });
    result.set(row.offerId, list);
  }
  return result;
}

type OwnOfferMediaItem = OfferMediaItem & { state: ImageState };

/**
 * An offer's audio, video and PDF (ADR 0046), with the same visibility as its
 * photos: the public does not see an item added in a change waiting for review.
 */
async function mediaForOffers(
  offerIds: string[],
  options: { audience: 'public' | 'owner' },
): Promise<Map<string, OwnOfferMediaItem[]>> {
  const result = new Map<string, OwnOfferMediaItem[]>();
  if (offerIds.length === 0 || !isStorageConfigured()) return result;

  const filters = [inArray(offerImages.offerId, offerIds), ne(offerImages.kind, 'image')];
  if (options.audience === 'public') filters.push(ne(offerImages.state, 'pending_add'));

  const rows = await db
    .select({
      id: offerImages.id,
      offerId: offerImages.offerId,
      kind: offerImages.kind,
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
      title: offerImages.title,
      mimeType: offerImages.mimeType,
      sizeBytes: offerImages.sizeBytes,
      durationSeconds: offerImages.durationSeconds,
      sortOrder: offerImages.sortOrder,
      state: offerImages.state,
    })
    .from(offerImages)
    .where(and(...filters))
    .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

  for (const row of rows) {
    if (row.kind === 'image') continue;
    const list = result.get(row.offerId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      url: publicUrl(row.objectKey, bucketFor(row.kind)),
      posterUrl: row.thumbKey ? publicUrl(row.thumbKey) : null,
      title: row.title,
      mimeType: row.mimeType ?? '',
      sizeBytes: row.sizeBytes ?? 0,
      durationSeconds: row.durationSeconds,
      sortOrder: row.sortOrder,
      state: row.state,
    });
    result.set(row.offerId, list);
  }
  return result;
}

/** Without the state: what a public response carries. */
function withoutState<T extends { state: ImageState }>(image: T): Omit<T, 'state'> {
  const { state: _state, ...rest } = image;
  return rest;
}

/** The first kind in the offer's order, how many of that kind, and the first one's length. */
function mediaBadgeFrom(media: readonly OfferMediaItem[]): MediaBadge | null {
  const first = media[0];
  if (!first) return null;
  return {
    kind: first.kind,
    count: media.filter((item) => item.kind === first.kind).length,
    durationSeconds: first.durationSeconds,
  };
}

/** The first video's poster in the shape of a photo. */
function posterFrom(media: readonly OfferMediaItem[]): OfferImage | null {
  const video = media.find((item) => item.kind === 'video' && item.posterUrl);
  if (!video?.posterUrl) return null;
  return { id: video.id, url: video.posterUrl, thumbUrl: video.posterUrl, sortOrder: video.sortOrder };
}

/** What each offer's card shows of its public audio, video and PDF: a badge, and a poster for want of a photo. */
export async function offerCardMedia(
  offerIds: string[],
): Promise<Map<string, { mediaBadge: MediaBadge | null; poster: OfferImage | null }>> {
  const media = await mediaForOffers(offerIds, { audience: 'public' });
  const result = new Map<string, { mediaBadge: MediaBadge | null; poster: OfferImage | null }>();
  for (const [offerId, items] of media) {
    result.set(offerId, { mediaBadge: mediaBadgeFrom(items), poster: posterFrom(items) });
  }
  return result;
}

/** Each offer's first public video poster, the cover of a card whose offer has no photo. */
export async function coverPoster(offerIds: string[]): Promise<Map<string, OfferImage>> {
  const result = new Map<string, OfferImage>();
  for (const [offerId, { poster }] of await offerCardMedia(offerIds)) {
    if (poster) result.set(offerId, poster);
  }
  return result;
}

/**
 * The creative's own offers, with where each stands in review (ADR 0058): its
 * status and reason, a change waiting beside a published offer, why the last
 * change was not approved, and every photo with its state.
 */
export async function listMine(userId: string) {
  const profile = await requireOwnProfile(userId);
  const revisionSubdomains = alias(creativeSubdomains, 'revision_subdomains');
  const rows = await db
    .select({
      id: offers.id,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      sortOrder: offers.sortOrder,
      status: offers.status,
      rejectionReason: offers.rejectionReason,
      revisionRejectionReason: offers.revisionRejectionReason,
      flaggedAt: offers.flaggedAt,
      reviewedAt: offers.reviewedAt,
      createdAt: offers.createdAt,
      updatedAt: offers.updatedAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      subdomainSingularName: creativeSubdomains.singularName,
      domainName: creativeDomains.name,
      revisionTitle: offerRevisions.title,
      revisionDescription: offerRevisions.description,
      revisionPriceMinCentavos: offerRevisions.priceMinCentavos,
      revisionPriceMaxCentavos: offerRevisions.priceMaxCentavos,
      revisionSubmittedAt: offerRevisions.submittedAt,
      revisionSubdomainSlug: revisionSubdomains.slug,
      revisionSubdomainName: revisionSubdomains.name,
      revisionSubdomainSingularName: revisionSubdomains.singularName,
    })
    .from(offers)
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .leftJoin(offerRevisions, eq(offerRevisions.offerId, offers.id))
    .leftJoin(revisionSubdomains, eq(offerRevisions.subdomainId, revisionSubdomains.id))
    .where(eq(offers.profileId, profile.id))
    .orderBy(asc(offers.sortOrder), asc(offers.createdAt));

  const offerIds = rows.map((row) => row.id);
  const [imageMap, mediaMap] = await Promise.all([
    imagesForOffers(offerIds, { audience: 'owner' }),
    mediaForOffers(offerIds, { audience: 'owner' }),
  ]);
  return rows.map((row) => {
    const images = imageMap.get(row.id) ?? [];
    const media = mediaMap.get(row.id) ?? [];
    const hasRevision = row.revisionTitle !== null;
    const imagesPending = [...images, ...media].some((item) => item.state !== 'live');
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      priceMinCentavos: row.priceMinCentavos,
      priceMaxCentavos: row.priceMaxCentavos,
      sortOrder: row.sortOrder,
      subdomainSlug: row.subdomainSlug,
      subdomainName: row.subdomainName,
      subdomainSingularName: row.subdomainSingularName,
      domainName: row.domainName,
      status: row.status,
      rejectionReason: row.rejectionReason,
      revisionRejectionReason: row.revisionRejectionReason,
      // A change to a published offer that is waiting for review — text, photos
      // or both. Null when there is none.
      pendingChanges:
        hasRevision || imagesPending
          ? {
              title: row.revisionTitle ?? row.title,
              description: hasRevision ? row.revisionDescription : row.description,
              priceMinCentavos: hasRevision ? row.revisionPriceMinCentavos : row.priceMinCentavos,
              priceMaxCentavos: hasRevision ? row.revisionPriceMaxCentavos : row.priceMaxCentavos,
              subdomainSlug: row.revisionSubdomainSlug ?? row.subdomainSlug,
              subdomainName: row.revisionSubdomainName ?? row.subdomainName,
              subdomainSingularName: row.revisionSubdomainSingularName ?? row.subdomainSingularName,
              submittedAt: row.revisionSubmittedAt?.toISOString() ?? null,
            }
          : null,
      flaggedAt: row.flaggedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      images,
      media,
    };
  });
}

export async function createOffer(userId: string, input: OfferBody) {
  const profile = await requireOwnProfile(userId);
  const subdomain = await assertRegisteredSubdomain(profile.id, input.subdomainSlug);

  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${profile.id}))`);

    const [tally] = await tx
      .select({ total: count() })
      .from(offers)
      .where(eq(offers.profileId, profile.id));
    if ((tally?.total ?? 0) >= OFFER_LIMIT) {
      throw AppError.badRequest(`A profile can have at most ${OFFER_LIMIT} offers`);
    }

    const [peak] = await tx
      .select({ maxOrder: max(offers.sortOrder) })
      .from(offers)
      .where(eq(offers.profileId, profile.id));
    // Waits for review before anyone else sees it (ADR 0058): status defaults
    // to pending_review.
    const [created] = await tx
      .insert(offers)
      .values({
        profileId: profile.id,
        subdomainId: subdomain.id,
        title: input.title,
        description: input.description ?? null,
        priceMinCentavos: input.priceMinCentavos ?? null,
        priceMaxCentavos: input.priceMaxCentavos ?? null,
        sortOrder: (peak?.maxOrder ?? -1) + 1,
        flaggedAt: detectContactDetails(input.description) ? new Date() : null,
      })
      .returning({ id: offers.id });
    return created!.id;
  });

  return (await listMine(userId)).find((offer) => offer.id === id)!;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The offer, locked until the transaction ends. Every owner write that
 * decides by the offer's status takes this lock, and so does the review
 * action (admin/content-review.service): an approval can never land between
 * reading the status and writing, which would put an unreviewed edit or
 * photo straight onto a published offer.
 */
async function lockOwnOffer(tx: Tx, profileId: string, offerId: string) {
  const [current] = await tx
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profileId)))
    .for('update');
  if (!current) throw AppError.notFound('No such offer.');
  return current;
}

async function ownOffer(profileId: string, offerId: string) {
  const [current] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profileId)))
    .limit(1);
  if (!current) throw AppError.notFound('No such offer.');
  return current;
}

/**
 * An edit, by where the offer stands (ADR 0058):
 *
 * - **Not yet published** (waiting, or rejected): the offer is hidden anyway,
 *   so the edit applies to it directly. A rejected offer goes back to review.
 * - **Published**: the public keeps seeing the approved version. The edit is
 *   kept beside it in `offer_revisions` until an administrator approves it
 *   (and it replaces the published one) or rejects it (and it is dropped).
 *   An edit that brings everything back to the published version withdraws
 *   the change.
 */
export async function updateOffer(userId: string, offerId: string, input: PatchOfferBody) {
  const profile = await requireOwnProfile(userId);
  const before = await ownOffer(profile.id, offerId);
  // Checked before the lock: it reads the taxonomy, not the offer's state.
  const chosenSubdomainId = input.subdomainSlug !== undefined
    ? (await assertRegisteredSubdomain(profile.id, input.subdomainSlug, before.subdomainId)).id
    : undefined;

  await db.transaction(async (tx) => {
    const current = await lockOwnOffer(tx, profile.id, offerId);
    const [revision] = current.status === 'published'
      ? await tx.select().from(offerRevisions).where(eq(offerRevisions.offerId, offerId)).limit(1)
      : [];
    await applyOfferEdit(tx, current, revision, chosenSubdomainId, input);
  });

  return (await listMine(userId)).find((offer) => offer.id === offerId)!;
}

async function applyOfferEdit(
  tx: Tx,
  current: typeof offers.$inferSelect,
  revision: typeof offerRevisions.$inferSelect | undefined,
  chosenSubdomainId: string | undefined,
  input: PatchOfferBody,
) {
  const offerId = current.id;
  // An edit builds on the change already waiting, if there is one.
  const base = revision ?? current;
  const subdomainId = chosenSubdomainId ?? base.subdomainId;
  const next = {
    subdomainId,
    title: input.title !== undefined ? input.title : base.title,
    description: input.description !== undefined ? input.description ?? null : base.description,
    priceMinCentavos: input.priceMinCentavos !== undefined ? input.priceMinCentavos : base.priceMinCentavos,
    priceMaxCentavos: input.priceMaxCentavos !== undefined ? input.priceMaxCentavos : base.priceMaxCentavos,
  };
  if (
    next.priceMinCentavos != null
    && next.priceMaxCentavos != null
    && next.priceMinCentavos > next.priceMaxCentavos
  ) {
    throw AppError.badRequest('Maximum must be at least the minimum', {
      field: 'priceMaxCentavos',
    });
  }
  const now = new Date();
  const flaggedAt = detectContactDetails(next.description) ? now : null;

  if (current.status !== 'published') {
    await tx
      .update(offers)
      .set({
        ...next,
        flaggedAt,
        ...(current.status === 'rejected' ? { status: 'pending_review' as const, rejectionReason: null } : {}),
        updatedAt: now,
      })
      .where(eq(offers.id, offerId));
    return;
  }

  const sameAsPublished =
    next.subdomainId === current.subdomainId
    && next.title === current.title
    && next.description === current.description
    && next.priceMinCentavos === current.priceMinCentavos
    && next.priceMaxCentavos === current.priceMaxCentavos;

  if (sameAsPublished) {
    await tx.delete(offerRevisions).where(eq(offerRevisions.offerId, offerId));
  } else {
    await tx
      .insert(offerRevisions)
      .values({ offerId, ...next, flaggedAt, submittedAt: now })
      .onConflictDoUpdate({
        target: offerRevisions.offerId,
        set: { ...next, flaggedAt, submittedAt: now },
      });
  }
  // A new change supersedes the reason the last one was declined.
  await tx
    .update(offers)
    .set({ revisionRejectionReason: null, updatedAt: now })
    .where(eq(offers.id, offerId));
}

export async function deleteOffer(userId: string, offerId: string) {
  const profile = await requireOwnProfile(userId);
  const rows = await db
    .select({ kind: offerImages.kind, objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
    .from(offers)
    .leftJoin(offerImages, eq(offers.id, offerImages.offerId))
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)));
  if (rows.length === 0) throw AppError.notFound('No such offer.');

  const [deleted] = await db
    .delete(offers)
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)))
    .returning({ id: offers.id });
  if (!deleted) throw AppError.notFound('No such offer.');

  // Only once the rows are certainly gone. Deleting objects first leaves rows
  // pointing at nothing if the delete fails, and a broken image cannot be
  // recovered — whereas an object with no row is just an orphan the prune
  // script collects.
  // best-effort; media:prune catches any miss
  await Promise.all(rows.flatMap((row) => row.objectKey && row.kind
    ? [
        discardObject(row.objectKey, bucketFor(row.kind)),
        ...(row.thumbKey ? [discardObject(row.thumbKey)] : []),
      ]
    : []));

  return { ok: true as const };
}

/** Order is the creative's to set, and changes no content: it applies at once. */
export async function reorderOffers(userId: string, ids: string[]) {
  const profile = await requireOwnProfile(userId);
  const existing = await db
    .select({ id: offers.id })
    .from(offers)
    .where(eq(offers.profileId, profile.id));
  const existingIds = new Set(existing.map((row) => row.id));
  if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
    throw AppError.notFound('No such offer.');
  }

  await db.transaction(async (tx) => {
    for (const [sortOrder, id] of ids.entries()) {
      await tx
        .update(offers)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(offers.id, id), eq(offers.profileId, profile.id)));
    }
  });
  return listMine(userId);
}

/**
 * A photo added to a published offer waits as `pending_add` until the change
 * is reviewed; added to one that is not yet published, it is simply part of
 * it. A rejected offer goes back to review either way. The limit counts every
 * photo the offer would have once the change is approved.
 */
export async function addOfferImage(
  userId: string,
  offerId: string,
  input: { objectKey: string; thumbKey: string },
) {
  const profile = await requireOwnProfile(userId);
  await ownOffer(profile.id, offerId);

  assertOwnOfferKey(profile.id, input.objectKey);
  assertOwnOfferKey(profile.id, input.thumbKey);

  const row = await db.transaction(async (tx) => {
    // The profile's lock first, as attachOfferMedia takes it, so an abandon of
    // these keys waits for the attach (issue #115).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${profile.id}))`);
    // Also serialises concurrent uploads, so the limit holds.
    const current = await lockOwnOffer(tx, profile.id, offerId);
    const imageLimit = UPLOAD_LIMITS.offer.image.perTarget;
    const [tally] = await tx
      .select({ total: count() })
      .from(offerImages)
      .where(
        and(
          eq(offerImages.offerId, offerId),
          eq(offerImages.kind, 'image'),
          ne(offerImages.state, 'pending_remove'),
        ),
      );
    if ((tally?.total ?? 0) >= imageLimit) {
      throw AppError.badRequest(`An offer can have at most ${imageLimit} images`);
    }
    const [peak] = await tx
      .select({ maxOrder: max(offerImages.sortOrder) })
      .from(offerImages)
      .where(eq(offerImages.offerId, offerId));
    const [created] = await tx
      .insert(offerImages)
      .values({
        offerId,
        objectKey: input.objectKey,
        thumbKey: input.thumbKey,
        sortOrder: (peak?.maxOrder ?? -1) + 1,
        state: current.status === 'published' ? 'pending_add' : 'live',
      })
      .returning();
    await tx
      .update(offers)
      .set(
        current.status === 'published'
          ? { revisionRejectionReason: null, updatedAt: new Date() }
          : current.status === 'rejected'
            ? { status: 'pending_review', rejectionReason: null, updatedAt: new Date() }
            : { updatedAt: new Date() },
      )
      .where(eq(offers.id, offerId));
    return created!;
  });
  return imagePublic(row);
}

/**
 * Attaches an upload the pipeline has verified (ADR 0046): an image, audio,
 * video or PDF. Like a photo, it waits as `pending_add` on a published offer,
 * and a rejected offer goes back to review. The limit is counted again under
 * the offer's lock, since the offer may have filled up since the ticket.
 */
export async function attachOfferMedia(userId: string, offerId: string, body: AttachOfferMediaBody) {
  const profile = await requireOwnProfile(userId);
  await ownOffer(profile.id, offerId);

  const verified = await verifyReservation(userId, body.reservationId);
  if (verified.destination !== 'offer' || verified.offerId !== offerId) {
    throw AppError.conflict('That upload belongs to a different offer.');
  }

  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${profile.id}))`);
    const current = await lockOwnOffer(tx, profile.id, offerId);

    const limit = UPLOAD_LIMITS.offer[verified.kind].perTarget;
    const [recorded] = await tx
      .select({ total: count() })
      .from(offerImages)
      .where(
        and(
          eq(offerImages.offerId, offerId),
          eq(offerImages.kind, verified.kind),
          ne(offerImages.state, 'pending_remove'),
        ),
      );
    const [held] = await tx
      .select({ total: count() })
      .from(mediaUploads)
      .where(
        and(
          eq(mediaUploads.offerId, offerId),
          eq(mediaUploads.kind, verified.kind),
          gt(mediaUploads.expiresAt, new Date()),
          ne(mediaUploads.id, verified.reservationId),
        ),
      );
    if ((recorded?.total ?? 0) + (held?.total ?? 0) >= limit) {
      throw mediaError(409, 'MEDIA_LIMIT_REACHED', { perTarget: limit });
    }

    const [peak] = await tx
      .select({ maxOrder: max(offerImages.sortOrder) })
      .from(offerImages)
      .where(eq(offerImages.offerId, offerId));
    const [row] = await tx
      .insert(offerImages)
      .values({
        offerId,
        kind: verified.kind,
        objectKey: verified.objectKey,
        thumbKey: verified.thumbKey,
        mimeType: verified.mimeType,
        sizeBytes: verified.sizeBytes,
        durationSeconds: verified.durationSeconds,
        title: body.title ?? null,
        sortOrder: (peak?.maxOrder ?? -1) + 1,
        state: current.status === 'published' ? 'pending_add' : 'live',
      })
      .returning({ id: offerImages.id, kind: offerImages.kind });
    await consumeReservation(tx, verified.reservationId);
    await tx
      .update(offers)
      .set(
        current.status === 'published'
          ? { revisionRejectionReason: null, updatedAt: new Date() }
          : current.status === 'rejected'
            ? { status: 'pending_review', rejectionReason: null, updatedAt: new Date() }
            : { updatedAt: new Date() },
      )
      .where(eq(offers.id, offerId));
    return row!;
  });
  return { id: created.id, kind: created.kind };
}

/**
 * Removing a photo. From a published offer, an approved photo stays public as
 * `pending_remove` until the change is reviewed; a photo that was itself only
 * waiting is withdrawn at once. From an offer not yet published it simply
 * goes.
 */
export async function deleteOfferImage(userId: string, imageId: string) {
  const profile = await requireOwnProfile(userId);
  const [row] = await db
    .select({
      id: offerImages.id,
      offerId: offerImages.offerId,
      kind: offerImages.kind,
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
      state: offerImages.state,
    })
    .from(offerImages)
    .innerJoin(offers, eq(offerImages.offerId, offers.id))
    .where(and(eq(offerImages.id, imageId), eq(offers.profileId, profile.id)))
    .limit(1);
  if (!row) throw AppError.notFound('No such offer image.');

  const deleted = await db.transaction(async (tx) => {
    const offer = await lockOwnOffer(tx, profile.id, row.offerId);
    const [image] = await tx
      .select({ state: offerImages.state })
      .from(offerImages)
      .where(eq(offerImages.id, row.id))
      .limit(1);
    if (!image) throw AppError.notFound('No such offer image.');

    if (offer.status === 'published' && image.state !== 'pending_add') {
      if (image.state === 'live') {
        await tx.update(offerImages).set({ state: 'pending_remove' }).where(eq(offerImages.id, row.id));
        await tx
          .update(offers)
          .set({ revisionRejectionReason: null, updatedAt: new Date() })
          .where(eq(offers.id, row.offerId));
      }
      return false;
    }

    await tx.delete(offerImages).where(eq(offerImages.id, row.id));
    if (offer.status === 'rejected') {
      await tx
        .update(offers)
        .set({ status: 'pending_review', rejectionReason: null, updatedAt: new Date() })
        .where(eq(offers.id, row.offerId));
    }
    return true;
  });
  if (!deleted) return { ok: true as const };

  // After the row is gone — see deleteOffer.
  // best-effort; media:prune catches any miss
  await Promise.all([
    discardObject(row.objectKey, bucketFor(row.kind)),
    ...(row.thumbKey ? [discardObject(row.thumbKey)] : []),
  ]);

  return { ok: true as const };
}

export async function listPublishedOffers(
  options: ListOffersQuery & { viewerMunicipalityId?: string | null },
): Promise<PublishedOfferListResult> {
  const offset = (options.page - 1) * options.limit;
  // Offers leave the directory with a suspended account — see profiles.service
  // — and only an approved offer is on it at all (ADR 0058).
  const filters = [
    eq(offers.status, 'published'),
    eq(creativeProfiles.status, 'published'),
    eq(users.status, 'active'),
  ];
  if (options.domain) filters.push(eq(creativeDomains.slug, options.domain));
  if (options.subdomain) filters.push(eq(creativeSubdomains.slug, options.subdomain));
  if (options.municipality) filters.push(eq(municipalities.slug, options.municipality));

  // Budget is pesos in the query; compare in centavos. Overlap with the offer's
  // range; "Price on request" (both null) is excluded when a budget is set.
  const budgetMinCentavos = options.budgetMin != null ? options.budgetMin * 100 : null;
  const budgetMaxCentavos = options.budgetMax != null ? options.budgetMax * 100 : null;
  if (budgetMinCentavos != null || budgetMaxCentavos != null) {
    filters.push(
      sql`(${offers.priceMinCentavos} is not null or ${offers.priceMaxCentavos} is not null)`,
    );
    if (budgetMinCentavos != null) {
      filters.push(
        sql`coalesce(${offers.priceMaxCentavos}, ${offers.priceMinCentavos}) >= ${budgetMinCentavos}`,
      );
    }
    if (budgetMaxCentavos != null) {
      filters.push(
        sql`coalesce(${offers.priceMinCentavos}, ${offers.priceMaxCentavos}) <= ${budgetMaxCentavos}`,
      );
    }
  }

  // Search narrows and ranks, but never outranks nearby-first (ADR 0003).
  const search = options.q ? offerSearch(options.q) : null;
  if (search) filters.push(search.where);

  const where = and(...filters);
  const order = [
    ...(options.viewerMunicipalityId
      ? [desc(sql`${users.municipalityId} = ${options.viewerMunicipalityId}`)]
      : []),
    ...(search?.orderBy ?? []),
    desc(offers.createdAt),
    asc(offers.id),
  ];

  const rows = await db
    .select({
      id: offers.id,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      createdAt: offers.createdAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      subdomainSingularName: creativeSubdomains.singularName,
      domainName: creativeDomains.name,
      creativeSlug: creativeProfiles.slug,
      creativeDisplayName: creativeProfiles.displayName,
      municipality: municipalities.name,
      municipalityId: users.municipalityId,
      avatarKey: users.avatarKey,
    })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(where)
    .orderBy(...order)
    .limit(options.limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(where);
  // Nothing matched the first page of a search: count it (issue #24).
  if (options.q && options.page === 1 && (totals?.total ?? 0) === 0) {
    void recordMiss(options.q, 'offers');
  }
  const offerIds = rows.map((row) => row.id);
  const [imageMap, mediaMap] = await Promise.all([
    imagesForOffers(offerIds, { firstOnly: true }),
    offerCardMedia(offerIds),
  ]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priceMinCentavos: row.priceMinCentavos,
      priceMaxCentavos: row.priceMaxCentavos,
      createdAt: row.createdAt.toISOString(),
      subdomain: {
        slug: row.subdomainSlug,
        name: row.subdomainName,
        singularName: row.subdomainSingularName,
        domain: row.domainName,
      },
      image: (() => {
        const first = imageMap.get(row.id)?.[0];
        return first ? withoutState(first) : (mediaMap.get(row.id)?.poster ?? null);
      })(),
      mediaBadge: mediaMap.get(row.id)?.mediaBadge ?? null,
      creative: {
        slug: row.creativeSlug,
        displayName: row.creativeDisplayName,
        municipality: row.municipality,
        avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
        ...(options.viewerMunicipalityId
          ? { isNearby: row.municipalityId === options.viewerMunicipalityId }
          : {}),
      },
    })),
    total: totals?.total ?? 0,
  };
}

export async function getPublishedOfferById(
  offerId: string,
  viewerMunicipalityId?: string | null,
): Promise<PublishedOfferDetail> {
  const [row] = await db
    .select({
      id: offers.id,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      createdAt: offers.createdAt,
      updatedAt: offers.updatedAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      subdomainSingularName: creativeSubdomains.singularName,
      domainName: creativeDomains.name,
      creativeSlug: creativeProfiles.slug,
      creativeDisplayName: creativeProfiles.displayName,
      municipality: municipalities.name,
      municipalityId: users.municipalityId,
      avatarKey: users.avatarKey,
    })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(
      and(
        eq(offers.id, offerId),
        eq(offers.status, 'published'),
        eq(creativeProfiles.status, 'published'),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) throw AppError.notFound('No such offer.');

  // One offer means one creative, so this is a single extra aggregate rather
  // than a query per row — which is exactly why the directory card does not
  // carry a summary (plan 0038).
  const [imageMap, mediaMap, rating] = await Promise.all([
    imagesForOffers([row.id]),
    mediaForOffers([row.id], { audience: 'public' }),
    summaryForProfile(row.creativeSlug),
  ]);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceMinCentavos: row.priceMinCentavos,
    priceMaxCentavos: row.priceMaxCentavos,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subdomain: {
      slug: row.subdomainSlug,
      name: row.subdomainName,
      singularName: row.subdomainSingularName,
      domain: row.domainName,
    },
    images: (imageMap.get(row.id) ?? []).map(withoutState),
    media: (mediaMap.get(row.id) ?? []).map(withoutState),
    creative: {
      slug: row.creativeSlug,
      displayName: row.creativeDisplayName,
      municipality: row.municipality,
      avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
      rating,
      ...(viewerMunicipalityId
        ? { isNearby: row.municipalityId === viewerMunicipalityId }
        : {}),
    },
  };
}
