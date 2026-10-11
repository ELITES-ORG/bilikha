import { describe, expect, it } from 'vitest';
import { makeCreative, makeOffer, makePosting, makeUser } from '../../test/factories.js';
import { getProfile } from '../admin/admin.service.js';
import { listTaxonomyForAdmin } from '../admin/taxonomy.service.js';
import {
  getPublishedOfferById,
  listMine as listMyOffers,
  listPublishedOffers,
} from '../offers/offers.service.js';
import { getPostingById, listFeedPostings } from '../postings/postings.service.js';
import { getPublishedBySlug, listPublished } from '../profiles/profiles.service.js';
import { listDomains } from './taxonomy.service.js';

/**
 * Issue #17. `singularName` is optional in the contracts only for deployment
 * skew, so nothing at compile time proves a response carries it. These do, for
 * every read path that labels one offer, posting or creative.
 *
 * The factories file everything under the alphabetically first seeded
 * sub-domain, `accessory-makers`.
 */
const SLUG = 'accessory-makers';
const SINGULAR = 'Accessory Maker';

describe('singular sub-domain labels in API responses', () => {
  it('the public taxonomy tree', async () => {
    const domains = await listDomains();
    const sub = domains.flatMap((d) => d.subdomains).find((s) => s.slug === SLUG);
    expect(sub?.singularName).toBe(SINGULAR);
  });

  it('the admin taxonomy tree', async () => {
    const domains = await listTaxonomyForAdmin();
    const sub = domains.flatMap((d) => d.subdomains).find((s) => s.slug === SLUG);
    expect(sub?.singularName).toBe(SINGULAR);
  });

  it('published offers, listed and one by one', async () => {
    const { profile } = await makeCreative();
    const offer = await makeOffer(profile.id);

    const list = await listPublishedOffers({ page: 1, limit: 20 });
    expect(list.data.find((o) => o.id === offer.id)?.subdomain.singularName).toBe(SINGULAR);

    const detail = await getPublishedOfferById(offer.id);
    expect(detail.subdomain.singularName).toBe(SINGULAR);
  });

  it('the owner\'s own offers', async () => {
    const { user, profile } = await makeCreative();
    await makeOffer(profile.id);

    const mine = await listMyOffers(user.id);
    expect(mine[0]?.subdomainSingularName).toBe(SINGULAR);
  });

  it('a public creative profile, its crafts and its offers', async () => {
    const { profile } = await makeCreative();
    await makeOffer(profile.id);

    const detail = await getPublishedBySlug(profile.slug);
    expect(detail.subdomains.length).toBeGreaterThan(0);
    for (const sub of detail.subdomains) expect(sub.singularName).toBe(SINGULAR);
    expect(detail.offers.length).toBeGreaterThan(0);
    for (const offer of detail.offers) expect(offer.subdomain.singularName).toBe(SINGULAR);
  });

  it('the directory of creatives', async () => {
    const { profile } = await makeCreative();

    const list = await listPublished({ page: 1, limit: 20 });
    const row = list.data.find((p) => p.slug === profile.slug);
    expect(row?.subdomains[0]?.singularName).toBe(SINGULAR);
  });

  it('a posting, one by one and in the feed', async () => {
    const client = await makeUser();
    const posting = await makePosting(client.id);
    const { user: creative } = await makeCreative();

    const detail = await getPostingById(client.id, posting.id);
    expect(detail.subdomain.singularName).toBe(SINGULAR);

    const feed = await listFeedPostings(creative.id, { page: 1, limit: 20 });
    expect(feed.data.find((p) => p.id === posting.id)?.subdomain.singularName).toBe(SINGULAR);
  });

  it('the admin view of a profile', async () => {
    const { profile } = await makeCreative();

    const detail = await getProfile(profile.id);
    expect(detail.subdomains[0]?.singularName).toBe(SINGULAR);
  });
});
