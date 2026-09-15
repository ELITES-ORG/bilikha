import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SectionHeadingProps {
  /** Small uppercase kicker. Use it to place the section, not to repeat the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Trailing control — a link, filter, or button — baselined with the title. */
  action?: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}

/**
 * Section headers are left-aligned and asymmetric by default. Centred stacks
 * read as a template; ragged-right text with the action pushed to the end
 * reads as a considered layout.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Tag = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-3', className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="u-eyebrow mb-2 flex items-center gap-2">
            <span className="inline-block h-px w-5 bg-palayok-500" aria-hidden="true" />
            {eyebrow}
          </p>
        )}

        <Tag className={cn('u-display text-ink', Tag === 'h2' ? 'text-3xl' : 'text-2xl')}>
          {title}
        </Tag>

        {description && (
          <p className="mt-2.5 text-md text-ink-muted text-pretty">{description}</p>
        )}
      </div>

      {action && <div className="shrink-0 pb-1">{action}</div>}
    </div>
  );
}
