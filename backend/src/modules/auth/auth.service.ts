import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  barangays,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  municipalities,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { isReservedUsername, normalizeUsername } from '../../lib/username.js';
import { normalizeEmail, normalizePhone } from '../../lib/contact.js';
import type { RegisterInput } from './auth.schema.js';

/** Bump when the privacy notice or terms change; existing users then need
 *  re-consent. */
export const CONSENT_VERSION = '2026-09-15';

export interface PublicUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  profileSlug: string | null;
  profileStatus: string | null;
  rejectionReason: string | null;
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  if (input.kind === 'client') {
    return registerClient(input);
  }
  return registerCreative(input);
}

async function registerClient(
  input: Extract<RegisterInput, { kind: 'client' }>,
): Promise<PublicUser> {
  const usernameNormalized = normalizeUsername(input.username);

  if (isReservedUsername(usernameNormalized)) {
    throw AppError.conflict('That username is not available.', {
      field: 'username',
    });
  }

  const emailNormalized = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    const [user] = await db
      .insert(users)
      .values({
        username: input.username.trim(),
        usernameNormalized,
        email: input.email.trim(),
        emailNormalized,
        phone,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate.toISOString().slice(0, 10),
        municipalityId: null,
        privacyConsentAt: now,
        termsAcceptedAt: now,
        consentVersion: CONSENT_VERSION,
      })
      .returning();

    if (!user) throw new Error('User insert returned no row');

    return toPublicUser(user, null);
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

async function registerCreative(
  input: Extract<RegisterInput, { kind: 'creative' }>,
): Promise<PublicUser> {
  const usernameNormalized = normalizeUsername(input.username);

  if (isReservedUsername(usernameNormalized)) {
    throw AppError.conflict('That username is not available.', {
      field: 'username',
    });
  }

  const emailNormalized = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  const [municipality] = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.slug, input.municipalitySlug))
    .limit(1);

  if (!municipality) {
    throw AppError.badRequest('Unknown municipality.', { field: 'municipalitySlug' });
  }

  let barangayId: string | null = null;
  if (input.barangaySlug) {
    const [barangay] = await db
      .select()
      .from(barangays)
      .where(
        and(eq(barangays.slug, input.barangaySlug), eq(barangays.municipalityId, municipality.id)),
      )
      .limit(1);

    if (!barangay) {
      throw AppError.badRequest('Unknown barangay for that municipality.', {
        field: 'barangaySlug',
      });
    }
    barangayId = barangay.id;
  }

  // Resolve every sub-domain slug up front so a bad slug fails before any write.
  const subdomainRows = await db
    .select()
    .from(creativeSubdomains)
    .where(inArray(creativeSubdomains.slug, input.subdomainSlugs));

  if (subdomainRows.length !== input.subdomainSlugs.length) {
    throw AppError.badRequest('One or more sub-domains are unknown.', {
      field: 'subdomainSlugs',
    });
  }

  const primary = subdomainRows.find((row) => row.slug === input.primarySubdomainSlug);
  if (!primary) {
    throw AppError.badRequest('Primary sub-domain is not among the selected.', {
      field: 'primarySubdomainSlug',
    });
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username.trim(),
          usernameNormalized,
          email: input.email.trim(),
          emailNormalized,
          phone,
          passwordHash,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName,
          suffix: input.suffix ?? null,
          birthDate: input.birthDate.toISOString().slice(0, 10),
          municipalityId: municipality.id,
          barangayId,
          privacyConsentAt: now,
          termsAcceptedAt: now,
          consentVersion: CONSENT_VERSION,
        })
        .returning();

      if (!user) throw new Error('User insert returned no row');

      const [profile] = await tx
        .insert(creativeProfiles)
        .values({ userId: user.id, slug: usernameNormalized })
        .returning();

      if (!profile) throw new Error('Profile insert returned no row');

      await tx.insert(creativeProfileSubdomains).values(
        subdomainRows.map((row) => ({
          profileId: profile.id,
          subdomainId: row.id,
          isPrimary: row.id === primary.id,
        })),
      );

      return toPublicUser(user, profile);
    });
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

export async function authenticate(username: string, password: string): Promise<PublicUser> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.usernameNormalized, normalizeUsername(username)))
    .limit(1);

  // Always run a verification, even with no user, so response time does not
  // reveal whether a username exists.
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ok = await verifyPassword(hash, password);

  if (!user || !ok) {
    throw AppError.unauthorized('Incorrect username or password.');
  }

  if (user.status === 'suspended') {
    throw AppError.forbidden('This account has been suspended.');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const [profile] = await db
    .select()
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, user.id))
    .limit(1);

  return toPublicUser(user, profile ?? null);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, user.id))
    .limit(1);

  return toPublicUser(user, profile ?? null);
}

function toPublicUser(
  user: typeof users.$inferSelect,
  profile: typeof creativeProfiles.$inferSelect | null,
): PublicUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    profileSlug: profile?.slug ?? null,
    profileStatus: profile?.status ?? null,
    rejectionReason: profile?.rejectionReason ?? null,
  };
}

/** Postgres 23505 = unique_violation. Map it to a field-specific message rather
 *  than leaking a constraint name to the client. Drizzle wraps the driver
 *  error on `cause`, so walk that chain. */
function translateUniqueViolation(error: unknown): unknown {
  let current: unknown = error;
  let code: string | undefined;
  let detail = '';
  let constraint = '';

  while (current && typeof current === 'object') {
    const candidate = current as {
      code?: string;
      detail?: string;
      constraint_name?: string;
      cause?: unknown;
    };
    if (candidate.code === '23505') {
      code = candidate.code;
      detail = String(candidate.detail ?? '');
      constraint = String(candidate.constraint_name ?? '');
      break;
    }
    current = candidate.cause;
  }

  if (code !== '23505') return error;

  const haystack = `${detail} ${constraint}`;

  if (haystack.includes('username_normalized')) {
    return AppError.conflict('That username is already taken.', { field: 'username' });
  }
  if (haystack.includes('email_normalized')) {
    return AppError.conflict('An account already uses that email address.', { field: 'email' });
  }
  if (haystack.includes('phone') || haystack.includes('users_phone')) {
    return AppError.conflict('An account already uses that phone number.', { field: 'phone' });
  }
  return AppError.conflict('That account already exists.');
}
