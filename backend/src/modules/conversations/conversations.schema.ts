import { z } from 'zod';

export const startConversationSchema = z.object({
  profileSlug: z.string().trim().min(1),
  body: z.string().trim().min(20, 'Give a little more detail').max(2000),
  offerId: z.string().uuid('Invalid offer id').optional(),
});

export const ensureConversationSchema = z
  .object({
    profileSlug: z.string().trim().min(1).optional(),
    postingId: z.string().uuid('Invalid posting id').optional(),
  })
  .refine((data) => Boolean(data.profileSlug) !== Boolean(data.postingId), {
    message: 'Provide either profileSlug or postingId',
  });

export const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1, 'Write a message').max(2000),
    offerId: z.string().uuid('Invalid offer id').optional(),
    postingId: z.string().uuid('Invalid posting id').optional(),
  })
  .refine((data) => !(data.offerId && data.postingId), {
    message: 'Attach either an offer or a posting, not both',
  });

export const listMessagesSchema = z.object({
  // Polling passes the newest message it already has.
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listThreadsSchema = z.object({
  mode: z.enum(['hiring', 'creative']).default('hiring'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listHistorySchema = z.object({
  mode: z.enum(['hiring', 'creative']).default('hiring'),
});

export const reportSchema = z.object({
  reason: z.string().trim().min(10, 'Tell us what is wrong').max(500),
});

export const conversationIdSchema = z.string().uuid('Invalid conversation id');

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type EnsureConversationInput = z.infer<typeof ensureConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type ListThreadsInput = z.infer<typeof listThreadsSchema>;
export type ListHistoryInput = z.infer<typeof listHistorySchema>;
export type ReportInput = z.infer<typeof reportSchema>;
