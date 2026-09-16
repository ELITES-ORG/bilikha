import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/require-admin.js';
import { listQuerySchema, moderateSchema, profileParamsSchema } from './admin.schema.js';
import {
  getProfile,
  listProfiles,
  listUnreviewedMedia,
  moderate,
  reviewMedia,
  statusCounts,
} from './admin.service.js';

export const adminRouter: Router = Router();

// Guards the whole router. Every route below is admin-only by construction,
// rather than by remembering to add a guard per route.
adminRouter.use(requireAdmin);

adminRouter.get('/profiles', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { rows, total } = await listProfiles(query);

  res.json({
    data: rows,
    meta: { page: query.page, limit: query.limit, total, status: query.status },
  });
});

adminRouter.get('/profiles/counts', async (_req, res) => {
  res.json({ data: await statusCounts() });
});

adminRouter.get('/media', async (req, res) => {
  const page = z.coerce.number().int().positive().default(1).parse(req.query.page ?? 1);
  const limit = z.coerce.number().int().positive().max(50).default(20).parse(req.query.limit ?? 20);
  const { data, total } = await listUnreviewedMedia({ page, limit });
  res.json({ data, meta: { page, limit, total } });
});

adminRouter.post('/media/:kind/:id/review', async (req, res) => {
  const kind = z.enum(['avatar', 'portfolio']).parse(req.params.kind);
  const id = z.string().uuid('Invalid id').parse(req.params.id);
  const body = z.object({ action: z.enum(['approve', 'remove']) }).parse(req.body);
  const data = await reviewMedia({
    kind,
    id,
    adminId: req.session.userId!,
    action: body.action,
  });
  res.json({ data });
});

adminRouter.get('/profiles/:id', async (req, res) => {
  const { id } = profileParamsSchema.parse(req.params);
  res.json({ data: await getProfile(id) });
});

adminRouter.post('/profiles/:id/moderate', async (req, res) => {
  const { id } = profileParamsSchema.parse(req.params);
  const input = moderateSchema.parse(req.body);

  const updated = await moderate({
    profileId: id,
    adminId: req.session.userId!,
    action: input.action,
    reason: input.reason,
  });

  res.json({ data: updated });
});
