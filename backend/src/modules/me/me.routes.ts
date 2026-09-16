import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { passwordChangeLimiter } from '../../middleware/rate-limit.js';
import {
  changePasswordSchema,
  createProfileSchema,
  updateProfileSchema,
} from './me.schema.js';
import {
  changePassword,
  createOwnProfile,
  getOwnProfile,
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
