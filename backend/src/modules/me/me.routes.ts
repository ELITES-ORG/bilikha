import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { updateProfileSchema } from './me.schema.js';
import { getOwnProfile, updateOwnProfile } from './me.service.js';

export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/profile', async (req, res) => {
  const profile = await getOwnProfile(req.session.userId!);
  res.json({ data: profile });
});

meRouter.put('/profile', async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const profile = await updateOwnProfile(req.session.userId!, input);
  res.json({ data: profile });
});
