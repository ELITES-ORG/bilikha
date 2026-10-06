import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Eyebrow } from './Eyebrow';

export interface SectionHeadingProps {
  /** Small uppercase kicker. Use it to place the section, not to repeat the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Trailing control — a link, filter, or button — baselined with the title. */
  action?: ReactNode;
  /** `h1` when the section heading is the page's title. */
  as?: 'h1' | 'h2' | 'h3';
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
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}

        <Tag className={cn('u-display text-ink', Tag === 'h3' ? 'text-2xl' : 'text-3xl')}>
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
