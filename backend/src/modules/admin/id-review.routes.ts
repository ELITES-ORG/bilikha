import { Router } from 'express';
import type { ListMeta } from '../../contracts/pagination.js';
import { adminIdViewLimiter } from '../../middleware/rate-limit.js';
import {
  idAppealDecisionSchema,
  idDecisionSchema,
  idQueueQuerySchema,
  idVerificationParamsSchema,
} from '../verification/review.schema.js';
import {
  decideAppeal,
  decideIdVerification,
  getIdVerificationForReview,
  listIdVerifications,
} from '../verification/review.service.js';

/**
 * ID review (ADR 0057, plan 0053 Phase 3). Mounted inside `adminRouter`, which
 * calls `requireAdmin` for everything under it — admin-only by construction,
 * and a 404 for anyone else.
 */
export const idReviewRouter: Router = Router();

idReviewRouter.get('/id-verifications', async (req, res) => {
  const query = idQueueQuerySchema.parse(req.query);
  const { rows, total } = await listIdVerifications(query);
  const meta: ListMeta = { page: query.page, limit: query.limit, total };
  res.json({ data: rows, meta });
});

idReviewRouter.get('/id-verifications/:id', adminIdViewLimiter, async (req, res) => {
  const { id } = idVerificationParamsSchema.parse(req.params);
  const data = await getIdVerificationForReview({ id, adminId: req.session.userId! });
  // Signed links to an ID: never stored by a browser or a proxy.
  res.set('Cache-Control', 'no-store');
  res.json({ data });
});

idReviewRouter.post('/id-verifications/:id/decision', async (req, res) => {
  const { id } = idVerificationParamsSchema.parse(req.params);
  const input = idDecisionSchema.parse(req.body);
  const data = await decideIdVerification({ id, adminId: req.session.userId!, ...input });
  res.json({ data });
});

idReviewRouter.post('/id-verifications/:id/appeal', async (req, res) => {
  const { id } = idVerificationParamsSchema.parse(req.params);
  const input = idAppealDecisionSchema.parse(req.body);
  const data = await decideAppeal({ id, adminId: req.session.userId!, ...input });
  res.json({ data });
});
