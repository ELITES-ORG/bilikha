import { describe, expect, it } from 'vitest';
import {
  makeCompletedAgreement,
  makeConversation,
  makeCreative,
  makeOffer,
  makeRating,
  makeUser,
} from '../../test/factories.js';
import { getPublishedOfferById } from './offers.service.js';

/**
 * Plan 0038. The offer page shows a creative's score under their municipality,
 * and shows nothing at all when there is no score.
 *
 * The second half is the one worth a test. Every creative on the platform has
 * `count: 0` today, so a UI check proves only that the feature is absent — the
 * card looks identical whether the code works or was never written. What has to
 * be pinned is that a real rating reaches the detail response, because nothing
 * on the platform will demonstrate it for months.
 */

async function publishedOfferBy(creativeProfileId: string) {
  return makeOffer(creativeProfileId, { title: 'Mural for a carinderia' });
}

describe('an offer detail carries its creative rating summary', () => {
  it('reports no score for a creative nobody has rated', async () => {
    const creative = await makeCreative();
    const offer = await publishedOfferBy(creative.profile.id);

    const detail = await getPublishedOfferById(offer.id);

    // null rather than 0: there is nothing to average, which is not the same
    // as an average of zero (ADR 0033).
    expect(detail.creative.rating).toEqual({ average: null, count: 0 });
  });

  it('carries the average and its count once a completed agreement is rated', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeCompletedAgreement(conversation);
    await makeRating(agreement.id, client.id, { stars: 4 });

    const offer = await publishedOfferBy(creative.profile.id);
    const detail = await getPublishedOfferById(offer.id);

    expect(detail.creative.rating.count).toBe(1);
    expect(detail.creative.rating.average).toBe(4);
  });

  it('averages across several ratings rather than reporting the newest', async () => {
    const creative = await makeCreative();

    for (const stars of [5, 2]) {
      const client = await makeUser();
      const conversation = await makeConversation(client.id, creative.profile);
      const { agreement } = await makeCompletedAgreement(conversation);
      await makeRating(agreement.id, client.id, { stars });
    }

    const offer = await publishedOfferBy(creative.profile.id);
    const detail = await getPublishedOfferById(offer.id);

    expect(detail.creative.rating.count).toBe(2);
    expect(detail.creative.rating.average).toBe(3.5);
  });
});
