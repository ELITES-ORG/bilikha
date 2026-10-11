import { z } from 'zod';

/**
 * Same shape as a creative profile's crafts (`me.schema.ts`): one to five
 * sub-domains, one of them primary. The extra rule — at most two domains — is
 * checked in the service, because it needs the taxonomy to know which domain
 * each sub-domain belongs to (ADR 0054).
 */
const craftFields = {
  subdomainSlugs: z.array(z.string().trim().min(1)).min(1, 'Choose at least one craft').max(5),
  primarySubdomainSlug: z.string().trim().min(1),
};

const primaryAmongSelected = {
  path: ['primarySubdomainSlug'] as (string | number)[],
  message: 'The primary must be one of your selected crafts',
};

export const foundOrganizationSchema = z
  .object({
    name: z.string().trim().min(2, 'At least 2 characters').max(80),
    bio: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
    municipalitySlug: z.string().trim().min(1, 'Select a municipality'),
    ...craftFields,
  })
  .refine((d) => d.subdomainSlugs.includes(d.primarySubdomainSlug), primaryAmongSelected);

/**
 * Every field optional, and `.strict()`: the slug is not here because it is a
 * public URL and never changes after founding (the rule ADR 0049 sets for
 * taxonomy slugs, for the same reason).
 */
export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    bio: z.string().trim().max(1000).nullable().optional(),
    municipalitySlug: z.string().trim().min(1).optional(),
    subdomainSlugs: craftFields.subdomainSlugs.optional(),
    primarySubdomainSlug: craftFields.primarySubdomainSlug.optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' })
  .refine(
    (d) =>
      (d.subdomainSlugs === undefined) === (d.primarySubdomainSlug === undefined),
    { message: 'Crafts and the primary craft change together', path: ['primarySubdomainSlug'] },
  )
  .refine(
    (d) => !d.subdomainSlugs || d.subdomainSlugs.includes(d.primarySubdomainSlug!),
    primaryAmongSelected,
  );

export const moderateOrganizationSchema = z.object({
  action: z.enum(['approved', 'rejected', 'acknowledged_edit']),
  reason: z.string().trim().max(500).optional(),
});

export const adminOrganizationQueueSchema = z.object({
  status: z.enum(['pending_review', 'published', 'rejected', 'suspended', 'edited']).default('pending_review'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FoundOrganizationInput = z.infer<typeof foundOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/**
 * Inviting someone in. Never `founder`: that role is founded or handed over,
 * not invited into (ADR 0054).
 */
export const inviteSchema = z.object({
  username: z.string().trim().min(1, 'Enter a username'),
  role: z.enum(['member', 'co_founder']).default('member'),
  title: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
});

export const handOverSchema = z.object({
  userId: z.string().uuid('Invalid account id'),
});

/** The storage key the browser uploaded the resized logo to. */
export const setLogoSchema = z.object({
  objectKey: z.string().min(1).max(512),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export const listOrganizationsSchema = z.object({
  domain: z.string().trim().min(1).optional(),
  subdomain: z.string().trim().min(1).optional(),
  municipality: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
