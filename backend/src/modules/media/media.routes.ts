import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth.js';
import { uploadLimiter } from '../../middleware/rate-limit.js';
import {
  abandonObject,
  clearAvatar,
  createPortfolioBodySchema,
  createPortfolioItem,
  deletePortfolioItem,
  issueUploadUrl,
  listOwnPortfolio,
  patchPortfolioBodySchema,
  reorderPortfolio,
  reorderPortfolioBodySchema,
  setAvatar,
  setAvatarBodySchema,
  updatePortfolioCaption,
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

mediaRouter.post('/abandon', async (req, res) => {
  const input = z.object({ objectKey: z.string().min(1).max(512) }).parse(req.body);
  const data = await abandonObject(req.session.userId!, input.objectKey);
  res.status(200).json({ data });
});

mediaRouter.get('/portfolio', async (req, res) => {
  const data = await listOwnPortfolio(req.session.userId!);
  res.json({ data });
});

mediaRouter.post('/portfolio', async (req, res) => {
  const input = createPortfolioBodySchema.parse(req.body);
  const data = await createPortfolioItem(req.session.userId!, input);
  res.status(201).json({ data });
});

mediaRouter.patch('/portfolio/:id', async (req, res) => {
  const id = z.string().uuid('Invalid portfolio item id').parse(req.params.id);
  const input = patchPortfolioBodySchema.parse(req.body);
  const data = await updatePortfolioCaption(req.session.userId!, id, input.caption);
  res.json({ data });
});

mediaRouter.delete('/portfolio/:id', async (req, res) => {
  const id = z.string().uuid('Invalid portfolio item id').parse(req.params.id);
  const data = await deletePortfolioItem(req.session.userId!, id);
  res.json({ data });
});

mediaRouter.put('/portfolio/order', async (req, res) => {
  const input = reorderPortfolioBodySchema.parse(req.body);
  const data = await reorderPortfolio(req.session.userId!, input.ids);
  res.json({ data });
});
