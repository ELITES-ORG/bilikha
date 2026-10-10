import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type {
  ManagedOrganization,
  ManagedOrganizationMember,
  MyOrganization,
  PendingOrganizationInvitation,
  OrganizationCraft,
  OrganizationRole,
  OrganizationStatus,
  PublicOrganization,
  PublicOrganizationMember,
} from '../../contracts/organizations.js';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeProfiles,
  creativeSubdomains,
  municipalities,
  organizationInvitations,
  organizationMembers,
  organizationSubdomains,
  organizations,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { formatFullName } from '../profiles/profiles.service.js';
import type { FoundOrganizationInput, UpdateOrganizationInput } from './organizations.schema.js';

/**
 * Organisations are teams of creatives (ADR 0054, plan 0051).
 *
 * Rules held here, each from ADR 0054 or the answers recorded in plan 0051:
 *
 * - Founding needs a **published** creative profile, and writes the founder's
 *   membership in the same transaction as the organisation — one never exists
 *   without a founder, not even for a moment.
 * - A person belongs to **at most five** organisations. Only memberships count,
 *   never pending invitations, and a **rejected** organisation does not count:
 *   its founder can submit a new one.
 * - **One or two** domains, **up to five** sub-domains, one primary.
 * - The slug is chosen once, from the name, and never changes: it is a public
 *   URL (the rule ADR 0049 sets for taxonomy slugs).
 */

export const ORGANIZATION_CAP = 5;
const MAX_DOMAINS = 2;

/** Path segments under /organizations that a slug must never shadow. */
const RESERVED_SLUGS = new Set(['mine', 'invitations', 'new']);

/** Founder first, then co-founders, then members — the order a page reads in. */
const ROLE_ORDER = sql<number>`case ${organizationMembers.role}
  when 'founder' then 0 when 'co_founder' then 1 else 2 end`;

function avatarUrl(key: string | null): string | null {
  return key && isStorageConfigured() ? publicUrl(key) : null;
}

/** "Bilikha Studio!" → "bilikha-studio". Accents are folded, not dropped. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'organisation';
}

/** The base slug, or the first free `base-2`, `base-3`… */
async function freeSlug(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(sql`${organizations.slug} = ${base} or ${organizations.slug} like ${`${base}-%`}`)
    ).map((row) => row.slug),
  );

  if (!taken.has(base) && !RESERVED_SLUGS.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * How many organisations count toward this person's cap: memberships of any
 * role, excluding organisations whose page was rejected.
 */
export async function countTowardCap(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), ne(organizations.status, 'rejected')));
  return row?.total ?? 0;
}

export async function assertUnderCap(userId: string): Promise<void> {
  if ((await countTowardCap(userId)) >= ORGANIZATION_CAP) {
    throw AppError.conflict(
      `You can belong to at most ${ORGANIZATION_CAP} organisations. Leave one before founding or joining another.`,
    );
  }
}

/** The person's creative profile, if it is published — the bar to found or join. */
export async function publishedProfileOf(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id, slug: creativeProfiles.slug })
    .from(creativeProfiles)
    .where(and(eq(creativeProfiles.userId, userId), eq(creativeProfiles.status, 'published')))
    .limit(1);
  return profile ?? null;
}

/**
 * Validates crafts against the live taxonomy: every sub-domain exists and is not
 * archived (ADR 0049), they span at most two domains, and the primary is one of
 * them.
 */
async function resolveCrafts(subdomainSlugs: string[], primarySlug: string) {
  const unique = [...new Set(subdomainSlugs)];
  const rows = await db
    .select({
      id: creativeSubdomains.id,
      slug: creativeSubdomains.slug,
      domainId: creativeSubdomains.domainId,
    })
    .from(creativeSubdomains)
    .where(and(inArray(creativeSubdomains.slug, unique), isNull(creativeSubdomains.archivedAt)));

  if (rows.length !== unique.length) {
    throw AppError.badRequest('One or more crafts are unknown.', { field: 'subdomainSlugs' });
  }

  const domains = new Set(rows.map((row) => row.domainId));
  if (domains.size > MAX_DOMAINS) {
    throw AppError.badRequest(
      `An organisation's crafts can come from at most ${MAX_DOMAINS} domains.`,
      { field: 'subdomainSlugs' },
    );
  }

  const primary = rows.find((row) => row.slug === primarySlug);
  if (!primary) {
    throw AppError.badRequest('The primary craft must be one of your selected crafts.', {
      field: 'primarySubdomainSlug',
    });
  }

  return rows.map((row) => ({ subdomainId: row.id, isPrimary: row.id === primary.id }));
}

async function municipalityIdFor(slug: string): Promise<string> {
  const [row] = await db
    .select({ id: municipalities.id })
    .from(municipalities)
    .where(eq(municipalities.slug, slug))
    .limit(1);
  if (!row) throw AppError.badRequest('Unknown municipality.', { field: 'municipalitySlug' });
  return row.id;
}

async function findBySlug(slug: string) {
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!row) throw AppError.notFound('No such organisation.');
  return row;
}

export async function roleIn(organizationId: string, userId: string): Promise<OrganizationRole | null> {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

export async function foundOrganization(input: {
  userId: string;
  data: FoundOrganizationInput;
}): Promise<{ slug: string; status: OrganizationStatus }> {
  if (!(await publishedProfileOf(input.userId))) {
    throw AppError.forbidden(
      'You need a published creative profile to found an organisation.',
    );
  }
  await assertUnderCap(input.userId);

  const [crafts, municipalityId, slug] = await Promise.all([
    resolveCrafts(input.data.subdomainSlugs, input.data.primarySubdomainSlug),
    municipalityIdFor(input.data.municipalitySlug),
    freeSlug(input.data.name),
  ]);

  // The organisation and its founder in one transaction: an organisation with
  // no founder must never exist, even between two statements.
  const created = await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        slug,
        name: input.data.name,
        bio: input.data.bio ?? null,
        municipalityId,
      })
      .returning({ id: organizations.id, slug: organizations.slug, status: organizations.status });

    await tx
      .insert(organizationMembers)
      .values({ organizationId: organization!.id, userId: input.userId, role: 'founder' });

    await tx
      .insert(organizationSubdomains)
      .values(crafts.map((craft) => ({ organizationId: organization!.id, ...craft })));

    return organization!;
  });

  return { slug: created.slug, status: created.status };
}

/**
 * Founder or co-founder edits the page. Only the founder changes the crafts
 * (ADR 0054). An edit to a published page flags it for review rather than
 * taking it down (ADR 0016); an edit to a rejected one resubmits it.
 */
export async function updateOrganization(input: {
  userId: string;
  slug: string;
  data: UpdateOrganizationInput;
}): Promise<{ slug: string; status: OrganizationStatus }> {
  const organization = await findBySlug(input.slug);
  const role = await roleIn(organization.id, input.userId);

  if (role !== 'founder' && role !== 'co_founder') {
    throw AppError.forbidden('Only the founder and co-founders can edit this organisation.');
  }
  if (input.data.subdomainSlugs && role !== 'founder') {
    throw AppError.forbidden("Only the founder can change the organisation's crafts.");
  }
  if (organization.status === 'suspended') {
    throw AppError.forbidden('This organisation has been suspended and cannot be edited.');
  }

  const crafts = input.data.subdomainSlugs
    ? await resolveCrafts(input.data.subdomainSlugs, input.data.primarySubdomainSlug!)
    : null;
  const municipalityId = input.data.municipalitySlug
    ? await municipalityIdFor(input.data.municipalitySlug)
    : undefined;

  const now = new Date();
  const statusChange =
    organization.status === 'published'
      ? { editedSinceReviewAt: now }
      : organization.status === 'rejected'
        ? { status: 'pending_review' as const, rejectionReason: null }
        : {};

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(organizations)
      .set({
        ...(input.data.name !== undefined ? { name: input.data.name } : {}),
        ...(input.data.bio !== undefined ? { bio: input.data.bio || null } : {}),
        ...(municipalityId ? { municipalityId } : {}),
        ...statusChange,
        updatedAt: now,
      })
      .where(eq(organizations.id, organization.id))
      .returning({ slug: organizations.slug, status: organizations.status });

    if (crafts) {
      await tx
        .delete(organizationSubdomains)
        .where(eq(organizationSubdomains.organizationId, organization.id));
      await tx
        .insert(organizationSubdomains)
        .values(crafts.map((craft) => ({ organizationId: organization.id, ...craft })));
    }

    return row!;
  });

  return updated;
}

async function craftsFor(organizationId: string): Promise<OrganizationCraft[]> {
  const rows = await db
    .select({
      slug: creativeSubdomains.slug,
      name: creativeSubdomains.name,
      domainSlug: creativeDomains.slug,
      domainName: creativeDomains.name,
      isPrimary: organizationSubdomains.isPrimary,
    })
    .from(organizationSubdomains)
    .innerJoin(creativeSubdomains, eq(organizationSubdomains.subdomainId, creativeSubdomains.id))
    .innerJoin(creativeDomains, eq(creativeSubdomains.domainId, creativeDomains.id))
    .where(eq(organizationSubdomains.organizationId, organizationId))
    .orderBy(sql`${organizationSubdomains.isPrimary} desc`, asc(creativeSubdomains.displayOrder));
  return rows;
}

async function municipalityOf(municipalityId: string) {
  const [row] = await db
    .select({ slug: municipalities.slug, name: municipalities.name })
    .from(municipalities)
    .where(eq(municipalities.id, municipalityId))
    .limit(1);
  return row!;
}

/**
 * The public page. Only a published organisation, and only members who could
 * themselves be seen in public: an active account with a published profile
 * (the rule `getPublishedBySlug` applies to a single creative).
 */
export async function getPublicOrganization(slug: string): Promise<PublicOrganization> {
  const organization = await findBySlug(slug);
  if (organization.status !== 'published') throw AppError.notFound('No such organisation.');

  const [crafts, municipality, memberRows] = await Promise.all([
    craftsFor(organization.id),
    municipalityOf(organization.municipalityId),
    db
      .select({
        role: organizationMembers.role,
        title: organizationMembers.title,
        profileSlug: creativeProfiles.slug,
        displayName: creativeProfiles.displayName,
        firstName: users.firstName,
        middleName: users.middleName,
        lastName: users.lastName,
        suffix: users.suffix,
        avatarKey: users.avatarKey,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .innerJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(users.status, 'active'),
          eq(creativeProfiles.status, 'published'),
        ),
      )
      .orderBy(ROLE_ORDER, asc(organizationMembers.joinedAt)),
  ]);

  const members: PublicOrganizationMember[] = memberRows.map((row) => ({
    displayName: row.displayName ?? formatFullName(row),
    profileSlug: row.profileSlug,
    avatarUrl: avatarUrl(row.avatarKey),
    role: row.role,
    title: row.title,
  }));

  return {
    slug: organization.slug,
    name: organization.name,
    bio: organization.bio,
    logoUrl: avatarUrl(organization.logoKey),
    municipality,
    crafts,
    members,
    createdAt: organization.createdAt.toISOString(),
  };
}

/**
 * The team's own view, in any status. Members see it; non-members get the same
 * 404 a missing organisation would, so an unpublished page does not leak.
 * Pending invitations are included for the founder and co-founders, who can
 * act on them; a plain member sees the team but not who has been asked.
 */
export async function getManagedOrganization(input: {
  userId: string;
  slug: string;
}): Promise<ManagedOrganization> {
  const organization = await findBySlug(input.slug);
  const myRole = await roleIn(organization.id, input.userId);
  if (!myRole) throw AppError.notFound('No such organisation.');

  const [crafts, municipality, memberRows] = await Promise.all([
    craftsFor(organization.id),
    municipalityOf(organization.municipalityId),
    db
      .select({
        userId: users.id,
        username: users.username,
        role: organizationMembers.role,
        title: organizationMembers.title,
        joinedAt: organizationMembers.joinedAt,
        profileSlug: creativeProfiles.slug,
        displayName: creativeProfiles.displayName,
        firstName: users.firstName,
        middleName: users.middleName,
        lastName: users.lastName,
        suffix: users.suffix,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
      .where(eq(organizationMembers.organizationId, organization.id))
      .orderBy(ROLE_ORDER, asc(organizationMembers.joinedAt)),
  ]);

  const members: ManagedOrganizationMember[] = memberRows.map((row) => ({
    userId: row.userId,
    username: row.username,
    displayName: row.displayName ?? formatFullName(row),
    profileSlug: row.profileSlug,
    role: row.role,
    title: row.title,
    joinedAt: row.joinedAt.toISOString(),
  }));

  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    bio: organization.bio,
    logoUrl: avatarUrl(organization.logoKey),
    municipality,
    crafts,
    status: organization.status,
    rejectionReason: organization.rejectionReason,
    editedSinceReviewAt: organization.editedSinceReviewAt?.toISOString() ?? null,
    myRole,
    members,
    invitations: myRole === 'member' ? [] : await invitationsFor(organization.id),
    createdAt: organization.createdAt.toISOString(),
  };
}

/** Every organisation the person belongs to, for the account hub. */
export async function listMyOrganizations(userId: string): Promise<MyOrganization[]> {
  return db
    .select({
      slug: organizations.slug,
      name: organizations.name,
      status: organizations.status,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(ROLE_ORDER, asc(organizations.name));
}

/**
 * The organisation's unanswered invitations, expired ones included and marked,
 * so the team can see who never replied and send again.
 */
export async function invitationsFor(organizationId: string): Promise<PendingOrganizationInvitation[]> {
  const rows = await db
    .select({
      id: organizationInvitations.id,
      username: users.username,
      role: organizationInvitations.role,
      title: organizationInvitations.title,
      createdAt: organizationInvitations.createdAt,
      expiresAt: organizationInvitations.expiresAt,
      displayName: creativeProfiles.displayName,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
    })
    .from(organizationInvitations)
    .innerJoin(users, eq(organizationInvitations.invitedUserId, users.id))
    .leftJoin(creativeProfiles, eq(creativeProfiles.userId, users.id))
    .where(
      and(
        eq(organizationInvitations.organizationId, organizationId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.declinedAt),
      ),
    )
    .orderBy(asc(organizationInvitations.createdAt));

  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName ?? formatFullName(row),
    role: row.role,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt.getTime() <= now,
  }));
}
