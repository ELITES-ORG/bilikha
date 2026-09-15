import { Router } from 'express';
import { z } from 'zod';
import { getPublishedBySlug, listPublished } from './profiles.service.js';

export const profilesRouter: Router = Router();

const listQuerySchema = z.object({
  domain: z.string().trim().min(1).optional(),
  subdomain: z.string().trim().min(1).optional(),
  municipality: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

profilesRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { data, total } = await listPublished(query);

  res.json({
    data,
    meta: { page: query.page, limit: query.limit, total },
  });
});

profilesRouter.get('/:slug', async (req, res) => {
  const profile = await getPublishedBySlug(req.params.slug!);
  res.json({ data: profile });
});
