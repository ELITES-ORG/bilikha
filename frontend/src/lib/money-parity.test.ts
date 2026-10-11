import { describe, expect, it } from 'vitest';
import { formatPriceRange as cardPriceRange } from '../../../backend/src/modules/share/share-price';
import { formatPriceRange } from './money';

/**
 * A shared link's preview card is written by the API (ADR 0056), the page it
 * opens by this file, and the two must word a price the same way. Contracts
 * hold types only (ADR 0037), so each side keeps its own copy, and this test
 * is what stops them drifting apart: change one and it fails until the other
 * matches.
 */
describe('price wording: the preview card and the page agree', () => {
  const amounts = [null, undefined, 0, 1, 49, 50, 99, 100, 150, 99_950, 250_000, 300_000, 1_000_000, 123_456_789];

  it('for every pairing of minimum and maximum', () => {
    for (const min of amounts) {
      for (const max of amounts) {
        expect(cardPriceRange(min, max), `min ${min}, max ${max}`).toBe(formatPriceRange(min, max));
      }
    }
  });
});
