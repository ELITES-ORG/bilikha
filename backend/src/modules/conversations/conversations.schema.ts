import { z } from 'zod';
import { FILES_PER_MESSAGE } from '../media/media.limits.js';

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
    // Empty is allowed when the message carries a file (ADR 0060).
    body: z.string().trim().max(2000).default(''),
    offerId: z.string().uuid('Invalid offer id').optional(),
    postingId: z.string().uuid('Invalid posting id').optional(),
    /** Upload reservations to send as files (ADR 0060). */
    attachments: z
      .array(z.string().uuid('Invalid upload id'))
      .max(FILES_PER_MESSAGE, `A message can carry at most ${FILES_PER_MESSAGE} files`)
      .refine((ids) => new Set(ids).size === ids.length, 'Each file can be sent once')
      .default([]),
  })
  .refine((data) => data.body.length > 0 || data.attachments.length > 0, {
    message: 'Write a message',
    path: ['body'],
  })
  .refine((data) => !(data.offerId && data.postingId), {
    message: 'Attach either an offer or a posting, not both',
  });

export const attachmentUrlSchema = z.object({
  variant: z.enum(['file', 'thumb']).default('file'),
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
export const attachmentIdSchema = z.string().uuid('Invalid file id');

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type EnsureConversationInput = z.infer<typeof ensureConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type ListThreadsInput = z.infer<typeof listThreadsSchema>;
export type ListHistoryInput = z.infer<typeof listHistorySchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type AttachmentUrlInput = z.infer<typeof attachmentUrlSchema>;
