import { z } from 'zod';

const postingFields = {
  title: z.string().trim().min(3).max(80),
  subdomainSlug: z.string().trim().min(1),
  municipalitySlug: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional()
    .or(z.literal('').transform(() => undefined)),
  budgetMinCentavos: z.number().int().positive()
    .max(100_000_000, 'Budget must be ₱1,000,000 or less').optional(),
  budgetMaxCentavos: z.number().int().positive()
    .max(100_000_000, 'Budget must be ₱1,000,000 or less').optional(),
  expiresInDays: z.number().int().min(1).max(60).default(30),
};

const validBudgetRange = (data: {
  budgetMinCentavos?: number | null;
  budgetMaxCentavos?: number | null;
}) => data.budgetMinCentavos == null
  || data.budgetMaxCentavos == null
  || data.budgetMinCentavos <= data.budgetMaxCentavos;

export const postingBodySchema = z
  .object(postingFields)
  .refine(validBudgetRange, {
    path: ['budgetMaxCentavos'],
    message: 'Maximum must be at least the minimum',
  });

const patchDescription = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

export const patchPostingBodySchema = z
  .object({
    title: postingFields.title.optional(),
    subdomainSlug: postingFields.subdomainSlug.optional(),
    municipalitySlug: postingFields.municipalitySlug.optional(),
    description: patchDescription,
    budgetMinCentavos: postingFields.budgetMinCentavos.nullable(),
    budgetMaxCentavos: postingFields.budgetMaxCentavos.nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine(validBudgetRange, {
    path: ['budgetMaxCentavos'],
    message: 'Maximum must be at least the minimum',
  });

export const postingIdSchema = z.string().uuid('Invalid posting id');

export const listPostingsQuerySchema = z.object({
  domain: z.string().trim().min(1).optional(),
  subdomain: z.string().trim().min(1).optional(),
  municipality: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PostingBody = z.infer<typeof postingBodySchema>;
export type PatchPostingBody = z.infer<typeof patchPostingBodySchema>;
export type ListPostingsQuery = z.infer<typeof listPostingsQuerySchema>;
