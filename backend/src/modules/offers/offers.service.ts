import { and, asc, count, desc, eq, inArray, max, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  PublishedOfferDetail,
  PublishedOfferListResult,
} from '../../contracts/offers.js';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  municipalities,
  offerImages,
  offerRevisions,
  offers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { deleteObject, isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { assertOwnOfferKey } from '../media/media.service.js';
import { summaryForProfile } from '../ratings/ratings.service.js';
import type { ListOffersQuery, OfferBody, PatchOfferBody } from './offers.schema.js';

export type {
  ProfileOffer,
  PublishedOfferCard,
  PublishedOfferDetail,
} from '../../contracts/offers.js';
import { offerSearch } from '../search/search-sql.js';

export const OFFER_LIMIT = 6;
export const OFFER_IMAGE_LIMIT = 4;

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

function imagePublic(row: { id: string; objectKey: string; thumbKey: string; sortOrder: number }) {
  return {
    id: row.id,
    url: publicUrl(row.objectKey),
    thumbUrl: publicUrl(row.thumbKey),
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
    ? inArray(offerImages.offerId, offerIds)
    : and(inArray(offerImages.offerId, offerIds), ne(offerImages.state, 'pending_add'));

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

/** Without the state: what a public response carries. */
function withoutState<T extends { state: ImageState }>(image: T): Omit<T, 'state'> {
  const { state: _state, ...rest } = image;
  return rest;
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

  const imageMap = await imagesForOffers(rows.map((row) => row.id), { audience: 'owner' });
  return rows.map((row) => {
    const images = imageMap.get(row.id) ?? [];
    const hasRevision = row.revisionTitle !== null;
    const imagesPending = images.some((image) => image.state !== 'live');
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
    .select({ objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
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
  await Promise.all(rows.flatMap((row) => row.objectKey
    ? [deleteObject(row.objectKey), deleteObject(row.thumbKey!)]
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
    // Also serialises concurrent uploads, so the limit holds.
    const current = await lockOwnOffer(tx, profile.id, offerId);
    const [tally] = await tx
      .select({ total: count() })
      .from(offerImages)
      .where(and(eq(offerImages.offerId, offerId), ne(offerImages.state, 'pending_remove')));
    if ((tally?.total ?? 0) >= OFFER_IMAGE_LIMIT) {
      throw AppError.badRequest(`An offer can have at most ${OFFER_IMAGE_LIMIT} images`);
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
  await Promise.all([deleteObject(row.objectKey), deleteObject(row.thumbKey)]);

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
  const imageMap = await imagesForOffers(rows.map((row) => row.id), { firstOnly: true });

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
        return first ? withoutState(first) : null;
      })(),
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
  const [imageMap, rating] = await Promise.all([
    imagesForOffers([row.id]),
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
