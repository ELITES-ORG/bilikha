import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeDomains, creativeSubdomains, municipalities } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';

export const taxonomyRouter: Router = Router();

/**
 * The full domain tree. Small, static, and requested on nearly every page, so
 * it is served in one round trip rather than as nested lookups. Worth putting
 * behind a cache header once traffic justifies it.
 */
taxonomyRouter.get('/domains', async (_req, res) => {
  const domains = await db.query.creativeDomains.findMany({
    orderBy: asc(creativeDomains.displayOrder),
    with: {
      subdomains: {
        orderBy: asc(creativeSubdomains.displayOrder),
      },
    },
  });

  res.json({ data: domains });
});

taxonomyRouter.get('/domains/:slug', async (req, res) => {
  const domain = await db.query.creativeDomains.findFirst({
    where: eq(creativeDomains.slug, req.params.slug),
    with: {
      subdomains: {
        orderBy: asc(creativeSubdomains.displayOrder),
      },
    },
  });

  if (!domain) {
    throw AppError.notFound(`No creative domain with slug "${req.params.slug}"`);
  }

  res.json({ data: domain });
});

taxonomyRouter.get('/municipalities', async (_req, res) => {
  const rows = await db.select().from(municipalities).orderBy(asc(municipalities.name));
  res.json({ data: rows });
});
