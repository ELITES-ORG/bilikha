import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth.js';
import { foundOrganizationSchema, updateOrganizationSchema } from './organizations.schema.js';
import {
  foundOrganization,
  getManagedOrganization,
  getPublicOrganization,
  listMyOrganizations,
  updateOrganization,
} from './organizations.service.js';

/**
 * Organisations (plan 0051). Parse, call, respond — the rules live in the
 * service.
 *
 * Fixed paths (`/mine`) are declared before `/:slug`, and the service refuses
 * to hand out those words as slugs, so a team called "Mine" cannot shadow a
 * route.
 */
export const organizationsRouter: Router = Router();

const slugParams = z.object({ slug: z.string().trim().min(1) });

organizationsRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ data: await listMyOrganizations(req.session.userId!) });
});

organizationsRouter.post('/', requireAuth, async (req, res) => {
  const data = foundOrganizationSchema.parse(req.body);
  const created = await foundOrganization({ userId: req.session.userId!, data });
  res.status(201).json({ data: created });
});

/** The team's own view, any status. Non-members get the same 404 as a missing one. */
organizationsRouter.get('/:slug/manage', requireAuth, async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  res.json({ data: await getManagedOrganization({ userId: req.session.userId!, slug }) });
});

organizationsRouter.patch('/:slug', requireAuth, async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  const data = updateOrganizationSchema.parse(req.body);
  res.json({ data: await updateOrganization({ userId: req.session.userId!, slug, data }) });
});

/** Public. Only a published organisation — anything else is a 404. */
organizationsRouter.get('/:slug', async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  res.json({ data: await getPublicOrganization(slug) });
});
