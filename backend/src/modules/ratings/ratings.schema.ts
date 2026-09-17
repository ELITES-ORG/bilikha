import { z } from 'zod';

export const ratingIdSchema = z.string().uuid('Invalid rating id');

/**
 * Five stars and a short note. The cap is the point: a review box that invites
 * an essay invites a grievance (ADR 0033), and this text is published about a
 * named person.
 */
const starsSchema = z.coerce
  .number()
  .int('Choose a whole number of stars')
  .min(1, 'Choose between one and five stars')
  .max(5, 'Choose between one and five stars');

const commentSchema = z.string().trim().max(500, 'Keep the note under 500 characters');

export const leaveRatingSchema = z.object({
  stars: starsSchema,
  comment: commentSchema.optional(),
});

/** An edit replaces both: the modal resubmits what it rendered. */
export const updateRatingSchema = z.object({
  stars: starsSchema,
  comment: commentSchema.optional(),
});

export const reportRatingSchema = z.object({
  reason: z.string().trim().min(1, 'Say what is wrong with this rating').max(1000),
});

export const listRatingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type LeaveRatingInput = z.infer<typeof leaveRatingSchema>;
export type UpdateRatingInput = z.infer<typeof updateRatingSchema>;
export type ReportRatingInput = z.infer<typeof reportRatingSchema>;
export type ListRatingsInput = z.infer<typeof listRatingsSchema>;
