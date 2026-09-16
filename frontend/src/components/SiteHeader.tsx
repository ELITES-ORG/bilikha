import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { useReceivedInquiries } from '@/features/inquiries/api';
import {
  defaultViewMode,
  readStoredViewMode,
  writeStoredViewMode,
  type AccountViewMode,
} from '@/features/me/view-mode';
import { Badge, Button, ButtonLink, Container } from '@/components/ui';
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
  const inbox = useReceivedInquiries(1, hasProfile);
  const unread = inbox.data?.data.filter((row) => row.status === 'sent').length ?? 0;

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
          {hasProfile && (
            <Link
              to="/inbox"
              className={cn(navClass(creative), 'sm:inline-flex items-center gap-1.5')}
            >
              Inbox
              {unread > 0 && (
                <Badge tone="accent" className="tabular-nums">
                  {unread}
                </Badge>
              )}
            </Link>
          )}
          {user && (
            <>
              <Link to="/inquiries" className={navClass(hiring)}>
                Inquiries
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
              <span className="hidden px-2 text-sm text-ink-muted sm:inline">{user.username}</span>
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
