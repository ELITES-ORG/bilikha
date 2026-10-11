import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { db } from '../index.js';
import { creativeSubdomains } from '../schema/index.js';
import { CREATIVE_DOMAINS } from './taxonomy-data.js';

const seedSubdomains = CREATIVE_DOMAINS.flatMap((domain) => domain.subdomains);

/**
 * Issue #17. The seed is insert-only (ADR 0049), so existing databases get
 * their singular labels from a hand-written backfill migration instead. The
 * two lists are written separately; this is what keeps them from drifting.
 */
describe('singular label backfill migration', () => {
  const backfill = readFileSync(
    new URL('../../../drizzle/0032_backfill_subdomain_singular_name.sql', import.meta.url),
    'utf8',
  );

  it('sets every seed sub-domain to the same singular the seed inserts', () => {
    for (const sub of seedSubdomains) {
      expect(backfill, sub.slug).toContain(
        `WHEN '${sub.slug}' THEN '${sub.singularName.replace(/'/g, "''")}'`,
      );
    }
  });

  it('lists exactly the 81 seed sub-domains', () => {
    expect(backfill.match(/WHEN '/g) ?? []).toHaveLength(81);
  });

  it('fills only rows that have no label yet', () => {
    expect(backfill).toContain('WHERE "singular_name" IS NULL');
  });

  it('falls back to the row\'s own name for a sub-domain an administrator added', () => {
    expect(backfill).toContain('ELSE "name"');
  });
});

describe('singular labels in the database', () => {
  it('gives every sub-domain a non-empty singular label', async () => {
    const rows = await db
      .select({ slug: creativeSubdomains.slug, singularName: creativeSubdomains.singularName })
      .from(creativeSubdomains);

    for (const row of rows) {
      expect(row.singularName.trim(), row.slug).not.toBe('');
    }
  });

  it('matches the seed for every seeded slug', async () => {
    const rows = await db
      .select({ slug: creativeSubdomains.slug, singularName: creativeSubdomains.singularName })
      .from(creativeSubdomains);
    const bySlug = new Map(rows.map((row) => [row.slug, row.singularName]));

    for (const sub of seedSubdomains) {
      expect(bySlug.get(sub.slug), sub.slug).toBe(sub.singularName);
    }
  });
});
