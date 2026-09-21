import { Button } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import type { ViewMode } from '@/features/auth/types';
import { useSetViewMode } from '@/features/me/api';
import { effectiveViewMode, MODE_LABEL } from '@/lib/view-mode';

/**
 * One-tap way out of a list emptied by the wrong mode (ADR 0025 / 0038).
 * A single action naming the destination — not a two-state control that reads
 * as a filter (plan 0032).
 */
export function SwitchModeAction({ className }: { className?: string }) {
  const { data: user } = useCurrentUser();
  const setMode = useSetViewMode();

  if (!user?.profileSlug) return null;

  const mode = effectiveViewMode(user);
  const other: ViewMode = mode === 'hiring' ? 'creative' : 'hiring';

  return (
    <Button
      type="button"
      size="sm"
      className={className}
      disabled={setMode.isPending}
      loading={setMode.isPending}
      onClick={() => {
        void setMode.mutateAsync(other).catch(() => undefined);
      }}
    >
      {`Switch to ${MODE_LABEL[other]}`}
    </Button>
  );
}
