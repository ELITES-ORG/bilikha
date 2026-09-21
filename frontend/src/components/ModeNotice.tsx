import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import { effectiveViewMode, MODE_AS } from '@/lib/view-mode';

/**
 * Names the mode on a mirrored surface without offering to change it
 * (ADR 0038). Empty lists keep a one-tap SwitchModeAction — that is the way
 * out of a list emptied by the wrong mode (ADR 0025 / plan 0032).
 */
export function ModeNotice() {
  const { data: user } = useCurrentUser();

  if (!user?.profileSlug) return null;

  const mode = effectiveViewMode(user);

  return (
    <p className="max-w-prose text-sm text-ink-muted">
      Viewing as {MODE_AS[mode]} — Home, Messages and History all follow this.{' '}
      <Link
        to="/account"
        className="font-medium text-ink underline decoration-hairline underline-offset-2 hover:decoration-ink"
      >
        Change in Account
      </Link>
    </p>
  );
}
