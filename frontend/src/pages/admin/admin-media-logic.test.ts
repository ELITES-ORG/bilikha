import type { AdminMediaRow } from '@contracts/admin';
import { describe, expect, it } from 'vitest';
import { countMedia, filterAndSortMedia } from './admin-media-logic';

function row(overrides: Partial<AdminMediaRow> & Pick<AdminMediaRow, 'id'>): AdminMediaRow {
  const { id, ...rest } = overrides;
  return {
    id,
    kind: 'avatar',
    createdAt: '2026-01-02T00:00:00.000Z',
    url: null,
    thumbUrl: null,
    caption: null,
    ownerName: 'Owner',
    profileSlug: null,
    profileId: null,
    ...rest,
  };
}

const items = [
  row({ id: 'avatar', ownerName: 'Alice Reyes', caption: 'Town Fiesta' }),
  row({
    id: 'new-offer',
    kind: 'offer',
    ownerName: 'Bob Cruz',
    title: 'Wedding portraits',
    description: 'Warm documentary coverage',
    createdAt: '2026-01-03T00:00:00.000Z',
    flaggedAt: '2026-01-04T00:00:00.000Z',
  }),
  row({
    id: 'old-offer',
    kind: 'offer',
    ownerName: 'Carla Lim',
    title: undefined,
    description: null,
    caption: 'Studio portrait',
    createdAt: '2026-01-01T00:00:00.000Z',
  }),
];

describe('media review filtering', () => {
  it('matches trimmed, case-insensitive text across every searchable field', () => {
    expect(filterAndSortMedia(items, 'all', '  ALICE  ', 'queue').map((item) => item.id)).toEqual([
      'avatar',
    ]);
    expect(filterAndSortMedia(items, 'all', 'wedding', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
    ]);
    expect(filterAndSortMedia(items, 'all', 'documentary', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
    ]);
    expect(filterAndSortMedia(items, 'all', 'studio', 'queue').map((item) => item.id)).toEqual([
      'old-offer',
    ]);
  });

  it('combines the kind and search filters and tolerates missing optional fields', () => {
    expect(filterAndSortMedia(items, 'offer', 'portrait', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
      'old-offer',
    ]);
    expect(filterAndSortMedia(items, 'avatar', 'portrait', 'queue')).toEqual([]);
    expect(filterAndSortMedia(items, 'all', 'not present', 'queue')).toEqual([]);
  });
});

describe('media review ordering', () => {
  it('preserves the server queue order and never mutates the input', () => {
    const original = items.map((item) => item.id);

    expect(filterAndSortMedia(items, 'all', '', 'queue').map((item) => item.id)).toEqual(original);
    expect(items.map((item) => item.id)).toEqual(original);
  });

  it('sorts newest and oldest without disturbing equal timestamps', () => {
    const tied = [items[0]!, row({ id: 'same-time' }), items[1]!, items[2]!];

    expect(filterAndSortMedia(tied, 'all', '', 'newest').map((item) => item.id)).toEqual([
      'new-offer',
      'avatar',
      'same-time',
      'old-offer',
    ]);
    expect(filterAndSortMedia(tied, 'all', '', 'oldest').map((item) => item.id)).toEqual([
      'old-offer',
      'avatar',
      'same-time',
      'new-offer',
    ]);
    expect(tied.map((item) => item.id)).toEqual(['avatar', 'same-time', 'new-offer', 'old-offer']);
  });
});

describe('media review counts', () => {
  it('counts kinds and flagged entries independently', () => {
    expect(countMedia(items)).toEqual({ avatar: 1, offer: 2, flagged: 1 });
    expect(countMedia([])).toEqual({ avatar: 0, offer: 0, flagged: 0 });
  });
});
