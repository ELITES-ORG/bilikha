import { z } from 'zod';

export const idQueueQuerySchema = z.object({
  view: z.enum(['pending', 'decided']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const idVerificationParamsSchema = z.object({
  id: z.string().uuid('Invalid ID verification id'),
});

/**
 * The decision. Which fields each decision needs — a reason to decline, a
 * number or `noIdNumber` to settle it — is checked in the service, beside the
 * repeated-ID rules it depends on.
 */
export const idDecisionSchema = z
  .object({
    decision: z.enum(['verify', 'retry', 'final']),
    // The person reads this exactly as written.
    reason: z.string().trim().max(500, 'Keep the reason under 500 characters').optional(),
    // Typed from the photo. Only its keyed hash is stored; never logged.
    idNumber: z.string().trim().min(1).max(64).optional(),
    noIdNumber: z.boolean().optional(),
    acknowledgeMatch: z.boolean().optional(),
  })
  .refine((body) => !(body.idNumber && body.noIdNumber), {
    path: ['noIdNumber'],
    message: 'Give the ID number, or say the document has none — not both.',
  });
