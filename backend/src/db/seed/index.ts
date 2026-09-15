import { db, closeDatabase } from '../index.js';
import { creativeDomains, creativeSubdomains, municipalities } from '../schema/index.js';
import { logger } from '../../lib/logger.js';
import { CREATIVE_DOMAINS, MUNICIPALITIES } from './taxonomy-data.js';

/**
 * Idempotent reference-data seed. Safe to re-run after every deploy: rows are
 * matched on slug and their labels refreshed, so correcting a typo in the
 * taxonomy never orphans the profiles that point at it.
 */
async function seed(): Promise<void> {
  logger.info('Seeding reference data');

  await db.transaction(async (tx) => {
    for (const municipality of MUNICIPALITIES) {
      await tx
        .insert(municipalities)
        .values({ slug: municipality.slug, name: municipality.name })
        .onConflictDoUpdate({
          target: municipalities.slug,
          set: { name: municipality.name },
        });
    }
    logger.info({ count: MUNICIPALITIES.length }, 'Municipalities seeded');

    let subdomainCount = 0;

    for (const [domainIndex, domain] of CREATIVE_DOMAINS.entries()) {
      const [insertedDomain] = await tx
        .insert(creativeDomains)
        .values({
          slug: domain.slug,
          name: domain.name,
          displayOrder: domainIndex + 1,
        })
        .onConflictDoUpdate({
          target: creativeDomains.slug,
          set: { name: domain.name, displayOrder: domainIndex + 1, updatedAt: new Date() },
        })
        .returning({ id: creativeDomains.id });

      if (!insertedDomain) {
        throw new Error(`Failed to upsert domain ${domain.slug}`);
      }

      for (const [subIndex, subdomain] of domain.subdomains.entries()) {
        await tx
          .insert(creativeSubdomains)
          .values({
            domainId: insertedDomain.id,
            slug: subdomain.slug,
            name: subdomain.name,
            displayOrder: subIndex + 1,
          })
          .onConflictDoUpdate({
            target: creativeSubdomains.slug,
            set: {
              domainId: insertedDomain.id,
              name: subdomain.name,
              displayOrder: subIndex + 1,
              updatedAt: new Date(),
            },
          });
        subdomainCount += 1;
      }
    }

    logger.info(
      { domains: CREATIVE_DOMAINS.length, subdomains: subdomainCount },
      'Creative taxonomy seeded',
    );
  });
}

seed()
  .then(async () => {
    logger.info('Seed complete');
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'Seed failed');
    await closeDatabase();
    process.exit(1);
  });
