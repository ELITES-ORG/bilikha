import { scoreLine } from '../format';
import type { RatingSummary } from '../types';
import { StarRow } from './StarRow';

export interface RatingScoreProps {
  summary: RatingSummary;
  /** Shown when there is nothing to average. Plain words, never empty stars. */
  emptyText?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * The score and its count, together, or a sentence saying there is none. This
 * is the only component that prints an average, so rule 4 is enforced in one
 * place: there is no way to render "5.0" here without "from 1 review" after it.
 */
export function RatingScore({
  summary,
  emptyText = 'No ratings yet',
  size = 'md',
}: RatingScoreProps) {
  const line = scoreLine(summary);

  if (!line) return <p className="text-sm text-ink-muted">{emptyText}</p>;

  return (
    <p className="flex flex-wrap items-center gap-2">
      <StarRow value={summary.average ?? 0} label={line} size={size} />
      <span className="text-base text-ink">{line}</span>
    </p>
  );
}
