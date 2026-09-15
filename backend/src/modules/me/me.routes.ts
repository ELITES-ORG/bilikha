import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { getOwnProfile } from './me.service.js';

export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/profile', async (req, res) => {
  const profile = await getOwnProfile(req.session.userId!);
  res.json({ data: profile });
});
