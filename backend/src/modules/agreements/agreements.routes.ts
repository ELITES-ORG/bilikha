import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { agreementAcceptLimiter, ratingCreateLimiter } from '../../middleware/rate-limit.js';
import { leaveRatingSchema } from '../ratings/ratings.schema.js';
import { rateAgreement, ratingForAgreement } from '../ratings/ratings.service.js';
import {
  acceptAgreementSchema,
  agreementEventSchema,
  agreementIdSchema,
  listAgreementsSchema,
  requestRevisionSchema,
} from './agreements.schema.js';
import {
  acceptAgreement,
  getAgreement,
  listAgreements,
  recordEvent,
  requestRevision,
} from './agreements.service.js';

/**
 * Everything except issuing. An agreement is issued into a conversation, so
 * that route hangs off `conversationsRouter` at POST /conversations/:id/agreements.
 */
export const agreementsRouter: Router = Router();

agreementsRouter.use(requireAuth);

agreementsRouter.get('/', async (req, res) => {
  const options = listAgreementsSchema.parse(req.query);
  const result = await listAgreements(req.session.userId!, options);
  res.json(result);
});

agreementsRouter.get('/:id', async (req, res) => {
  const id = agreementIdSchema.parse(req.params.id);
  const data = await getAgreement(req.session.userId!, id);
  res.json({ data });
});

agreementsRouter.post('/:id/revision', async (req, res) => {
  const id = agreementIdSchema.parse(req.params.id);
  const input = requestRevisionSchema.parse(req.body);
  const data = await requestRevision(req.session.userId!, id, input.note);
  res.status(201).json({ data });
});

// Limited: this endpoint takes a password, and without a limiter it is an
// oracle that bypasses loginLimiter entirely.
agreementsRouter.post('/:id/accept', agreementAcceptLimiter, async (req, res) => {
  const id = agreementIdSchema.parse(req.params.id);
  const input = acceptAgreementSchema.parse(req.body);
  const data = await acceptAgreement({
    userId: req.session.userId!,
    agreementId: id,
    password: input.password,
    seenHash: input.seenHash,
  });
  res.status(201).json({ data });
});

agreementsRouter.post('/:id/events', async (req, res) => {
  const id = agreementIdSchema.parse(req.params.id);
  const input = agreementEventSchema.parse(req.body);
  const data = await recordEvent({
    userId: req.session.userId!,
    agreementId: id,
    type: input.type,
    note: input.note ?? null,
  });
  res.status(201).json({ data });
});

/**
 * A rating is earned by this agreement being completed (ADR 0033), so it is
 * left here rather than against the creative. Limited per user: abuse is
 * bounded by the completed agreement, but the request publishes text about a
 * named person.
 */
agreementsRouter.post('/:id/rating', ratingCreateLimiter, async (req, res) => {
  const id = agreementIdSchema.parse(req.params.id);
  const input = leaveRatingSchema.parse(req.body);
  const data = await rateAgreement({
    userId: req.session.userId!,
    agreementId: id,
    stars: input.stars,
    comment: input.comment ?? null,
  });
  res.status(201).json({ data });
});

// What the record page needs to decide between "Rate this creative" and the
// rating already left. Null when there is none.
agreementsRouter.get('/:id/rating', async (req, res) => {
  const id = agreementIdSchema.parse(req.params.id);
  const data = await ratingForAgreement({ userId: req.session.userId!, agreementId: id });
  res.json({ data });
});
