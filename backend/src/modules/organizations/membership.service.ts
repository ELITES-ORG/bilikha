import { and, asc, count, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { MyOrganizationInvitation } from '../../contracts/organizations.js';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  organizationInvitations,
  organizationMembers,
  organizations,
  retiredOrganizationSlugs,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { discardObject } from '../../lib/storage.js';
import { normalizeUsername } from '../../lib/username.js';
import { notify } from '../notifications/notifications.service.js';
import { formatFullName } from '../profiles/profiles.service.js';
import type { InviteInput } from './organizations.schema.js';
import {
  assertUnderCap,
  lockCaps,
  lockSlug,
  publishedProfileOf,
  roleIn,
  type Tx,
} from './organizations.service.js';
import { brokenUniqueIndex } from './unique-violation.js';

/**
 * Membership and invitations (plan 0051 phase 3, ADR 0054).
 *
 * **Nobody is listed without accepting.** An organisation page publishes its
 * members, and RA 10173 needs their consent for that. So an invitation is only
 * ever an offer: the membership row — the thing the page reads — is written
 * when the invitee accepts, never before.
 *
 * **An organisation never exists without its founder.** The founder cannot
 * leave a team that still has people in it; they hand the role over first. A
 * founder alone closes the organisation by leaving. And because the database
 * refuses to delete anyone who is still a member, an account deletion cannot
 * orphan a team either — there is no deletion feature yet, and whichever one is
 * built must take a person out of their organisations first.
 */

/** Invitations last a week and expire on their own (answered 2026-10-09). */
export const INVITATION_DAYS = 7;

/** After a decline, the same organisation waits this long to ask that person again. */
export const DECLINE_PAUSE_DAYS = 30;
const DECLINE_PAUSE_MS = DECLINE_PAUSE_DAYS * 24 * 60 * 60 * 1000;

function inAWeek(): Date {
  return new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Withdraw unanswered invitations this person sent for this organisation. An
 * invitation speaks for whoever sent it: once they are out of the team, or no
 * longer hold the power it used, it should not still let someone in.
 */
async function withdrawInvitationsFrom(
  tx: Tx,
  organizationId: string,
  inviterId: string,
  onlyRole?: 'co_founder',
): Promise<void> {
  await tx
    .delete(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, organizationId),
        eq(organizationInvitations.invitedBy, inviterId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.declinedAt),
        ...(onlyRole ? [eq(organizationInvitations.role, onlyRole)] : []),
      ),
    );
}

async function organizationBySlug(slug: string) {
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!row) throw AppError.notFound('No such organisation.');
  return row;
}

export async function invite(input: {
  inviterId: string;
  slug: string;
  data: InviteInput;
}): Promise<{ id: string; expiresAt: string; refreshed: boolean }> {
  const organization = await organizationBySlug(input.slug);
  const inviterRole = await roleIn(organization.id, input.inviterId);

  if (inviterRole !== 'founder' && inviterRole !== 'co_founder') {
    throw AppError.forbidden('Only the founder and co-founders can invite people.');
  }
  // Whoever can add co-founders controls the organisation, so that power stays
  // with one person (ADR 0054).
  if (input.data.role === 'co_founder' && inviterRole !== 'founder') {
    throw AppError.forbidden('Only the founder can invite a co-founder.');
  }
  if (organization.status === 'suspended') {
    throw AppError.forbidden('This organisation has been suspended.');
  }

  // The account and whether its profile is published, in one query whatever
  // the answer: how long a refusal takes must not say which refusal it is.
  const [invitee] = await db
    .select({ id: users.id, status: users.status, publishedProfileId: creativeProfiles.id })
    .from(users)
    .leftJoin(
      creativeProfiles,
      and(eq(creativeProfiles.userId, users.id), eq(creativeProfiles.status, 'published')),
    )
    .where(eq(users.usernameNormalized, normalizeUsername(input.data.username)))
    .limit(1);

  // One answer for "no such account", "suspended" and "not a published
  // creative". Saying "not a creative" for a client's username would tell
  // anyone who asks that the account exists — and only published creatives are
  // public, so only they are confirmed.
  const notInvitable = AppError.notFound(
    `No creative with the username "${input.data.username}". Only creatives with a published profile can be invited.`,
  );
  if (invitee?.id === input.inviterId) {
    throw AppError.badRequest('You are already in this organisation.');
  }
  if (!invitee || invitee.status !== 'active' || !invitee.publishedProfileId) throw notInvitable;
  if (await roleIn(organization.id, invitee.id)) {
    throw AppError.conflict('That person is already in this organisation.');
  }

  // A decline is an answer. Without a pause, the next invitation — and its
  // notification — could follow within the second, as often as the rate limit
  // allows. The team is told when they may ask again; the invitee's no is
  // theirs to know about, since it was their invitation.
  const [declined] = await db
    .select({ declinedAt: organizationInvitations.declinedAt })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, organization.id),
        eq(organizationInvitations.invitedUserId, invitee.id),
        gt(organizationInvitations.declinedAt, new Date(Date.now() - DECLINE_PAUSE_MS)),
      ),
    )
    .orderBy(desc(organizationInvitations.declinedAt))
    .limit(1);
  if (declined?.declinedAt) {
    const again = new Date(declined.declinedAt.getTime() + DECLINE_PAUSE_MS);
    throw AppError.conflict(
      `They declined an invitation from this organisation recently. You can invite them again from ${again.toISOString().slice(0, 10)}.`,
    );
  }

  const [pending] = await db
    .select({ id: organizationInvitations.id, expiresAt: organizationInvitations.expiresAt })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, organization.id),
        eq(organizationInvitations.invitedUserId, invitee.id),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.declinedAt),
      ),
    )
    .limit(1);

  const expiresAt = inAWeek();
  let id: string;
  let refreshed = false;

  if (pending) {
    if (pending.expiresAt > new Date()) {
      throw AppError.conflict('That person already has an invitation waiting.');
    }
    // An expired, unanswered invitation still holds the one-pending slot — the
    // index cannot see expiry — so sending again refreshes it rather than
    // inserting a second row (plan 0051 step 3.1).
    await db
      .update(organizationInvitations)
      .set({
        expiresAt,
        role: input.data.role,
        title: input.data.title ?? null,
        invitedBy: input.inviterId,
      })
      .where(eq(organizationInvitations.id, pending.id));
    id = pending.id;
    refreshed = true;
  } else {
    try {
      const [row] = await db
        .insert(organizationInvitations)
        .values({
          organizationId: organization.id,
          invitedUserId: invitee.id,
          invitedBy: input.inviterId,
          role: input.data.role,
          title: input.data.title ?? null,
          expiresAt,
        })
        .returning({ id: organizationInvitations.id });
      id = row!.id;
    } catch (error) {
      // Someone else in the team invited them a moment earlier.
      if (brokenUniqueIndex(error) === 'organization_invitations_one_pending_idx') {
        throw AppError.conflict('That person already has an invitation waiting.');
      }
      throw error;
    }
  }

  await notify({
    userId: invitee.id,
    actorUserId: input.inviterId,
    type: 'organization_invited',
    targetId: organization.id,
  });

  return { id, expiresAt: expiresAt.toISOString(), refreshed };
}

/** An invitation addressed to this person and not yet answered, or a 404. */
async function openInvitation(userId: string, invitationId: string) {
  const [row] = await db
    .select()
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.id, invitationId),
        eq(organizationInvitations.invitedUserId, userId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.declinedAt),
      ),
    )
    .limit(1);
  if (!row) throw AppError.notFound('No such invitation.');
  return row;
}

export async function acceptInvitation(input: {
  userId: string;
  invitationId: string;
}): Promise<{ slug: string }> {
  const invitation = await openInvitation(input.userId, input.invitationId);

  if (invitation.expiresAt <= new Date()) {
    throw AppError.conflict('This invitation has expired. Ask for a new one.');
  }
  if (!(await publishedProfileOf(input.userId))) {
    throw AppError.forbidden('You need a published creative profile to join an organisation.');
  }
  // A friendly early answer; the binding check is inside the transaction.
  await assertUnderCap(input.userId);

  const [organization] = await db
    .select({ id: organizations.id, slug: organizations.slug, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, invitation.organizationId))
    .limit(1);
  if (!organization || organization.status === 'suspended') {
    throw AppError.notFound('This organisation is no longer available.');
  }

  // Acceptance is what lists a person; both writes or neither.
  try {
    await db.transaction(async (tx) => {
      await lockCaps(tx, [input.userId]);
      await assertUnderCap(input.userId, tx);
      await tx.insert(organizationMembers).values({
        organizationId: invitation.organizationId,
        userId: input.userId,
        role: invitation.role,
        title: invitation.title,
      });
      await tx
        .update(organizationInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(organizationInvitations.id, invitation.id));
    });
  } catch (error) {
    // The same invitation accepted twice at once: the first one won.
    if (brokenUniqueIndex(error) === 'organization_members_org_user_idx') {
      throw AppError.conflict('You are already in this organisation.');
    }
    throw error;
  }

  if (invitation.invitedBy) {
    await notify({
      userId: invitation.invitedBy,
      actorUserId: input.userId,
      type: 'organization_invitation_accepted',
      targetId: invitation.organizationId,
    });
  }

  return { slug: organization.slug };
}

export async function declineInvitation(input: {
  userId: string;
  invitationId: string;
}): Promise<void> {
  const invitation = await openInvitation(input.userId, input.invitationId);
  await db
    .update(organizationInvitations)
    .set({ declinedAt: new Date() })
    .where(eq(organizationInvitations.id, invitation.id));
}

/** Invitations waiting on this person: unanswered and not yet expired. */
export async function listMyInvitations(userId: string): Promise<MyOrganizationInvitation[]> {
  const rows = await db
    .select({
      id: organizationInvitations.id,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      role: organizationInvitations.role,
      title: organizationInvitations.title,
      expiresAt: organizationInvitations.expiresAt,
      inviterFirst: users.firstName,
      inviterMiddle: users.middleName,
      inviterLast: users.lastName,
      inviterSuffix: users.suffix,
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizationInvitations.organizationId, organizations.id))
    .leftJoin(users, eq(organizationInvitations.invitedBy, users.id))
    .where(
      and(
        eq(organizationInvitations.invitedUserId, userId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.declinedAt),
        gt(organizationInvitations.expiresAt, new Date()),
        ne(organizations.status, 'suspended'),
      ),
    )
    .orderBy(asc(organizationInvitations.expiresAt));

  return rows.map((row) => ({
    id: row.id,
    organization: { slug: row.orgSlug, name: row.orgName },
    role: row.role,
    title: row.title,
    invitedBy: row.inviterFirst
      ? formatFullName({
          firstName: row.inviterFirst,
          middleName: row.inviterMiddle,
          lastName: row.inviterLast!,
          suffix: row.inviterSuffix,
        })
      : null,
    expiresAt: row.expiresAt.toISOString(),
  }));
}

/**
 * Leaving. A member or co-founder simply goes. A founder with anyone else in
 * the team is stopped and told to hand over; a founder alone closes the
 * organisation, which takes its invitations and crafts with it.
 */
export async function leaveOrganization(input: {
  userId: string;
  slug: string;
}): Promise<{ closed: boolean }> {
  const organization = await organizationBySlug(input.slug);
  const role = await roleIn(organization.id, input.userId);
  if (!role) throw AppError.notFound('You are not in this organisation.');

  if (role === 'founder') {
    const [others] = await db
      .select({ total: count() })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          ne(organizationMembers.userId, input.userId),
        ),
      );

    if ((others?.total ?? 0) > 0) {
      throw AppError.conflict(
        `You founded ${organization.name}. Hand the founder role to a co-founder or member before you leave — an organisation always has a founder.`,
      );
    }

    // Closing deletes the organisation, which would also undo a suspension and
    // free the cap it holds. An administrator decides what happens to it.
    if (organization.status === 'suspended') {
      throw AppError.forbidden(
        'This organisation has been suspended, so it cannot be closed. Contact an administrator.',
      );
    }

    // The slug stays reserved: links to the closed organisation must not open
    // whichever team takes its name next.
    await db.transaction(async (tx) => {
      await lockSlug(tx, organization.slug);
      await tx.delete(organizations).where(eq(organizations.id, organization.id));
      await tx
        .insert(retiredOrganizationSlugs)
        .values({ slug: organization.slug })
        .onConflictDoNothing();
    });
    if (organization.logoKey) await discardObject(organization.logoKey);
    if (organization.logoPendingKey) await discardObject(organization.logoPendingKey);
    return { closed: true };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(organizationMembers.userId, input.userId),
        ),
      );
    await withdrawInvitationsFrom(tx, organization.id, input.userId);
  });
  return { closed: false };
}

/**
 * Removing someone. Founder and co-founders remove members; only the founder
 * removes a co-founder; nobody removes the founder. Removal deletes the
 * membership, so the person simply stops being listed.
 */
export async function removeMember(input: {
  actorId: string;
  slug: string;
  userId: string;
}): Promise<void> {
  const organization = await organizationBySlug(input.slug);
  const actorRole = await roleIn(organization.id, input.actorId);

  if (actorRole !== 'founder' && actorRole !== 'co_founder') {
    throw AppError.forbidden('Only the founder and co-founders can remove people.');
  }
  if (input.userId === input.actorId) {
    throw AppError.badRequest('To take yourself out, leave the organisation instead.');
  }

  const targetRole = await roleIn(organization.id, input.userId);
  if (!targetRole) throw AppError.notFound('That person is not in this organisation.');
  if (targetRole === 'founder') {
    throw AppError.forbidden('The founder cannot be removed.');
  }
  if (targetRole === 'co_founder' && actorRole !== 'founder') {
    throw AppError.forbidden('Only the founder can remove a co-founder.');
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organization.id),
          eq(organizationMembers.userId, input.userId),
        ),
      );
    await withdrawInvitationsFrom(tx, organization.id, input.userId);
  });
}

/**
 * Handing the founder role to someone already in the team, in one
 * transaction. The outgoing founder stays on as a co-founder — the least
 * destructive reading of ADR 0054 — and can leave afterwards.
 *
 * The demotion runs before the promotion: the one-founder index would refuse
 * the other order, which is the index doing its job.
 */
export async function handOver(input: {
  founderId: string;
  slug: string;
  toUserId: string;
}): Promise<void> {
  const organization = await organizationBySlug(input.slug);
  if ((await roleIn(organization.id, input.founderId)) !== 'founder') {
    throw AppError.forbidden('Only the founder can hand over the founder role.');
  }
  if (input.toUserId === input.founderId) {
    throw AppError.badRequest('You are already the founder.');
  }
  if (!(await roleIn(organization.id, input.toUserId))) {
    throw AppError.badRequest('The founder role can only go to someone already in the organisation.');
  }
  // The founder is who a visitor's message reaches, and the page is public only
  // while the founder is (getPublicOrganization). Handing the role to someone
  // suspended or unpublished would take the whole page down.
  const [recipient] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, input.toUserId))
    .limit(1);
  if (recipient?.status !== 'active' || !(await publishedProfileOf(input.toUserId))) {
    throw AppError.badRequest(
      'The founder role can only go to someone whose own creative profile is public.',
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(organizationMembers)
        .set({ role: 'co_founder' })
        .where(
          and(
            eq(organizationMembers.organizationId, organization.id),
            eq(organizationMembers.userId, input.founderId),
          ),
        );
      await tx
        .update(organizationMembers)
        .set({ role: 'founder' })
        .where(
          and(
            eq(organizationMembers.organizationId, organization.id),
            eq(organizationMembers.userId, input.toUserId),
          ),
        );
      // Inviting a co-founder is the founder's power, and it has moved on.
      await withdrawInvitationsFrom(tx, organization.id, input.founderId, 'co_founder');
    });
  } catch (error) {
    // Two handovers at once: the other one already moved the role.
    if (brokenUniqueIndex(error) === 'organization_members_one_founder_idx') {
      throw AppError.conflict('The founder role has just changed hands. Reload the page.');
    }
    throw error;
  }
}
