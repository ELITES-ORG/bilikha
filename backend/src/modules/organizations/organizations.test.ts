import { afterEach, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeSubdomains,
  moderationActions,
  notifications,
  organizationMembers,
  organizations,
} from '../../db/schema/index.js';
import { makeAdmin, makeCreative, makeUser } from '../../test/factories.js';
import {
  listOrganizationsForReview,
  moderateOrganization,
} from '../admin/organization-review.service.js';
import {
  ORGANIZATION_CAP,
  foundOrganization,
  getPublicOrganization,
  listPublishedOrganizations,
  slugify,
  updateOrganization,
} from './organizations.service.js';

/**
 * Plan 0051 phase 2 — founding and review. The database-level invariants are
 * in `organizations.integrity.test.ts`; these are the service rules on top.
 */

/** Seeded sub-domains, grouped so a test can pick one, two or three domains. */
async function craftsAcrossDomains(domainCount: number) {
  const rows = await db
    .select({ slug: creativeSubdomains.slug, domainId: creativeSubdomains.domainId })
    .from(creativeSubdomains)
    .orderBy(creativeSubdomains.domainId, creativeSubdomains.displayOrder);

  const picked: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.domainId)) continue;
    seen.add(row.domainId);
    picked.push(row.slug);
    if (picked.length === domainCount) break;
  }
  return picked;
}

async function input(name = 'ZZ Test Studio') {
  const [craft] = await craftsAcrossDomains(1);
  return {
    name,
    municipalitySlug: 'almeria',
    subdomainSlugs: [craft!],
    primarySubdomainSlug: craft!,
  };
}

/** Archived throwaway sub-domains, never seeded ones: reference data is not truncated. */
const THROWAWAY = 'zz-test-org-archived-';
afterEach(async () => {
  await db.delete(creativeSubdomains).where(like(creativeSubdomains.slug, `${THROWAWAY}%`));
});

describe('founding an organisation', () => {
  it('refuses someone without a published creative profile', async () => {
    const { user } = await makeCreative({ profile: { status: 'pending_review' } });

    await expect(
      foundOrganization({ userId: user.id, data: await input() }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an account with no profile at all', async () => {
    const user = await makeUser();
    await expect(foundOrganization({ userId: user.id, data: await input() })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('creates the page in review, with its founder, in one go', async () => {
    const { user } = await makeCreative();
    const created = await foundOrganization({ userId: user.id, data: await input() });

    expect(created.status).toBe('pending_review');

    const [org] = await db.select().from(organizations).where(eq(organizations.slug, created.slug));
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, org!.id));

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: user.id, role: 'founder' });
  });

  it(`refuses a ${ORGANIZATION_CAP + 1}th organisation`, async () => {
    const { user } = await makeCreative();
    for (let i = 0; i < ORGANIZATION_CAP; i += 1) {
      await foundOrganization({ userId: user.id, data: await input(`ZZ Cap ${i}`) });
    }

    await expect(
      foundOrganization({ userId: user.id, data: await input('ZZ One Too Many') }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('does not count a rejected organisation toward the cap — its founder can submit a new one', async () => {
    const { user } = await makeCreative();
    const admin = await makeAdmin();
    const slugs: string[] = [];
    for (let i = 0; i < ORGANIZATION_CAP; i += 1) {
      slugs.push((await foundOrganization({ userId: user.id, data: await input(`ZZ Rej ${i}`) })).slug);
    }

    const [first] = await db.select().from(organizations).where(eq(organizations.slug, slugs[0]!));
    await moderateOrganization({
      organizationId: first!.id,
      adminId: admin.id,
      action: 'rejected',
      reason: 'Not a real studio.',
    });

    const sixth = await foundOrganization({ userId: user.id, data: await input('ZZ Fresh Start') });
    expect(sixth.status).toBe('pending_review');
  });

  it('gives a second organisation with the same name its own slug', async () => {
    const a = await makeCreative();
    const b = await makeCreative();
    const first = await foundOrganization({ userId: a.user.id, data: await input('ZZ Same Name') });
    const second = await foundOrganization({ userId: b.user.id, data: await input('ZZ Same Name') });

    expect(first.slug).toBe('zz-same-name');
    expect(second.slug).toBe('zz-same-name-2');
  });

  it('never hands out a slug that would shadow a route', async () => {
    const { user } = await makeCreative();
    const created = await foundOrganization({ userId: user.id, data: await input('Mine') });
    expect(created.slug).not.toBe('mine');
  });

  it('folds accents rather than dropping letters', () => {
    expect(slugify('Peñafrancia Créatives!')).toBe('penafrancia-creatives');
    expect(slugify('***')).toBe('organisation');
  });

  it('refuses crafts from more than two domains', async () => {
    const { user } = await makeCreative();
    const three = await craftsAcrossDomains(3);

    await expect(
      foundOrganization({
        userId: user.id,
        data: { ...(await input()), subdomainSlugs: three, primarySubdomainSlug: three[0]! },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses an archived craft', async () => {
    const { user } = await makeCreative();
    const [domain] = await db.select({ id: creativeDomains.id }).from(creativeDomains).limit(1);
    const slug = `${THROWAWAY}${Date.now()}`;
    await db.insert(creativeSubdomains).values({
      domainId: domain!.id,
      slug,
      name: 'ZZ Archived',
      displayOrder: 999,
      archivedAt: new Date(),
    });

    await expect(
      foundOrganization({
        userId: user.id,
        data: { ...(await input()), subdomainSlugs: [slug], primarySubdomainSlug: slug },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('editing an organisation', () => {
  async function published() {
    const founder = await makeCreative();
    const admin = await makeAdmin();
    const { slug } = await foundOrganization({ userId: founder.user.id, data: await input() });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    await moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'approved' });
    return { founder, slug, id: org!.id };
  }

  it('flags an edit to a published page instead of taking it down', async () => {
    const { founder, slug, id } = await published();
    await updateOrganization({ userId: founder.user.id, slug, data: { bio: 'We make films.' } });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    expect(org!.status).toBe('published');
    expect(org!.editedSinceReviewAt).not.toBeNull();
  });

  it('resubmits a rejected page when it is edited', async () => {
    const founder = await makeCreative();
    const admin = await makeAdmin();
    const { slug } = await foundOrganization({ userId: founder.user.id, data: await input() });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    await moderateOrganization({
      organizationId: org!.id,
      adminId: admin.id,
      action: 'rejected',
      reason: 'Add a bio.',
    });

    await updateOrganization({ userId: founder.user.id, slug, data: { bio: 'Now with a bio.' } });

    const [after] = await db.select().from(organizations).where(eq(organizations.id, org!.id));
    expect(after!.status).toBe('pending_review');
    expect(after!.rejectionReason).toBeNull();
  });

  it('never changes the slug', async () => {
    const { founder, slug, id } = await published();
    await updateOrganization({ userId: founder.user.id, slug, data: { name: 'ZZ Renamed Studio' } });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    expect(org!.slug).toBe(slug);
    expect(org!.name).toBe('ZZ Renamed Studio');
  });

  it('lets a co-founder edit the page but not the crafts', async () => {
    const { slug, id } = await published();
    const coFounder = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: coFounder.user.id, role: 'co_founder' });

    await updateOrganization({ userId: coFounder.user.id, slug, data: { bio: 'Edited by a co-founder.' } });

    const [craft] = await craftsAcrossDomains(1);
    await expect(
      updateOrganization({
        userId: coFounder.user.id,
        slug,
        data: { subdomainSlugs: [craft!], primarySubdomainSlug: craft! },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses a plain member, and a stranger', async () => {
    const { slug, id } = await published();
    const member = await makeCreative();
    const stranger = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });

    for (const person of [member, stranger]) {
      await expect(
        updateOrganization({ userId: person.user.id, slug, data: { bio: 'x' } }),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe('reviewing an organisation', () => {
  it('shows the reviewer the bio and crafts the public would read', async () => {
    const founder = await makeCreative();
    const data = { ...(await input()), bio: 'We film weddings in Naval.' };
    const { slug } = await foundOrganization({ userId: founder.user.id, data });

    const { rows } = await listOrganizationsForReview({ status: 'pending_review', page: 1, limit: 50 });
    const row = rows.find((r) => r.slug === slug);
    expect(row).toMatchObject({ bio: 'We film weddings in Naval.', founderUsername: founder.user.username });
    expect(row!.crafts).toHaveLength(1);
  });

  it('approving publishes the page, records it, and tells the founder', async () => {
    const founder = await makeCreative();
    const admin = await makeAdmin();
    const { slug } = await foundOrganization({ userId: founder.user.id, data: await input() });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));

    await moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'approved' });

    const [after] = await db.select().from(organizations).where(eq(organizations.id, org!.id));
    expect(after!.status).toBe('published');

    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.organizationId, org!.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'approved', adminId: admin.id, subjectUserId: founder.user.id });

    const told = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, founder.user.id), eq(notifications.type, 'organization_approved')));
    expect(told).toHaveLength(1);
  });

  it('requires a reason to reject, and records it for the founder', async () => {
    const founder = await makeCreative();
    const admin = await makeAdmin();
    const { slug } = await foundOrganization({ userId: founder.user.id, data: await input() });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));

    await expect(
      moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'rejected' }),
    ).rejects.toMatchObject({ status: 400 });

    await moderateOrganization({
      organizationId: org!.id,
      adminId: admin.id,
      action: 'rejected',
      reason: 'The name copies a real company.',
    });
    const [after] = await db.select().from(organizations).where(eq(organizations.id, org!.id));
    expect(after!.status).toBe('rejected');
    expect(after!.rejectionReason).toBe('The name copies a real company.');
  });
});

describe('the public page', () => {
  it('is a 404 until the page is approved', async () => {
    const founder = await makeCreative();
    const { slug } = await foundOrganization({ userId: founder.user.id, data: await input() });

    await expect(getPublicOrganization(slug)).rejects.toMatchObject({ status: 404 });
  });

  it('lists only members who could be seen in public themselves', async () => {
    const founder = await makeCreative();
    const admin = await makeAdmin();
    const hidden = await makeCreative({ profile: { status: 'pending_review' } });
    const { slug } = await foundOrganization({ userId: founder.user.id, data: await input() });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    await db.insert(organizationMembers).values({ organizationId: org!.id, userId: hidden.user.id, role: 'member' });
    await moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'approved' });

    const page = await getPublicOrganization(slug);

    expect(page.members.map((m) => m.profileSlug)).toEqual([founder.profile.slug]);
    expect(page.members[0]!.role).toBe('founder');
    // No user ids in the public view.
    expect(JSON.stringify(page)).not.toContain(founder.user.id);
  });
});

describe('the directory list', () => {
  it('shows only published organisations, filtered like creatives', async () => {
    const admin = await makeAdmin();
    const [craft] = await craftsAcrossDomains(1);
    const published = await makeCreative();
    const pending = await makeCreative();

    const shown = await foundOrganization({ userId: published.user.id, data: { ...(await input('ZZ Listed Studio')) } });
    await foundOrganization({ userId: pending.user.id, data: { ...(await input('ZZ Unlisted Studio')) } });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, shown.slug));
    await moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'approved' });

    const all = await listPublishedOrganizations({ limit: 50 });
    const names = all.map((o) => o.name);
    expect(names).toContain('ZZ Listed Studio');
    expect(names).not.toContain('ZZ Unlisted Studio');

    const card = all.find((o) => o.name === 'ZZ Listed Studio')!;
    expect(card.primaryCraft?.slug).toBe(craft);
    expect(card.memberCount).toBe(1);

    expect((await listPublishedOrganizations({ subdomain: craft!, limit: 50 })).map((o) => o.name)).toContain(
      'ZZ Listed Studio',
    );
    expect(
      (await listPublishedOrganizations({ municipality: 'naval', limit: 50 })).map((o) => o.name),
    ).not.toContain('ZZ Listed Studio');
  });
});
