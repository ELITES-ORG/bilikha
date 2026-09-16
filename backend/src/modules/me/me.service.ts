import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  barangays,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  offerImages,
  offers,
  savedOffers,
  userBlocks,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import type {
  ChangePasswordInput,
  CreateProfileInput,
  UpdateProfileInput,
} from './me.schema.js';

function formatCreativeName(parts: {
  displayName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
}): string {
  if (parts.displayName?.trim()) return parts.displayName.trim();
  return [parts.firstName, parts.middleName, parts.lastName, parts.suffix]
    .filter(Boolean)
    .join(' ');
}

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

export async function createOwnProfile(
  userId: string,
  input: CreateProfileInput,
): Promise<OwnProfile> {
  const existing = await getOwnProfile(userId);
  if (existing) {
    throw AppError.conflict('This account already has a creative profile.');
  }

  const [user] = await db
    .select({
      id: users.id,
      usernameNormalized: users.usernameNormalized,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw AppError.unauthorized('Session is no longer valid.');

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

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(creativeProfiles)
      .values({
        userId,
        slug: user.usernameNormalized,
        displayName: input.displayName ?? null,
        bio: input.bio ?? null,
        contactPreference: input.contactPreference,
        status: 'pending_review',
      })
      .returning();

    if (!profile) throw new Error('Profile insert returned no row');

    await tx.insert(creativeProfileSubdomains).values(
      subdomainRows.map((row) => ({
        profileId: profile.id,
        subdomainId: row.id,
        isPrimary: row.id === primary.id,
      })),
    );
  });

  const created = await getOwnProfile(userId);
  if (!created) throw new Error('Profile missing after create');
  return created;
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

  const removedSlugs = current.subdomainSlugs.filter(
    (slug) => !input.subdomainSlugs.includes(slug),
  );
  if (removedSlugs.length > 0) {
    const [inUse] = await db
      .select({
        name: creativeSubdomains.name,
        total: count(),
      })
      .from(offers)
      .innerJoin(creativeSubdomains, eq(offers.subdomainId, creativeSubdomains.id))
      .where(
        and(
          eq(offers.profileId, profileRow.id),
          inArray(creativeSubdomains.slug, removedSlugs),
        ),
      )
      .groupBy(creativeSubdomains.id, creativeSubdomains.name)
      .limit(1);

    if (inUse && inUse.total > 0) {
      throw AppError.badRequest(
        `Remove your ${inUse.total} ${inUse.total === 1 ? 'offer' : 'offers'} under ${inUse.name} first.`,
        { field: 'subdomainSlugs' },
      );
    }
  }

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

export async function listBlocks(userId: string) {
  const rows = await db
    .select({
      id: userBlocks.id,
      blockedUserId: userBlocks.blockedUserId,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(userBlocks.blockedUserId, users.id))
    .where(eq(userBlocks.blockerUserId, userId));

  return rows.map((row) => ({
    id: row.id,
    userId: row.blockedUserId,
    username: row.username,
    name: `${row.firstName} ${row.lastName}`.trim(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function blockUser(blockerUserId: string, blockedUserId: string) {
  if (blockerUserId === blockedUserId) {
    throw AppError.badRequest('You cannot block yourself.');
  }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, blockedUserId))
    .limit(1);
  if (!target) throw AppError.notFound('User not found.');

  const [existing] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerUserId, blockerUserId),
        eq(userBlocks.blockedUserId, blockedUserId),
      ),
    )
    .limit(1);

  if (existing) {
    return { id: existing.id, alreadyBlocked: true as const };
  }

  const [row] = await db
    .insert(userBlocks)
    .values({ blockerUserId, blockedUserId })
    .returning();

  return { id: row!.id, alreadyBlocked: false as const };
}

export async function unblockUser(blockerUserId: string, blockedUserId: string) {
  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerUserId, blockerUserId),
        eq(userBlocks.blockedUserId, blockedUserId),
      ),
    );
  return { ok: true as const };
}

/** Only offers on published creatives can be saved. */
export async function saveOffer(userId: string, offerId: string) {
  const [offer] = await db
    .select({ id: offers.id })
    .from(offers)
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .where(and(eq(offers.id, offerId), eq(creativeProfiles.status, 'published')))
    .limit(1);

  if (!offer) {
    throw AppError.badRequest('Only published offers can be saved.', { field: 'offerId' });
  }

  const [existing] = await db
    .select({ id: savedOffers.id })
    .from(savedOffers)
    .where(and(eq(savedOffers.userId, userId), eq(savedOffers.offerId, offerId)))
    .limit(1);

  if (existing) {
    return { id: existing.id, alreadySaved: true as const };
  }

  // The read above is not atomic with this insert, and a double-tap really does
  // arrive twice. Without onConflictDoNothing the unique index turns the second
  // one into a 500 on an action that is meant to be idempotent.
  const [row] = await db
    .insert(savedOffers)
    .values({ userId, offerId })
    .onConflictDoNothing({ target: [savedOffers.userId, savedOffers.offerId] })
    .returning({ id: savedOffers.id });

  if (row) return { id: row.id, alreadySaved: false as const };

  const [raced] = await db
    .select({ id: savedOffers.id })
    .from(savedOffers)
    .where(and(eq(savedOffers.userId, userId), eq(savedOffers.offerId, offerId)))
    .limit(1);

  return { id: raced!.id, alreadySaved: true as const };
}

/** Idempotent: missing rows still return successfully. */
export async function unsaveOffer(userId: string, offerId: string) {
  await db
    .delete(savedOffers)
    .where(and(eq(savedOffers.userId, userId), eq(savedOffers.offerId, offerId)));
  return { ok: true as const };
}

export async function listSavedOffers(userId: string) {
  const rows = await db
    .select({
      id: savedOffers.id,
      savedAt: savedOffers.createdAt,
      offerId: offers.id,
      title: offers.title,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
      slug: creativeProfiles.slug,
      displayName: creativeProfiles.displayName,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      municipality: municipalities.name,
      avatarKey: users.avatarKey,
    })
    .from(savedOffers)
    .innerJoin(offers, eq(savedOffers.offerId, offers.id))
    .innerJoin(creativeProfiles, eq(offers.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(eq(savedOffers.userId, userId))
    .orderBy(desc(savedOffers.createdAt));

  const offerIds = rows.map((r) => r.offerId);
  const firstImageByOfferId = new Map<string, { url: string; thumbUrl: string }>();
  if (offerIds.length > 0 && isStorageConfigured()) {
    const imageRows = await db
      .select({
        offerId: offerImages.offerId,
        objectKey: offerImages.objectKey,
        thumbKey: offerImages.thumbKey,
      })
      .from(offerImages)
      .where(inArray(offerImages.offerId, offerIds))
      .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

    for (const row of imageRows) {
      if (firstImageByOfferId.has(row.offerId)) continue;
      firstImageByOfferId.set(row.offerId, {
        url: publicUrl(row.objectKey),
        thumbUrl: publicUrl(row.thumbKey),
      });
    }
  }

  return {
    data: rows.map((row) => ({
      id: row.id,
      savedAt: row.savedAt.toISOString(),
      offer: {
        id: row.offerId,
        title: row.title,
        priceMinCentavos: row.priceMinCentavos,
        priceMaxCentavos: row.priceMaxCentavos,
        image: firstImageByOfferId.get(row.offerId) ?? null,
      },
      creative: {
        slug: row.slug,
        displayName: formatCreativeName(row),
        municipality: row.municipality,
        avatarUrl: row.avatarKey && isStorageConfigured() ? publicUrl(row.avatarKey) : null,
      },
    })),
  };
}
