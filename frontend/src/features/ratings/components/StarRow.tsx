import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} as const;

const STARS = [1, 2, 3, 4, 5];

export interface StarRowProps {
  /** May be fractional: an average rounds to the nearest whole star to draw. */
  value: number;
  /**
   * What a screen reader hears in place of the icons. Where the row stands for
   * an average it names the count as well — a score without its count is a lie
   * in a thin market (ADR 0033).
   */
  label: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Read-only stars. The interactive version is a radio group — see
 * `StarRadioGroup`, which is what anyone leaving a rating uses.
 */
export function StarRow({ value, label, size = 'sm', className }: StarRowProps) {
  const filled = Math.round(value);

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {STARS.map((star) => (
        <Star
          key={star}
          aria-hidden
          className={cn(
            SIZES[size],
            star <= filled ? 'fill-palayok-500 text-palayok-600' : 'text-clay-300',
          )}
        />
      ))}
    </span>
  );
}
