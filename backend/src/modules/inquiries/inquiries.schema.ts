import { z } from 'zod';

export const sendInquirySchema = z.object({
  profileSlug: z.string().trim().min(1),
  subject: z.string().trim().min(3, 'Too short').max(120),
  message: z.string().trim().min(20, 'Give a little more detail').max(2000),
});

export const respondSchema = z.object({
  action: z.enum(['responded', 'declined']),
  response: z.string().trim().max(2000).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const inquiryParamsSchema = z.object({
  id: z.string().uuid('Not a valid inquiry id'),
});

export type SendInquiryInput = z.infer<typeof sendInquirySchema>;
export type RespondInput = z.infer<typeof respondSchema>;
