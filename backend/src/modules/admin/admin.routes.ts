import { Router } from 'express';
import { requireAdmin } from '../../middleware/require-admin.js';
import { listQuerySchema, moderateSchema, profileParamsSchema } from './admin.schema.js';
import { getProfile, listProfiles, moderate, statusCounts } from './admin.service.js';

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
