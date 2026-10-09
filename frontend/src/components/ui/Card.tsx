import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Adds hover lift and a border shift. Only for cards that are themselves links. */
  interactive?: boolean;
  /**
   * `flat` leans on the hairline alone. Default carries the faintest shadow.
   * Resist reaching past `raised` — stacked elevation on a directory grid is
   * what makes a page look like a pile of floating boxes.
   */
  elevation?: 'flat' | 'base' | 'raised';
  /** Element to render — `li` when the card is a list item. */
  as?: 'div' | 'li' | 'article' | 'section';
}

const ELEVATIONS = {
  flat: 'shadow-none',
  base: 'shadow-xs',
  raised: 'shadow-sm',
} as const;

export function Card({
  interactive = false,
  elevation = 'base',
  as: Tag = 'div',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-md border border-hairline bg-surface',
        ELEVATIONS[elevation],
        interactive && 'interactive-lift hover:border-slate-300 hover:shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-hairline px-5 py-3.5 bg-slate-50/60 rounded-b-md', className)}
      {...props}
    />
  );
}
