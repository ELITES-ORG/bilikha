import { z } from 'zod';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { passwordChangeLimiter } from '../../middleware/rate-limit.js';
import {
  changePasswordSchema,
  createProfileSchema,
  saveOfferSchema,
  updateProfileSchema,
} from './me.schema.js';
import {
  blockUser,
  changePassword,
  createOwnProfile,
  getOwnProfile,
  listBlocks,
  listSavedOffers,
  saveOffer,
  unblockUser,
  unsaveOffer,
  updateOwnProfile,
} from './me.service.js';

export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/profile', async (req, res) => {
  const profile = await getOwnProfile(req.session.userId!);
  res.json({ data: profile });
});

meRouter.post('/profile', async (req, res) => {
  const input = createProfileSchema.parse(req.body);
  const profile = await createOwnProfile(req.session.userId!, input);
  res.status(201).json({ data: profile });
});

meRouter.put('/profile', async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const profile = await updateOwnProfile(req.session.userId!, input);
  res.json({ data: profile });
});

meRouter.post('/password', passwordChangeLimiter, async (req, res) => {
  const input = changePasswordSchema.parse(req.body);
  const userId = req.session.userId!;

  await changePassword(userId, input);

  // Invalidate a possibly captured session id while keeping the user signed in.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.userId = userId;

  res.status(200).json({ data: { ok: true } });
});

const blockBodySchema = z.object({
  userId: z.string().uuid('Invalid user id'),
});

meRouter.get('/blocks', async (req, res) => {
  const data = await listBlocks(req.session.userId!);
  res.json({ data });
});

meRouter.post('/blocks', async (req, res) => {
  const input = blockBodySchema.parse(req.body);
  const data = await blockUser(req.session.userId!, input.userId);
  res.status(data.alreadyBlocked ? 200 : 201).json({ data });
});

meRouter.delete('/blocks/:userId', async (req, res) => {
  const userId = z.string().uuid('Invalid user id').parse(req.params.userId);
  const data = await unblockUser(req.session.userId!, userId);
  res.json({ data });
});

meRouter.get('/saved-offers', async (req, res) => {
  const result = await listSavedOffers(req.session.userId!);
  res.json(result);
});

meRouter.post('/saved-offers', async (req, res) => {
  const input = saveOfferSchema.parse(req.body);
  const data = await saveOffer(req.session.userId!, input.offerId);
  res.status(data.alreadySaved ? 200 : 201).json({ data });
});

meRouter.delete('/saved-offers/:offerId', async (req, res) => {
  const offerId = z.string().uuid('Invalid offer id').parse(req.params.offerId);
  await unsaveOffer(req.session.userId!, offerId);
  res.status(204).send();
});
