import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Bilikha will show this often and early: a province this size will have
 * sub-domains with no registrants for a long while. An empty result is a normal
 * state here, not an error — so it gets a proper surface with a way forward
 * rather than a bare "no results found".
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-hairline-strong',
        'bg-clay-50/50 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-surface text-ink-subtle shadow-xs ring-1 ring-hairline">
          {icon}
        </div>
      )}

      <p className="u-display text-xl text-ink">{title}</p>

      {description && (
        <p className="mt-2 max-w-sm text-base text-ink-muted text-pretty">{description}</p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
