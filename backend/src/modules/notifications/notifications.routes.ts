import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth.js';
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from './notifications.service.js';

export const notificationsRouter: Router = Router();

notificationsRouter.use(requireAuth);

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

notificationsRouter.get('/', async (req, res) => {
  const query = listSchema.parse(req.query);
  const { data, total } = await listNotifications(req.session.userId!, query);

  res.json({ data, meta: { page: query.page, limit: query.limit, total } });
});

/**
 * Polled by every signed-in page, so it does the least work of any route here:
 * one indexed count, no joins, no target resolution.
 */
notificationsRouter.get('/unread-count', async (req, res) => {
  res.json({ data: { count: await unreadCount(req.session.userId!) } });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid('Invalid id') }).parse(req.params);
  await markRead(req.session.userId!, id);
  res.json({ data: { ok: true } });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await markAllRead(req.session.userId!);
  res.json({ data: { ok: true } });
});
