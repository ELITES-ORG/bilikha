import { afterEach, describe, expect, it } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeSubdomains,
  organizationInvitations,
  organizationMembers,
  organizationSubdomains,
  organizations,
  users,
} from '../../db/schema/index.js';
import { makeCreative, makeUser, municipalityIdAt } from '../../test/factories.js';

/**
 * Plan 0051 phase 1: the invariants ADR 0054 needs the database itself to hold,
 * attacked directly in SQL with no service in front. Phase 1 ships tables and
 * nothing that reads them, so these are the only guarantees that exist yet —
 * and they are the ones a later bug in a service cannot bypass.
 */

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

/**
 * Drizzle does not rethrow the driver's error: it wraps it in a plain `Error`
 * reading `Failed query: ...` and hangs the `PostgresError` — the only thing
 * carrying `code` — off `cause`. Same reason `taxonomy.service.ts` walks the
 * chain in `isForeignKeyViolation`.
 */
function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== 'object') return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

async function expectPgError(work: Promise<unknown>, code: string): Promise<void> {
  try {
    await work;
  } catch (error) {
    expect(pgCode(error)).toBe(code);
    return;
  }
  throw new Error(`expected Postgres error ${code}, but the statement succeeded`);
}

let slugCounter = 0;

async function makeOrganization(overrides: Partial<typeof organizations.$inferInsert> = {}) {
  slugCounter += 1;
  const [row] = await db
    .insert(organizations)
    .values({
      slug: `zz-test-org-${Date.now()}-${slugCounter}`,
      name: 'ZZ Test Studio',
      municipalityId: await municipalityIdAt(0),
      ...overrides,
    })
    .returning();
  return row!;
}

async function anySeededSubdomainId(): Promise<string> {
  const [row] = await db.select({ id: creativeSubdomains.id }).from(creativeSubdomains).limit(1);
  return row!.id;
}

/**
 * Reference tables are never truncated between tests (`src/test/setup.ts`).
 * The one case here that needs a sub-domain it can attempt to delete gets its
 * own, so a guard that ever failed could not take a seeded row with it.
 */
const THROWAWAY_PREFIX = 'zz-test-org-subdomain-';

afterEach(async () => {
  await db.delete(creativeSubdomains).where(like(creativeSubdomains.slug, `${THROWAWAY_PREFIX}%`));
});

describe('organisations — at most one founder', () => {
  it('refuses a second founder for the same organisation', async () => {
    const org = await makeOrganization();
    const { user: founder } = await makeCreative();
    const { user: second } = await makeCreative();

    await db
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: founder.id, role: 'founder' });

    await expectPgError(
      db.insert(organizationMembers).values({ organizationId: org.id, userId: second.id, role: 'founder' }),
      UNIQUE_VIOLATION,
    );
  });

  it('allows any number of co-founders and members alongside the one founder', async () => {
    const org = await makeOrganization();
    const people = await Promise.all([makeCreative(), makeCreative(), makeCreative(), makeCreative()]);

    await db.insert(organizationMembers).values([
      { organizationId: org.id, userId: people[0]!.user.id, role: 'founder' },
      { organizationId: org.id, userId: people[1]!.user.id, role: 'co_founder' },
      { organizationId: org.id, userId: people[2]!.user.id, role: 'co_founder' },
      { organizationId: org.id, userId: people[3]!.user.id, role: 'member' },
    ]);

    const rows = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, org.id));
    expect(rows).toHaveLength(4);
  });

  it('lets one person found two different organisations', async () => {
    // The one-founder index is per organisation, not per person.
    const { user } = await makeCreative();
    const first = await makeOrganization();
    const second = await makeOrganization();

    await db.insert(organizationMembers).values([
      { organizationId: first.id, userId: user.id, role: 'founder' },
      { organizationId: second.id, userId: user.id, role: 'founder' },
    ]);
  });

  it('refuses the same person twice in one organisation', async () => {
    const org = await makeOrganization();
    const { user } = await makeCreative();

    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: 'member' });

    await expectPgError(
      db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: 'co_founder' }),
      UNIQUE_VIOLATION,
    );
  });
});

describe('organisations — nobody can be orphaned by deletion', () => {
  it('refuses to delete a user who is still in an organisation', async () => {
    // There is no account-deletion feature, so this is the only guard keeping
    // a founder's deletion from leaving an organisation with no founder.
    const org = await makeOrganization();
    const { user } = await makeCreative();
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: 'founder' });

    await expectPgError(db.delete(users).where(eq(users.id, user.id)), FOREIGN_KEY_VIOLATION);

    const [still] = await db.select().from(users).where(eq(users.id, user.id));
    expect(still).toBeDefined();
  });

  it('lets a user be deleted once they have left every organisation', async () => {
    const org = await makeOrganization();
    const plain = await makeUser();
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: plain.id, role: 'member' });

    await db.delete(organizationMembers).where(eq(organizationMembers.userId, plain.id));
    await db.delete(users).where(eq(users.id, plain.id));

    const rows = await db.select().from(users).where(eq(users.id, plain.id));
    expect(rows).toHaveLength(0);
  });

  it('removes everything belonging to an organisation when it is deleted', async () => {
    const org = await makeOrganization();
    const { user: founder } = await makeCreative();
    const { user: invitee } = await makeCreative();

    await db.insert(organizationMembers).values({ organizationId: org.id, userId: founder.id, role: 'founder' });
    await db.insert(organizationInvitations).values({
      organizationId: org.id,
      invitedUserId: invitee.id,
      invitedBy: founder.id,
      role: 'member',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await db
      .insert(organizationSubdomains)
      .values({ organizationId: org.id, subdomainId: await anySeededSubdomainId(), isPrimary: true });

    await db.delete(organizations).where(eq(organizations.id, org.id));

    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, org.id));
    const invites = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.organizationId, org.id));
    const subs = await db.select().from(organizationSubdomains).where(eq(organizationSubdomains.organizationId, org.id));

    expect(members).toHaveLength(0);
    expect(invites).toHaveLength(0);
    expect(subs).toHaveLength(0);
    // The founder's account survives their organisation; only the membership went.
    const [person] = await db.select().from(users).where(eq(users.id, founder.id));
    expect(person).toBeDefined();
  });
});

describe('organisations — invitations', () => {
  const inSevenDays = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('refuses a second unanswered invitation to the same person', async () => {
    const org = await makeOrganization();
    const { user: founder } = await makeCreative();
    const { user: invitee } = await makeCreative();
    const base = { organizationId: org.id, invitedUserId: invitee.id, invitedBy: founder.id, role: 'member' as const };

    await db.insert(organizationInvitations).values({ ...base, expiresAt: inSevenDays() });

    await expectPgError(
      db.insert(organizationInvitations).values({ ...base, expiresAt: inSevenDays() }),
      UNIQUE_VIOLATION,
    );
  });

  it('allows a fresh invitation once the last one was declined', async () => {
    const org = await makeOrganization();
    const { user: founder } = await makeCreative();
    const { user: invitee } = await makeCreative();
    const base = { organizationId: org.id, invitedUserId: invitee.id, invitedBy: founder.id, role: 'member' as const };

    await db.insert(organizationInvitations).values({ ...base, expiresAt: inSevenDays(), declinedAt: new Date() });
    await db.insert(organizationInvitations).values({ ...base, expiresAt: inSevenDays() });

    const rows = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.invitedUserId, invitee.id));
    expect(rows).toHaveLength(2);
  });

  it('still counts an expired, unanswered invitation as pending — re-inviting must update it', async () => {
    // The trap plan 0051 phase 3 must not fall into. The pending index cannot
    // see expiry (`now()` is not allowed in an index predicate), so an expired
    // invitation still occupies the slot. Re-sending after the seven days
    // therefore has to update this row's `expires_at`; inserting a new row is
    // refused. If this test ever starts passing an insert, the index changed.
    const org = await makeOrganization();
    const { user: founder } = await makeCreative();
    const { user: invitee } = await makeCreative();
    const base = { organizationId: org.id, invitedUserId: invitee.id, invitedBy: founder.id, role: 'member' as const };

    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [expired] = await db
      .insert(organizationInvitations)
      .values({ ...base, expiresAt: longAgo })
      .returning();

    await expectPgError(
      db.insert(organizationInvitations).values({ ...base, expiresAt: inSevenDays() }),
      UNIQUE_VIOLATION,
    );

    // The supported way: refresh the same row.
    await db
      .update(organizationInvitations)
      .set({ expiresAt: inSevenDays() })
      .where(eq(organizationInvitations.id, expired!.id));

    const [refreshed] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, expired!.id));
    expect(refreshed!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses an invitation that is both accepted and declined', async () => {
    const org = await makeOrganization();
    const { user: invitee } = await makeCreative();

    await expectPgError(
      db.insert(organizationInvitations).values({
        organizationId: org.id,
        invitedUserId: invitee.id,
        role: 'member',
        expiresAt: inSevenDays(),
        acceptedAt: new Date(),
        declinedAt: new Date(),
      }),
      CHECK_VIOLATION,
    );
  });

  it('refuses an invitation into the founder role', async () => {
    // The founder role is founded or handed over, never invited into.
    const org = await makeOrganization();
    const { user: invitee } = await makeCreative();

    await expectPgError(
      db.insert(organizationInvitations).values({
        organizationId: org.id,
        invitedUserId: invitee.id,
        role: 'founder',
        expiresAt: inSevenDays(),
      }),
      CHECK_VIOLATION,
    );
  });
});

describe('organisations — sub-domains and slugs', () => {
  it('refuses two primary sub-domains on one organisation', async () => {
    const org = await makeOrganization();
    const subs = await db.select({ id: creativeSubdomains.id }).from(creativeSubdomains).limit(2);

    await db
      .insert(organizationSubdomains)
      .values({ organizationId: org.id, subdomainId: subs[0]!.id, isPrimary: true });

    await expectPgError(
      db
        .insert(organizationSubdomains)
        .values({ organizationId: org.id, subdomainId: subs[1]!.id, isPrimary: true }),
      UNIQUE_VIOLATION,
    );
  });

  it('refuses to delete a sub-domain an organisation uses', async () => {
    const [domain] = await db.select({ id: creativeDomains.id }).from(creativeDomains).limit(1);
    const [sub] = await db
      .insert(creativeSubdomains)
      .values({
        domainId: domain!.id,
        slug: `${THROWAWAY_PREFIX}${Date.now()}`,
        name: 'ZZ Throwaway',
        displayOrder: 999,
      })
      .returning();

    const org = await makeOrganization();
    await db.insert(organizationSubdomains).values({ organizationId: org.id, subdomainId: sub!.id });

    await expectPgError(
      db.delete(creativeSubdomains).where(eq(creativeSubdomains.id, sub!.id)),
      FOREIGN_KEY_VIOLATION,
    );

    // Release it so afterEach can remove the throwaway.
    await db.delete(organizations).where(eq(organizations.id, org.id));
  });

  it('refuses a second organisation with the same slug', async () => {
    const first = await makeOrganization();

    await expectPgError(makeOrganization({ slug: first.slug }), UNIQUE_VIOLATION);
  });
});
