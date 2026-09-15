import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  barangays,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { ChangePasswordInput, UpdateProfileInput } from './me.schema.js';

export interface OwnProfile {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  displayName: string | null;
  bio: string | null;
  municipalitySlug: string | null;
  barangaySlug: string | null;
  contactPreference: string;
  email: string;
  phone: string;
  status: string;
  rejectionReason: string | null;
  editedSinceReviewAt: string | null;
  subdomainSlugs: string[];
  primarySubdomainSlug: string | null;
}

type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';

/** ADR 0016. The only three outcomes. */
export function nextStatusAfterEdit(
  current: ProfileStatus,
  publicFieldsChanged: boolean,
): { status: ProfileStatus; flagEdited: boolean } {
  if (current === 'suspended') return { status: 'pending_review', flagEdited: false };
  if (current === 'published' && publicFieldsChanged) {
    return { status: 'published', flagEdited: true };
  }
  return { status: current, flagEdited: false };
}

function sameSlugSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((slug, i) => slug === sortedB[i]);
}

function normOptional(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return value;
}

export async function getOwnProfile(userId: string): Promise<OwnProfile | null> {
  const [row] = await db
    .select({
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      email: users.email,
      phone: users.phone,
      municipalitySlug: municipalities.slug,
      barangaySlug: barangays.slug,
      displayName: creativeProfiles.displayName,
      bio: creativeProfiles.bio,
      contactPreference: creativeProfiles.contactPreference,
      status: creativeProfiles.status,
      rejectionReason: creativeProfiles.rejectionReason,
      editedSinceReviewAt: creativeProfiles.editedSinceReviewAt,
      profileId: creativeProfiles.id,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .leftJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .leftJoin(barangays, eq(users.barangayId, barangays.id))
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!row) return null;

  const subdomainRows = await db
    .select({
      slug: creativeSubdomains.slug,
      isPrimary: creativeProfileSubdomains.isPrimary,
    })
    .from(creativeProfileSubdomains)
    .innerJoin(
      creativeSubdomains,
      eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id),
    )
    .where(eq(creativeProfileSubdomains.profileId, row.profileId));

  const primary = subdomainRows.find((s) => s.isPrimary);

  return {
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    suffix: row.suffix,
    displayName: row.displayName,
    bio: row.bio,
    municipalitySlug: row.municipalitySlug,
    barangaySlug: row.barangaySlug,
    contactPreference: row.contactPreference,
    email: row.email,
    phone: row.phone,
    status: row.status,
    rejectionReason: row.rejectionReason,
    editedSinceReviewAt: row.editedSinceReviewAt?.toISOString() ?? null,
    subdomainSlugs: subdomainRows.map((s) => s.slug),
    primarySubdomainSlug: primary?.slug ?? null,
  };
}

export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<OwnProfile> {
  const current = await getOwnProfile(userId);
  if (!current) throw AppError.notFound('No profile to update.');

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

  const nextMiddle = input.middleName ?? null;
  const nextSuffix = input.suffix ?? null;
  const nextDisplay = input.displayName ?? null;
  const nextBio = input.bio ?? null;
  const nextBarangaySlug = input.barangaySlug ?? null;

  const publicFieldsChanged =
    current.firstName !== input.firstName ||
    normOptional(current.middleName) !== normOptional(nextMiddle) ||
    current.lastName !== input.lastName ||
    normOptional(current.suffix) !== normOptional(nextSuffix) ||
    normOptional(current.displayName) !== normOptional(nextDisplay) ||
    normOptional(current.bio) !== normOptional(nextBio) ||
    current.municipalitySlug !== input.municipalitySlug ||
    normOptional(current.barangaySlug) !== normOptional(nextBarangaySlug) ||
    !sameSlugSet(current.subdomainSlugs, input.subdomainSlugs) ||
    current.primarySubdomainSlug !== input.primarySubdomainSlug;

  const transition = nextStatusAfterEdit(current.status as ProfileStatus, publicFieldsChanged);
  const now = new Date();

  const [profileRow] = await db
    .select({ id: creativeProfiles.id, status: creativeProfiles.status })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profileRow) throw AppError.notFound('No profile to update.');

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        firstName: input.firstName,
        middleName: nextMiddle,
        lastName: input.lastName,
        suffix: nextSuffix,
        municipalityId: municipality.id,
        barangayId,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    const profileUpdate: {
      displayName: string | null;
      bio: string | null;
      contactPreference: string;
      status: ProfileStatus;
      rejectionReason?: string | null;
      editedSinceReviewAt?: Date;
      updatedAt: Date;
    } = {
      displayName: nextDisplay,
      bio: nextBio,
      contactPreference: input.contactPreference,
      status: transition.status,
      updatedAt: now,
    };

    if (current.status === 'suspended' && transition.status === 'pending_review') {
      profileUpdate.rejectionReason = null;
    }
    if (transition.flagEdited) {
      profileUpdate.editedSinceReviewAt = now;
    }

    await tx
      .update(creativeProfiles)
      .set(profileUpdate)
      .where(eq(creativeProfiles.id, profileRow.id));

    await tx
      .delete(creativeProfileSubdomains)
      .where(eq(creativeProfileSubdomains.profileId, profileRow.id));

    await tx.insert(creativeProfileSubdomains).values(
      subdomainRows.map((row) => ({
        profileId: profileRow.id,
        subdomainId: row.id,
        isPrimary: row.id === primary.id,
      })),
    );

    if (current.status !== transition.status) {
      await tx.insert(moderationActions).values({
        profileId: profileRow.id,
        adminId: null,
        action: 'returned_to_pending',
        reason: null,
      });
    }
  });

  const updated = await getOwnProfile(userId);
  if (!updated) throw new Error('Profile missing after update');
  return updated;
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw AppError.unauthorized('Session is no longer valid.');

  const ok = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!ok) {
    throw AppError.unauthorized('Current password is incorrect.');
  }

  if (input.newPassword.toLowerCase().includes(user.username.toLowerCase())) {
    throw AppError.badRequest('Password must not contain your username.', {
      field: 'newPassword',
    });
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
