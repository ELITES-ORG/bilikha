import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatItemProps {
  value: ReactNode;
  label: string;
  /** Decorative; the label carries the meaning. */
  icon?: ReactNode;
  /** `inverse` for a navy surface. */
  tone?: 'default' | 'inverse';
  className?: string;
}

/**
 * Icon, a large navy figure, and a muted label. Put several in a row with
 * `divide-x divide-hairline` on the parent for the thin dividers.
 */
export function StatItem({ value, label, icon, tone = 'default', className }: StatItemProps) {
  const inverse = tone === 'inverse';
  return (
    <div className={cn('flex flex-col gap-1 px-3 first:pl-0 sm:px-5', className)}>
      <div className="flex items-center gap-2">
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
      </div>
      <span className={cn('text-sm', inverse ? 'text-on-primary-muted' : 'text-ink-muted')}>
        {label}
      </span>
    </div>
  );
}
