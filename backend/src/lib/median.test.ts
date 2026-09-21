import { describe, expect, it } from 'vitest';
import { medianCentavos } from './median.js';

describe('medianCentavos', () => {
  it('returns null when there are no values', () => {
    expect(medianCentavos([])).toBeNull();
  });

  it('returns the only value when there is one', () => {
    expect(medianCentavos([90_000])).toBe(90_000);
  });

  it('takes the lower of the two middle values when the count is even', () => {
    // Sorted [50_000, 2_150_000] — middles are both; lower is 50_000.
    expect(medianCentavos([2_150_000, 50_000])).toBe(50_000);
    expect(medianCentavos([2_000, 2_000, 50_000, 2_000])).toBe(2_000);
  });

  it('returns the middle value when the count is odd', () => {
    expect(medianCentavos([10_000, 30_000, 20_000])).toBe(20_000);
  });
});
