import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { messageLimiter } from '../../middleware/rate-limit.js';
import {
  conversationIdSchema,
  listMessagesSchema,
  listThreadsSchema,
  reportSchema,
  sendMessageSchema,
  startConversationSchema,
} from './conversations.schema.js';
import {
  getThread,
  listHistory,
  listThreads,
  markRead,
  reportConversation,
  sendMessage,
  startOrContinue,
  unreadCount,
} from './conversations.service.js';

export const conversationsRouter: Router = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.post('/', messageLimiter, async (req, res) => {
  const input = startConversationSchema.parse(req.body);
  const data = await startOrContinue(req.session.userId!, input);
  res.status(data.continued ? 200 : 201).json({ data });
});

conversationsRouter.get('/', async (req, res) => {
  const options = listThreadsSchema.parse(req.query);
  const result = await listThreads(req.session.userId!, options);
  res.json(result);
});

conversationsRouter.get('/unread-count', async (req, res) => {
  const data = await unreadCount(req.session.userId!);
  res.json({ data });
});

// Before /:id so "history" is not parsed as a conversation uuid.
conversationsRouter.get('/history', async (req, res) => {
  const result = await listHistory(req.session.userId!);
  res.json(result);
});

conversationsRouter.get('/:id', async (req, res) => {
  const id = conversationIdSchema.parse(req.params.id);
  const options = listMessagesSchema.parse(req.query);
  const data = await getThread(id, req.session.userId!, options);
  res.json({ data });
});

conversationsRouter.post('/:id/messages', messageLimiter, async (req, res) => {
  const id = conversationIdSchema.parse(req.params.id);
  const input = sendMessageSchema.parse(req.body);
  const data = await sendMessage(id, req.session.userId!, input);
  res.status(201).json({ data });
});

conversationsRouter.post('/:id/read', async (req, res) => {
  const id = conversationIdSchema.parse(req.params.id);
  const data = await markRead(id, req.session.userId!);
  res.json({ data });
});

conversationsRouter.post('/:id/report', async (req, res) => {
  const id = conversationIdSchema.parse(req.params.id);
  const input = reportSchema.parse(req.body);
  const data = await reportConversation(id, req.session.userId!, input);
  res.status(201).json({ data });
});
