import { z } from 'zod';
import { OFFER_IMAGE_LIMIT, OFFER_LIMIT } from './offers.service.js';

const offerFields = {
  title: z.string().trim().min(3).max(80),
  subdomainSlug: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional()
    .or(z.literal('').transform(() => undefined)),
  // 100_000_000 centavos is ₱1,000,000. The ceiling is not about realism, it
  // stops a typo putting a nine-digit price on the directory - so it needs a
  // message a person can act on rather than Zod's default.
  priceMinCentavos: z.number().int().positive()
    .max(100_000_000, 'Price must be ₱1,000,000 or less').optional(),
  priceMaxCentavos: z.number().int().positive()
    .max(100_000_000, 'Price must be ₱1,000,000 or less').optional(),
};

const validPriceRange = (data: {
  priceMinCentavos?: number | null;
  priceMaxCentavos?: number | null;
}) => data.priceMinCentavos == null
  || data.priceMaxCentavos == null
  || data.priceMinCentavos <= data.priceMaxCentavos;

export const offerBodySchema = z
  .object(offerFields)
  .refine(validPriceRange, {
    path: ['priceMaxCentavos'],
    message: 'Maximum must be at least the minimum',
  });

/**
 * On PATCH an empty description means "clear it", not "leave it alone". The
 * create schema maps '' to undefined, and reusing that here made a description
 * settable but never removable — which matters most for the one field the
 * contact-details flag reads.
 */
const patchDescription = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

export const patchOfferBodySchema = z
  .object({
    title: offerFields.title.optional(),
    subdomainSlug: offerFields.subdomainSlug.optional(),
    description: patchDescription,
    priceMinCentavos: offerFields.priceMinCentavos.nullable(),
    priceMaxCentavos: offerFields.priceMaxCentavos.nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine(validPriceRange, {
    path: ['priceMaxCentavos'],
    message: 'Maximum must be at least the minimum',
  });

export const offerIdSchema = z.string().uuid('Invalid offer id');
export const offerImageIdSchema = z.string().uuid('Invalid offer image id');

export const reorderOffersBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(OFFER_LIMIT),
});

export const addOfferImageBodySchema = z.object({
  objectKey: z.string().min(1).max(512),
  thumbKey: z.string().min(1).max(512),
});

export const listOffersQuerySchema = z
  .object({
    domain: z.string().trim().min(1).optional(),
    subdomain: z.string().trim().min(1).optional(),
    municipality: z.string().trim().min(1).optional(),
    // Pesos at the query edge; converted to centavos in the service.
    budgetMin: z.coerce.number().int().positive().max(1_000_000).optional(),
    budgetMax: z.coerce.number().int().positive().max(1_000_000).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine(
    (q) => q.budgetMin == null || q.budgetMax == null || q.budgetMin <= q.budgetMax,
    { path: ['budgetMax'], message: 'Maximum must be at least the minimum' },
  );

export const reorderOfferImagesBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(OFFER_IMAGE_LIMIT),
});

export type OfferBody = z.infer<typeof offerBodySchema>;
export type PatchOfferBody = z.infer<typeof patchOfferBodySchema>;
export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;
