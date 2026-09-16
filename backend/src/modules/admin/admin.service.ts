import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  offerImages,
  offers,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { deleteObject, isStorageConfigured, publicUrl } from '../../lib/storage.js';

type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
type ProfileQueueStatus = ProfileStatus | 'edited';

export async function listProfiles(options: {
  status: ProfileQueueStatus;
  page: number;
  limit: number;
}) {
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

  return { rows, total: totals?.total ?? 0 };
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

export async function getProfile(id: string) {
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

  return { ...profile, subdomains, history };
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
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(creativeProfiles)
        .set({ editedSinceReviewAt: null, updatedAt: new Date() })
        .where(eq(creativeProfiles.id, input.profileId))
        .returning({ id: creativeProfiles.id, status: creativeProfiles.status });

      if (!updated) throw AppError.notFound('No such profile.');

      await tx.insert(moderationActions).values({
        profileId: input.profileId,
        adminId: input.adminId,
        action: input.action,
        reason: input.reason?.trim() ?? null,
      });

      return updated;
    });
  }

  const nextStatus: ProfileStatus =
    input.action === 'approved'
      ? 'published'
      : input.action === 'rejected'
        ? 'suspended'
        : 'pending_review';

  return db.transaction(async (tx) => {
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
      .returning({ id: creativeProfiles.id, status: creativeProfiles.status });

    if (!updated) throw AppError.notFound('No such profile.');

    await tx.insert(moderationActions).values({
      profileId: input.profileId,
      adminId: input.adminId,
      action: input.action,
      reason: input.reason?.trim() ?? null,
    });

    return updated;
  });
}

type MediaQueueRow = {
  id: string;
  kind: 'avatar' | 'offer';
  createdAt: string;
  url: string | null;
  thumbUrl: string | null;
  caption: string | null;
  ownerName: string;
  profileSlug: string | null;
  profileId: string | null;
  title?: string;
  description?: string | null;
  priceMinCentavos?: number | null;
  priceMaxCentavos?: number | null;
  flaggedAt?: string | null;
  images?: { id: string; url: string; thumbUrl: string; sortOrder: number }[];
  /** Sort helper — flagged offers rank above everything else. */
  _flagged: boolean;
};

async function imagesForOfferQueue(offerIds: string[]) {
  const result = new Map<
    string,
    { id: string; url: string; thumbUrl: string; sortOrder: number }[]
  >();
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
    list.push({
      id: row.id,
      sortOrder: row.sortOrder,
      url: publicUrl(row.objectKey),
      thumbUrl: publicUrl(row.thumbKey),
    });
    result.set(row.offerId, list);
  }
  return result;
}

export async function listUnreviewedMedia(options: { page: number; limit: number }) {
  const offset = (options.page - 1) * options.limit;

  const offerRows = await db
    .select({
      id: offers.id,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      flaggedAt: offers.flaggedAt,
      createdAt: offers.createdAt,
      ownerName: sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`,
      profileSlug: creativeProfiles.slug,
      profileId: creativeProfiles.id,
    })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .where(isNull(offers.reviewedAt));

  const imageMap = await imagesForOfferQueue(offerRows.map((row) => row.id));

  const offerItems: MediaQueueRow[] = offerRows.map((row) => {
    const images = imageMap.get(row.id) ?? [];
    const first = images[0];
    return {
      id: row.id,
      kind: 'offer' as const,
      createdAt: row.createdAt.toISOString(),
      url: first?.url ?? null,
      thumbUrl: first?.thumbUrl ?? null,
      caption: null,
      ownerName: row.ownerName,
      profileSlug: row.profileSlug,
      profileId: row.profileId,
      title: row.title,
      description: row.description,
      priceMinCentavos: row.priceMinCentavos,
      priceMaxCentavos: row.priceMaxCentavos,
      flaggedAt: row.flaggedAt?.toISOString() ?? null,
      images,
      _flagged: row.flaggedAt != null,
    };
  });

  const avatarItems: MediaQueueRow[] = [];
  if (isStorageConfigured()) {
    const avatarRows = await db
      .select({
        id: users.id,
        createdAt: users.updatedAt,
        objectKey: users.avatarKey,
        ownerName: sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`,
        profileSlug: creativeProfiles.slug,
        profileId: creativeProfiles.id,
      })
      .from(users)
      .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
      .where(and(isNotNull(users.avatarKey), sql`${users.avatarReviewedAt} is null`));

    for (const row of avatarRows) {
      avatarItems.push({
        id: row.id,
        kind: 'avatar',
        createdAt: row.createdAt.toISOString(),
        url: row.objectKey ? publicUrl(row.objectKey) : null,
        thumbUrl: row.objectKey ? publicUrl(row.objectKey) : null,
        caption: null,
        ownerName: row.ownerName,
        profileSlug: row.profileSlug,
        profileId: row.profileId,
        _flagged: false,
      });
    }
  }

  // Flagged offers first, then remaining unreviewed (avatars + unflagged offers)
  // by createdAt desc.
  const merged = [...offerItems, ...avatarItems].sort((a, b) => {
    if (a._flagged !== b._flagged) return a._flagged ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  const total = merged.length;
  const data = merged.slice(offset, offset + options.limit).map(({ _flagged: _, ...row }) => row);
  return { data, total };
}

export async function reviewMedia(input: {
  kind: 'avatar' | 'offer';
  id: string;
  adminId: string;
  action: 'approve' | 'remove';
}) {
  if (input.kind === 'offer') {
    return reviewOfferMedia(input);
  }

  const [user] = await db
    .select({
      id: users.id,
      avatarKey: users.avatarKey,
      profileId: creativeProfiles.id,
    })
    .from(users)
    .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
    .where(eq(users.id, input.id))
    .limit(1);

  if (!user?.avatarKey) throw AppError.notFound('No such avatar.');

  if (input.action === 'approve') {
    await db
      .update(users)
      .set({ avatarReviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return { ok: true as const };
  }

  const key = user.avatarKey;
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ avatarKey: null, avatarReviewedAt: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // profileId stays null for a client with no creative profile; the
    // takedown is still recorded against subjectUserId.
    await tx.insert(moderationActions).values({
      profileId: user.profileId,
      subjectUserId: user.id,
      adminId: input.adminId,
      action: 'media_removed',
      reason: 'Avatar removed by admin',
    });
  });
  await deleteObject(key);
  return { ok: true as const };
}

async function reviewOfferMedia(input: {
  id: string;
  adminId: string;
  action: 'approve' | 'remove';
}) {
  const [offer] = await db
    .select({
      id: offers.id,
      profileId: offers.profileId,
      ownerUserId: creativeProfiles.userId,
    })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .where(eq(offers.id, input.id))
    .limit(1);

  if (!offer) throw AppError.notFound('No such offer.');

  if (input.action === 'approve') {
    await db
      .update(offers)
      .set({ reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(offers.id, offer.id));
    return { ok: true as const };
  }

  const images = await db
    .select({ objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
    .from(offerImages)
    .where(eq(offerImages.offerId, offer.id));

  await Promise.all(
    images.flatMap((row) => [deleteObject(row.objectKey), deleteObject(row.thumbKey)]),
  );

  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(offers)
      .where(eq(offers.id, offer.id))
      .returning({ id: offers.id });
    if (!deleted) throw AppError.notFound('No such offer.');

    await tx.insert(moderationActions).values({
      profileId: offer.profileId,
      subjectUserId: offer.ownerUserId,
      adminId: input.adminId,
      action: 'media_removed',
      reason: 'Offer removed by admin',
    });
  });

  return { ok: true as const };
}
