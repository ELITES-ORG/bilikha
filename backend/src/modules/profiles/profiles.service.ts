import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
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
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';

// Public shape. Note what is absent: email, phone, birthDate, barangay.
export interface PublicProfile {
  slug: string;
  displayName: string | null;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  municipality: string;
  /** Present when the viewer has a municipality; true if it matches this row. */
  isNearby?: boolean;
  subdomains: { slug: string; name: string; domain: string; isPrimary: boolean }[];
  /** Present on the detail endpoint only — not on directory cards. */
  offers?: {
    id: string;
    title: string;
    description: string | null;
    priceMinCentavos: number | null;
    priceMaxCentavos: number | null;
    /**
     * Nested, matching `GET /offers`. It used to be flat `subdomainSlug` /
     * `subdomainName` here and nested there, so one offer had two shapes
     * depending on which endpoint returned it — and the client, written against
     * the other one, read `offer.subdomain.name` on undefined and took the whole
     * profile page down.
     */
    subdomain: { slug: string; name: string; domain: string };
    images: { id: string; url: string; thumbUrl: string; sortOrder: number }[];
  }[];
  memberSince: string;
}

export interface ListPublishedOptions {
  domain?: string;
  subdomain?: string;
  municipality?: string;
  page: number;
  limit: number;
  /** Null for anonymous viewers and for accounts with no municipality yet. */
  viewerMunicipalityId?: string | null;
}

function formatFullName(parts: {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName, parts.suffix]
    .filter(Boolean)
    .join(' ');
}

async function subdomainsForProfiles(profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, PublicProfile['subdomains']>();

  const rows = await db
    .select({
      profileId: creativeProfileSubdomains.profileId,
      slug: creativeSubdomains.slug,
      name: creativeSubdomains.name,
      domain: creativeDomains.name,
      isPrimary: creativeProfileSubdomains.isPrimary,
    })
    .from(creativeProfileSubdomains)
    .innerJoin(
      creativeSubdomains,
      eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id),
    )
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(inArray(creativeProfileSubdomains.profileId, profileIds));

  const map = new Map<string, PublicProfile['subdomains']>();
  for (const row of rows) {
    const list = map.get(row.profileId) ?? [];
    list.push({
      slug: row.slug,
      name: row.name,
      domain: row.domain,
      isPrimary: row.isPrimary,
    });
    map.set(row.profileId, list);
  }
  return map;
}

async function offersForProfile(profileId: string): Promise<NonNullable<PublicProfile['offers']>> {
  const rows = await db
    .select({
      id: offers.id,
      title: offers.title,
      description: offers.description,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      subdomainSlug: creativeSubdomains.slug,
      subdomainName: creativeSubdomains.name,
      domainName: creativeDomains.name,
    })
    .from(offers)
    .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(eq(offers.profileId, profileId))
    .orderBy(asc(offers.sortOrder), asc(offers.createdAt));

  if (rows.length === 0) return [];

  const imageRows = isStorageConfigured()
    ? await db
      .select({
        id: offerImages.id,
        offerId: offerImages.offerId,
        objectKey: offerImages.objectKey,
        thumbKey: offerImages.thumbKey,
        sortOrder: offerImages.sortOrder,
      })
      .from(offerImages)
      .where(inArray(offerImages.offerId, rows.map((row) => row.id)))
      .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt))
    : [];

  const imagesByOffer = new Map<
    string,
    { id: string; url: string; thumbUrl: string; sortOrder: number }[]
  >();
  for (const row of imageRows) {
    const list = imagesByOffer.get(row.offerId) ?? [];
    list.push({
      id: row.id,
      url: publicUrl(row.objectKey),
      thumbUrl: publicUrl(row.thumbKey),
      sortOrder: row.sortOrder,
    });
    imagesByOffer.set(row.offerId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    priceMinCentavos: row.priceMinCentavos,
    priceMaxCentavos: row.priceMaxCentavos,
    subdomain: { slug: row.subdomainSlug, name: row.subdomainName, domain: row.domainName },
    images: imagesByOffer.get(row.id) ?? [],
  }));
}

export async function listPublished(options: ListPublishedOptions) {
  const offset = (options.page - 1) * options.limit;
  // A suspended account's work leaves the directory with them. Suspension is a
  // property of the user, and every public listing derives visibility from it —
  // so unsuspending restores everything without anyone having to remember what
  // was published.
  const filters = [eq(creativeProfiles.status, 'published'), eq(users.status, 'active')];

  if (options.municipality) {
    filters.push(eq(municipalities.slug, options.municipality));
  }

  if (options.subdomain) {
    filters.push(
      sql`exists (
        select 1 from creative_profile_subdomains cps
        join creative_subdomains cs on cs.id = cps.subdomain_id
        where cps.profile_id = ${creativeProfiles.id}
          and cs.slug = ${options.subdomain}
      )`,
    );
  } else if (options.domain) {
    filters.push(
      sql`exists (
        select 1 from creative_profile_subdomains cps
        join creative_subdomains cs on cs.id = cps.subdomain_id
        join creative_domains cd on cd.id = cs.domain_id
        where cps.profile_id = ${creativeProfiles.id}
          and cd.slug = ${options.domain}
      )`,
    );
  }

  const where = and(...filters);

  const nearbyFirst = options.viewerMunicipalityId
    ? [
        desc(sql`${users.municipalityId} = ${options.viewerMunicipalityId}`),
        desc(creativeProfiles.createdAt),
      ]
    : [desc(creativeProfiles.createdAt)];

  const rows = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      displayName: creativeProfiles.displayName,
      bio: creativeProfiles.bio,
      createdAt: creativeProfiles.createdAt,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      municipality: municipalities.name,
      municipalityId: users.municipalityId,
      avatarKey: users.avatarKey,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(where)
    .orderBy(...nearbyFirst)
    .limit(options.limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(where);

  const subdomainMap = await subdomainsForProfiles(rows.map((row) => row.id));
  const data: PublicProfile[] = rows.map((row) => {
    const profile: PublicProfile = {
      slug: row.slug,
      displayName: row.displayName,
      fullName: formatFullName(row),
      bio: row.bio,
      avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
      municipality: row.municipality,
      subdomains: subdomainMap.get(row.id) ?? [],
      memberSince: row.createdAt.toISOString(),
    };
    if (options.viewerMunicipalityId) {
      profile.isNearby = row.municipalityId === options.viewerMunicipalityId;
    }
    return profile;
  });

  return { data, total: totals?.total ?? 0 };
}

export async function getPublishedBySlug(slug: string): Promise<PublicProfile> {
  const [row] = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      displayName: creativeProfiles.displayName,
      bio: creativeProfiles.bio,
      createdAt: creativeProfiles.createdAt,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      municipality: municipalities.name,
      avatarKey: users.avatarKey,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(
      and(
        eq(creativeProfiles.slug, slug),
        eq(creativeProfiles.status, 'published'),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);

  if (!row) throw AppError.notFound('No such creative.');

  const subdomainMap = await subdomainsForProfiles([row.id]);
  const profileOffers = await offersForProfile(row.id);
  return {
    slug: row.slug,
    displayName: row.displayName,
    fullName: formatFullName(row),
    bio: row.bio,
    avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
    municipality: row.municipality,
    subdomains: subdomainMap.get(row.id) ?? [],
    offers: profileOffers,
    memberSince: row.createdAt.toISOString(),
  };
}
