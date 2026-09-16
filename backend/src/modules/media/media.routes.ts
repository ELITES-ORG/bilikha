import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { uploadLimiter } from '../../middleware/rate-limit.js';
import {
  clearAvatar,
  issueUploadUrl,
  setAvatar,
  setAvatarBodySchema,
  uploadUrlBodySchema,
} from './media.service.js';

export const mediaRouter: Router = Router();

mediaRouter.use(requireAuth);

mediaRouter.post('/upload-url', uploadLimiter, async (req, res) => {
  const input = uploadUrlBodySchema.parse(req.body);
  const data = await issueUploadUrl(req.session.userId!, input);
  res.status(200).json({ data });
});

mediaRouter.put('/avatar', async (req, res) => {
  const input = setAvatarBodySchema.parse(req.body);
  const data = await setAvatar(req.session.userId!, input.objectKey);
  res.status(200).json({ data });
});

mediaRouter.delete('/avatar', async (req, res) => {
  const data = await clearAvatar(req.session.userId!);
  res.status(200).json({ data });
});
