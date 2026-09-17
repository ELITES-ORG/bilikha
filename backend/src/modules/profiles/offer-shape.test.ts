import { describe, expect, it } from 'vitest';
import { getPublishedBySlug } from './profiles.service.js';
import { listPublishedOffers } from '../offers/offers.service.js';
import { makeCreative, makeOffer } from '../../test/factories.js';

/**
 * The profile page renders `offer.subdomain.name`. This endpoint used to return
 * a flat `subdomainName` while `GET /offers` returned the nested object, so one
 * offer had two shapes depending on which route produced it. The client, typed
 * against the nested one, read `.name` on undefined inside `offers.map` and
 * took the whole public profile down for every creative who had an offer — a
 * creative with none rendered fine, which is why it survived review.
 *
 * ADR 0031 names this class — hand-written client types drifting from the
 * response — as unsolved, and says the real answer is sharing types across the
 * boundary. Until that exists, the shape gets asserted here.
 */
describe('an offer has one shape, whichever endpoint returns it', () => {
  it('nests the sub-domain on the profile, as the offer index does', async () => {
    const { profile } = await makeCreative();
    await makeOffer(profile.id, { title: 'Half-day shoot' });

    const detail = await getPublishedBySlug(profile.slug);
    const offer = detail.offers?.[0];

    expect(offer).toBeDefined();
    expect(offer!.subdomain).toBeDefined();
    expect(typeof offer!.subdomain.slug).toBe('string');
    expect(offer!.subdomain.name.length).toBeGreaterThan(0);
    expect(offer!.subdomain.domain.length).toBeGreaterThan(0);
  });

  it('agrees with the offer index field for field', async () => {
    const { profile } = await makeCreative();
    await makeOffer(profile.id, { title: 'Half-day shoot' });

    const detail = await getPublishedBySlug(profile.slug);
    const index = await listPublishedOffers({ page: 1, limit: 10 });

    const fromProfile = detail.offers?.[0]?.subdomain;
    const fromIndex = index.data[0]?.subdomain;

    expect(fromProfile).toEqual(fromIndex);
  });
});
