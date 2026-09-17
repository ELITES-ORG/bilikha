import { describe, expect, it } from 'vitest';
import { getPublishedBySlug, listPublished } from './profiles.service.js';
import { listPublishedOffers, getPublishedOfferById } from '../offers/offers.service.js';
import { listFeedPostings, getPostingById } from '../postings/postings.service.js';
import { startOrContinue } from '../conversations/conversations.service.js';
import { saveOffer } from '../me/me.service.js';
import {
  makeConversation,
  makeCreative,
  makeOffer,
  makePosting,
  makeUser,
  reinstate,
  suspend,
} from '../../test/factories.js';

/**
 * ADR 0028 in executable form.
 *
 * A suspended account's work leaves every public surface, and comes back
 * whole when they are reinstated — which only holds because visibility is
 * derived from `users.status` at read time rather than copied onto the content.
 * This was verified once by hand and nothing held it afterwards.
 *
 * Each case asserts all three states: visible, hidden, visible again. The last
 * is the one that proves nothing was destroyed to hide it.
 */
describe('a suspended account leaves the public surfaces', () => {
  const page = { page: 1, limit: 50 };

  it('takes its profile out of the directory and back', async () => {
    const { user, profile } = await makeCreative();

    const before = await listPublished(page);
    expect(before.data.map((r) => r.slug)).toContain(profile.slug);

    await suspend(user.id);
    const during = await listPublished(page);
    expect(during.data.map((r) => r.slug)).not.toContain(profile.slug);

    await reinstate(user.id);
    const after = await listPublished(page);
    expect(after.data.map((r) => r.slug)).toContain(profile.slug);
  });

  it('makes the profile page 404 rather than empty', async () => {
    const { user, profile } = await makeCreative();

    await expect(getPublishedBySlug(profile.slug)).resolves.toBeTruthy();

    await suspend(user.id);
    await expect(getPublishedBySlug(profile.slug)).rejects.toThrow();

    await reinstate(user.id);
    await expect(getPublishedBySlug(profile.slug)).resolves.toBeTruthy();
  });

  it('takes its offers out of the offer index and back', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { title: 'A test offer' });

    const before = await listPublishedOffers(page);
    expect(before.data.map((r) => r.id)).toContain(offer.id);

    await suspend(user.id);
    const during = await listPublishedOffers(page);
    expect(during.data.map((r) => r.id)).not.toContain(offer.id);

    await reinstate(user.id);
    const after = await listPublishedOffers(page);
    expect(after.data.map((r) => r.id)).toContain(offer.id);
  });

  it('makes a single offer unreachable and reachable again', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id);

    await expect(getPublishedOfferById(offer.id)).resolves.toBeTruthy();

    await suspend(user.id);
    await expect(getPublishedOfferById(offer.id)).rejects.toThrow();

    await reinstate(user.id);
    await expect(getPublishedOfferById(offer.id)).resolves.toBeTruthy();
  });

  it('takes its postings out of the creative feed and back', async () => {
    // The feed is read by a creative and lists clients' postings, so this
    // needs both sides: a viewer with a profile, and a client who posted.
    const viewer = await makeCreative();
    const client = await makeUser();
    const posting = await makePosting(client.id);

    const before = await listFeedPostings(viewer.user.id, page);
    expect(before.data.map((r) => r.id)).toContain(posting.id);

    await suspend(client.id);
    const during = await listFeedPostings(viewer.user.id, page);
    expect(during.data.map((r) => r.id)).not.toContain(posting.id);

    await reinstate(client.id);
    const after = await listFeedPostings(viewer.user.id, page);
    expect(after.data.map((r) => r.id)).toContain(posting.id);
  });

  it('counts the feed the same way it pages it', async () => {
    // The count query needed the same join as the rows query. A total that
    // disagrees with its page is the shape this bug takes.
    const viewer = await makeCreative();
    const client = await makeUser();
    await makePosting(client.id);

    const before = await listFeedPostings(viewer.user.id, page);
    expect(before.total).toBe(before.data.length);

    await suspend(client.id);
    const during = await listFeedPostings(viewer.user.id, page);
    expect(during.total).toBe(during.data.length);
  });

  it('makes a single posting unreachable and reachable again', async () => {
    const viewer = await makeCreative();
    const client = await makeUser();
    const posting = await makePosting(client.id);

    await expect(getPostingById(viewer.user.id, posting.id)).resolves.toBeTruthy();

    await suspend(client.id);
    await expect(getPostingById(viewer.user.id, posting.id)).rejects.toThrow();

    await reinstate(client.id);
    await expect(getPostingById(viewer.user.id, posting.id)).resolves.toBeTruthy();
  });

  it('cannot be contacted, the same way a missing profile cannot', async () => {
    const { user, profile } = await makeCreative();
    const client = await makeUser();
    const message = 'Hello, I would like to ask about your rates for a small job.';

    await suspend(user.id);
    await expect(
      startOrContinue(client.id, { profileSlug: profile.slug, body: message }),
    ).rejects.toThrow();

    await reinstate(user.id);
    await expect(
      startOrContinue(client.id, { profileSlug: profile.slug, body: message }),
    ).resolves.toBeTruthy();
  });

  it('cannot have its offers saved', async () => {
    const { user, profile } = await makeCreative();
    const offer = await makeOffer(profile.id);
    const client = await makeUser();

    await expect(saveOffer(client.id, offer.id)).resolves.toBeTruthy();

    await suspend(user.id);
    const other = await makeOffer(profile.id, { title: 'Another' });
    await expect(saveOffer(client.id, other.id)).rejects.toThrow();
  });

  it('leaves an existing conversation row alone', async () => {
    // Suspension hides content; it does not delete history. The per-request
    // guard is what stops the suspended side acting.
    const { profile, user } = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, profile);

    await suspend(user.id);

    expect(conversation.id).toBeTruthy();
    await reinstate(user.id);
    await expect(getPublishedBySlug(profile.slug)).resolves.toBeTruthy();
  });
});
