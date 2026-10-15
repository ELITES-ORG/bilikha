import { z } from 'zod';

export const idQueueQuerySchema = z.object({
  view: z.enum(['pending', 'appeals', 'decided']).default('pending'),
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
    // The decision the administrator's page showed: null for a first decision,
    // its `decidedAt` for a change. Without it a decision sent from a page
    // opened earlier would land as a change to one made since.
    expectedDecidedAt: z.iso.datetime().nullable(),
  })
  .refine((body) => !(body.idNumber && body.noIdNumber), {
    path: ['noIdNumber'],
    message: 'Give the ID number, or say the document has none — not both.',
  });

/** The answer to a person's appeal (plan 0053 Step 4.3). The reason is required either way. */
export const idAppealDecisionSchema = z.object({
  outcome: z.enum(['grant', 'uphold']),
  reason: z
    .string()
    .trim()
    .min(1, 'Write the reason for the answer')
    .max(500, 'Keep the reason under 500 characters'),
  acknowledgeMatch: z.boolean().optional(),
});
