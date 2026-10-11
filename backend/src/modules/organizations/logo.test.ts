import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeSubdomains, moderationActions, organizations } from '../../db/schema/index.js';
import { makeAdmin, makeCreative } from '../../test/factories.js';
import { reviewMedia } from '../admin/admin.service.js';
import { moderateOrganization } from '../admin/organization-review.service.js';
import { clearLogo, issueLogoUpload, setLogo } from './logo.service.js';
import { acceptInvitation, invite, leaveOrganization } from './membership.service.js';
import { foundOrganization } from './organizations.service.js';

/**
 * Organisation logos (plan 0051 follow-up). Storage is not configured under
 * test, so these cover what the API decides — who may set a logo, which
 * objects they may attach, what review sees — not the upload itself.
 */

async function teamWithMember(options: { publish?: boolean } = {}) {
  const founder = await makeCreative();
  const member = await makeCreative();
  const [craft] = await db.select({ slug: creativeSubdomains.slug }).from(creativeSubdomains).limit(1);
  const { slug } = await foundOrganization({
    userId: founder.user.id,
    data: {
      name: `ZZ Logo ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      municipalitySlug: 'almeria',
      subdomainSlugs: [craft!.slug],
      primarySubdomainSlug: craft!.slug,
    },
  });
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  const { id } = await invite({
    inviterId: founder.user.id,
    slug,
    data: { username: member.user.username, role: 'member' },
  });
  await acceptInvitation({ userId: member.user.id, invitationId: id });
  if (options.publish) {
    const admin = await makeAdmin();
    await moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'approved' });
  }
  return { founder, member, slug, id: org!.id };
}

const keyFor = (organizationId: string) => `organizations/${organizationId}/logo-test.webp`;

async function row(id: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  return org!;
}

describe('setting a logo', () => {
  it('attaches an object under the organisation, unreviewed, and flags a published page as edited', async () => {
    const { founder, slug, id } = await teamWithMember({ publish: true });

    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    const org = await row(id);
    expect(org.logoKey).toBe(keyFor(id));
    expect(org.logoReviewedAt).toBeNull();
    expect(org.editedSinceReviewAt).not.toBeNull();
    expect(org.status).toBe('published');
  });

  it("refuses another organisation's object, and a key that climbs out of its folder", async () => {
    const mine = await teamWithMember();
    const theirs = await teamWithMember();

    await expect(
      setLogo({ userId: mine.founder.user.id, slug: mine.slug, objectKey: keyFor(theirs.id) }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setLogo({
        userId: mine.founder.user.id,
        slug: mine.slug,
        objectKey: `organizations/${mine.id}/../${theirs.id}/x.webp`,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('is for the founder and co-founders: a member is refused, a stranger sees no organisation', async () => {
    const { member, slug, id } = await teamWithMember();
    const stranger = await makeCreative();

    await expect(setLogo({ userId: member.user.id, slug, objectKey: keyFor(id) })).rejects.toMatchObject({
      status: 403,
    });
    await expect(setLogo({ userId: stranger.user.id, slug, objectKey: keyFor(id) })).rejects.toMatchObject({
      status: 404,
    });
    await expect(issueLogoUpload({ userId: member.user.id, slug })).rejects.toMatchObject({ status: 403 });
  });

  it('answers 503, not 500, when image storage is not set up', async () => {
    const { founder, slug } = await teamWithMember();
    await expect(issueLogoUpload({ userId: founder.user.id, slug })).rejects.toMatchObject({ status: 503 });
  });

  it('can be removed', async () => {
    const { founder, slug, id } = await teamWithMember();
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    expect(await clearLogo({ userId: founder.user.id, slug })).toEqual({ removed: true });
    expect((await row(id)).logoKey).toBeNull();
  });

  it('does not stop a founder alone closing the organisation', async () => {
    const founder = await makeCreative();
    const [craft] = await db.select({ slug: creativeSubdomains.slug }).from(creativeSubdomains).limit(1);
    const { slug } = await foundOrganization({
      userId: founder.user.id,
      data: {
        name: `ZZ Logo Close ${Date.now()}`,
        municipalitySlug: 'almeria',
        subdomainSlugs: [craft!.slug],
        primarySubdomainSlug: craft!.slug,
      },
    });
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(org!.id) });

    await expect(leaveOrganization({ userId: founder.user.id, slug })).resolves.toEqual({ closed: true });
  });
});

describe('reviewing a logo', () => {
  it('approving marks the current logo as seen', async () => {
    const { founder, slug, id } = await teamWithMember();
    const admin = await makeAdmin();
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    await reviewMedia({ kind: 'logo', id, adminId: admin.id, action: 'approve' });

    expect((await row(id)).logoReviewedAt).not.toBeNull();
  });

  it('removing takes the logo off, keeps the page, and records it against the organisation and founder', async () => {
    const { founder, slug, id } = await teamWithMember({ publish: true });
    const admin = await makeAdmin();
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    await reviewMedia({ kind: 'logo', id, adminId: admin.id, action: 'remove' });

    const org = await row(id);
    expect(org.logoKey).toBeNull();
    expect(org.status).toBe('published');
    const [audit] = await db
      .select()
      .from(moderationActions)
      .where(and(eq(moderationActions.organizationId, id), eq(moderationActions.action, 'media_removed')));
    expect(audit).toMatchObject({ subjectUserId: founder.user.id, adminId: admin.id });
  });

  it('is a 404 for an organisation with no logo', async () => {
    const { id } = await teamWithMember();
    const admin = await makeAdmin();
    await expect(reviewMedia({ kind: 'logo', id, adminId: admin.id, action: 'approve' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
