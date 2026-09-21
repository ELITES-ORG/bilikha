/**
 * Money lifecycle segments for the stacked bar on /account/work (plan 0029).
 * Pure — no React. Widths are proportions of total centavos; the bar itself
 * applies them as inline styles so Tailwind never sees an interpolated class.
 */

import type { WorkSummary } from '@contracts/work';

export type MoneySegmentKey =
  | 'proposed'
  | 'agreed'
  | 'inProgress'
  | 'awaitingConfirmation'
  | 'completed'
  | 'cancelled';

export interface MoneySegmentDef {
  key: MoneySegmentKey;
  label: string;
  /** Tailwind background utility — a real class name, never interpolated. */
  fillClass: string;
  /** Field on WorkSummary.money. */
  field: keyof WorkSummary['money'];
}

/**
 * Lifecycle order. Fill tokens are the measured five-step lawa spread plus
 * clay for cancelled (plan 0029 rules 2–5). Class names are static so Tailwind
 * emits the CSS.
 */
export const MONEY_SEGMENT_DEFS = [
  { key: 'proposed', label: 'Proposed', fillClass: 'bg-lawa-100', field: 'proposedCentavos' },
  { key: 'agreed', label: 'Agreed', fillClass: 'bg-lawa-300', field: 'agreedCentavos' },
  { key: 'inProgress', label: 'In progress', fillClass: 'bg-lawa-500', field: 'inProgressCentavos' },
  {
    key: 'awaitingConfirmation',
    label: 'Awaiting confirmation',
    fillClass: 'bg-lawa-700',
    field: 'awaitingConfirmationCentavos',
  },
  { key: 'completed', label: 'Completed', fillClass: 'bg-lawa-950', field: 'completedCentavos' },
  { key: 'cancelled', label: 'Cancelled', fillClass: 'bg-clay-400', field: 'cancelledCentavos' },
] as const satisfies readonly MoneySegmentDef[];

/**
 * Every money state must have a segment, and the compiler enforces it.
 *
 * Plan 0027's audit made the states partition their total in the service; the
 * display layer kept no such guarantee, and `agreed` shipped missing from the
 * agreements sentence for exactly that reason. Dropping `awaitingConfirmation`
 * from the defs above passed every test in this file, so a test was not enough:
 * the omission has to be a compile error.
 *
 * Add a state to the contract and this line fails until it has a segment.
 */
type MoneyStateField = Exclude<
  keyof WorkSummary['money'],
  'committedCentavos' | 'typicalCentavos'
>;
type CoveredField = (typeof MONEY_SEGMENT_DEFS)[number]['field'];
type UncoveredField = Exclude<MoneyStateField, CoveredField>;
const _everyMoneyStateHasASegment: UncoveredField extends never ? true : never = true;
void _everyMoneyStateHasASegment;

/** One entry of MONEY_SEGMENT_DEFS, with its literal field preserved. */
type SegmentDef = (typeof MONEY_SEGMENT_DEFS)[number];

export interface MoneySegment {
  key: MoneySegmentKey;
  label: string;
  fillClass: string;
  centavos: number;
  /** Share of the bar, 0–1. */
  share: number;
}

/** Segments with money, in lifecycle order. Empty when nothing to plot. */
export function moneySegments(money: WorkSummary['money']): MoneySegment[] {
  const present = MONEY_SEGMENT_DEFS.map((def) => {
    const centavos = money[def.field];
    if (typeof centavos !== 'number' || centavos <= 0) return null;
    return { def, centavos };
  }).filter((row): row is { def: SegmentDef; centavos: number } => row != null);

  const total = present.reduce((sum, row) => sum + row.centavos, 0);
  if (total <= 0) return [];

  return present.map(({ def, centavos }) => ({
    key: def.key,
    label: def.label,
    fillClass: def.fillClass,
    centavos,
    share: centavos / total,
  }));
}

/**
 * A single full-width segment is a rectangle, not a comparison — the tiles and
 * the sentence already say it. Nothing agreed → no bar either.
 */
export function shouldShowMoneyBar(segments: MoneySegment[]): boolean {
  return segments.length >= 2;
}

/** Direct label fits when the segment is wide enough not to clip on a 375px phone. */
export function segmentLabelFits(share: number): boolean {
  return share >= 0.15;
}
