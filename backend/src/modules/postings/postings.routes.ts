import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { requireAuth } from '../../middleware/require-auth.js';
import {
  listPostingsQuerySchema,
  patchPostingBodySchema,
  postingBodySchema,
  postingIdSchema,
} from './postings.schema.js';
import {
  closePosting,
  createPosting,
  deletePosting,
  getPostingById,
  listFeedPostings,
  listMine,
  updatePosting,
} from './postings.service.js';

export const postingsRouter: Router = Router();

async function viewerMunicipalityId(userId: string) {
  const [viewer] = await db
    .select({ municipalityId: users.municipalityId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return viewer?.municipalityId ?? null;
}

postingsRouter.get('/mine', requireAuth, async (req, res) => {
  res.json({ data: await listMine(req.session.userId!) });
});

postingsRouter.post('/', requireAuth, async (req, res) => {
  const input = postingBodySchema.parse(req.body);
  res.status(201).json({ data: await createPosting(req.session.userId!, input) });
});

postingsRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = postingIdSchema.parse(req.params.id);
  const input = patchPostingBodySchema.parse(req.body);
  res.json({ data: await updatePosting(req.session.userId!, id, input) });
});

postingsRouter.post('/:id/close', requireAuth, async (req, res) => {
  const id = postingIdSchema.parse(req.params.id);
  res.json({ data: await closePosting(req.session.userId!, id) });
});

postingsRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = postingIdSchema.parse(req.params.id);
  res.json({ data: await deletePosting(req.session.userId!, id) });
});

postingsRouter.get('/', requireAuth, async (req, res) => {
  const query = listPostingsQuerySchema.parse(req.query);
  const municipalityId = await viewerMunicipalityId(req.session.userId!);
  const result = await listFeedPostings(req.session.userId!, {
    ...query,
    viewerMunicipalityId: municipalityId,
  });
  res.json({
    data: result.data,
    meta: { page: query.page, limit: query.limit, total: result.total },
  });
});

postingsRouter.get('/:id', requireAuth, async (req, res) => {
  const id = postingIdSchema.parse(req.params.id);
  res.json({ data: await getPostingById(req.session.userId!, id) });
});
