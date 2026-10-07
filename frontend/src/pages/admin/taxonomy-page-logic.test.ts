import { describe, expect, it } from 'vitest';
import { canDelete, referencesLabel, reorderWrites, swapTarget } from './taxonomy-page-logic';

/**
 * Plan 0047 phase 4. The screen itself needs a browser, which the repository
 * deliberately does not test with (ADR 0031) — but the rules it applies before
 * rendering are pure, and two of them are the difference between offering a
 * destructive control and refusing to.
 */
describe('how many records reference an item', () => {
  it('names the singular, which is the common case under a craft', () => {
    expect(referencesLabel(1)).toBe('1 reference');
  });

  it('pluralises above one', () => {
    expect(referencesLabel(2)).toBe('2 references');
    expect(referencesLabel(81)).toBe('81 references');
  });

  it('says nothing references it rather than "0 references"', () => {
    expect(referencesLabel(0)).toBe('nothing references it');
  });
});

describe('whether delete is offered', () => {
  it('is offered only when nothing references the item', () => {
    expect(canDelete({ referenceCount: 0 })).toBe(true);
  });

  it('is withheld at one reference, the boundary the server returns 409 on', () => {
    expect(canDelete({ referenceCount: 1 })).toBe(false);
    expect(canDelete({ referenceCount: 97 })).toBe(false);
  });
});

describe('which sibling a reorder swaps with', () => {
  const siblings = [
    { slug: 'a', displayOrder: 1, referenceCount: 0 },
    { slug: 'b', displayOrder: 2, referenceCount: 0 },
    { slug: 'c', displayOrder: 3, referenceCount: 0 },
  ];

  it('takes the neighbour in the direction asked for', () => {
    expect(swapTarget(siblings, 1, -1)?.slug).toBe('a');
    expect(swapTarget(siblings, 1, 1)?.slug).toBe('c');
  });

  it('has nothing to swap with past either end', () => {
    expect(swapTarget(siblings, 0, -1)).toBeUndefined();
    expect(swapTarget(siblings, 2, 1)).toBeUndefined();
  });

  it('does not clamp the first item onto itself — that would write an empty audit row', () => {
    expect(swapTarget(siblings, 0, -1)).not.toBe(siblings[0]);
  });

  it('is safe on an empty list', () => {
    expect(swapTarget([], 0, 1)).toBeUndefined();
  });
});

describe('what a reorder writes', () => {
  const item = (slug: string, displayOrder: number) => ({ slug, displayOrder, referenceCount: 0 });

  it('is the same two writes as a swap on a list numbered 1 to n', () => {
    const siblings = [item('a', 1), item('b', 2), item('c', 3)];
    expect(reorderWrites(siblings, 1, -1)).toEqual([
      { slug: 'b', displayOrder: 1 },
      { slug: 'a', displayOrder: 2 },
    ]);
  });

  it('separates two items that tie, which a swap of equal values never could', () => {
    const siblings = [item('a', 1), item('b', 1)];
    const writes = reorderWrites(siblings, 1, -1);
    expect(writes).toEqual([{ slug: 'a', displayOrder: 2 }]);
    // b keeps 1 and a becomes 2: b is now first, as asked.
  });

  it('renumbers around a gap rather than colliding with the rest of the list', () => {
    const siblings = [item('a', 5), item('b', 6), item('c', 7)];
    expect(reorderWrites(siblings, 2, -1)).toEqual([
      { slug: 'a', displayOrder: 1 },
      { slug: 'c', displayOrder: 2 },
      { slug: 'b', displayOrder: 3 },
    ]);
  });

  it('writes nothing past either end', () => {
    const siblings = [item('a', 1), item('b', 2)];
    expect(reorderWrites(siblings, 0, -1)).toEqual([]);
    expect(reorderWrites(siblings, 1, 1)).toEqual([]);
  });
});
