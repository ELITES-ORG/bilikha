/**
 * Migrates portfolio_items into a single "Portfolio" offer per profile,
 * keeping objectKey / thumbKey byte-identical. Idempotent: skips profiles that
 * already have an offer titled Portfolio. Exits cleanly when portfolio_items
 * has already been dropped.
 *
 * NOT what protects production. `db:migrate` applies every pending migration in
 * one pass on deploy, so there is no moment between "offers exists" and
 * "portfolio_items is dropped" in which this could run — by the time anyone
 * invokes it, the table is already gone and it reports a no-op. The move lives
 * in migration 0013 so that it is atomic with the drop.
 *
 * Kept as a manual fallback for a database where 0013 ran before the offers
 * tables existed, and as a verifier: it reports key-pair identity and aborts if
 * any pair is missing.
 *
 * Usage: npm run migrate:offers
 */
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { closeDatabase, db, sql as pg } from '../db/index.js';
import {
  creativeProfileSubdomains,
  offerImages,
  offers,
} from '../db/schema/index.js';

// Legacy source table is intentionally local: it is absent from the current
// application schema after the migration that drops it.
const portfolioItems = pgTable('portfolio_items', {
  profileId: uuid('profile_id').notNull(),
  objectKey: text('object_key').notNull(),
  thumbKey: text('thumb_key').notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

async function portfolioItemsTableExists(): Promise<boolean> {
  try {
    const rows = await pg`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'portfolio_items'
      ) as exists
    `;
    return Boolean((rows[0] as { exists: boolean } | undefined)?.exists);
  } catch {
    return false;
  }
}

async function main() {
  if (!(await portfolioItemsTableExists())) {
    console.log('portfolio_items table not found — migration already complete / table gone');
    return;
  }

  const [beforeTally] = await db.select({ total: count() }).from(portfolioItems);
  const portfolioBefore = beforeTally?.total ?? 0;
  const beforeKeys = await db
    .select({
      objectKey: portfolioItems.objectKey,
      thumbKey: portfolioItems.thumbKey,
    })
    .from(portfolioItems)
    .orderBy(asc(portfolioItems.objectKey), asc(portfolioItems.thumbKey));

  const profilesWithPortfolio = await db
    .selectDistinct({ profileId: portfolioItems.profileId })
    .from(portfolioItems);

  let migrated = 0;
  let skipped = 0;
  let imagesMoved = 0;

  for (const { profileId } of profilesWithPortfolio) {
    const [existing] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.profileId, profileId), eq(offers.title, 'Portfolio')))
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    const [primary] = await db
      .select({ subdomainId: creativeProfileSubdomains.subdomainId })
      .from(creativeProfileSubdomains)
      .where(
        and(
          eq(creativeProfileSubdomains.profileId, profileId),
          eq(creativeProfileSubdomains.isPrimary, true),
        ),
      )
      .limit(1);

    if (!primary) {
      console.warn(`skip ${profileId}: no primary sub-domain`);
      skipped += 1;
      continue;
    }

    const items = await db
      .select({
        objectKey: portfolioItems.objectKey,
        thumbKey: portfolioItems.thumbKey,
        sortOrder: portfolioItems.sortOrder,
      })
      .from(portfolioItems)
      .where(eq(portfolioItems.profileId, profileId))
      .orderBy(asc(portfolioItems.sortOrder), asc(portfolioItems.createdAt));

    await db.transaction(async (tx) => {
      const [offer] = await tx
        .insert(offers)
        .values({
          profileId,
          subdomainId: primary.subdomainId,
          title: 'Portfolio',
          description: null,
          priceMinCentavos: null,
          priceMaxCentavos: null,
          sortOrder: 0,
        })
        .returning({ id: offers.id });

      if (items.length > 0) {
        await tx.insert(offerImages).values(
          items.map((item) => ({
            offerId: offer!.id,
            objectKey: item.objectKey,
            thumbKey: item.thumbKey,
            sortOrder: item.sortOrder,
          })),
        );
      }
    });

    migrated += 1;
    imagesMoved += items.length;
    console.log(`migrated ${profileId}: ${items.length} image(s)`);
  }

  const [afterTally] = await db.select({ total: count() }).from(portfolioItems);
  const portfolioAfter = afterTally?.total ?? 0;
  const [offerImageTally] = await db.select({ total: count() }).from(offerImages);
  const offerImageAfter = offerImageTally?.total ?? 0;

  const afterKeys = await db
    .select({
      objectKey: offerImages.objectKey,
      thumbKey: offerImages.thumbKey,
    })
    .from(offerImages)
    .orderBy(asc(offerImages.objectKey), asc(offerImages.thumbKey));

  const beforeSet = new Set(beforeKeys.map((k) => `${k.objectKey}\0${k.thumbKey}`));
  const afterSet = new Set(afterKeys.map((k) => `${k.objectKey}\0${k.thumbKey}`));
  const missing = [...beforeSet].filter((k) => !afterSet.has(k));

  console.log(
    JSON.stringify(
      {
        profilesMigrated: migrated,
        profilesSkipped: skipped,
        imagesMoved,
        portfolioBefore,
        portfolioAfter,
        offerImageAfter,
        keysIdentical: missing.length === 0,
        missingKeyPairs: missing.length,
      },
      null,
      2,
    ),
  );

  if (portfolioBefore !== portfolioAfter) {
    throw new Error('portfolio_items count changed during migration — abort');
  }
  if (missing.length > 0) {
    throw new Error(`${missing.length} key pair(s) missing from offer_images`);
  }

  // Second run must be a no-op
  const again = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(offers)
    .where(eq(offers.title, 'Portfolio'));
  console.log(`portfolio offers now: ${again[0]?.n ?? 0}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
