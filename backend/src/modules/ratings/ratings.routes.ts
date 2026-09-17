import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { ratingIdSchema, reportRatingSchema, updateRatingSchema } from './ratings.schema.js';
import { deleteRating, reportRating, updateRating } from './ratings.service.js';

/**
 * What can be done to a rating that already exists. Leaving one hangs off the
 * agreement that earned it (POST /agreements/:id/rating), and reading them
 * hangs off the profile they are shown on.
 */
export const ratingsRouter: Router = Router();

ratingsRouter.use(requireAuth);

ratingsRouter.patch('/:id', async (req, res) => {
  const id = ratingIdSchema.parse(req.params.id);
  const input = updateRatingSchema.parse(req.body);
  const data = await updateRating({
    userId: req.session.userId!,
    ratingId: id,
    stars: input.stars,
    comment: input.comment ?? null,
  });
  res.json({ data });
});

ratingsRouter.delete('/:id', async (req, res) => {
  const id = ratingIdSchema.parse(req.params.id);
  const data = await deleteRating({ userId: req.session.userId!, ratingId: id });
  res.json({ data });
});

// The creative's appeal. Their only recourse, so it is one call (ADR 0033).
ratingsRouter.post('/:id/report', async (req, res) => {
  const id = ratingIdSchema.parse(req.params.id);
  const input = reportRatingSchema.parse(req.body);
  const data = await reportRating({
    userId: req.session.userId!,
    ratingId: id,
    reason: input.reason,
  });
  res.status(201).json({ data });
});
