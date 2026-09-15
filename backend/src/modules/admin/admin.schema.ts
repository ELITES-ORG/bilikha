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
