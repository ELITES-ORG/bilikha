import { useCurrentUser } from '@/features/auth/api';
import type { ViewMode } from '@/features/auth/types';
import { useSetViewMode } from '@/features/me/api';
import { effectiveViewMode } from '@/lib/view-mode';
import { cn } from '@/lib/cn';

interface ModeSwitchProps {
  className?: string;
  /** Larger touch targets for page headers (Account keeps its own layout). */
  size?: 'sm' | 'md';
}

/**
 * "I'm hiring" ↔ "I'm for hire". First person on purpose: the earlier labels
 * were "Hiring" and "My creative work", and the second actively misled — it
 * reads as your own offers and portfolio, when the mode shows other people's
 * job posts. Whose perspective this is has to be unambiguous, because the mode
 * decides what Home, Messages and History each contain.
 */
export function ModeSwitch({ className, size = 'sm' }: ModeSwitchProps) {
  const { data: user } = useCurrentUser();
  const setMode = useSetViewMode();

  if (!user?.profileSlug) return null;

  const mode = effectiveViewMode(user);
  const hiring = mode === 'hiring';
  const creative = mode === 'creative';

  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs';

  function choose(next: ViewMode) {
    if (next === mode || setMode.isPending) return;
    void setMode.mutateAsync(next).catch(() => undefined);
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-sm border border-hairline p-0.5',
        className,
      )}
      role="group"
      aria-label="Account view"
    >
      <button
        type="button"
        className={cn(
          'rounded-xs font-medium transition-colors',
          pad,
          hiring
            ? 'bg-primary text-on-primary'
            : 'text-ink-muted hover:bg-clay-100 hover:text-ink',
        )}
        aria-pressed={hiring}
        disabled={setMode.isPending}
        onClick={() => choose('hiring')}
      >
        I&apos;m hiring
      </button>
      <button
        type="button"
        className={cn(
          'rounded-xs font-medium transition-colors',
          pad,
          creative
            ? 'bg-primary text-on-primary'
            : 'text-ink-muted hover:bg-clay-100 hover:text-ink',
        )}
        aria-pressed={creative}
        disabled={setMode.isPending}
        onClick={() => choose('creative')}
      >
        I&apos;m for hire
      </button>
    </div>
  );
}
