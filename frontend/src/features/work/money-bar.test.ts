import { describe, expect, it } from 'vitest';
import type { WorkSummary } from '@contracts/work';
import { moneySegments, segmentLabelFits, shouldShowMoneyBar } from './money-bar';

function money(overrides: Partial<WorkSummary['money']> = {}): WorkSummary['money'] {
  return {
    proposedCentavos: 0,
    agreedCentavos: 0,
    inProgressCentavos: 0,
    awaitingConfirmationCentavos: 0,
    completedCentavos: 0,
    cancelledCentavos: 0,
    committedCentavos: 0,
    typicalCentavos: null,
    ...overrides,
  };
}

describe('moneySegments', () => {
  it('returns nothing when every state is zero', () => {
    expect(moneySegments(money())).toEqual([]);
    expect(shouldShowMoneyBar([])).toBe(false);
  });

  it('does not show a bar for a single state', () => {
    const segments = moneySegments(money({ completedCentavos: 900_000, committedCentavos: 900_000 }));
    expect(segments).toHaveLength(1);
    expect(shouldShowMoneyBar(segments)).toBe(false);
  });

  it('keeps lifecycle order and proportional shares', () => {
    const segments = moneySegments(
      money({
        proposedCentavos: 10_000,
        agreedCentavos: 20_000,
        inProgressCentavos: 30_000,
        completedCentavos: 40_000,
        committedCentavos: 90_000,
      }),
    );

    expect(segments.map((s) => s.key)).toEqual([
      'proposed',
      'agreed',
      'inProgress',
      'completed',
    ]);
    expect(shouldShowMoneyBar(segments)).toBe(true);

    const totalShare = segments.reduce((sum, s) => sum + s.share, 0);
    expect(totalShare).toBeCloseTo(1, 10);
    expect(segments[0]!.share).toBeCloseTo(10 / 100, 10);
    expect(segments[3]!.share).toBeCloseTo(40 / 100, 10);
  });

  it('puts cancelled last and off the ramp class', () => {
    const segments = moneySegments(
      money({
        completedCentavos: 50_000,
        cancelledCentavos: 60_000,
        committedCentavos: 50_000,
      }),
    );
    expect(segments.map((s) => s.key)).toEqual(['completed', 'cancelled']);
    expect(segments[1]!.fillClass).toBe('bg-clay-400');
  });

  it('flags labels that would not fit under 15%', () => {
    expect(segmentLabelFits(0.15)).toBe(true);
    expect(segmentLabelFits(0.14)).toBe(false);
  });
});
