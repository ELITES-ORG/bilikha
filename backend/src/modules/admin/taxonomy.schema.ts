import { z } from 'zod';
import { ALIAS_MAX_LENGTH } from '../search/search-sql.js';
import { MISSES_DEFAULT_DAYS, RETENTION_DAYS } from '../search/search-misses.js';

/**
 * A slug is kebab-case, spelled out, no abbreviations. It is chosen once, when
 * the item is created, and never again — see `updateTaxonomySchema`.
 */
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'A slug is lowercase letters, digits and single hyphens, e.g. sound-engineers',
  );

const nameSchema = z.string().trim().min(2).max(120);
const descriptionSchema = z.string().trim().max(1000);

export const createDomainSchema = z.object({
  slug: slugSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
  displayOrder: z.coerce.number().int().positive().optional(),
});

export const createSubdomainSchema = z.object({
  domainSlug: slugSchema,
  slug: slugSchema,
  name: nameSchema,
  singularName: nameSchema,
  displayOrder: z.coerce.number().int().positive().optional(),
});

/**
 * No `slug` field, and `.strict()` so sending one is a 400 rather than a
 * silently ignored key.
 *
 * A slug is a public identifier: it is in URLs, indexed by Google, and shared
 * into Messenger. Changing one breaks every link that ever pointed at it, which
 * is a data migration and a redirect, not an edit (ADR 0049). An edit form must
 * not be one keystroke away from that, and a schema that merely ignores the
 * field would let a caller believe the rename worked.
 *
 * A wrong slug is fixed by archiving the item and creating a replacement.
 */
export const updateTaxonomySchema = z
  .object({
    name: nameSchema.optional(),
    singularName: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    displayOrder: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update',
  });

/** Which of the two taxonomy tables a route is addressing. */
export const taxonomyKindSchema = z.enum(['domains', 'subdomains']);

export const taxonomyParamsSchema = z.object({
  kind: taxonomyKindSchema,
  slug: slugSchema,
});

export const taxonomyChangesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type CreateSubdomainInput = z.infer<typeof createSubdomainSchema>;
export type UpdateTaxonomyInput = z.infer<typeof updateTaxonomySchema>;
export type TaxonomyKind = z.infer<typeof taxonomyKindSchema>;

/**
 * An everyday word for a sub-domain (issue #24). The length is checked here
 * and again after folding, which can only shorten it.
 */
export const addAliasSchema = z.object({
  term: z.string().trim().min(1, 'Enter a word').max(ALIAS_MAX_LENGTH),
});

export const subdomainAliasParamsSchema = z.object({ slug: slugSchema });

export const aliasParamsSchema = z.object({
  slug: slugSchema,
  id: z.string().uuid('Invalid alias id'),
});

export const searchMissesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(RETENTION_DAYS).default(MISSES_DEFAULT_DAYS),
});
