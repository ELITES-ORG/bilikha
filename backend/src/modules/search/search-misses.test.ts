import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { searchMisses } from '../../db/schema/index.js';
import { listPublishedOffers } from '../offers/offers.service.js';
import { listPublished } from '../profiles/profiles.service.js';
import { makeCreative } from '../../test/factories.js';
import { RETENTION_DAYS, recordMiss, topMisses } from './search-misses.js';

/**
 * Unmatched searches (issue #24). Each case searches its own made-up word, so a
 * count written late by another case's listing call cannot land in it.
 */

async function countFor(term: string, listing = 'creatives'): Promise<number> {
  const rows = await db
    .select({ count: searchMisses.count })
    .from(searchMisses)
    .where(and(eq(searchMisses.term, term), eq(searchMisses.listing, listing)));
  return rows.reduce((sum, row) => sum + row.count, 0);
}

/** The listings count a miss without waiting on it; give the write a moment. */
async function settledCount(term: string, listing = 'creatives', expected = 1): Promise<number> {
  for (let i = 0; i < 20; i += 1) {
    const count = await countFor(term, listing);
    if (count >= expected) return count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return countFor(term, listing);
}

describe('counting searches that found nothing', () => {
  it('counts a word once per listing and day, and adds to it', async () => {
    await recordMiss('Zqvortle', 'creatives');
    await recordMiss('zqvortle', 'creatives');
    await recordMiss('zqvortle', 'offers');

    expect(await countFor('zqvortle', 'creatives')).toBe(2);
    expect(await countFor('zqvortle', 'offers')).toBe(1);
    const rows = await db.select().from(searchMisses).where(eq(searchMisses.term, 'zqvortle'));
    expect(rows).toHaveLength(2);
  });

  it('stores the words as search reads them, and nothing about who searched', async () => {
    await recordMiss('  Zqvortle!!  blim ', 'creatives');

    expect(await countFor('zqvortle blim')).toBe(1);
    const columns = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'search_misses'`,
    );
    expect((columns as unknown as { column_name: string }[]).map((c) => c.column_name).sort()).toEqual(
      ['count', 'day', 'listing', 'term'],
    );
  });

  it('ignores a search with no words in it', async () => {
    await recordMiss('&|!():*', 'creatives');

    expect(await db.select().from(searchMisses)).toEqual([]);
  });

  it(`drops counts older than ${RETENTION_DAYS} days as it writes`, async () => {
    await db.insert(searchMisses).values([
      { term: 'zqold', listing: 'creatives', day: sql`current_date - ${RETENTION_DAYS + 1}::int` },
      { term: 'zqkept', listing: 'creatives', day: sql`current_date - ${RETENTION_DAYS - 1}::int` },
    ]);

    await recordMiss('zqnew', 'creatives');

    expect(await countFor('zqold')).toBe(0);
    expect(await countFor('zqkept')).toBe(1);
  });

  it('is counted by the listings only when the first page found nothing', async () => {
    await makeCreative({ profile: { displayName: 'Zqmatched Ocampo' } });
    await listPublished({ page: 1, limit: 20, q: 'zqnothing' });
    await listPublishedOffers({ page: 1, limit: 20, q: 'zqnothingoffer' });
    await listPublished({ page: 1, limit: 20, q: 'zqmatched' });
    await listPublished({ page: 2, limit: 20, q: 'zqpagetwo' });
    await listPublished({ page: 1, limit: 20 });

    expect(await settledCount('zqnothing')).toBe(1);
    expect(await settledCount('zqnothingoffer', 'offers')).toBe(1);
    expect(await countFor('zqmatched')).toBe(0);
    expect(await countFor('zqpagetwo')).toBe(0);
  });

  it('lists the most frequent first, summed over the window', async () => {
    await db.insert(searchMisses).values([
      { term: 'zqtop', listing: 'creatives', day: sql`current_date`, count: 3 },
      { term: 'zqtop', listing: 'creatives', day: sql`current_date - 1`, count: 2 },
      { term: 'zqmid', listing: 'offers', day: sql`current_date`, count: 4 },
      { term: 'zqstale', listing: 'creatives', day: sql`current_date - 40`, count: 9 },
    ]);

    const top = await topMisses(30);
    expect(top.filter((row) => row.term.startsWith('zq'))).toEqual([
      { term: 'zqtop', listing: 'creatives', count: 5 },
      { term: 'zqmid', listing: 'offers', count: 4 },
    ]);
  });
});
