import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeSubdomains,
  organizationInvitations,
  organizations,
  retiredOrganizationSlugs,
} from '../../db/schema/index.js';
import { makeAdmin, makeCreative, reinstate, suspend } from '../../test/factories.js';
import { moderateOrganization } from '../admin/organization-review.service.js';
import {
  acceptInvitation,
  handOver,
  invite,
  leaveOrganization,
  listMyInvitations,
  removeMember,
} from './membership.service.js';
import {
  ORGANIZATION_CAP,
  countTowardCap,
  foundOrganization,
  getPublicOrganization,
  listPublishedOrganizations,
  updateOrganization,
} from './organizations.service.js';

/**
 * The guards an audit of plan 0051 added: the cap holds through resubmission
 * and under concurrent requests, concurrent duplicates answer 409 rather than
 * 500, a page is public only while its founder is, invitations do not outlive
 * the power that sent them, and review does not touch a suspension.
 */

async function craft() {
  const [row] = await db
    .select({ slug: creativeSubdomains.slug, singularName: creativeSubdomains.singularName })
    .from(creativeSubdomains)
    .limit(1);
  return row!;
}

let counter = 0;
async function found(userId: string, name = `ZZ Guard ${(counter += 1)}-${Date.now()}`) {
  const { slug } = await craft();
  const created = await foundOrganization({
    userId,
    data: { name, municipalitySlug: 'almeria', subdomainSlugs: [slug], primarySubdomainSlug: slug },
  });
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, created.slug));
  return { slug: created.slug, id: row!.id };
}

async function decide(organizationId: string, action: 'approved' | 'rejected') {
  const admin = await makeAdmin();
  await moderateOrganization({
    organizationId,
    adminId: admin.id,
    action,
    ...(action === 'rejected' ? { reason: 'Please add a bio.' } : {}),
  });
}

/** The HTTP status a settled promise failed with, or 'ok'. */
function outcome(result: PromiseSettledResult<unknown>): number | 'ok' {
  return result.status === 'fulfilled' ? 'ok' : ((result.reason as { status?: number }).status ?? 500);
}

describe('the cap', () => {
  it('stops a rejected page going back for review when its founder has filled five elsewhere', async () => {
    const { user } = await makeCreative();
    const rejected = await found(user.id);
    await decide(rejected.id, 'rejected');
    for (let i = 0; i < ORGANIZATION_CAP; i += 1) await found(user.id);

    await expect(
      updateOrganization({ userId: user.id, slug: rejected.slug, data: { bio: 'Now with a bio.' } }),
    ).rejects.toMatchObject({ status: 409 });

    const [row] = await db.select().from(organizations).where(eq(organizations.id, rejected.id));
    expect(row!.status).toBe('rejected');
    expect(await countTowardCap(user.id)).toBe(ORGANIZATION_CAP);
  });

  it('stops it too when a member of the team has filled five since it was rejected', async () => {
    const founder = await makeCreative();
    const member = await makeCreative();
    const org = await found(founder.user.id);
    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: member.user.username, role: 'member' },
    });
    await acceptInvitation({ userId: member.user.id, invitationId });
    await decide(org.id, 'rejected');
    for (let i = 0; i < ORGANIZATION_CAP; i += 1) await found(member.user.id);

    await expect(
      updateOrganization({ userId: founder.user.id, slug: org.slug, data: { bio: 'Again.' } }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Someone in this team') });
  });

  it('holds when two foundings race at four', async () => {
    const { user } = await makeCreative();
    for (let i = 0; i < ORGANIZATION_CAP - 1; i += 1) await found(user.id);

    const results = await Promise.allSettled([found(user.id), found(user.id)]);

    expect(results.map(outcome).sort()).toEqual([409, 'ok']);
    expect(await countTowardCap(user.id)).toBe(ORGANIZATION_CAP);
  });
});

describe('concurrent duplicates', () => {
  it('gives two foundings of one name at once a slug each, not a 500', async () => {
    const [a, b] = await Promise.all([makeCreative(), makeCreative()]);
    const name = `ZZ Same Name ${Date.now()}`;

    const results = await Promise.allSettled([found(a.user.id, name), found(b.user.id, name)]);

    expect(results.map(outcome)).toEqual(['ok', 'ok']);
    const slugs = results.map((r) => (r as PromiseFulfilledResult<{ slug: string }>).value.slug);
    expect(new Set(slugs).size).toBe(2);
  });

  it('answers a double-clicked accept with a refusal, not a 500', async () => {
    const founder = await makeCreative();
    const invitee = await makeCreative();
    const org = await found(founder.user.id);
    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: invitee.user.username, role: 'member' },
    });

    const results = await Promise.allSettled([
      acceptInvitation({ userId: invitee.user.id, invitationId }),
      acceptInvitation({ userId: invitee.user.id, invitationId }),
    ]);

    const outcomes = results.map(outcome);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
    expect(outcomes.find((o) => o !== 'ok')).toBeOneOf([404, 409]);
  });

  it('answers two people inviting the same person at once with a refusal, not a 500', async () => {
    const founder = await makeCreative();
    const coFounder = await makeCreative();
    const invitee = await makeCreative();
    const org = await found(founder.user.id);
    const { id } = await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: coFounder.user.username, role: 'co_founder' },
    });
    await acceptInvitation({ userId: coFounder.user.id, invitationId: id });

    const data = { username: invitee.user.username, role: 'member' as const };
    const results = await Promise.allSettled([
      invite({ inviterId: founder.user.id, slug: org.slug, data }),
      invite({ inviterId: coFounder.user.id, slug: org.slug, data }),
    ]);

    expect(results.map(outcome).sort()).toEqual([409, 'ok']);
  });
});

describe('the founder fronts the page', () => {
  it('takes the page and its directory card down while the founder is suspended, and back after', async () => {
    const founder = await makeCreative();
    const org = await found(founder.user.id);
    await decide(org.id, 'approved');

    await suspend(founder.user.id);
    await expect(getPublicOrganization(org.slug)).rejects.toMatchObject({ status: 404 });
    expect((await listPublishedOrganizations({ limit: 50 })).map((o) => o.slug)).not.toContain(org.slug);

    await reinstate(founder.user.id);
    expect((await getPublicOrganization(org.slug)).slug).toBe(org.slug);
  });

  it('refuses to hand the founder role to someone whose profile is not public', async () => {
    const founder = await makeCreative();
    const member = await makeCreative();
    const org = await found(founder.user.id);
    const { id } = await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: member.user.username, role: 'member' },
    });
    await acceptInvitation({ userId: member.user.id, invitationId: id });
    await db
      .update(creativeProfiles)
      .set({ status: 'pending_review' })
      .where(eq(creativeProfiles.userId, member.user.id));

    await expect(
      handOver({ founderId: founder.user.id, slug: org.slug, toUserId: member.user.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('shows each craft by its singular label as well as its plural', async () => {
    const founder = await makeCreative();
    const org = await found(founder.user.id);
    await decide(org.id, 'approved');
    const { singularName } = await craft();

    const card = (await listPublishedOrganizations({ limit: 50 })).find((o) => o.slug === org.slug);
    expect(card?.primaryCraft?.singularName).toBe(singularName);
    expect((await getPublicOrganization(org.slug)).crafts[0]?.singularName).toBe(singularName);
  });
});

describe('invitations do not outlive the power that sent them', () => {
  async function teamWithCoFounder() {
    const founder = await makeCreative();
    const coFounder = await makeCreative();
    const org = await found(founder.user.id);
    const { id } = await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: coFounder.user.username, role: 'co_founder' },
    });
    await acceptInvitation({ userId: coFounder.user.id, invitationId: id });
    return { founder, coFounder, org };
  }

  it('withdraws what a co-founder sent when they are removed', async () => {
    const { founder, coFounder, org } = await teamWithCoFounder();
    const invitee = await makeCreative();
    await invite({
      inviterId: coFounder.user.id,
      slug: org.slug,
      data: { username: invitee.user.username, role: 'member' },
    });

    await removeMember({ actorId: founder.user.id, slug: org.slug, userId: coFounder.user.id });

    expect(await listMyInvitations(invitee.user.id)).toEqual([]);
  });

  it('withdraws what someone sent when they leave', async () => {
    const { coFounder, org } = await teamWithCoFounder();
    const invitee = await makeCreative();
    await invite({
      inviterId: coFounder.user.id,
      slug: org.slug,
      data: { username: invitee.user.username, role: 'member' },
    });

    await leaveOrganization({ userId: coFounder.user.id, slug: org.slug });

    expect(await listMyInvitations(invitee.user.id)).toEqual([]);
  });

  it("withdraws the old founder's co-founder invitations on hand-over, and keeps member ones", async () => {
    const { founder, coFounder, org } = await teamWithCoFounder();
    const asCoFounder = await makeCreative();
    const asMember = await makeCreative();
    await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: asCoFounder.user.username, role: 'co_founder' },
    });
    await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: asMember.user.username, role: 'member' },
    });

    await handOver({ founderId: founder.user.id, slug: org.slug, toUserId: coFounder.user.id });

    expect(await listMyInvitations(asCoFounder.user.id)).toEqual([]);
    expect(await listMyInvitations(asMember.user.id)).toHaveLength(1);
  });
});

describe('suspension', () => {
  it('is not undone by a founder alone closing the organisation', async () => {
    const founder = await makeCreative();
    const org = await found(founder.user.id);
    await db.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, org.id));

    await expect(leaveOrganization({ userId: founder.user.id, slug: org.slug })).rejects.toMatchObject({
      status: 403,
    });
    expect(await db.select().from(organizations).where(eq(organizations.id, org.id))).toHaveLength(1);
  });

  it('is not lifted by approving, and acknowledging needs an edit to acknowledge', async () => {
    const founder = await makeCreative();
    const admin = await makeAdmin();
    const pending = await found(founder.user.id);

    await expect(
      moderateOrganization({ organizationId: pending.id, adminId: admin.id, action: 'acknowledged_edit' }),
    ).rejects.toMatchObject({ status: 409 });

    await db.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, pending.id));
    await expect(
      moderateOrganization({ organizationId: pending.id, adminId: admin.id, action: 'approved' }),
    ).rejects.toMatchObject({ status: 409 });
    const [row] = await db.select().from(organizations).where(eq(organizations.id, pending.id));
    expect(row!.status).toBe('suspended');
  });
});

describe('a closed organisation keeps its slug', () => {
  it('never gives the slug of a closed organisation to a new one', async () => {
    const first = await makeCreative();
    const name = `ZZ Closing Studio ${Date.now()}`;
    const closed = await found(first.user.id, name);

    await leaveOrganization({ userId: first.user.id, slug: closed.slug });

    const [retired] = await db
      .select()
      .from(retiredOrganizationSlugs)
      .where(eq(retiredOrganizationSlugs.slug, closed.slug));
    expect(retired).toBeDefined();

    const next = await makeCreative();
    const reopened = await found(next.user.id, name);
    expect(reopened.slug).not.toBe(closed.slug);
    expect(reopened.slug).toBe(`${closed.slug}-2`);
  });

  it('holds when the closing and a founding of the same name happen at once', async () => {
    const first = await makeCreative();
    const second = await makeCreative();
    const name = `ZZ Racing Studio ${Date.now()}`;
    const closed = await found(first.user.id, name);

    const [, founding] = await Promise.all([
      leaveOrganization({ userId: first.user.id, slug: closed.slug }),
      found(second.user.id, name),
    ]);

    expect(founding.slug).not.toBe(closed.slug);
  });
});

describe('invitation rows', () => {
  it('are deleted, not left dangling, when withdrawn', async () => {
    const founder = await makeCreative();
    const member = await makeCreative();
    const invitee = await makeCreative();
    const org = await found(founder.user.id);
    const { id } = await invite({
      inviterId: founder.user.id,
      slug: org.slug,
      data: { username: member.user.username, role: 'co_founder' },
    });
    await acceptInvitation({ userId: member.user.id, invitationId: id });
    await invite({
      inviterId: member.user.id,
      slug: org.slug,
      data: { username: invitee.user.username, role: 'member' },
    });

    await removeMember({ actorId: founder.user.id, slug: org.slug, userId: member.user.id });

    const left = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.invitedUserId, invitee.user.id));
    expect(left).toEqual([]);
  });
});
