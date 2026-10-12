import type { AdminMediaRow } from '@contracts/admin';
import { describe, expect, it } from 'vitest';
import { countFlagged, filterAndSortReview, mediaChanges, mediaKindOf } from './review-list-logic';

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

describe('media changes', () => {
  type Media = NonNullable<AdminMediaRow['images']>[number];
  const media = (kind: Media['kind'], state: Media['state'], n = 1): Media[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${kind}-${state}-${i}`,
      kind,
      url: `https://cdn.test/${kind}-${i}`,
      thumbUrl: null,
      sortOrder: i,
      state,
    }));
  const change = (...images: Media[][]) => row({ id: 'change', kind: 'offer', change: 'edit', images: images.flat() });

  it('counts each kind added and removed, photos first', () => {
    expect(
      mediaChanges(change(media('video', 'pending_add'), media('audio', 'pending_remove'), media('image', 'pending_add'))),
    ).toBe('1 photo added, 1 audio removed, 1 video added');
  });

  it('pluralises as it counts, and leaves out what stays', () => {
    expect(
      mediaChanges(
        change(
          media('image', 'live', 3),
          media('image', 'pending_remove', 2),
          media('audio', 'pending_add', 2),
          media('video', 'pending_add', 2),
          media('document', 'pending_add', 2),
          media('document', 'pending_remove'),
        ),
      ),
    ).toBe('2 photos removed, 2 audio added, 2 videos added, 2 PDFs added, 1 PDF removed');
  });

  it('reads items from a backend that sends no kind as photos, so none drops out during a release', () => {
    const old = (state: Media['state'], n: number) =>
      media('image', state, n).map(({ kind: _kind, ...rest }) => rest as Media);
    const fromOldBackend = change(old('live', 1), old('pending_add', 2), old('pending_remove', 1));

    expect(fromOldBackend.images!.map(mediaKindOf)).toEqual(['image', 'image', 'image', 'image']);
    expect(mediaChanges(fromOldBackend)).toBe('2 photos added, 1 photo removed');
  });

  it('is nothing when the change touches no media', () => {
    expect(mediaChanges(change(media('image', 'live'), media('audio', 'live')))).toBeNull();
    expect(mediaChanges(row({ id: 'plain', kind: 'offer', change: 'edit' }))).toBeNull();
  });
});
