import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeSubdomains, moderationActions, organizations } from '../../db/schema/index.js';
import { makeAdmin, makeCreative } from '../../test/factories.js';
import { reviewContent } from '../admin/content-review.service.js';
import { listNotifications } from '../notifications/notifications.service.js';
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
  it('waits for review in the pending slot, leaving the approved logo public', async () => {
    const { founder, slug, id } = await teamWithMember({ publish: true });
    await db.update(organizations).set({ logoKey: 'organizations/approved/old.webp' }).where(eq(organizations.id, id));

    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    const org = await row(id);
    expect(org.logoPendingKey).toBe(keyFor(id));
    expect(org.logoKey).toBe('organizations/approved/old.webp');
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

  it('withdraws a logo waiting for review first, and takes down the approved one after', async () => {
    const { founder, slug, id } = await teamWithMember();
    await db.update(organizations).set({ logoKey: 'organizations/approved/old.webp' }).where(eq(organizations.id, id));
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    expect(await clearLogo({ userId: founder.user.id, slug })).toEqual({ removed: true });
    expect(await row(id)).toMatchObject({ logoPendingKey: null, logoKey: 'organizations/approved/old.webp' });

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
  it('approving makes the new logo the public one', async () => {
    const { founder, slug, id } = await teamWithMember();
    const admin = await makeAdmin();
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    await reviewContent({ kind: 'logo', id, adminId: admin.id, action: 'approve' });

    expect(await row(id)).toMatchObject({ logoKey: keyFor(id), logoPendingKey: null });
  });

  it('rejecting needs a reason, keeps the approved logo and the page, and tells the founder why', async () => {
    const { founder, slug, id } = await teamWithMember({ publish: true });
    const admin = await makeAdmin();
    await db.update(organizations).set({ logoKey: 'organizations/approved/old.webp' }).where(eq(organizations.id, id));
    await setLogo({ userId: founder.user.id, slug, objectKey: keyFor(id) });

    await expect(reviewContent({ kind: 'logo', id, adminId: admin.id, action: 'reject' })).rejects.toMatchObject({
      status: 400,
    });
    await reviewContent({ kind: 'logo', id, adminId: admin.id, action: 'reject', reason: 'This is a stock image.' });

    expect(await row(id)).toMatchObject({
      logoKey: 'organizations/approved/old.webp',
      logoPendingKey: null,
      logoRejectionReason: 'This is a stock image.',
      status: 'published',
    });
    const [audit] = await db
      .select()
      .from(moderationActions)
      .where(and(eq(moderationActions.organizationId, id), eq(moderationActions.action, 'media_removed')));
    expect(audit).toMatchObject({ subjectUserId: founder.user.id, adminId: admin.id, reason: 'This is a stock image.' });
    const { data } = await listNotifications(founder.user.id, { page: 1, limit: 10 });
    expect(data.find((n) => n.type === 'logo_rejected')).toMatchObject({
      detail: 'This is a stock image.',
      link: `/organizations/${slug}/manage`,
    });
  });

  it('is a 404 when no logo is waiting', async () => {
    const { id } = await teamWithMember();
    const admin = await makeAdmin();
    await expect(reviewContent({ kind: 'logo', id, adminId: admin.id, action: 'approve' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
