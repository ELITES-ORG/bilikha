import type { SQL } from 'drizzle-orm';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  ne,
  sql,
} from 'drizzle-orm';
import type { Posting, PostingListResult } from '../../contracts/postings.js';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  messages,
  municipalities,
  postings,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { detectContactDetails } from '../offers/offers.service.js';
import type { ListPostingsQuery, PatchPostingBody, PostingBody } from './postings.schema.js';

export type { Posting } from '../../contracts/postings.js';

export const OPEN_POSTING_LIMIT = 5;

function formatClientName(parts: {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName, parts.suffix]
    .filter(Boolean)
    .join(' ');
}

async function requireCreativeProfile(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw AppError.forbidden('A creative profile is required to browse postings');
  }
  return profile;
}

async function registeredSubdomainIdsForUser(userId: string): Promise<string[]> {
  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);
  if (!profile) return [];
  const rows = await db
    .select({ subdomainId: creativeProfileSubdomains.subdomainId })
    .from(creativeProfileSubdomains)
    .where(eq(creativeProfileSubdomains.profileId, profile.id));
  return rows.map((row) => row.subdomainId);
}

async function resolveSubdomainBySlug(subdomainSlug: string) {
  const [subdomain] = await db
    .select({
      id: creativeSubdomains.id,
      slug: creativeSubdomains.slug,
      name: creativeSubdomains.name,
      domainName: creativeDomains.name,
    })
    .from(creativeSubdomains)
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(eq(creativeSubdomains.slug, subdomainSlug))
    .limit(1);
  if (!subdomain) {
    throw AppError.badRequest('Unknown sub-domain.', { field: 'subdomainSlug' });
  }
  return subdomain;
}

async function resolveMunicipalityBySlug(municipalitySlug: string) {
  const [municipality] = await db
    .select({ id: municipalities.id, slug: municipalities.slug, name: municipalities.name })
    .from(municipalities)
    .where(eq(municipalities.slug, municipalitySlug))
    .limit(1);
  if (!municipality) {
    throw AppError.badRequest('Unknown municipality.', { field: 'municipalitySlug' });
  }
  return municipality;
}

function formatPostingTimestamps(row: {
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  flaggedAt: Date | null;
  reviewedAt: Date | null;
}) {
  return {
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    flaggedAt: row.flaggedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

async function replyCountsForPostings(postingIds: string[]) {
  const result = new Map<string, number>();
  if (postingIds.length === 0) return result;
  const rows = await db
    .select({
      postingId: messages.postingId,
      replyCount: sql<number>`count(distinct ${messages.conversationId})`.mapWith(Number),
    })
    .from(messages)
    .where(inArray(messages.postingId, postingIds))
    .groupBy(messages.postingId);
  for (const row of rows) {
    if (row.postingId) result.set(row.postingId, row.replyCount);
  }
  return result;
}

async function clientsForUserIds(userIds: string[]) {
  const result = new Map<string, { name: string; avatarUrl: string | null }>();
  if (userIds.length === 0) return result;
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      avatarKey: users.avatarKey,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  for (const row of rows) {
    result.set(row.id, {
      name: formatClientName(row),
      avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
    });
  }
  return result;
}

async function repliedPostingIds(viewerUserId: string, postingIds: string[]) {
  const result = new Set<string>();
  if (postingIds.length === 0) return result;
  const rows = await db
    .selectDistinct({ postingId: messages.postingId })
    .from(messages)
    .where(
      and(
        inArray(messages.postingId, postingIds),
        eq(messages.senderUserId, viewerUserId),
      ),
    );
  for (const row of rows) {
    if (row.postingId) result.add(row.postingId);
  }
  return result;
}

type PostingRowCore = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  status: 'open' | 'closed' | 'expired';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  flaggedAt: Date | null;
  reviewedAt: Date | null;
  subdomainSlug: string;
  subdomainName: string;
  domainName: string;
  municipalitySlug: string;
  municipalityName: string;
};

function mapPostingRow(
  row: PostingRowCore,
  extras: {
    client?: { name: string; avatarUrl: string | null };
    hasReplied?: boolean;
    replyCount?: number;
  } = {},
): Posting {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    budgetMinCentavos: row.budgetMinCentavos,
    budgetMaxCentavos: row.budgetMaxCentavos,
    status: row.status,
    ...formatPostingTimestamps(row),
    subdomain: {
      slug: row.subdomainSlug,
      name: row.subdomainName,
      domain: row.domainName,
    },
    municipality: {
      slug: row.municipalitySlug,
      name: row.municipalityName,
    },
    ...(extras.client ? { client: extras.client } : {}),
    ...(extras.hasReplied !== undefined ? { hasReplied: extras.hasReplied } : {}),
    ...(extras.replyCount !== undefined ? { replyCount: extras.replyCount } : {}),
  };
}

export async function listMine(userId: string): Promise<Posting[]> {
  const rows = await db
    .select({
      id: postings.id,
      userId: postings.userId,
      title: postings.title,
      description: postings.description,
      budgetMinCentavos: postings.budgetMinCentavos,
      budgetMaxCentavos: postings.budgetMaxCentavos,
      status: postings.status,
      createdAt: postings.createdAt,
      updatedAt: postings.updatedAt,
      expiresAt: postings.expiresAt,
      flaggedAt: postings.flaggedAt,
      reviewedAt: postings.reviewedAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      domainName: creativeDomains.name,
      municipalitySlug: municipalities.slug,
      municipalityName: municipalities.name,
    })
    .from(postings)
    .innerJoin(creativeSubdomains, eq(postings.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .innerJoin(municipalities, eq(postings.municipalityId, municipalities.id))
    .where(eq(postings.userId, userId))
    .orderBy(desc(postings.createdAt), asc(postings.id));

  const replyMap = await replyCountsForPostings(rows.map((row) => row.id));
  return rows.map((row) => mapPostingRow(row, {
    replyCount: replyMap.get(row.id) ?? 0,
  }));
}

export async function createPosting(userId: string, input: PostingBody) {
  const subdomain = await resolveSubdomainBySlug(input.subdomainSlug);
  const municipality = await resolveMunicipalityBySlug(input.municipalitySlug);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [tally] = await tx
      .select({ total: count() })
      .from(postings)
      .where(and(eq(postings.userId, userId), eq(postings.status, 'open')));
    if ((tally?.total ?? 0) >= OPEN_POSTING_LIMIT) {
      throw AppError.badRequest(`An account can have at most ${OPEN_POSTING_LIMIT} open postings`);
    }

    const [created] = await tx
      .insert(postings)
      .values({
        userId,
        subdomainId: subdomain.id,
        municipalityId: municipality.id,
        title: input.title,
        description: input.description ?? null,
        budgetMinCentavos: input.budgetMinCentavos ?? null,
        budgetMaxCentavos: input.budgetMaxCentavos ?? null,
        expiresAt,
        flaggedAt: detectContactDetails(input.description) ? now : null,
      })
      .returning({ id: postings.id });
    return created!.id;
  });

  return (await listMine(userId)).find((posting) => posting.id === id)!;
}

export async function updatePosting(userId: string, postingId: string, input: PatchPostingBody) {
  const [current] = await db
    .select()
    .from(postings)
    .where(and(eq(postings.id, postingId), eq(postings.userId, userId)))
    .limit(1);
  if (!current) throw AppError.notFound('No such posting.');

  let subdomainId = current.subdomainId;
  if (input.subdomainSlug !== undefined) {
    subdomainId = (await resolveSubdomainBySlug(input.subdomainSlug)).id;
  }
  let municipalityId = current.municipalityId;
  if (input.municipalitySlug !== undefined) {
    municipalityId = (await resolveMunicipalityBySlug(input.municipalitySlug)).id;
  }

  const title = input.title !== undefined ? input.title : current.title;
  const description = input.description !== undefined
    ? input.description ?? null
    : current.description;
  const budgetMinCentavos = input.budgetMinCentavos !== undefined
    ? input.budgetMinCentavos
    : current.budgetMinCentavos;
  const budgetMaxCentavos = input.budgetMaxCentavos !== undefined
    ? input.budgetMaxCentavos
    : current.budgetMaxCentavos;
  if (
    budgetMinCentavos != null
    && budgetMaxCentavos != null
    && budgetMinCentavos > budgetMaxCentavos
  ) {
    throw AppError.badRequest('Maximum must be at least the minimum', {
      field: 'budgetMaxCentavos',
    });
  }

  const now = new Date();
  await db
    .update(postings)
    .set({
      title,
      subdomainId,
      municipalityId,
      description,
      budgetMinCentavos,
      budgetMaxCentavos,
      flaggedAt: detectContactDetails(description) ? now : null,
      updatedAt: now,
    })
    .where(and(eq(postings.id, postingId), eq(postings.userId, userId)));

  return (await listMine(userId)).find((posting) => posting.id === postingId)!;
}

export async function closePosting(userId: string, postingId: string) {
  const [updated] = await db
    .update(postings)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(and(eq(postings.id, postingId), eq(postings.userId, userId)))
    .returning({ id: postings.id });
  if (!updated) throw AppError.notFound('No such posting.');
  return (await listMine(userId)).find((posting) => posting.id === postingId)!;
}

export async function deletePosting(userId: string, postingId: string) {
  const [owned] = await db
    .select({ id: postings.id })
    .from(postings)
    .where(and(eq(postings.id, postingId), eq(postings.userId, userId)))
    .limit(1);
  if (!owned) throw AppError.notFound('No such posting.');

  const [reply] = await db
    .select({ total: count() })
    .from(messages)
    .where(eq(messages.postingId, postingId));
  if ((reply?.total ?? 0) > 0) {
    throw AppError.badRequest(
      'This posting has replies and cannot be deleted. Close it instead.',
    );
  }

  await db.delete(postings).where(and(eq(postings.id, postingId), eq(postings.userId, userId)));
  return { ok: true as const };
}

/**
 * Postgres reads a bare constant in ORDER BY as a column ordinal, so
 * `ORDER BY false` is error 42601 — not a no-op. Both fallbacks used to emit
 * one, which meant the feed threw for any creative with no registered
 * sub-domains, and would have for anyone with no municipality. Drop the key
 * instead of ordering by a constant; there is nothing to sort on either way.
 */
function feedOrder(
  registeredSubdomainIds: string[],
  viewerMunicipalityId: string | null,
) {
  const order: SQL[] = [];

  if (registeredSubdomainIds.length > 0) {
    order.push(desc(inArray(postings.subdomainId, registeredSubdomainIds)));
  }
  if (viewerMunicipalityId) {
    order.push(desc(sql`${postings.municipalityId} = ${viewerMunicipalityId}`));
  }

  // Newest first, with a stable tiebreaker so pagination cannot repeat or skip.
  order.push(desc(postings.createdAt), asc(postings.id));
  return order;
}

export async function listFeedPostings(
  userId: string,
  options: ListPostingsQuery & { viewerMunicipalityId?: string | null },
): Promise<PostingListResult> {
  await requireCreativeProfile(userId);
  const now = new Date();
  const registeredSubdomainIds = await registeredSubdomainIdsForUser(userId);
  const offset = (options.page - 1) * options.limit;

  const filters = [
    eq(postings.status, 'open'),
    gt(postings.expiresAt, now),
    ne(postings.userId, userId),
    // A suspended account's postings leave the feed with them, the same way a
    // suspended creative leaves the directory. Visibility derives from the
    // account rather than being copied onto the row, so unsuspending restores
    // everything with no bookkeeping.
    eq(users.status, 'active'),
  ];
  if (options.domain) filters.push(eq(creativeDomains.slug, options.domain));
  if (options.subdomain) filters.push(eq(creativeSubdomains.slug, options.subdomain));
  if (options.municipality) filters.push(eq(municipalities.slug, options.municipality));
  const where = and(...filters);
  const order = feedOrder(registeredSubdomainIds, options.viewerMunicipalityId ?? null);

  const rows = await db
    .select({
      id: postings.id,
      userId: postings.userId,
      title: postings.title,
      description: postings.description,
      budgetMinCentavos: postings.budgetMinCentavos,
      budgetMaxCentavos: postings.budgetMaxCentavos,
      status: postings.status,
      createdAt: postings.createdAt,
      updatedAt: postings.updatedAt,
      expiresAt: postings.expiresAt,
      flaggedAt: postings.flaggedAt,
      reviewedAt: postings.reviewedAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      domainName: creativeDomains.name,
      municipalitySlug: municipalities.slug,
      municipalityName: municipalities.name,
    })
    .from(postings)
    .innerJoin(users, eq(postings.userId, users.id))
    .innerJoin(creativeSubdomains, eq(postings.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .innerJoin(municipalities, eq(postings.municipalityId, municipalities.id))
    .where(where)
    .orderBy(...order)
    .limit(options.limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(postings)
    .innerJoin(users, eq(postings.userId, users.id))
    .innerJoin(creativeSubdomains, eq(postings.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .innerJoin(municipalities, eq(postings.municipalityId, municipalities.id))
    .where(where);

  const postingIds = rows.map((row) => row.id);
  const clientIds = [...new Set(rows.map((row) => row.userId))];
  const [clientMap, replied] = await Promise.all([
    clientsForUserIds(clientIds),
    repliedPostingIds(userId, postingIds),
  ]);

  return {
    data: rows.map((row) => mapPostingRow(row, {
      client: clientMap.get(row.userId) ?? { name: 'Unknown', avatarUrl: null },
      hasReplied: replied.has(row.id),
    })),
    total: totals?.total ?? 0,
  };
}

export async function getPostingById(userId: string, postingId: string): Promise<Posting> {
  const [row] = await db
    .select({
      id: postings.id,
      userId: postings.userId,
      title: postings.title,
      description: postings.description,
      budgetMinCentavos: postings.budgetMinCentavos,
      budgetMaxCentavos: postings.budgetMaxCentavos,
      status: postings.status,
      createdAt: postings.createdAt,
      updatedAt: postings.updatedAt,
      expiresAt: postings.expiresAt,
      flaggedAt: postings.flaggedAt,
      reviewedAt: postings.reviewedAt,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      domainName: creativeDomains.name,
      municipalitySlug: municipalities.slug,
      municipalityName: municipalities.name,
    })
    .from(postings)
    .innerJoin(creativeSubdomains, eq(postings.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .innerJoin(municipalities, eq(postings.municipalityId, municipalities.id))
    .where(eq(postings.id, postingId))
    .limit(1);
  if (!row) throw AppError.notFound('No such posting.');

  const isOwner = row.userId === userId;
  if (!isOwner) {
    await requireCreativeProfile(userId);
    const now = new Date();
    if (row.status !== 'open' || row.expiresAt <= now) {
      throw AppError.notFound('No such posting.');
    }

    // Hidden from the feed but still reachable by id would make the filter
    // decorative. The owner keeps access so a suspension is not also a lockout
    // from their own record.
    const [poster] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (poster?.status !== 'active') {
      throw AppError.notFound('No such posting.');
    }
  }

  const [clientMap, replied] = await Promise.all([
    clientsForUserIds([row.userId]),
    isOwner ? Promise.resolve(new Set<string>()) : repliedPostingIds(userId, [row.id]),
  ]);

  return mapPostingRow(row, {
    client: clientMap.get(row.userId) ?? { name: 'Unknown', avatarUrl: null },
    ...(!isOwner ? { hasReplied: replied.has(row.id) } : {}),
  });
}
