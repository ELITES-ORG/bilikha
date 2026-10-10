import { eq } from 'drizzle-orm';
import { db, closeDatabase, type Database } from '../index.js';
import { creativeDomains, creativeSubdomains, municipalities } from '../schema/index.js';
import { logger } from '../../lib/logger.js';
import { seedBarangays } from './barangays.js';
import { CREATIVE_DOMAINS, MUNICIPALITIES } from './taxonomy-data.js';

/**
 * Idempotent reference-data seed. Safe to re-run after every deploy, which is
 * what Render's build command does.
 *
 * **It fills gaps and never overwrites.** The creative taxonomy is edited by
 * administrators in the admin area, and the database — not
 * `taxonomy-data.ts` — is its source of truth (ADR 0049). An upsert here
 * would revert every one of those edits on the next backend deploy, silently.
 * So domains and sub-domains are inserted when their slug is absent and left
 * alone when it is present.
 *
 * Municipalities and barangays still upsert: nobody edits those in the admin
 * area, and the eight municipalities are fixed.
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

    const barangayCount = await seedBarangays(tx as unknown as Database);
    logger.info({ count: barangayCount }, 'Barangays seeded');

    let subdomainCount = 0;

    for (const [domainIndex, domain] of CREATIVE_DOMAINS.entries()) {
      await tx
        .insert(creativeDomains)
        .values({
          slug: domain.slug,
          name: domain.name,
          displayOrder: domainIndex + 1,
        })
        .onConflictDoNothing({ target: creativeDomains.slug });

      // `onConflictDoNothing` returns no row when the slug was already there,
      // which after ADR 0049 is the normal case on every deploy. The id is
      // read back rather than returned from the insert.
      const [existingDomain] = await tx
        .select({ id: creativeDomains.id })
        .from(creativeDomains)
        .where(eq(creativeDomains.slug, domain.slug))
        .limit(1);

      if (!existingDomain) {
        throw new Error(`Failed to insert domain ${domain.slug}`);
      }

      for (const [subIndex, subdomain] of domain.subdomains.entries()) {
        await tx
          .insert(creativeSubdomains)
          .values({
            domainId: existingDomain.id,
            slug: subdomain.slug,
            name: subdomain.name,
            singularName: subdomain.singularName,
            displayOrder: subIndex + 1,
          })
          .onConflictDoNothing({ target: creativeSubdomains.slug });
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
