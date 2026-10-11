import { Router } from 'express';
import { z } from 'zod';
import type { ListMeta } from '../../contracts/pagination.js';
import {
  adminOrganizationQueueSchema,
  moderateOrganizationSchema,
} from '../organizations/organizations.schema.js';
import {
  listOrganizationsForReview,
  moderateOrganization,
  organizationReviewCounts,
} from './organization-review.service.js';

/**
 * Organisation review (plan 0051 phase 2). Mounted inside `adminRouter`, which
 * calls `requireAdmin` for everything under it — admin-only by construction.
 */
export const organizationReviewRouter: Router = Router();

organizationReviewRouter.get('/organizations', async (req, res) => {
  const query = adminOrganizationQueueSchema.parse(req.query);
  const { rows, total } = await listOrganizationsForReview(query);
  const meta: ListMeta = { page: query.page, limit: query.limit, total };
  res.json({ data: rows, meta });
});

organizationReviewRouter.get('/organizations/counts', async (_req, res) => {
  res.json({ data: await organizationReviewCounts() });
});

organizationReviewRouter.post('/organizations/:id/moderate', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid('Invalid organisation id') }).parse(req.params);
  const input = moderateOrganizationSchema.parse(req.body);
  const data = await moderateOrganization({
    organizationId: id,
    adminId: req.session.userId!,
    action: input.action,
    reason: input.reason,
  });
  res.json({ data });
});
