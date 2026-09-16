import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { requireAuth } from '../../middleware/require-auth.js';
import {
  addOfferImageBodySchema,
  listOffersQuerySchema,
  offerBodySchema,
  offerIdSchema,
  offerImageIdSchema,
  patchOfferBodySchema,
  reorderOffersBodySchema,
} from './offers.schema.js';
import {
  addOfferImage,
  createOffer,
  deleteOffer,
  deleteOfferImage,
  getPublishedOfferById,
  listMine,
  listPublishedOffers,
  reorderOffers,
  updateOffer,
} from './offers.service.js';

export const offersRouter: Router = Router();
const ownOffersRouter: Router = Router();

async function viewerMunicipalityId(userId: string | undefined) {
  if (!userId) return null;
  const [viewer] = await db
    .select({ municipalityId: users.municipalityId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return viewer?.municipalityId ?? null;
}

ownOffersRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ data: await listMine(req.session.userId!) });
});

ownOffersRouter.post('/', requireAuth, async (req, res) => {
  const input = offerBodySchema.parse(req.body);
  res.status(201).json({ data: await createOffer(req.session.userId!, input) });
});

ownOffersRouter.put('/order', requireAuth, async (req, res) => {
  const input = reorderOffersBodySchema.parse(req.body);
  res.json({ data: await reorderOffers(req.session.userId!, input.ids) });
});

ownOffersRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = offerIdSchema.parse(req.params.id);
  const input = patchOfferBodySchema.parse(req.body);
  res.json({ data: await updateOffer(req.session.userId!, id, input) });
});

ownOffersRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = offerIdSchema.parse(req.params.id);
  res.json({ data: await deleteOffer(req.session.userId!, id) });
});

ownOffersRouter.post('/:id/images', requireAuth, async (req, res) => {
  const id = offerIdSchema.parse(req.params.id);
  const input = addOfferImageBodySchema.parse(req.body);
  res.status(201).json({ data: await addOfferImage(req.session.userId!, id, input) });
});

ownOffersRouter.delete('/images/:imageId', requireAuth, async (req, res) => {
  const imageId = offerImageIdSchema.parse(req.params.imageId);
  res.json({ data: await deleteOfferImage(req.session.userId!, imageId) });
});

offersRouter.use(ownOffersRouter);

offersRouter.get('/', async (req, res) => {
  const query = listOffersQuerySchema.parse(req.query);
  const municipalityId = await viewerMunicipalityId(req.session.userId);
  const result = await listPublishedOffers({ ...query, viewerMunicipalityId: municipalityId });
  res.json({
    data: result.data,
    meta: { page: query.page, limit: query.limit, total: result.total },
  });
});

offersRouter.get('/:id', async (req, res) => {
  const id = offerIdSchema.parse(req.params.id);
  const municipalityId = await viewerMunicipalityId(req.session.userId);
  res.json({ data: await getPublishedOfferById(id, municipalityId) });
});
