import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeSubdomains,
  notifications,
  organizationInvitations,
  organizationMembers,
  organizations,
} from '../../db/schema/index.js';
import { makeAdmin, makeCreative, makeUser } from '../../test/factories.js';
import { moderateOrganization } from '../admin/organization-review.service.js';
import {
  DECLINE_PAUSE_DAYS,
  acceptInvitation,
  declineInvitation,
  handOver,
  invite,
  leaveOrganization,
  listMyInvitations,
  removeMember,
} from './membership.service.js';
import {
  ORGANIZATION_CAP,
  foundOrganization,
  getManagedOrganization,
  getPublicOrganization,
} from './organizations.service.js';

/**
 * Plan 0051 phase 3 — membership and invitations. The consent rule is the
 * heart of it: nobody is listed until they accept.
 */

async function anyCraft() {
  const [row] = await db.select({ slug: creativeSubdomains.slug }).from(creativeSubdomains).limit(1);
  return row!.slug;
}

/** A founded organisation, optionally published, with its id. */
async function team(options: { publish?: boolean } = {}) {
  const founder = await makeCreative();
  const craft = await anyCraft();
  const { slug } = await foundOrganization({
    userId: founder.user.id,
    data: {
      name: `ZZ Team ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      municipalitySlug: 'almeria',
      subdomainSlugs: [craft],
      primarySubdomainSlug: craft,
    },
  });
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (options.publish) {
    const admin = await makeAdmin();
    await moderateOrganization({ organizationId: org!.id, adminId: admin.id, action: 'approved' });
  }
  return { founder, slug, id: org!.id };
}

async function memberRole(organizationId: string, userId: string) {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
  return row?.role ?? null;
}

describe('inviting', () => {
  it('lists nobody until they accept', async () => {
    const { founder, slug, id } = await team({ publish: true });
    const invitee = await makeCreative();

    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug,
      data: { username: invitee.user.username, role: 'member', title: 'Editor' },
    });

    expect(await memberRole(id, invitee.user.id)).toBeNull();
    expect((await getPublicOrganization(slug)).members).toHaveLength(1);

    await acceptInvitation({ userId: invitee.user.id, invitationId });

    expect(await memberRole(id, invitee.user.id)).toBe('member');
    const page = await getPublicOrganization(slug);
    expect(page.members.map((m) => m.profileSlug)).toContain(invitee.profile.slug);
    expect(page.members.find((m) => m.profileSlug === invitee.profile.slug)?.title).toBe('Editor');
  });

  it('lets only the founder invite a co-founder', async () => {
    const { founder, slug, id } = await team();
    const coFounder = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: coFounder.user.id, role: 'co_founder' });
    const candidate = await makeCreative();

    await expect(
      invite({ inviterId: coFounder.user.id, slug, data: { username: candidate.user.username, role: 'co_founder' } }),
    ).rejects.toMatchObject({ status: 403 });

    await invite({ inviterId: founder.user.id, slug, data: { username: candidate.user.username, role: 'co_founder' } });
  });

  it('refuses a plain member', async () => {
    const { slug, id } = await team();
    const member = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });
    const candidate = await makeCreative();

    await expect(
      invite({ inviterId: member.user.id, slug, data: { username: candidate.user.username, role: 'member' } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('gives the same answer for an unknown username and a client — no account is confirmed', async () => {
    const { founder, slug } = await team();
    const client = await makeUser();

    // Settled together: awaiting one while the other is still unhandled lets
    // the second rejection land with no handler, which fails the run.
    const [unknown, notCreative] = await Promise.allSettled([
      invite({ inviterId: founder.user.id, slug, data: { username: 'zz_no_such_person', role: 'member' } }),
      invite({ inviterId: founder.user.id, slug, data: { username: client.username, role: 'member' } }),
    ]);

    expect(unknown).toMatchObject({ status: 'rejected', reason: { status: 404 } });
    expect(notCreative).toMatchObject({ status: 'rejected', reason: { status: 404 } });
    const message = (result: PromiseSettledResult<unknown>) =>
      result.status === 'rejected' ? (result.reason as Error).message : '';
    expect(message(unknown).replace('zz_no_such_person', 'X')).toBe(
      message(notCreative).replace(client.username, 'X'),
    );
  });

  it('refuses a second invitation while one is still waiting', async () => {
    const { founder, slug } = await team();
    const invitee = await makeCreative();
    const data = { username: invitee.user.username, role: 'member' as const };

    await invite({ inviterId: founder.user.id, slug, data });
    await expect(invite({ inviterId: founder.user.id, slug, data })).rejects.toMatchObject({ status: 409 });
  });

  it('refreshes an expired invitation instead of inserting a second', async () => {
    const { founder, slug, id } = await team();
    const invitee = await makeCreative();
    const data = { username: invitee.user.username, role: 'member' as const };

    const first = await invite({ inviterId: founder.user.id, slug, data });
    await db
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvitations.id, first.id));

    const again = await invite({ inviterId: founder.user.id, slug, data });

    expect(again.refreshed).toBe(true);
    expect(again.id).toBe(first.id);
    expect(new Date(again.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const rows = await db
      .select()
      .from(organizationInvitations)
      .where(and(eq(organizationInvitations.organizationId, id), eq(organizationInvitations.invitedUserId, invitee.user.id)));
    expect(rows).toHaveLength(1);
  });

  it('notifies the invitee, and the inviter once accepted', async () => {
    const { founder, slug } = await team();
    const invitee = await makeCreative();

    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug,
      data: { username: invitee.user.username, role: 'member' },
    });
    await acceptInvitation({ userId: invitee.user.id, invitationId });

    const invited = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, invitee.user.id), eq(notifications.type, 'organization_invited')));
    const accepted = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, founder.user.id), eq(notifications.type, 'organization_invitation_accepted')));
    expect(invited).toHaveLength(1);
    expect(accepted).toHaveLength(1);
  });
});

describe('answering an invitation', () => {
  it('cannot accept an expired invitation, and stays off the page', async () => {
    const { founder, slug, id } = await team({ publish: true });
    const invitee = await makeCreative();
    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug,
      data: { username: invitee.user.username, role: 'member' },
    });
    await db
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvitations.id, invitationId));

    await expect(acceptInvitation({ userId: invitee.user.id, invitationId })).rejects.toMatchObject({ status: 409 });
    expect(await memberRole(id, invitee.user.id)).toBeNull();
  });

  it("refuses to let someone answer another person's invitation", async () => {
    const { founder, slug } = await team();
    const invitee = await makeCreative();
    const someoneElse = await makeCreative();
    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug,
      data: { username: invitee.user.username, role: 'member' },
    });

    await expect(acceptInvitation({ userId: someoneElse.user.id, invitationId })).rejects.toMatchObject({
      status: 404,
    });
  });

  it(`declining adds nobody, and a fresh invitation can follow after ${DECLINE_PAUSE_DAYS} days`, async () => {
    const { founder, slug, id } = await team();
    const invitee = await makeCreative();
    const data = { username: invitee.user.username, role: 'member' as const };

    const { id: invitationId } = await invite({ inviterId: founder.user.id, slug, data });
    await declineInvitation({ userId: invitee.user.id, invitationId });

    expect(await memberRole(id, invitee.user.id)).toBeNull();
    // Not straight away: a decline is an answer, and asking again re-notifies.
    await expect(invite({ inviterId: founder.user.id, slug, data })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('declined'),
    });

    const longAgo = new Date(Date.now() - (DECLINE_PAUSE_DAYS + 1) * 24 * 60 * 60 * 1000);
    await db
      .update(organizationInvitations)
      .set({ declinedAt: longAgo })
      .where(eq(organizationInvitations.id, invitationId));
    await invite({ inviterId: founder.user.id, slug, data });
  });

  it('pauses only the organisation that was declined', async () => {
    const declined = await team();
    const other = await team();
    const invitee = await makeCreative();
    const data = { username: invitee.user.username, role: 'member' as const };

    const { id: invitationId } = await invite({
      inviterId: declined.founder.user.id,
      slug: declined.slug,
      data,
    });
    await declineInvitation({ userId: invitee.user.id, invitationId });

    await invite({ inviterId: other.founder.user.id, slug: other.slug, data });
  });

  it(`refuses to let someone join a ${ORGANIZATION_CAP + 1}th organisation`, async () => {
    const invitee = await makeCreative();
    const craft = await anyCraft();
    for (let i = 0; i < ORGANIZATION_CAP; i += 1) {
      await foundOrganization({
        userId: invitee.user.id,
        data: { name: `ZZ Own ${i}`, municipalitySlug: 'almeria', subdomainSlugs: [craft], primarySubdomainSlug: craft },
      });
    }
    const { founder, slug } = await team();
    const { id: invitationId } = await invite({
      inviterId: founder.user.id,
      slug,
      data: { username: invitee.user.username, role: 'member' },
    });

    await expect(acceptInvitation({ userId: invitee.user.id, invitationId })).rejects.toMatchObject({ status: 409 });
  });

  it('lists only invitations still open for me', async () => {
    const { founder, slug } = await team();
    const other = await team();
    const invitee = await makeCreative();

    await invite({ inviterId: founder.user.id, slug, data: { username: invitee.user.username, role: 'member' } });
    const { id: expiredId } = await invite({
      inviterId: other.founder.user.id,
      slug: other.slug,
      data: { username: invitee.user.username, role: 'member' },
    });
    await db
      .update(organizationInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(organizationInvitations.id, expiredId));

    const mine = await listMyInvitations(invitee.user.id);
    expect(mine.map((i) => i.organization.slug)).toEqual([slug]);
  });
});

describe('leaving and removing', () => {
  it('lets a member leave', async () => {
    const { slug, id } = await team();
    const member = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });

    expect(await leaveOrganization({ userId: member.user.id, slug })).toEqual({ closed: false });
    expect(await memberRole(id, member.user.id)).toBeNull();
  });

  it('stops a founder leaving a team that still has people, and says why', async () => {
    const { founder, slug, id } = await team();
    const member = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });

    await expect(leaveOrganization({ userId: founder.user.id, slug })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Hand the founder role'),
    });
    expect(await memberRole(id, founder.user.id)).toBe('founder');
  });

  it('closes the organisation when a founder alone leaves', async () => {
    const { founder, slug, id } = await team();

    expect(await leaveOrganization({ userId: founder.user.id, slug })).toEqual({ closed: true });
    const rows = await db.select().from(organizations).where(eq(organizations.id, id));
    expect(rows).toHaveLength(0);
  });

  it('enforces who can remove whom', async () => {
    const { founder, slug, id } = await team();
    const coFounder = await makeCreative();
    const otherCoFounder = await makeCreative();
    const member = await makeCreative();
    await db.insert(organizationMembers).values([
      { organizationId: id, userId: coFounder.user.id, role: 'co_founder' },
      { organizationId: id, userId: otherCoFounder.user.id, role: 'co_founder' },
      { organizationId: id, userId: member.user.id, role: 'member' },
    ]);

    // A co-founder cannot remove another co-founder, nor the founder.
    await expect(
      removeMember({ actorId: coFounder.user.id, slug, userId: otherCoFounder.user.id }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeMember({ actorId: coFounder.user.id, slug, userId: founder.user.id }),
    ).rejects.toMatchObject({ status: 403 });

    // A co-founder can remove a member; the founder can remove a co-founder.
    await removeMember({ actorId: coFounder.user.id, slug, userId: member.user.id });
    await removeMember({ actorId: founder.user.id, slug, userId: otherCoFounder.user.id });
    expect(await memberRole(id, member.user.id)).toBeNull();
    expect(await memberRole(id, otherCoFounder.user.id)).toBeNull();
  });
});

describe('handing over', () => {
  it('moves the founder role and keeps the old founder as a co-founder', async () => {
    const { founder, slug, id } = await team();
    const member = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });

    await handOver({ founderId: founder.user.id, slug, toUserId: member.user.id });

    expect(await memberRole(id, member.user.id)).toBe('founder');
    expect(await memberRole(id, founder.user.id)).toBe('co_founder');

    // Exactly one founder, still.
    const founders = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, id), eq(organizationMembers.role, 'founder')));
    expect(founders).toHaveLength(1);

    // And the old founder can now leave.
    await leaveOrganization({ userId: founder.user.id, slug });
  });

  it('refuses a non-founder, and a hand-over to someone outside the team', async () => {
    const { founder, slug, id } = await team();
    const member = await makeCreative();
    const outsider = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });

    await expect(
      handOver({ founderId: member.user.id, slug, toUserId: member.user.id }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handOver({ founderId: founder.user.id, slug, toUserId: outsider.user.id }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('the team view', () => {
  it('shows pending invitations to the founder, not to a plain member', async () => {
    const { founder, slug, id } = await team();
    const member = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: id, userId: member.user.id, role: 'member' });
    const invitee = await makeCreative();
    await invite({ inviterId: founder.user.id, slug, data: { username: invitee.user.username, role: 'member' } });

    const asFounder = await getManagedOrganization({ userId: founder.user.id, slug });
    const asMember = await getManagedOrganization({ userId: member.user.id, slug });

    expect(asFounder.invitations).toHaveLength(1);
    expect(asMember.invitations).toHaveLength(0);
  });

  it('is a 404 for someone outside the team', async () => {
    const { slug } = await team();
    const outsider = await makeCreative();
    await expect(getManagedOrganization({ userId: outsider.user.id, slug })).rejects.toMatchObject({
      status: 404,
    });
  });
});
