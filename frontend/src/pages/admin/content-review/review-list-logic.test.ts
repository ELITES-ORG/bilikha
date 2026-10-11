import type { AdminMediaRow } from '@contracts/admin';
import { describe, expect, it } from 'vitest';
import { countFlagged, filterAndSortReview } from './review-list-logic';

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
    version: `v-${id}`,
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
    subdomain: 'Event photography',
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
    expect(filterAndSortReview(items, '  ALICE  ', 'queue').map((item) => item.id)).toEqual([
      'avatar',
    ]);
    expect(filterAndSortReview(items, 'wedding', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
    ]);
    expect(filterAndSortReview(items, 'documentary', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
    ]);
    expect(filterAndSortReview(items, 'studio', 'queue').map((item) => item.id)).toEqual([
      'old-offer',
    ]);
    expect(filterAndSortReview(items, 'event photo', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
    ]);
  });

  it('tolerates missing optional fields, and finds nothing for text that is not there', () => {
    expect(filterAndSortReview(items, 'portrait', 'queue').map((item) => item.id)).toEqual([
      'new-offer',
      'old-offer',
    ]);
    expect(filterAndSortReview(items, 'not present', 'queue')).toEqual([]);
  });
});

describe('media review ordering', () => {
  it('preserves the server queue order and never mutates the input', () => {
    const original = items.map((item) => item.id);

    expect(filterAndSortReview(items, '', 'queue').map((item) => item.id)).toEqual(original);
    expect(items.map((item) => item.id)).toEqual(original);
  });

  it('sorts newest and oldest without disturbing equal timestamps', () => {
    const tied = [items[0]!, row({ id: 'same-time' }), items[1]!, items[2]!];

    expect(filterAndSortReview(tied, '', 'newest').map((item) => item.id)).toEqual([
      'new-offer',
      'avatar',
      'same-time',
      'old-offer',
    ]);
    expect(filterAndSortReview(tied, '', 'oldest').map((item) => item.id)).toEqual([
      'old-offer',
      'avatar',
      'same-time',
      'new-offer',
    ]);
    expect(tied.map((item) => item.id)).toEqual(['avatar', 'same-time', 'new-offer', 'old-offer']);
  });
});

describe('media review counts', () => {
  it('counts flagged entries', () => {
    expect(countFlagged(items)).toBe(1);
    expect(countFlagged([])).toBe(0);
  });

  it('searches an organisation logo by its organisation', () => {
    const withLogo = [...items, row({ id: 'logo', kind: 'logo', ownerName: 'Naval Light Studio' })];

    expect(filterAndSortReview(withLogo, 'naval light', 'queue').map((item) => item.id)).toEqual(['logo']);
  });
});
