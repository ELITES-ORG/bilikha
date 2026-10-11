import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, redactSearch } from '../../app.js';
import { db } from '../../db/index.js';
import {
  creativeProfileSubdomains,
  creativeSubdomains,
  municipalities,
} from '../../db/schema/index.js';
import { listPublishedOffers } from '../offers/offers.service.js';
import { listPublished } from '../profiles/profiles.service.js';
import { makeCreative, makeOffer, municipalityIdAt, suspend } from '../../test/factories.js';
import { searchWords } from './search-sql.js';

/**
 * Directory search (ADR 0003, issue #22). Fixtures use made-up words so nothing
 * here depends on what the seed calls a town or a craft (plan 0019 rule 2):
 * a town's or sub-domain's name is read from the database, never written down.
 */

const page = { page: 1, limit: 50 };

async function creativeSlugs(q: string, extra: Partial<Parameters<typeof listPublished>[0]> = {}) {
  const result = await listPublished({ ...page, q, ...extra });
  return result.data.map((row) => row.slug);
}

async function offerTitles(q: string, extra: Partial<Parameters<typeof listPublishedOffers>[0]> = {}) {
  const result = await listPublishedOffers({ ...page, q, ...extra });
  return result.data.map((row) => row.title);
}

async function municipalityAt(index: number) {
  const id = await municipalityIdAt(index);
  const [row] = await db
    .select({ id: municipalities.id, slug: municipalities.slug, name: municipalities.name })
    .from(municipalities)
    .where(eq(municipalities.id, id));
  return row!;
}

/** The Nth seeded sub-domain by slug, past the first, which the factories use. */
async function subdomainAt(index: number) {
  const rows = await db
    .select({
      id: creativeSubdomains.id,
      slug: creativeSubdomains.slug,
      name: creativeSubdomains.name,
      singularName: creativeSubdomains.singularName,
    })
    .from(creativeSubdomains)
    .orderBy(asc(creativeSubdomains.slug))
    .limit(index + 1);
  const row = rows[index];
  if (!row) throw new Error(`The seed has fewer than ${index + 1} sub-domains.`);
  return row;
}

/** The longest word of a name: the one least likely to appear anywhere else. */
function longestWord(name: string): string {
  return name.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a));
}

describe('the search query words', () => {
  it('splits on anything that is not a letter or digit', () => {
    expect(searchWords('Wedding photo')).toEqual(['wedding', 'photo']);
    expect(searchWords('  e-commerce  ')).toEqual(['e', 'commerce']);
  });

  it('keeps letters from any script and drops tsquery syntax', () => {
    expect(searchWords('Niño')).toEqual(['niño']);
    expect(searchWords("a&b|c!(d):*'e'<->")).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('gives nothing when no letter or digit is left, and stops at eight words', () => {
    expect(searchWords('&|!():*')).toEqual([]);
    expect(searchWords("'' \"\"")).toEqual([]);
    expect(searchWords('a b c d e f g h i j')).toHaveLength(8);
  });
});

describe('the request log', () => {
  it('replaces what was searched for and keeps the rest', () => {
    expect(redactSearch('/api/v1/creatives?q=Juan%20Dela%20Cruz&page=2')).toBe(
      '/api/v1/creatives?q=redacted&page=2',
    );
    expect(redactSearch('/api/v1/offers?page=2')).toBe('/api/v1/offers?page=2');
    expect(redactSearch('/api/v1/health')).toBe('/api/v1/health');
  });
});

describe('searching creatives', () => {
  it('matches a display name, a full name with its middle name, and a bio', async () => {
    const byDisplay = await makeCreative({ profile: { displayName: 'Marisol Quintana' } });
    const byFullName = await makeCreative({
      user: { firstName: 'Evangeline', middleName: 'Tumulak', lastName: 'Abellanosa' },
      profile: { displayName: null },
    });
    const byBio = await makeCreative({ profile: { bio: 'I weave banig mats from tikog.' } });
    const unrelated = await makeCreative({ profile: { displayName: 'Ana Baker' } });

    expect(await creativeSlugs('quintana')).toEqual([byDisplay.profile.slug]);
    expect(await creativeSlugs('Evangeline Abellanosa')).toEqual([byFullName.profile.slug]);
    expect(await creativeSlugs('tumulak')).toEqual([byFullName.profile.slug]);
    expect(await creativeSlugs('tikog')).toEqual([byBio.profile.slug]);
    expect(await creativeSlugs('quintana')).not.toContain(unrelated.profile.slug);
  });

  it('matches by prefix, and needs every word', async () => {
    const both = await makeCreative({ profile: { displayName: 'Dalisay Kalikasan' } });
    await makeCreative({ profile: { displayName: 'Dalisay Ramos' } });

    expect(await creativeSlugs('dalisay kali')).toEqual([both.profile.slug]);
    expect(await creativeSlugs('dali')).toHaveLength(2);
  });

  it('matches any of their sub-domains', async () => {
    const sub = await subdomainAt(3);
    const creative = await makeCreative({ profile: { displayName: 'Zyrel Ocampo' } });
    await db.insert(creativeProfileSubdomains).values({
      profileId: creative.profile.id,
      subdomainId: sub.id,
      isPrimary: false,
    });

    expect(await creativeSlugs(longestWord(sub.name))).toContain(creative.profile.slug);
  });

  it('matches the singular label a card shows, as well as the official plural', async () => {
    const sub = await subdomainAt(3);
    const creative = await makeCreative({ profile: { displayName: 'Zyrel Ocampo' } });
    await db.insert(creativeProfileSubdomains).values({
      profileId: creative.profile.id,
      subdomainId: sub.id,
      isPrimary: false,
    });

    expect(await creativeSlugs(sub.singularName)).toContain(creative.profile.slug);
  });

  it('lets each word match a different field', async () => {
    const town = await municipalityAt(2);
    const there = await makeCreative({
      user: { municipalityId: town.id },
      profile: { displayName: 'Habilin Weaves' },
    });
    await makeCreative({ profile: { displayName: 'Habilin Elsewhere' } });

    expect(await creativeSlugs(`habilin ${town.name}`)).toEqual([there.profile.slug]);
  });

  it('matches their town', async () => {
    const town = await municipalityAt(2);
    const there = await makeCreative({ user: { municipalityId: town.id } });

    expect(await creativeSlugs(town.name.toLowerCase())).toContain(there.profile.slug);
  });

  it('tolerates a typo in a name', async () => {
    const photographer = await makeCreative({ profile: { displayName: 'Photographer Ramon' } });
    await makeCreative({ profile: { displayName: 'Ana Baker' } });

    expect(await creativeSlugs('fotographer')).toEqual([photographer.profile.slug]);
  });

  it('ranks a word match above a typo-only match', async () => {
    const exact = await makeCreative({ profile: { displayName: 'Photographer Ramon' } });
    // Newer, so newest-first alone would put it on top.
    const typo = await makeCreative({ profile: { displayName: 'Fotographer Ben' } });

    expect(await creativeSlugs('photographer')).toEqual([exact.profile.slug, typo.profile.slug]);
  });

  it('keeps nearby-first above relevance', async () => {
    const near = await municipalityIdAt(0);
    const far = await municipalityIdAt(1);
    const farExact = await makeCreative({
      user: { municipalityId: far },
      profile: { displayName: 'Photographer Ramon' },
    });
    const nearTypo = await makeCreative({
      user: { municipalityId: near },
      profile: { displayName: 'Fotographer Ben' },
    });

    expect(await creativeSlugs('photographer', { viewerMunicipalityId: near })).toEqual([
      nearTypo.profile.slug,
      farExact.profile.slug,
    ]);
  });

  it('leaves out unpublished and suspended creatives', async () => {
    const visible = await makeCreative({ profile: { displayName: 'Liwayway Santos' } });
    await makeCreative({ profile: { displayName: 'Liwayway Pending', status: 'pending_review' } });
    const suspended = await makeCreative({ profile: { displayName: 'Liwayway Hidden' } });
    await suspend(suspended.user.id);

    const result = await listPublished({ ...page, q: 'liwayway' });
    expect(result.data.map((row) => row.slug)).toEqual([visible.profile.slug]);
    expect(result.total).toBe(1);
  });

  it('combines with the town filter', async () => {
    const town = await municipalityAt(1);
    const here = await makeCreative({
      user: { municipalityId: town.id },
      profile: { displayName: 'Bayani Here' },
    });
    await makeCreative({
      user: { municipalityId: await municipalityIdAt(0) },
      profile: { displayName: 'Bayani Elsewhere' },
    });

    expect(await creativeSlugs('bayani', { municipality: town.slug })).toEqual([here.profile.slug]);
  });

  it('pages through the matches with the right total', async () => {
    for (const name of ['Kalipay One', 'Kalipay Two', 'Kalipay Three']) {
      await makeCreative({ profile: { displayName: name } });
    }
    await makeCreative({ profile: { displayName: 'Ana Baker' } });

    const seen = new Set<string>();
    for (const n of [1, 2, 3]) {
      const result = await listPublished({ page: n, limit: 1, q: 'kalipay' });
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(1);
      seen.add(result.data[0]!.slug);
    }
    expect(seen.size).toBe(3);
  });
});

describe('searching offers', () => {
  it('matches a title word and a description word', async () => {
    const { profile } = await makeCreative();
    await makeOffer(profile.id, { title: 'Wedding photographer' });
    await makeOffer(profile.id, { title: 'Logo design', description: 'Includes a brand guide.' });
    await makeOffer(profile.id, { title: 'Drone footage' });

    expect(await offerTitles('wedding')).toEqual(['Wedding photographer']);
    expect(await offerTitles('brand')).toEqual(['Logo design']);
    expect(await offerTitles('wedding photo')).toEqual(['Wedding photographer']);
    expect(await offerTitles('wedding drone')).toEqual([]);
  });

  it("matches the offer's sub-domain, the creative's name and their town", async () => {
    const sub = await subdomainAt(3);
    const town = await municipalityAt(2);
    const { profile } = await makeCreative({
      user: { municipalityId: town.id },
      profile: { displayName: 'Tindog Studio' },
    });
    await makeOffer(profile.id, { title: 'Zxq package', subdomainId: sub.id });

    expect(await offerTitles(longestWord(sub.name))).toContain('Zxq package');
    expect(await offerTitles(sub.singularName)).toContain('Zxq package');
    expect(await offerTitles('tindog')).toEqual(['Zxq package']);
    expect(await offerTitles(town.name)).toContain('Zxq package');
  });

  it('tolerates a typo in the title', async () => {
    const { profile } = await makeCreative();
    await makeOffer(profile.id, { title: 'Wedding photographer' });
    await makeOffer(profile.id, { title: 'Logo design' });

    expect(await offerTitles('fotographer')).toEqual(['Wedding photographer']);
  });

  it("leaves out a suspended creative's offers and an unpublished profile's", async () => {
    const visible = await makeCreative();
    await makeOffer(visible.profile.id, { title: 'Harana serenade' });
    const pending = await makeCreative({ profile: { status: 'pending_review' } });
    await makeOffer(pending.profile.id, { title: 'Harana pending' });
    const suspended = await makeCreative();
    await makeOffer(suspended.profile.id, { title: 'Harana hidden' });
    await suspend(suspended.user.id);

    const result = await listPublishedOffers({ ...page, q: 'harana' });
    expect(result.data.map((row) => row.title)).toEqual(['Harana serenade']);
    expect(result.total).toBe(1);
  });

  it('combines with the sub-domain filter', async () => {
    const sub = await subdomainAt(3);
    const { profile } = await makeCreative();
    await makeOffer(profile.id, { title: 'Sayaw in the filter', subdomainId: sub.id });
    await makeOffer(profile.id, { title: 'Sayaw outside it' });

    expect(await offerTitles('sayaw', { subdomain: sub.slug })).toEqual(['Sayaw in the filter']);
  });

  it('pages through the matches with the right total', async () => {
    const { profile } = await makeCreative();
    for (const title of ['Pahiyas one', 'Pahiyas two', 'Pahiyas three']) {
      await makeOffer(profile.id, { title });
    }

    const seen = new Set<string>();
    for (const n of [1, 2, 3]) {
      const result = await listPublishedOffers({ page: n, limit: 1, q: 'pahiyas' });
      expect(result.total).toBe(3);
      seen.add(result.data[0]!.title);
    }
    expect(seen.size).toBe(3);
  });
});

interface ListBody<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

describe('search through the real app', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  it('answers q on both listings with data and meta', async () => {
    const { profile } = await makeCreative({ profile: { displayName: 'Marisol Quintana' } });
    await makeOffer(profile.id, { title: 'Wedding photographer' });

    const offersResponse = await fetch(`${base}/offers?q=${encodeURIComponent('wedding photo')}`);
    const offersBody = (await offersResponse.json()) as ListBody<{ title: string }>;
    expect(offersResponse.status).toBe(200);
    expect(offersBody.data.map((row) => row.title)).toEqual(['Wedding photographer']);
    expect(offersBody.meta).toMatchObject({ page: 1, total: 1 });

    const creativesResponse = await fetch(`${base}/creatives?q=quintana`);
    const creativesBody = (await creativesResponse.json()) as ListBody<{ slug: string }>;
    expect(creativesResponse.status).toBe(200);
    expect(creativesBody.data.map((row) => row.slug)).toEqual([profile.slug]);
    expect(creativesBody.meta).toMatchObject({ page: 1, total: 1 });
  });

  it('survives input made only of query syntax', async () => {
    await makeCreative();

    for (const q of ['&|!():*', "''", '"\\', '<->']) {
      const offersResponse = await fetch(`${base}/offers?q=${encodeURIComponent(q)}`);
      const creativesResponse = await fetch(`${base}/creatives?q=${encodeURIComponent(q)}`);
      expect(offersResponse.status, q).toBe(200);
      expect(creativesResponse.status, q).toBe(200);
      await offersResponse.text();
      expect(((await creativesResponse.json()) as ListBody<unknown>).data, q).toEqual([]);
    }
  });

  it('refuses one character and ignores a blank q', async () => {
    await makeCreative();

    const tooShort = await fetch(`${base}/creatives?q=a`);
    expect(tooShort.status).toBe(400);
    await tooShort.text();

    const blank = await fetch(`${base}/creatives?q=${encodeURIComponent('   ')}`);
    expect(blank.status).toBe(200);
    expect(((await blank.json()) as ListBody<unknown>).meta.total).toBe(1);
  });
});
