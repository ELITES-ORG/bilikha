import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
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
  offers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { deleteObject, isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { assertOwnOfferKey } from '../media/media.service.js';
import type { ListOffersQuery, OfferBody, PatchOfferBody } from './offers.schema.js';

export type {
  ProfileOffer,
  PublishedOfferCard,
  PublishedOfferDetail,
} from '../../contracts/offers.js';

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

export async function assertRegisteredSubdomain(profileId: string, subdomainSlug: string) {
  const [subdomain] = await db
    .select({ id: creativeSubdomains.id, name: creativeSubdomains.name })
    .from(creativeProfileSubdomains)
    .innerJoin(
      creativeSubdomains,
      eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id),
    )
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

async function imagesForOffers(offerIds: string[], firstOnly = false) {
  const result = new Map<string, ReturnType<typeof imagePublic>[]>();
  if (offerIds.length === 0 || !isStorageConfigured()) return result;

  const rows = await db
    .select({
      id: offerImages.id,
      offerId: offerImages.offerId,
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
      sortOrder: offerImages.sortOrder,
    })
    .from(offerImages)
    .where(inArray(offerImages.offerId, offerIds))
    .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

  for (const row of rows) {
    const list = result.get(row.offerId) ?? [];
    if (firstOnly && list.length > 0) continue;
    list.push(imagePublic(row));
    result.set(row.offerId, list);
  }
  return result;
}

export async function listMine(userId: string) {
  const profile = await requireOwnProfile(userId);
  const rows = await db
    .select({
      id: offers.id,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      sortOrder: offers.sortOrder,
      flaggedAt: offers.flaggedAt,
      reviewedAt: offers.reviewedAt,
      createdAt: offers.createdAt,
      updatedAt: offers.updatedAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      domainName: creativeDomains.name,
    })
    .from(offers)
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(eq(offers.profileId, profile.id))
    .orderBy(asc(offers.sortOrder), asc(offers.createdAt));

  const imageMap = await imagesForOffers(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    flaggedAt: row.flaggedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    images: imageMap.get(row.id) ?? [],
  }));
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
    const now = new Date();
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
        flaggedAt: detectContactDetails(input.description) ? now : null,
      })
      .returning({ id: offers.id });

    if (profile.status === 'published') {
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: now, updatedAt: now })
        .where(eq(creativeProfiles.id, profile.id));
    }
    return created!.id;
  });

  return (await listMine(userId)).find((offer) => offer.id === id)!;
}

export async function updateOffer(userId: string, offerId: string, input: PatchOfferBody) {
  const profile = await requireOwnProfile(userId);
  const [current] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)))
    .limit(1);
  if (!current) throw AppError.notFound('No such offer.');

  let subdomainId = current.subdomainId;
  if (input.subdomainSlug !== undefined) {
    subdomainId = (await assertRegisteredSubdomain(profile.id, input.subdomainSlug)).id;
  }

  const title = input.title !== undefined ? input.title : current.title;
  const description = input.description !== undefined ? input.description ?? null : current.description;
  const priceMinCentavos = input.priceMinCentavos !== undefined
    ? input.priceMinCentavos
    : current.priceMinCentavos;
  const priceMaxCentavos = input.priceMaxCentavos !== undefined
    ? input.priceMaxCentavos
    : current.priceMaxCentavos;
  if (
    priceMinCentavos != null
    && priceMaxCentavos != null
    && priceMinCentavos > priceMaxCentavos
  ) {
    throw AppError.badRequest('Maximum must be at least the minimum', {
      field: 'priceMaxCentavos',
    });
  }

  // Subdomain-only edits stay reviewed; title / description / price re-enter the queue.
  const contentChanged =
    title !== current.title
    || description !== current.description
    || priceMinCentavos !== current.priceMinCentavos
    || priceMaxCentavos !== current.priceMaxCentavos;

  await db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(offers)
      .set({
        title,
        subdomainId,
        description,
        priceMinCentavos,
        priceMaxCentavos,
        flaggedAt: detectContactDetails(description) ? now : null,
        reviewedAt: contentChanged ? null : current.reviewedAt,
        updatedAt: now,
      })
      .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)))
      .returning({ id: offers.id });
    if (!updated) throw AppError.notFound('No such offer.');

    if (profile.status === 'published') {
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: now, updatedAt: now })
        .where(eq(creativeProfiles.id, profile.id));
    }
  });

  return (await listMine(userId)).find((offer) => offer.id === offerId)!;
}

export async function deleteOffer(userId: string, offerId: string) {
  const profile = await requireOwnProfile(userId);
  const rows = await db
    .select({ objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
    .from(offers)
    .leftJoin(offerImages, eq(offers.id, offerImages.offerId))
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)));
  if (rows.length === 0) throw AppError.notFound('No such offer.');

  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(offers)
      .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)))
      .returning({ id: offers.id });
    if (!deleted) throw AppError.notFound('No such offer.');
    if (profile.status === 'published') {
      const now = new Date();
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: now, updatedAt: now })
        .where(eq(creativeProfiles.id, profile.id));
    }
  });

  // Only once the rows are certainly gone. Deleting objects first leaves rows
  // pointing at nothing if the transaction fails, and a broken image cannot be
  // recovered — whereas an object with no row is just an orphan the prune
  // script collects.
  await Promise.all(rows.flatMap((row) => row.objectKey
    ? [deleteObject(row.objectKey), deleteObject(row.thumbKey!)]
    : []));

  return { ok: true as const };
}

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
    if (profile.status === 'published') {
      const now = new Date();
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: now, updatedAt: now })
        .where(eq(creativeProfiles.id, profile.id));
    }
  });
  return listMine(userId);
}

export async function addOfferImage(
  userId: string,
  offerId: string,
  input: { objectKey: string; thumbKey: string },
) {
  const profile = await requireOwnProfile(userId);
  const [owned] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.profileId, profile.id)))
    .limit(1);
  if (!owned) throw AppError.notFound('No such offer.');

  assertOwnOfferKey(profile.id, input.objectKey);
  assertOwnOfferKey(profile.id, input.thumbKey);

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${offerId}))`);
    const [tally] = await tx
      .select({ total: count() })
      .from(offerImages)
      .where(eq(offerImages.offerId, offerId));
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
      })
      .returning();
    if (profile.status === 'published') {
      const now = new Date();
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: now, updatedAt: now })
        .where(eq(creativeProfiles.id, profile.id));
    }
    return created!;
  });
  return imagePublic(row);
}

export async function deleteOfferImage(userId: string, imageId: string) {
  const profile = await requireOwnProfile(userId);
  const [row] = await db
    .select({
      id: offerImages.id,
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
    })
    .from(offerImages)
    .innerJoin(offers, eq(offerImages.offerId, offers.id))
    .where(and(eq(offerImages.id, imageId), eq(offers.profileId, profile.id)))
    .limit(1);
  if (!row) throw AppError.notFound('No such offer image.');

  await db.transaction(async (tx) => {
    await tx.delete(offerImages).where(eq(offerImages.id, row.id));
    if (profile.status === 'published') {
      const now = new Date();
      await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: now, updatedAt: now })
        .where(eq(creativeProfiles.id, profile.id));
    }
  });

  // After the row is gone — see deleteOffer.
  await Promise.all([deleteObject(row.objectKey), deleteObject(row.thumbKey)]);

  return { ok: true as const };
}

export async function listPublishedOffers(
  options: ListOffersQuery & { viewerMunicipalityId?: string | null },
): Promise<PublishedOfferListResult> {
  const offset = (options.page - 1) * options.limit;
  // Offers leave the directory with a suspended account — see profiles.service.
  const filters = [eq(creativeProfiles.status, 'published'), eq(users.status, 'active')];
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

  const where = and(...filters);
  const order = options.viewerMunicipalityId
    ? [
        desc(sql`${users.municipalityId} = ${options.viewerMunicipalityId}`),
        desc(offers.createdAt),
        asc(offers.id),
      ]
    : [desc(offers.createdAt), asc(offers.id)];

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
  const imageMap = await imagesForOffers(rows.map((row) => row.id), true);

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
        domain: row.domainName,
      },
      image: imageMap.get(row.id)?.[0] ?? null,
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
        eq(creativeProfiles.status, 'published'),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) throw AppError.notFound('No such offer.');

  const imageMap = await imagesForOffers([row.id]);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceMinCentavos: row.priceMinCentavos,
    priceMaxCentavos: row.priceMaxCentavos,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subdomain: { slug: row.subdomainSlug, name: row.subdomainName, domain: row.domainName },
    images: imageMap.get(row.id) ?? [],
    creative: {
      slug: row.creativeSlug,
      displayName: row.creativeDisplayName,
      municipality: row.municipality,
      avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
      ...(viewerMunicipalityId
        ? { isNearby: row.municipalityId === viewerMunicipalityId }
        : {}),
    },
  };
}
