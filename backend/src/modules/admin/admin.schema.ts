import { z } from 'zod';

export const listQuerySchema = z.object({
  status: z
    .enum(['draft', 'pending_review', 'published', 'suspended'])
    .default('pending_review'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const moderateSchema = z.object({
  action: z.enum(['approved', 'rejected', 'returned_to_pending']),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Route params reach Postgres as a uuid comparison. Without this, a malformed
 * id produces `invalid input syntax for type uuid` and surfaces as a 500 —
 * an unhandled database error where a 400 belongs.
 */
export const profileParamsSchema = z.object({
  id: z.string().uuid('Not a valid profile id'),
});
