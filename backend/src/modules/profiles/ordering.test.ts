import { describe, expect, it } from 'vitest';
import { listPublished } from './profiles.service.js';
import { makeCreative, municipalityIdAt } from '../../test/factories.js';

/**
 * The nearby-first ordering builds its ORDER BY from a raw SQL fragment, and
 * once shipped `ORDER BY false` — Postgres 42601, because a bare constant is
 * read as a column ordinal. It broke the directory for 11 of 47 profiles and
 * no amount of mocking would have seen it: a mock does not parse SQL.
 *
 * These tests exist to make that a failing assertion instead of a live bug.
 */
describe('the creative directory ordering', () => {
  const page = { page: 1, limit: 50 };

  it('runs for an anonymous viewer, who has no municipality', async () => {
    await makeCreative();
    await expect(listPublished(page)).resolves.toBeTruthy();
  });

  it('runs when the viewer municipality is explicitly null', async () => {
    await makeCreative();
    await expect(listPublished({ ...page, viewerMunicipalityId: null })).resolves.toBeTruthy();
  });

  it('puts the viewer’s own municipality first', async () => {
    const near = await municipalityIdAt(0);
    const far = await municipalityIdAt(1);

    // Created far-first, so creation order alone would put the far one on top.
    const farCreative = await makeCreative({ user: { municipalityId: far } });
    const nearCreative = await makeCreative({ user: { municipalityId: near } });

    const result = await listPublished({ ...page, viewerMunicipalityId: near });
    const slugs = result.data.map((r) => r.slug);

    expect(slugs.indexOf(nearCreative.profile.slug)).toBeLessThan(
      slugs.indexOf(farCreative.profile.slug),
    );
  });

  it('still returns everyone, not only the nearby ones', async () => {
    const near = await municipalityIdAt(0);
    const far = await municipalityIdAt(1);
    await makeCreative({ user: { municipalityId: far } });
    await makeCreative({ user: { municipalityId: near } });

    const result = await listPublished({ ...page, viewerMunicipalityId: near });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('falls back to newest-first with no viewer municipality', async () => {
    const older = await makeCreative();
    const newer = await makeCreative();

    const result = await listPublished(page);
    const slugs = result.data.map((r) => r.slug);
    expect(slugs.indexOf(newer.profile.slug)).toBeLessThan(slugs.indexOf(older.profile.slug));
  });
});
