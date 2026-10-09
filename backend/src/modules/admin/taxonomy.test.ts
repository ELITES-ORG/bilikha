import { afterEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeProfileSubdomains,
  creativeSubdomains,
  offers,
  organizationSubdomains,
  organizations,
  postings,
  taxonomyChanges,
} from '../../db/schema/index.js';
import {
  makeAdmin,
  makeCreative,
  makeOffer,
  makePosting,
  makeUser,
  municipalityIdAt,
} from '../../test/factories.js';
import { createOffer, updateOffer } from '../offers/offers.service.js';
import { createPosting, updatePosting } from '../postings/postings.service.js';
import { AppError } from '../../lib/http-error.js';
import { updateTaxonomySchema } from './taxonomy.schema.js';
import {
  archiveTaxonomyItem,
  createDomain,
  createSubdomain,
  deleteTaxonomyItem,
  listTaxonomyChanges,
  listTaxonomyForAdmin,
  restoreTaxonomyItem,
  updateTaxonomyItem,
} from './taxonomy.service.js';

/**
 * Reference tables are never truncated between tests (`src/test/setup.ts`),
 * because everything else has a foreign key into them. So every case here
 * works on its own `zz-test-` items and removes them afterwards rather than
 * touching a seeded domain — a leaked row would change the 9/81 counts that
 * other suites and the seed test rely on.
 */
const TEST_PREFIX = 'zz-test-';

afterEach(async () => {
  const subs = await db
    .select({ id: creativeSubdomains.id })
    .from(creativeSubdomains)
    .where(like(creativeSubdomains.slug, `${TEST_PREFIX}%`));

  if (subs.length > 0) {
    const ids = subs.map((s) => s.id);
    // Everything that references a test sub-domain goes first: the references
    // are ON DELETE RESTRICT, and a cleanup that fails leaks `zz-test-` rows
    // into every later run.
    await db.delete(offers).where(inArray(offers.subdomainId, ids));
    await db.delete(postings).where(inArray(postings.subdomainId, ids));
    await db.delete(creativeProfileSubdomains).where(
      inArray(creativeProfileSubdomains.subdomainId, ids),
    );
    await db.delete(organizationSubdomains).where(
      inArray(organizationSubdomains.subdomainId, ids),
    );
  }

  await db.delete(creativeSubdomains).where(like(creativeSubdomains.slug, `${TEST_PREFIX}%`));
  await db.delete(creativeDomains).where(like(creativeDomains.slug, `${TEST_PREFIX}%`));
  await db.delete(taxonomyChanges).where(like(taxonomyChanges.itemSlug, `${TEST_PREFIX}%`));
});

async function makeTestDomain(adminId: string, suffix = 'domain') {
  return createDomain({
    adminId,
    input: { slug: `${TEST_PREFIX}${suffix}`, name: 'ZZ Test Domain' },
  });
}

async function makeTestSubdomain(adminId: string, domainSlug: string, suffix = 'sub') {
  return createSubdomain({
    adminId,
    input: {
      domainSlug,
      slug: `${TEST_PREFIX}${suffix}`,
      name: 'ZZ Test Sub-domain',
    },
  });
}

async function auditFor(slug: string) {
  return db
    .select()
    .from(taxonomyChanges)
    .where(eq(taxonomyChanges.itemSlug, slug))
    .orderBy(taxonomyChanges.createdAt);
}

describe('admin taxonomy — creating', () => {
  it('creates a domain and records who did it', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);

    expect(domain.slug).toBe(`${TEST_PREFIX}domain`);
    expect(domain.archivedAt).toBeNull();

    const audit = await auditFor(domain.slug);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('created');
    expect(audit[0]?.itemKind).toBe('domain');
    expect(audit[0]?.adminId).toBe(admin.id);
  });

  it('creates a sub-domain under an existing domain', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);

    expect(sub.domainId).toBe(domain.id);

    const audit = await auditFor(sub.slug);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.itemKind).toBe('subdomain');
  });

  it('refuses a slug that is already taken', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    await makeTestSubdomain(admin.id, domain.slug);

    await expect(makeTestSubdomain(admin.id, domain.slug)).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a sub-domain under a domain that does not exist', async () => {
    const admin = await makeAdmin();

    await expect(
      makeTestSubdomain(admin.id, `${TEST_PREFIX}no-such-domain`),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('admin taxonomy — editing', () => {
  it('renames an item and records what moved', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);

    const updated = await updateTaxonomyItem({
      kind: 'subdomains',
      slug: sub.slug,
      adminId: admin.id,
      input: { name: 'ZZ Renamed' },
    });

    expect(updated.name).toBe('ZZ Renamed');

    const audit = await auditFor(sub.slug);
    expect(audit.map((row) => row.action)).toEqual(['created', 'updated']);
    expect(audit[1]?.before).toMatchObject({ name: 'ZZ Test Sub-domain' });
    expect(audit[1]?.after).toMatchObject({ name: 'ZZ Renamed' });
  });

  it('cannot be asked to change a slug', () => {
    expect(() => updateTaxonomySchema.parse({ slug: 'something-else' })).toThrow();
    expect(() => updateTaxonomySchema.parse({ name: 'Fine', slug: 'sneaky' })).toThrow();
    expect(() => updateTaxonomySchema.parse({ name: 'Fine' })).not.toThrow();
  });

  it('refuses an empty update', () => {
    expect(() => updateTaxonomySchema.parse({})).toThrow();
  });
});

describe('admin taxonomy — archiving', () => {
  it('archives a referenced sub-domain and leaves the reference intact', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    const { profile } = await makeCreative();

    await db
      .insert(creativeProfileSubdomains)
      .values({ profileId: profile.id, subdomainId: sub.id, isPrimary: false });

    const archived = await archiveTaxonomyItem({
      kind: 'subdomains',
      slug: sub.slug,
      adminId: admin.id,
    });
    expect(archived.archivedAt).not.toBeNull();

    const links = await db
      .select()
      .from(creativeProfileSubdomains)
      .where(
        and(
          eq(creativeProfileSubdomains.profileId, profile.id),
          eq(creativeProfileSubdomains.subdomainId, sub.id),
        ),
      );
    expect(links).toHaveLength(1);
  });

  it('archiving a domain archives its sub-domains in the same breath', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);

    await archiveTaxonomyItem({ kind: 'domains', slug: domain.slug, adminId: admin.id });

    const [row] = await db
      .select({ archivedAt: creativeSubdomains.archivedAt })
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.id, sub.id));
    expect(row?.archivedAt).not.toBeNull();

    const audit = await auditFor(sub.slug);
    expect(audit.map((entry) => entry.action)).toEqual(['created', 'archived']);
  });

  it('restores an archived item', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);

    await archiveTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });
    const restored = await restoreTaxonomyItem({
      kind: 'subdomains',
      slug: sub.slug,
      adminId: admin.id,
    });

    expect(restored.archivedAt).toBeNull();
    const audit = await auditFor(sub.slug);
    expect(audit.map((entry) => entry.action)).toEqual(['created', 'archived', 'restored']);
  });

  it('hides archived items from the public tree and keeps them in the admin one', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    await archiveTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });

    const { listDomains } = await import('../taxonomy/taxonomy.service.js');
    const publicTree = await listDomains();
    const publicSlugs = publicTree.flatMap((d) => d.subdomains.map((s) => s.slug));
    expect(publicSlugs).not.toContain(sub.slug);

    const adminTree = await listTaxonomyForAdmin();
    const adminSlugs = adminTree.flatMap((d) => d.subdomains.map((s) => s.slug));
    expect(adminSlugs).toContain(sub.slug);
  });
});

describe('archiving and the people already registered under it', () => {
  it('lets a creative re-save a profile whose sub-domain was archived', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    const { user, profile } = await makeCreative();

    // The archived sub-domain is the profile's only one, which is the case
    // that locks someone out if the edit path filters on active alone.
    await db
      .delete(creativeProfileSubdomains)
      .where(eq(creativeProfileSubdomains.profileId, profile.id));
    await db
      .insert(creativeProfileSubdomains)
      .values({ profileId: profile.id, subdomainId: sub.id, isPrimary: true });

    await archiveTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });

    const { getOwnProfile, updateOwnProfile } = await import('../me/me.service.js');
    const own = await getOwnProfile(user.id);

    const saved = await updateOwnProfile(user.id, {
      firstName: own!.firstName,
      lastName: own!.lastName,
      municipalitySlug: own!.municipalitySlug,
      subdomainSlugs: [sub.slug],
      primarySubdomainSlug: sub.slug,
      contactPreference: own!.contactPreference,
    } as Parameters<typeof updateOwnProfile>[1]);

    expect(saved.subdomainSlugs).toContain(sub.slug);
  });

  it('refuses an archived sub-domain the profile does not already hold', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    const { user } = await makeCreative();

    await archiveTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });

    const { getOwnProfile, updateOwnProfile } = await import('../me/me.service.js');
    const own = await getOwnProfile(user.id);

    await expect(
      updateOwnProfile(user.id, {
        firstName: own!.firstName,
        lastName: own!.lastName,
        municipalitySlug: own!.municipalitySlug,
        subdomainSlugs: [sub.slug],
        primarySubdomainSlug: sub.slug,
        contactPreference: own!.contactPreference,
      } as Parameters<typeof updateOwnProfile>[1]),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('admin taxonomy — deleting', () => {
  it('refuses to delete a referenced sub-domain', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    const { profile } = await makeCreative();

    await db
      .insert(creativeProfileSubdomains)
      .values({ profileId: profile.id, subdomainId: sub.id, isPrimary: false });

    await expect(
      deleteTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id }),
    ).rejects.toMatchObject({ status: 409 });

    const [still] = await db
      .select()
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.id, sub.id));
    expect(still).toBeDefined();
  });

  it('counts an organisation as a reference, so delete is neither offered nor misreported', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    const [org] = await db
      .insert(organizations)
      .values({
        slug: `${TEST_PREFIX}org`,
        name: 'ZZ Test Studio',
        municipalityId: await municipalityIdAt(0),
      })
      .returning();
    await db.insert(organizationSubdomains).values({ organizationId: org!.id, subdomainId: sub.id });

    // The admin page offers Delete only at zero references.
    const tree = await listTaxonomyForAdmin();
    const listed = tree
      .find((item) => item.slug === domain.slug)
      ?.subdomains.find((item) => item.slug === sub.slug);
    expect(listed?.referenceCount).toBe(1);

    await expect(
      deleteTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/used by 1 /) });
  });

  it('deletes an unreferenced sub-domain and keeps its history', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);

    await deleteTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });

    const rows = await db
      .select()
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.id, sub.id));
    expect(rows).toHaveLength(0);

    // The audit row outlives the item: item_slug is text, not a foreign key.
    const audit = await auditFor(sub.slug);
    expect(audit.map((entry) => entry.action)).toEqual(['created', 'deleted']);
  });

  it('reports a missing item as a 404, not a silent success', async () => {
    const admin = await makeAdmin();

    await expect(
      deleteTaxonomyItem({ kind: 'subdomains', slug: `${TEST_PREFIX}ghost`, adminId: admin.id }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('admin taxonomy — the change log', () => {
  it('lists changes newest first, naming the administrator', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    await updateTaxonomyItem({
      kind: 'domains',
      slug: domain.slug,
      adminId: admin.id,
      input: { name: 'ZZ Renamed Domain' },
    });

    const { rows } = await listTaxonomyChanges({ page: 1, limit: 20 });
    const mine = rows.filter((row) => row.itemSlug === domain.slug);

    expect(mine[0]?.action).toBe('updated');
    expect(mine[0]?.adminUsername).toBe(admin.username);
  });
});

describe('admin taxonomy — deleting a domain', () => {
  it('records a deleted row for each sub-domain removed with it', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const first = await makeTestSubdomain(admin.id, domain.slug, 'sub-one');
    const second = await makeTestSubdomain(admin.id, domain.slug, 'sub-two');

    await deleteTaxonomyItem({ kind: 'domains', slug: domain.slug, adminId: admin.id });

    for (const sub of [first, second]) {
      const rows = await auditFor(sub.slug);
      const deleted = rows.filter((row) => row.action === 'deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0]).toMatchObject({ itemKind: 'subdomain', adminId: admin.id });
      expect(deleted[0]!.before).toMatchObject({ viaDomain: domain.slug });
    }
    const [domainRow] = (await auditFor(domain.slug)).filter((row) => row.action === 'deleted');
    expect(domainRow).toMatchObject({ itemKind: 'domain', adminId: admin.id });
  });

  it('refuses a domain whose sub-domain is referenced, and deletes nothing', async () => {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    const { profile } = await makeCreative();
    await db
      .insert(creativeProfileSubdomains)
      .values({ profileId: profile.id, subdomainId: sub.id, isPrimary: false });

    await expect(
      deleteTaxonomyItem({ kind: 'domains', slug: domain.slug, adminId: admin.id }),
    ).rejects.toMatchObject({ status: 409 });

    const [still] = await db
      .select()
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.id, sub.id));
    expect(still).toBeDefined();
    expect((await auditFor(sub.slug)).some((row) => row.action === 'deleted')).toBe(false);
  });
});

describe('admin taxonomy — archived sub-domains in offers and postings', () => {
  async function archivedTestSubdomain() {
    const admin = await makeAdmin();
    const domain = await makeTestDomain(admin.id);
    const sub = await makeTestSubdomain(admin.id, domain.slug);
    await archiveTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });
    return sub;
  }

  it('refuses a new posting under an archived sub-domain', async () => {
    const sub = await archivedTestSubdomain();
    const client = await makeUser();

    await expect(
      createPosting(client.id, {
        title: 'Need a test',
        subdomainSlug: sub.slug,
        municipalitySlug: 'naval',
        expiresInDays: 30,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lets an existing posting keep its archived sub-domain through an edit', async () => {
    const sub = await archivedTestSubdomain();
    const client = await makeUser();
    const posting = await makePosting(client.id, { subdomainId: sub.id });

    const updated = await updatePosting(client.id, posting.id, {
      subdomainSlug: sub.slug,
      title: 'Still need a test',
      description: undefined,
    });
    expect(updated).toBeDefined();
  });

  it('refuses a new offer under an archived sub-domain the profile still holds', async () => {
    const sub = await archivedTestSubdomain();
    const { user, profile } = await makeCreative();
    await db
      .insert(creativeProfileSubdomains)
      .values({ profileId: profile.id, subdomainId: sub.id, isPrimary: false });

    await expect(
      createOffer(user.id, { title: 'Test offer', subdomainSlug: sub.slug }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lets an existing offer keep its archived sub-domain through an edit', async () => {
    const sub = await archivedTestSubdomain();
    const { user, profile } = await makeCreative();
    await db
      .insert(creativeProfileSubdomains)
      .values({ profileId: profile.id, subdomainId: sub.id, isPrimary: false });
    const offer = await makeOffer(profile.id, { subdomainId: sub.id });

    const updated = await updateOffer(user.id, offer.id, {
      subdomainSlug: sub.slug,
      title: 'Renamed offer',
      description: undefined,
    });
    expect(updated).toBeDefined();
  });
});
