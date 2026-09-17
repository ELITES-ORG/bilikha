import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  agreementAcceptances,
  agreementEvents,
  agreementLineItems,
  agreements,
  conversations,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  municipalities,
  offers,
  postings,
  ratings,
  users,
} from '../db/schema/index.js';
import type { NewUser, User } from '../db/schema/users.js';
import type { CreativeProfile } from '../db/schema/profiles.js';
import type { Conversation } from '../db/schema/conversations.js';
import { contentHash } from '../modules/agreements/agreements.service.js';

/**
 * A precomputed argon2id hash of PASSWORD. Hashing is deliberately slow, and a
 * suite that hashes a password for every user it creates spends most of its
 * time doing it. Tests that actually authenticate use this pair; the rest never
 * touch it.
 */
export const PASSWORD = 'test-password-1234';
const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$YmlsaWtoYXRlc3RzYWx0MTI$Ux8vN0kM3dQ0xJ0gKk7yQmVQ6wLJXqVQnQ5H1sB5kZQ';

let counter = 0;
/** Unique per call, so no factory ever collides with a unique index. */
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

async function anyMunicipalityId(): Promise<string> {
  const [row] = await db
    .select({ id: municipalities.id })
    .from(municipalities)
    .orderBy(asc(municipalities.slug))
    .limit(1);

  if (!row) {
    throw new Error(
      'No municipalities in the test database. The reference seed did not run — '
        + 'check global-setup.',
    );
  }
  return row.id;
}

/**
 * Nth seeded municipality by slug. Ordering tests need two distinct ones, and
 * which two does not matter — only that they differ. Never assert on the names
 * (plan 0019 rule 2).
 */
export async function municipalityIdAt(index: number): Promise<string> {
  const rows = await db
    .select({ id: municipalities.id })
    .from(municipalities)
    .orderBy(asc(municipalities.slug))
    .limit(index + 1);

  const row = rows[index];
  if (!row) throw new Error(`The seed has fewer than ${index + 1} municipalities.`);
  return row.id;
}

async function anySubdomainId(): Promise<string> {
  const [row] = await db
    .select({ id: creativeSubdomains.id })
    .from(creativeSubdomains)
    .orderBy(asc(creativeSubdomains.slug))
    .limit(1);

  if (!row) throw new Error('No sub-domains in the test database. The reference seed did not run.');
  return row.id;
}

export async function makeUser(overrides: Partial<NewUser> = {}): Promise<User> {
  const username = (overrides.username as string | undefined) ?? unique('u');
  const email = (overrides.email as string | undefined) ?? `${username}@example.test`;
  const now = new Date();

  const [row] = await db
    .insert(users)
    .values({
      username,
      usernameNormalized: username.toLowerCase(),
      email,
      emailNormalized: email.toLowerCase(),
      phone: unique('+639'),
      passwordHash: PASSWORD_HASH,
      firstName: 'Test',
      lastName: 'Person',
      birthDate: '1995-01-01',
      privacyConsentAt: now,
      termsAcceptedAt: now,
      consentVersion: '1',
      municipalityId: await anyMunicipalityId(),
      ...overrides,
    })
    .returning();

  return row!;
}

export async function makeAdmin(overrides: Partial<NewUser> = {}): Promise<User> {
  return makeUser({ role: 'admin', ...overrides });
}

export interface CreativeFixture {
  user: User;
  profile: CreativeProfile;
}

/**
 * A user plus a creative profile, published by default and attached to a
 * sub-domain from the seeded taxonomy — which is what every public read path
 * joins through.
 */
export async function makeCreative(
  overrides: { user?: Partial<NewUser>; profile?: Partial<typeof creativeProfiles.$inferInsert> } = {},
): Promise<CreativeFixture> {
  const user = await makeUser(overrides.user);
  const slug = unique('creative-');

  const [profile] = await db
    .insert(creativeProfiles)
    .values({
      userId: user.id,
      slug,
      displayName: 'Test Creative',
      status: 'published',
      ...overrides.profile,
    })
    .returning();

  await db.insert(creativeProfileSubdomains).values({
    profileId: profile!.id,
    subdomainId: await anySubdomainId(),
    isPrimary: true,
  });

  return { user, profile: profile! };
}

export async function makeOffer(
  profileId: string,
  overrides: Partial<typeof offers.$inferInsert> = {},
) {
  const [row] = await db
    .insert(offers)
    .values({
      profileId,
      subdomainId: await anySubdomainId(),
      title: 'Test offer',
      ...overrides,
    })
    .returning();

  return row!;
}

export async function makePosting(
  userId: string,
  overrides: Partial<typeof postings.$inferInsert> = {},
) {
  const [row] = await db
    .insert(postings)
    .values({
      userId,
      subdomainId: await anySubdomainId(),
      municipalityId: await anyMunicipalityId(),
      title: 'Test posting',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...overrides,
    })
    .returning();

  return row!;
}

export async function makeConversation(clientUserId: string, profile: CreativeProfile) {
  const [row] = await db
    .insert(conversations)
    .values({
      profileId: profile.id,
      clientUserId,
      creativeUserId: profile.userId,
    })
    .returning();

  return row!;
}

export interface AgreementLineItemInput {
  description: string;
  priceCentavos: number;
}

const DEFAULT_LINE_ITEMS: AgreementLineItemInput[] = [
  { description: 'Half-day shoot', priceCentavos: 500_000 },
  { description: 'Twenty edited photographs', priceCentavos: 250_000 },
  { description: 'Online gallery for thirty days', priceCentavos: 50_000 },
];

/**
 * A `sent` agreement issued by the conversation's creative, with its line items
 * in the order given. Writes the rows directly — tests that exercise
 * `issueAgreement` should call the service instead.
 */
export async function makeAgreement(
  conversation: Conversation,
  overrides: {
    agreement?: Partial<typeof agreements.$inferInsert>;
    lineItems?: AgreementLineItemInput[];
  } = {},
) {
  const [agreement] = await db
    .insert(agreements)
    .values({
      conversationId: conversation.id,
      issuedByUserId: conversation.creativeUserId,
      packageTitle: 'Test package',
      startDate: '2026-10-03',
      durationDays: 14,
      ...overrides.agreement,
    })
    .returning();

  const lineItems = await db
    .insert(agreementLineItems)
    .values(
      (overrides.lineItems ?? DEFAULT_LINE_ITEMS).map((item, index) => ({
        agreementId: agreement!.id,
        description: item.description,
        priceCentavos: item.priceCentavos,
        sortOrder: index,
      })),
    )
    .returning();

  return { agreement: agreement!, lineItems };
}

/**
 * The same, already accepted by the client, with a real acceptance row carrying
 * the content hash of what was accepted.
 *
 * Line items go in before the status changes: the freeze trigger refuses to
 * touch them once the agreement is accepted, which is the point of it.
 */
export async function makeAcceptedAgreement(
  conversation: Conversation,
  overrides: {
    agreement?: Partial<typeof agreements.$inferInsert>;
    lineItems?: AgreementLineItemInput[];
  } = {},
) {
  const { agreement, lineItems } = await makeAgreement(conversation, overrides);
  const hash = contentHash(agreement, lineItems);

  const [acceptance] = await db
    .insert(agreementAcceptances)
    .values({
      agreementId: agreement.id,
      acceptedByUserId: conversation.clientUserId,
      contentHash: hash,
    })
    .returning();

  const [accepted] = await db
    .update(agreements)
    .set({ status: 'accepted' })
    .where(eq(agreements.id, agreement.id))
    .returning();

  return { agreement: accepted!, lineItems, acceptance: acceptance!, contentHash: hash };
}

/**
 * An accepted agreement walked all the way to Completed: started, delivered,
 * and confirmed by the client, one second apart so the newest event is never
 * ambiguous.
 *
 * The events go in directly rather than through `recordEvent` — tests that
 * exercise the transitions themselves live in the lifecycle suite, and this
 * factory exists for everything downstream of them.
 */
export async function makeCompletedAgreement(
  conversation: Conversation,
  overrides: {
    agreement?: Partial<typeof agreements.$inferInsert>;
    lineItems?: AgreementLineItemInput[];
  } = {},
) {
  const accepted = await makeAcceptedAgreement(conversation, overrides);
  const base = Date.now();

  const events = await db
    .insert(agreementEvents)
    .values([
      {
        agreementId: accepted.agreement.id,
        actorUserId: conversation.creativeUserId,
        type: 'started' as const,
        createdAt: new Date(base),
      },
      {
        agreementId: accepted.agreement.id,
        actorUserId: conversation.creativeUserId,
        type: 'delivery_marked' as const,
        createdAt: new Date(base + 1000),
      },
      {
        agreementId: accepted.agreement.id,
        actorUserId: conversation.clientUserId,
        type: 'completion_confirmed' as const,
        createdAt: new Date(base + 2000),
      },
    ])
    .returning();

  return { ...accepted, events };
}

/** A rating on an agreement, written directly. */
export async function makeRating(
  agreementId: string,
  raterUserId: string,
  overrides: Partial<typeof ratings.$inferInsert> = {},
) {
  const [row] = await db
    .insert(ratings)
    .values({
      agreementId,
      raterUserId,
      stars: 5,
      comment: 'Delivered exactly what we agreed.',
      ...overrides,
    })
    .returning();

  return row!;
}

/** Suspends an account the way the admin service does, without the audit row. */
export async function suspend(userId: string): Promise<void> {
  await db.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
}

export async function reinstate(userId: string): Promise<void> {
  await db.update(users).set({ status: 'active' }).where(eq(users.id, userId));
}
