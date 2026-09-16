import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { useUnreadCount } from '@/features/conversations/api';
import {
  defaultViewMode,
  readStoredViewMode,
  writeStoredViewMode,
  type AccountViewMode,
} from '@/features/me/view-mode';
import { Badge, Button, ButtonLink, Container, Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';

function navClass(active: boolean) {
  return cn(
    'link-underline hidden px-2 py-1 text-base transition-colors sm:inline-block',
    active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink',
  );
}

export function SiteHeader() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const hasProfile = Boolean(user?.profileSlug);
  const unreadQuery = useUnreadCount(Boolean(user));
  const unread = unreadQuery.data ?? 0;

  const [storedMode, setStoredMode] = useState<AccountViewMode | null>(() => readStoredViewMode());
  const viewMode = hasProfile ? (storedMode ?? defaultViewMode()) : 'hiring';

  function chooseMode(mode: AccountViewMode) {
    setStoredMode(mode);
    writeStoredViewMode(mode);
  }

  const hiring = !hasProfile || viewMode === 'hiring';
  const creative = hasProfile && viewMode === 'creative';

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur-sm">
      <Container width="wide" className="flex h-16 items-center justify-between gap-6">
        <Link to="/" className="group flex items-baseline gap-2.5">
          <span className="u-display text-xl font-semibold tracking-tight text-ink">Bilikha</span>
          <span className="hidden text-2xs text-ink-subtle sm:inline">BILIRAN</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {hasProfile && (
            <div
              className="mr-1 hidden items-center rounded-sm border border-hairline p-0.5 sm:inline-flex"
              role="group"
              aria-label="Account view"
            >
              <button
                type="button"
                className={cn(
                  'rounded-xs px-2 py-1 text-xs font-medium transition-colors',
                  hiring
                    ? 'bg-lawa-700 text-clay-50'
                    : 'text-ink-muted hover:bg-clay-100 hover:text-ink',
                )}
                aria-pressed={hiring}
                onClick={() => chooseMode('hiring')}
              >
                Hiring
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-xs px-2 py-1 text-xs font-medium transition-colors',
                  creative
                    ? 'bg-lawa-700 text-clay-50'
                    : 'text-ink-muted hover:bg-clay-100 hover:text-ink',
                )}
                aria-pressed={creative}
                onClick={() => chooseMode('creative')}
              >
                My creative work
              </button>
            </div>
          )}

          <Link to="/directory" className={navClass(hiring)}>
            Directory
          </Link>
          {user && (
            <>
              <Link
                to="/messages"
                className={cn(
                  'link-underline inline-flex items-center gap-1.5 px-2 py-1 text-base transition-colors',
                  'font-medium text-ink sm:font-normal',
                  'text-ink-muted hover:text-ink sm:inline-flex',
                )}
              >
                Messages
                {unread > 0 && (
                  <Badge tone="accent" className="tabular-nums">
                    {unread > 99 ? '99+' : unread}
                  </Badge>
                )}
              </Link>
              <Link
                to="/account"
                className={cn(
                  'link-underline px-2 py-1 text-base transition-colors',
                  creative || !hasProfile
                    ? 'font-medium text-ink'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                Account
              </Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/admin" className={navClass(false)}>
              Admin
            </Link>
          )}
          {user ? (
            <>
              <Link
                to="/account"
                className="ml-1 hidden items-center gap-2 sm:inline-flex"
                aria-label="Your account"
              >
                <Avatar
                  src={user.avatarUrl}
                  name={`${user.firstName} ${user.lastName}`}
                  size="sm"
                />
                <span className="text-sm text-ink-muted">{user.username}</span>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                className="ml-1"
                loading={logout.isPending}
                onClick={() => void logout.mutateAsync()}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm" className="ml-1">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register" size="sm">
                Register
              </ButtonLink>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
