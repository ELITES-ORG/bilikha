import type { CSSProperties } from 'react';
import type { WorkSummary } from '@contracts/work';
import { formatPesos } from '@/lib/money';
import { cn } from '@/lib/cn';
import {
  moneySegments,
  segmentLabelFits,
  shouldShowMoneyBar,
} from './money-bar';

/**
 * Horizontal stacked bar of agreement money by lifecycle state.
 *
 * Widths are inline flex-grow values — never an interpolated Tailwind class
 * (Tailwind 4 would emit no CSS). One state → no bar; nothing → no bar.
 */
export function MoneyLifecycleBar({ money }: { money: WorkSummary['money'] }) {
  const segments = moneySegments(money);
  if (!shouldShowMoneyBar(segments)) return null;

  return (
    <div className="mt-4" data-testid="money-lifecycle-bar">
      {/*
        clay-100 track + hairline bounds the lightest lawa steps so they read
        as data (rules 4–5). Paper-coloured 2px gaps separate adjacent fills.
      */}
      <div className="rounded-xs border border-hairline bg-clay-100 p-0.5">
        <div
          className="flex h-10 gap-0.5 overflow-hidden rounded-xs bg-paper"
          role="img"
          aria-label={segments
            .map((s) => `${s.label} ${formatPesos(s.centavos)}`)
            .join(', ')}
        >
          {segments.map((segment, index) => {
            const first = index === 0;
            const last = index === segments.length - 1;
            const showLabel = segmentLabelFits(segment.share);

            return (
              <div
                key={segment.key}
                data-segment={segment.key}
                className={cn(
                  'relative flex min-w-0 items-center justify-center overflow-hidden',
                  segment.fillClass,
                  first && 'rounded-l-xs',
                  last && 'rounded-r-xs',
                )}
                style={
                  {
                    flexGrow: segment.centavos,
                    flexBasis: 0,
                    flexShrink: 0,
                  } satisfies CSSProperties
                }
              >
                {/*
                  Hidden on phones. Measured 2026-09-22 at 375px: "Agreed
                  ₱2,000" had 57px and needed 86, "In progress ₱3,000" had 89
                  and needed 105 — a share threshold cannot fix that, because
                  what overflows is the text, not the fraction. The legend below
                  carries every state with its swatch and amount, and the bar's
                  aria-label carries all of it for a screen reader, so nothing
                  is lost by dropping the chip where it does not fit.
                */}
                {showLabel && (
                  <span
                    className={cn(
                      'mx-1 hidden truncate rounded-xs px-1.5 py-0.5 sm:inline-block',
                      'text-[11px] font-medium leading-none',
                      'bg-paper/85 text-ink',
                    )}
                  >
                    {segment.label} {formatPesos(segment.centavos)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-xs text-ink-muted">
            <span
              className={cn('size-2.5 shrink-0 rounded-xs', segment.fillClass)}
              aria-hidden
            />
            <span>
              {segment.label}{' '}
              <span data-numeric className="text-ink">
                {formatPesos(segment.centavos)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
