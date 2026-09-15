import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  barangays,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  municipalities,
  users,
} from '../../db/schema/index.js';

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
