import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface StatItemProps {
  value: ReactNode;
  label: string;
  /** Shown instead of `label` below `sm`, where a row of three is ~100px a cell. */
  shortLabel?: string;
  /** Decorative; the label carries the meaning. */
  icon?: ReactNode;
  /** `inverse` for a navy surface. */
  tone?: 'default' | 'inverse';
  /** Makes the whole item one link, carried by the label. */
  href?: string;
  className?: string;
}

/**
 * Icon, a large navy figure, and a muted label, as one term and description.
 * The parent must be a `<dl>`. Put several in a row with
 * `divide-x divide-hairline` on it for the thin dividers.
 */
export function StatItem({
  value,
  label,
  shortLabel,
  icon,
  tone = 'default',
  href,
  className,
}: StatItemProps) {
  const inverse = tone === 'inverse';
  const text = shortLabel ? (
    <>
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </>
  ) : (
    label
  );

  return (
    // The label leads in the DOM so a screen reader hears the term before the
    // figure; column-reverse puts the figure on top.
    <div
      className={cn(
        'flex flex-col-reverse gap-1 px-3 first:pl-0 sm:px-5',
        href && 'group relative',
        className,
      )}
    >
      <dt className={cn('text-sm', inverse ? 'text-on-primary-muted' : 'text-ink-muted')}>
        {href ? (
          // Touch screens have no hover, so the chevron is what says "tappable".
          <a
            href={href}
            className={cn(
              'inline-flex items-center gap-0.5 underline-offset-4 transition-colors after:absolute after:inset-0 group-hover:underline',
              inverse ? 'group-hover:text-on-primary' : 'group-hover:text-lawa-700',
            )}
          >
            {text}
            <ChevronRight
              className="size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </a>
        ) : (
          text
        )}
      </dt>
      <dd className="flex items-center gap-2">
        {icon && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <span
          className={cn(
            'font-sans text-2xl font-extrabold tabular-nums sm:text-3xl',
            inverse ? 'text-on-primary' : 'text-lawa-700',
          )}
          data-numeric
        >
          {value}
        </span>
      </dd>
    </div>
  );
}
