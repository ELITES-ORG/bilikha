import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift and a border shift. Only for cards that are themselves links. */
  interactive?: boolean;
  /**
   * `flat` leans on the hairline alone. Default carries the faintest shadow.
   * Resist reaching past `raised` — stacked elevation on a directory grid is
   * what makes a page look like a pile of floating boxes.
   */
  elevation?: 'flat' | 'base' | 'raised';
}

const ELEVATIONS = {
  flat: 'shadow-none',
  base: 'shadow-xs',
  raised: 'shadow-sm',
} as const;

export function Card({
  interactive = false,
  elevation = 'base',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-hairline bg-surface',
        ELEVATIONS[elevation],
        interactive && 'interactive-lift hover:border-clay-300 hover:shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-hairline px-5 py-3.5 bg-clay-50/60 rounded-b-md', className)}
      {...props}
    />
  );
}
