import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { organizations } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import {
  assertSafeObjectKey,
  createSignedUpload,
  discardObject,
  organizationLogoKey,
} from '../../lib/storage.js';
import { roleIn } from './organizations.service.js';

/**
 * An organisation's logo (plan 0051 follow-up), handled the way a profile photo
 * is: the browser resizes the image and uploads it straight to storage with a
 * signed URL, then tells the API which object it put there. Image bytes never
 * pass through this server.
 *
 * Founder and co-founders manage it, as they manage the rest of the page. A
 * new logo goes to the media queue for review (`logo_reviewed_at` cleared), and
 * on a published page it also flags the page as edited (ADR 0016), as a new
 * profile photo does.
 */

async function editableOrganization(userId: string, slug: string) {
  const [organization] = await db
    .select({
      id: organizations.id,
      status: organizations.status,
      logoKey: organizations.logoKey,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!organization) throw AppError.notFound('No such organisation.');

  const role = await roleIn(organization.id, userId);
  if (!role) throw AppError.notFound('No such organisation.');
  if (role !== 'founder' && role !== 'co_founder') {
    throw AppError.forbidden("Only the founder and co-founders can change the organisation's logo.");
  }
  if (organization.status === 'suspended') {
    throw AppError.forbidden('This organisation has been suspended and cannot be edited.');
  }
  return organization;
}

export async function issueLogoUpload(input: { userId: string; slug: string }) {
  const organization = await editableOrganization(input.userId, input.slug);
  return createSignedUpload(organizationLogoKey(organization.id));
}

export async function setLogo(input: { userId: string; slug: string; objectKey: string }) {
  const organization = await editableOrganization(input.userId, input.slug);

  // Must run before the prefix test — see assertSafeObjectKey. The prefix is
  // what stops one team attaching an object another team uploaded.
  assertSafeObjectKey(input.objectKey);
  if (!input.objectKey.startsWith(`organizations/${organization.id}/`)) {
    throw AppError.forbidden('That image does not belong to this organisation.');
  }

  const now = new Date();
  await db
    .update(organizations)
    .set({
      logoKey: input.objectKey,
      logoReviewedAt: null,
      ...(organization.status === 'published' ? { editedSinceReviewAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(organizations.id, organization.id));

  if (organization.logoKey && organization.logoKey !== input.objectKey) {
    await discardObject(organization.logoKey);
  }
  return { objectKey: input.objectKey };
}

export async function clearLogo(input: { userId: string; slug: string }) {
  const organization = await editableOrganization(input.userId, input.slug);
  if (!organization.logoKey) return { removed: false };

  await db
    .update(organizations)
    .set({ logoKey: null, logoReviewedAt: null, updatedAt: new Date() })
    .where(eq(organizations.id, organization.id));

  await discardObject(organization.logoKey);
  return { removed: true };
}
