import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { inquiryLimiter } from '../../middleware/rate-limit.js';
import {
  inquiryParamsSchema,
  listQuerySchema,
  respondSchema,
  sendInquirySchema,
} from './inquiries.schema.js';
import {
  listReceived,
  listSent,
  markRead,
  respond,
  send,
} from './inquiries.service.js';

export const inquiriesRouter: Router = Router();

inquiriesRouter.use(requireAuth);

inquiriesRouter.post('/', inquiryLimiter, async (req, res) => {
  const input = sendInquirySchema.parse(req.body);
  const data = await send({ ...input, senderUserId: req.session.userId! });
  res.status(201).json({ data });
});

inquiriesRouter.get('/received', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { data, total } = await listReceived(req.session.userId!, query);
  res.json({ data, meta: { page: query.page, limit: query.limit, total } });
});

inquiriesRouter.get('/sent', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { data, total } = await listSent(req.session.userId!, query);
  res.json({ data, meta: { page: query.page, limit: query.limit, total } });
});

inquiriesRouter.post('/:id/read', async (req, res) => {
  const { id } = inquiryParamsSchema.parse(req.params);
  const data = await markRead(id, req.session.userId!);
  res.json({ data });
});

inquiriesRouter.post('/:id/respond', async (req, res) => {
  const { id } = inquiryParamsSchema.parse(req.params);
  const input = respondSchema.parse(req.body);
  const data = await respond(id, req.session.userId!, input);
  res.json({ data });
});
