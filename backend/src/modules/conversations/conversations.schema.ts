import { z } from 'zod';

export const startConversationSchema = z.object({
  profileSlug: z.string().trim().min(1),
  subject: z.string().trim().min(3, 'Too short').max(120),
  body: z.string().trim().min(20, 'Give a little more detail').max(2000),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(2000),
});

export const listMessagesSchema = z.object({
  // Polling passes the newest message it already has.
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listThreadsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const reportSchema = z.object({
  reason: z.string().trim().min(10, 'Tell us what is wrong').max(500),
});

export const conversationIdSchema = z.string().uuid('Invalid conversation id');

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type ListThreadsInput = z.infer<typeof listThreadsSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
