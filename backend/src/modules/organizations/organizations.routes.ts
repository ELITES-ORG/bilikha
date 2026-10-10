import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth.js';
import { organizationInviteLimiter } from '../../middleware/rate-limit.js';
import {
  foundOrganizationSchema,
  handOverSchema,
  inviteSchema,
  listOrganizationsSchema,
  updateOrganizationSchema,
} from './organizations.schema.js';
import {
  acceptInvitation,
  declineInvitation,
  handOver,
  invite,
  leaveOrganization,
  listMyInvitations,
  removeMember,
} from './membership.service.js';
import {
  foundOrganization,
  getManagedOrganization,
  getPublicOrganization,
  listMyOrganizations,
  listPublishedOrganizations,
  updateOrganization,
} from './organizations.service.js';

/**
 * Organisations (plan 0051). Parse, call, respond — the rules live in the
 * service.
 *
 * Fixed paths (`/mine`, `/invitations`) are declared before `/:slug`, and the service refuses
 * to hand out those words as slugs, so a team called "Mine" cannot shadow a
 * route.
 */
export const organizationsRouter: Router = Router();

const slugParams = z.object({ slug: z.string().trim().min(1) });

/** Public: published organisations for the directory, filtered like creatives. */
organizationsRouter.get('/', async (req, res) => {
  const filters = listOrganizationsSchema.parse(req.query);
  res.json({ data: await listPublishedOrganizations(filters) });
});

organizationsRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ data: await listMyOrganizations(req.session.userId!) });
});

const invitationParams = z.object({ id: z.string().uuid('Invalid invitation id') });

/** Invitations waiting on the signed-in person. */
organizationsRouter.get('/invitations', requireAuth, async (req, res) => {
  res.json({ data: await listMyInvitations(req.session.userId!) });
});

organizationsRouter.post('/invitations/:id/accept', requireAuth, async (req, res) => {
  const { id } = invitationParams.parse(req.params);
  res.json({ data: await acceptInvitation({ userId: req.session.userId!, invitationId: id }) });
});

organizationsRouter.post('/invitations/:id/decline', requireAuth, async (req, res) => {
  const { id } = invitationParams.parse(req.params);
  await declineInvitation({ userId: req.session.userId!, invitationId: id });
  res.json({ data: { declined: true } });
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

organizationsRouter.post('/:slug/invitations', requireAuth, organizationInviteLimiter, async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  const data = inviteSchema.parse(req.body);
  const created = await invite({ inviterId: req.session.userId!, slug, data });
  res.status(created.refreshed ? 200 : 201).json({ data: created });
});

organizationsRouter.post('/:slug/leave', requireAuth, async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  res.json({ data: await leaveOrganization({ userId: req.session.userId!, slug }) });
});

organizationsRouter.delete('/:slug/members/:userId', requireAuth, async (req, res) => {
  const { slug, userId } = slugParams
    .extend({ userId: z.string().uuid('Invalid account id') })
    .parse(req.params);
  await removeMember({ actorId: req.session.userId!, slug, userId });
  res.json({ data: { removed: true } });
});

/** Hand the founder role to someone already in the team. */
organizationsRouter.post('/:slug/founder', requireAuth, async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  const { userId } = handOverSchema.parse(req.body);
  await handOver({ founderId: req.session.userId!, slug, toUserId: userId });
  res.json({ data: { handedOver: true } });
});

/** Public. Only a published organisation — anything else is a 404. */
organizationsRouter.get('/:slug', async (req, res) => {
  const { slug } = slugParams.parse(req.params);
  res.json({ data: await getPublicOrganization(slug) });
});
