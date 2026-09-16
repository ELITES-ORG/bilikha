import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { uploadLimiter } from '../../middleware/rate-limit.js';
import { issueUploadUrl, uploadUrlBodySchema } from './media.service.js';

export const mediaRouter: Router = Router();

mediaRouter.use(requireAuth);

mediaRouter.post('/upload-url', uploadLimiter, async (req, res) => {
  const input = uploadUrlBodySchema.parse(req.body);
  const data = await issueUploadUrl(req.session.userId!, input);
  res.status(200).json({ data });
});
