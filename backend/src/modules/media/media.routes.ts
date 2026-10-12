import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth.js';
import { uploadLimiter } from '../../middleware/rate-limit.js';
import { mediaLimitsView } from './media.limits.js';
import {
  abandonObject,
  abandonUploadTicket,
  clearAvatar,
  issueUploadTicket,
  issueUploadUrl,
  mediaUsage,
  setAvatar,
  setAvatarBodySchema,
  uploadTicketBodySchema,
  uploadUrlBodySchema,
} from './media.service.js';

export const mediaRouter: Router = Router();

// Public: the editor reads the limits before anyone picks a file (ADR 0046).
mediaRouter.get('/limits', (_req, res) => {
  res.json({ data: mediaLimitsView() });
});

mediaRouter.use(requireAuth);

mediaRouter.post('/upload-url', uploadLimiter, async (req, res) => {
  const input = uploadUrlBodySchema.parse(req.body);
  const data = await issueUploadUrl(req.session.userId!, input);
  res.status(200).json({ data });
});

mediaRouter.get('/usage', async (req, res) => {
  const data = await mediaUsage(req.session.userId!);
  res.status(200).json({ data });
});

mediaRouter.post('/uploads', uploadLimiter, async (req, res) => {
  const input = uploadTicketBodySchema.parse(req.body);
  const data = await issueUploadTicket(req.session.userId!, input);
  res.status(201).json({ data });
});

mediaRouter.delete('/uploads/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const data = await abandonUploadTicket(req.session.userId!, id);
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
