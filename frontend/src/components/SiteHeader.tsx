import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { ModeSwitch } from '@/components/ModeSwitch';
import { effectiveViewMode } from '@/lib/view-mode';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { useUnreadCount } from '@/features/conversations/api';
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

  const viewMode = effectiveViewMode(user);
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
          {user && (
            <span aria-hidden="true" className="inline-flex text-ink-muted sm:hidden">
              <Bell className="size-5" />
            </span>
          )}

          <ModeSwitch className="mr-1 hidden sm:inline-flex" />

          <Link
            to="/directory"
            className={cn(
              'link-underline px-2 py-1 text-base transition-colors',
              // Phones get a deliberately bare header: the tab bar owns this
              // when signed in, and the landing page's domain and municipality
              // links do when signed out.
              'hidden sm:inline-block',
              hiring ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            Directory
          </Link>
          {user && (
            <>
              <Link
                to="/messages"
                className={cn(
                  'link-underline hidden items-center gap-1.5 px-2 py-1 text-base transition-colors sm:inline-flex',
                  'text-ink-muted hover:text-ink',
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
                  'link-underline hidden px-2 py-1 text-base transition-colors sm:inline-block',
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
                className="ml-1 hidden sm:inline-flex"
                loading={logout.isPending}
                onClick={() => void logout.mutateAsync()}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              {/* Phone: logo and Sign in, nothing else. Register is still one
                  tap further on, from the sign-in page. */}
              <ButtonLink
                to="/login"
                variant="ghost"
                size="sm"
                className="ml-1 hidden sm:inline-flex"
              >
                Sign in
              </ButtonLink>
              <ButtonLink to="/login" size="sm" className="sm:hidden">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register" size="sm" className="hidden sm:inline-flex">
                Register
              </ButtonLink>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
