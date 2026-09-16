import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { getPublishedBySlug, listPublished } from './profiles.service.js';

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

  res.json({
    data,
    meta: { page: query.page, limit: query.limit, total },
  });
});

profilesRouter.get('/:slug', async (req, res) => {
  const profile = await getPublishedBySlug(req.params.slug!);
  res.json({ data: profile });
});
