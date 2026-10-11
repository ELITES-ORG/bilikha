import { desc, gte, lt, sql } from 'drizzle-orm';
import type { SearchListing, SearchMiss } from '../../contracts/taxonomy.js';
import { db } from '../../db/index.js';
import { searchMisses } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { searchWords } from './search-sql.js';

/**
 * Searches that found nothing (issue #24). The words people type that match no
 * offer or creative are the honest list of missing aliases — and, if one keeps
 * coming back, of a missing sub-domain.
 *
 * Counted, never logged: a row is a term, a listing, a day and a number. No
 * user, session or address is written, so nothing ties a search to a person,
 * and rows older than `RETENTION_DAYS` are removed as new ones arrive.
 */

export const RETENTION_DAYS = 90;
/** The unmatched-search list's default window and length. */
export const MISSES_DEFAULT_DAYS = 30;
export const MISSES_LIMIT = 50;

/** One spelling per search: the words as search reads them, joined by a space. */
function missTerm(q: string): string {
  return searchWords(q).join(' ');
}

/**
 * Counts a search that found nothing. Callers do not wait on it and it never
 * throws: counting a miss must never cost anyone their results.
 */
export async function recordMiss(q: string, listing: SearchListing): Promise<void> {
  const term = missTerm(q);
  if (!term) return;
  try {
    await db
      .insert(searchMisses)
      .values({ term, listing, day: sql`current_date` })
      .onConflictDoUpdate({
        target: [searchMisses.term, searchMisses.listing, searchMisses.day],
        set: { count: sql`${searchMisses.count} + 1` },
      });
    await db
      .delete(searchMisses)
      .where(lt(searchMisses.day, sql`current_date - ${RETENTION_DAYS}::int`));
  } catch (error) {
    logger.warn({ err: error }, 'Could not count an unmatched search');
  }
}

/** The most common unmatched searches over the last `days` days, most frequent first. */
export async function topMisses(days = MISSES_DEFAULT_DAYS): Promise<SearchMiss[]> {
  const total = sql<number>`sum(${searchMisses.count})::int`.mapWith(Number);
  return db
    .select({ term: searchMisses.term, listing: searchMisses.listing, count: total })
    .from(searchMisses)
    .where(gte(searchMisses.day, sql`current_date - ${days}::int`))
    .groupBy(searchMisses.term, searchMisses.listing)
    .orderBy(desc(total), searchMisses.term)
    .limit(MISSES_LIMIT) as Promise<SearchMiss[]>;
}
