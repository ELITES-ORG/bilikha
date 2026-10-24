import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { barangays, creativeProfiles, idVerifications, municipalities, users } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { isReservedUsername, normalizeUsername } from '../../lib/username.js';
import { normalizeEmail, normalizePhone } from '../../lib/contact.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import type { PublicUser } from '../../contracts/auth.js';
import type { IdDeclinedDetails } from '../../contracts/verification.js';
import { latestIdVerification, ownView } from '../verification/verification.service.js';
import { appealDeadline } from '../verification/window.js';
import type { RegisterInput } from './auth.schema.js';

export type { PublicUser } from '../../contracts/auth.js';

/** Stamped on every account at registration, so an account records which
 *  version of the privacy notice and terms its owner agreed to. Bump it when
 *  either changes what they disclose. There is no re-consent flow: a bump
 *  changes only what new registrations record. Mirrors `CONSENT_VERSION` in
 *  `frontend/src/lib/legal.ts`. It moved to 2026-10-13 when the terms began
 *  listing audio, video and PDF on offers, and saying uploads must be the
 *  uploader's own work or theirs to share, and the privacy notice began saying
 *  that searches which find nothing are counted (issue #24). It moved to
 *  2026-10-15 when new accounts began adding a photo of their ID: the privacy
 *  notice gained its ID section, and the terms say Bilikha is for people from
 *  Biliran (ADR 0057, plan 0053 Phase 5). It moved to 2026-10-24 when the
 *  privacy notice began saying that photos, audio, video and PDFs can be sent
 *  in messages, that only the two people can open them, and that all but PDFs
 *  are deleted after 30 days (ADR 0060, plan 0060 Step 6.4). */
export const CONSENT_VERSION = '2026-10-24';

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const usernameNormalized = normalizeUsername(input.username);

  if (isReservedUsername(usernameNormalized)) {
    throw AppError.conflict('That username is not available.', {
      field: 'username',
    });
  }

  const [municipality] = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.slug, input.municipalitySlug))
    .limit(1);

  if (!municipality) {
    throw AppError.badRequest('Unknown municipality.', { field: 'municipalitySlug' });
  }

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

  const emailNormalized = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  // The account and its first ID verification row, together: a new account is
  // browse-only from its first request until its ID is verified (ADR 0057).
  // Accounts from before this have no row, which means none is required.
  let user: typeof users.$inferSelect;
  try {
    user = await db.transaction(async (tx) => {
      const [created] = await tx
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
          barangayId: barangay.id,
          privacyConsentAt: now,
          termsAcceptedAt: now,
          consentVersion: CONSENT_VERSION,
        })
        .returning();
      if (!created) throw new Error('User insert returned no row');

      await tx.insert(idVerifications).values({ userId: created.id, status: 'pending' });
      return created;
    });
  } catch (error) {
    throw translateUniqueViolation(error);
  }

  // After the commit: toPublicUser reads through `db`, which inside the
  // transaction would not see the new row.
  return toPublicUser(user, null);
}

/**
 * The username and password, checked as sign-in checks them: a wrong one is
 * the same 401 whether or not the username exists, and a suspended account is
 * refused by name. Shared with the ID appeal (plan 0053 Step 4.2), which a
 * declined account makes without a session.
 */
export async function checkCredentials(
  username: string,
  password: string,
): Promise<typeof users.$inferSelect> {
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

  return user;
}

export async function authenticate(username: string, password: string): Promise<PublicUser> {
  const user = await checkCredentials(username, password);

  // Checked only after the right password, so the reason is never told to
  // someone guessing (ADR 0057). Before lastLoginAt: a refused sign-in is not
  // a sign-in. *Try again* is let in — resubmitting the ID is all it can do.
  const verification = await latestIdVerification(user.id);
  if (verification?.status === 'declined_final' || verification?.status === 'appealed') {
    // Until when the decline can still be appealed, so the sign-in screen can
    // offer it (plan 0053 Step 4.2).
    const appealUntil = appealDeadline(verification, new Date());
    const details: IdDeclinedDetails =
      verification.status === 'appealed'
        ? { kind: 'appealed', reason: verification.decisionReason }
        : {
            kind: 'final',
            reason: verification.decisionReason,
            ...(appealUntil ? { appealUntil: appealUntil.toISOString() } : {}),
          };
    throw new AppError(
      403,
      'ID_DECLINED',
      verification.status === 'appealed'
        ? 'Your appeal is being reviewed. You will be able to sign in if it is granted.'
        : 'Your ID was declined, so this account cannot be used.',
      details,
    );
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

async function municipalityForUser(
  municipalityId: string | null,
): Promise<{ slug: string; name: string } | null> {
  if (!municipalityId) return null;
  const [row] = await db
    .select({ slug: municipalities.slug, name: municipalities.name })
    .from(municipalities)
    .where(eq(municipalities.id, municipalityId))
    .limit(1);
  return row ?? null;
}

async function toPublicUser(
  user: typeof users.$inferSelect,
  profile: typeof creativeProfiles.$inferSelect | null,
): Promise<PublicUser> {
  const municipality = await municipalityForUser(user.municipalityId);
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    viewMode: user.viewMode,
    municipalitySlug: municipality?.slug ?? null,
    municipalityName: municipality?.name ?? null,
    profileSlug: profile?.slug ?? null,
    profileStatus: profile?.status ?? null,
    rejectionReason: profile?.rejectionReason ?? null,
    mustChangePassword: user.mustChangePassword,
    avatarUrl: user.avatarKey && isStorageConfigured() ? publicUrl(user.avatarKey) : null,
    pendingAvatarUrl:
      user.avatarPendingKey && isStorageConfigured() ? publicUrl(user.avatarPendingKey) : null,
    avatarRejectionReason: user.avatarRejectionReason,
    idVerification: ownView(await latestIdVerification(user.id)),
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
