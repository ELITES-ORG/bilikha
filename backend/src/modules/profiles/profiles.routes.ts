import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { getPublishedBySlug, listPublished } from './profiles.service.js';
import { listRatingsSchema } from '../ratings/ratings.schema.js';
import { listForProfile, summaryForProfile } from '../ratings/ratings.service.js';
import type { ListMeta } from '../../contracts/pagination.js';

export const profilesRouter: Router = Router();

const listQuerySchema = z.object({
  domain: z.string().trim().min(1).optional(),
  subdomain: z.string().trim().min(1).optional(),
  municipality: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

profilesRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query);

  let viewerMunicipalityId: string | null = null;
  const userId = req.session.userId;
  if (userId) {
    const [viewer] = await db
      .select({ municipalityId: users.municipalityId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    viewerMunicipalityId = viewer?.municipalityId ?? null;
  }

  const { data, total } = await listPublished({
    ...query,
    viewerMunicipalityId,
  });

  const meta: ListMeta = { page: query.page, limit: query.limit, total };
  res.json({ data, meta });
});

profilesRouter.get('/:slug', async (req, res) => {
  const profile = await getPublishedBySlug(req.params.slug!);
  res.json({ data: profile });
});

/**
 * Public, like the profile they belong to. The count comes back with the list
 * so nothing can render a score without it (plan 0021 rule 4).
 */
profilesRouter.get('/:slug/ratings', async (req, res) => {
  const query = listRatingsSchema.parse(req.query);
  const { data, total } = await listForProfile(req.params.slug!, query);
  const meta: ListMeta = { page: query.page, limit: query.limit, total };
  res.json({ data, meta });
});

profilesRouter.get('/:slug/ratings/summary', async (req, res) => {
  res.json({ data: await summaryForProfile(req.params.slug!) });
});
