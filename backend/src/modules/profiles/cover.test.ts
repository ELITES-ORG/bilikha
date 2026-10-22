import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { getOwnProfile } from '../me/me.service.js';
import { getPublishedBySlug, listPublished } from './profiles.service.js';
import { makeCreative } from '../../test/factories.js';

/**
 * A cover (issue #36, ADR 0061) is public only once approved: the profile page
 * reads the approved pair, the owner also sees the pair waiting for review,
 * and the directory card carries no cover at all.
 */
describe('who sees a cover', () => {
  const original = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };

  beforeEach(() => {
    env.SUPABASE_URL = 'http://storage.test';
    env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
  });

  afterEach(() => {
    env.SUPABASE_URL = original.url;
    env.SUPABASE_SERVICE_ROLE_KEY = original.key;
  });

  const keys = (profileId: string, name: string) => ({
    key: `covers/${profileId}/${name}.webp`,
    small: `covers/${profileId}/${name}-768.webp`,
  });

  it('shows the approved cover on the profile page, never the one waiting', async () => {
    const { profile } = await makeCreative();
    const approved = keys(profile.id, 'approved');
    const pending = keys(profile.id, 'pending');
    const { profile: covered } = await makeCreative({
      profile: {
        coverKey: approved.key,
        coverSmallKey: approved.small,
        coverPendingKey: pending.key,
        coverPendingSmallKey: pending.small,
      },
    });

    const detail = await getPublishedBySlug(covered.slug);

    expect(detail.cover).toEqual({
      url: expect.stringContaining(approved.key),
      smallUrl: expect.stringContaining(approved.small),
    });
    expect(JSON.stringify(detail)).not.toContain(pending.key);
  });

  it('shows no cover while the only one is waiting for review', async () => {
    const { profile } = await makeCreative();
    const pending = keys(profile.id, 'pending');
    const { profile: waiting } = await makeCreative({
      profile: { coverPendingKey: pending.key, coverPendingSmallKey: pending.small },
    });

    expect((await getPublishedBySlug(waiting.slug)).cover).toBeNull();
  });

  it('shows no cover for a profile without one', async () => {
    const { profile } = await makeCreative();
    expect((await getPublishedBySlug(profile.slug)).cover).toBeNull();
  });

  it('gives the owner both pairs and the last reason', async () => {
    const { profile } = await makeCreative();
    const approved = keys(profile.id, 'approved');
    const pending = keys(profile.id, 'pending');
    const { user } = await makeCreative({
      profile: {
        coverKey: approved.key,
        coverSmallKey: approved.small,
        coverPendingKey: pending.key,
        coverPendingSmallKey: pending.small,
        coverRejectionReason: 'Too dark to read.',
      },
    });

    const own = await getOwnProfile(user.id);

    expect(own?.cover?.url).toContain(approved.key);
    expect(own?.pendingCover).toEqual({
      url: expect.stringContaining(pending.key),
      smallUrl: expect.stringContaining(pending.small),
    });
    expect(own?.coverRejectionReason).toBe('Too dark to read.');
  });

  it('keeps the cover off the directory card', async () => {
    const { profile } = await makeCreative();
    const approved = keys(profile.id, 'approved');
    const { profile: covered } = await makeCreative({
      profile: { displayName: 'Covered Creative', coverKey: approved.key, coverSmallKey: approved.small },
    });

    const { data } = await listPublished({ page: 1, limit: 50, q: 'Covered Creative' });
    const card = data.find((entry) => entry.slug === covered.slug);

    expect(card).toBeDefined();
    expect(card).not.toHaveProperty('cover');
    expect(JSON.stringify(card)).not.toContain(approved.key);
  });
});
