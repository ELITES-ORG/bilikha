import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { creativeProfiles } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import {
  avatarKey,
  createSignedUpload,
  portfolioKey,
} from '../../lib/storage.js';

export const uploadUrlBodySchema = z.object({
  kind: z.enum(['avatar', 'portfolio']),
});

export type UploadUrlBody = z.infer<typeof uploadUrlBodySchema>;

async function requireOwnCreativeProfile(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    throw AppError.forbidden('A creative profile is required to upload portfolio images');
  }

  return profile;
}

/**
 * Issues signed upload URLs. Image bytes never pass through this API.
 *
 * Portfolio ten-item enforcement on the ticket itself is completed in Phase 6
 * once `portfolio_items` exists; until then only the creative-profile guard
 * runs here. POST /media/portfolio will enforce the cap inside its insert
 * transaction.
 */
export async function issueUploadUrl(userId: string, input: UploadUrlBody) {
  if (input.kind === 'avatar') {
    const objectKey = avatarKey(userId);
    const ticket = await createSignedUpload(objectKey);
    return { kind: 'avatar' as const, ...ticket };
  }

  const profile = await requireOwnCreativeProfile(userId);
  const base = portfolioKey(profile.id);
  const fullKey = `${base}.webp`;
  const thumbKey = `${base}-thumb.webp`;

  const [full, thumb] = await Promise.all([
    createSignedUpload(fullKey),
    createSignedUpload(thumbKey),
  ]);

  return {
    kind: 'portfolio' as const,
    full: { uploadUrl: full.uploadUrl, objectKey: full.objectKey },
    thumb: { uploadUrl: thumb.uploadUrl, objectKey: thumb.objectKey },
  };
}
