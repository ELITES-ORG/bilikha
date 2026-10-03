import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { useUnreadCount } from '@/features/conversations/api';
import { useNotificationCount } from '@/features/notifications/api';
import { Badge, Button, ButtonLink, Container, Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Wordmark } from './Wordmark';

type HeaderTone = 'default' | 'brand';

/** Link colour by state, for a white bar or the navy one. */
function linkTone(tone: HeaderTone, active: boolean) {
  if (tone === 'brand') {
    return active ? 'font-semibold text-on-primary' : 'text-on-primary-muted hover:text-on-primary';
  }
  return active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink';
}

function navClass(tone: HeaderTone, active: boolean) {
  return cn(
    'link-underline hidden px-2 py-1 text-base transition-colors sm:inline-block',
    linkTone(tone, active),
  );
}

export interface SiteHeaderProps {
  /**
   * `brand` is the navy bar, used on the landing page only. Everywhere else
   * the bar stays white so it recedes behind the content people came for.
   */
  tone?: HeaderTone;
  /** Appended to the bar, e.g. to hide it on phones where a page has its own. */
  className?: string;
}

export function SiteHeader({ tone = 'default', className }: SiteHeaderProps = {}) {
  const brand = tone === 'brand';
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const unreadQuery = useUnreadCount(Boolean(user));
  const unread = unreadQuery.data ?? 0;
  const notificationQuery = useNotificationCount(Boolean(user));
  const notifications = notificationQuery.data ?? 0;

  /**
   * Active state follows the route, not the mode.
   *
   * These links used to bold by view mode, from when the header carried the
   * mode switch. The switch now lives on the three surfaces it governs, so
   * bolding by mode meant the header quietly changed which link looked current
   * with nothing on screen explaining why. Which page you are on is what a nav
   * is answering.
   */
  const { pathname } = useLocation();
  const isCurrent = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);

  return (
    <header
      className={cn(
        'sticky top-0 z-40',
        // On navy the navy focus ring would vanish; re-point the token to white
        // for everything inside the bar.
        brand
          ? 'bg-primary [--color-ring:var(--color-on-primary)]'
          : 'border-b border-hairline bg-paper/90 backdrop-blur-sm',
        className,
      )}
    >
      <Container width="wide" className="flex h-16 items-center justify-between gap-6">
        <Link to="/" className="group flex items-center">
          <Wordmark tone={brand ? 'inverse' : 'default'} />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {user && (
            <Link
              to="/notifications"
            viewTransition
              aria-label={
                notifications > 0
                  ? `Notifications, ${notifications} unread`
                  : 'Notifications'
              }
              className={cn(
                'relative inline-flex size-11 items-center justify-center rounded-full transition-colors',
                linkTone(tone, isCurrent('/notifications')),
              )}
            >
              <Bell className="size-5" />
              {notifications > 0 && (
                // Same control as the Messages count, so one fact reads one
                // way. Badge carries its own tones, which keeps this out of
                // raw colours — plan 0014 rule 1.
                <Badge
                  tone="accent"
                  variant="solid"
                  aria-hidden="true"
                  className="absolute top-0.5 right-0.5 min-w-5 justify-center px-1.5 tabular-nums"
                >
                  {notifications > 9 ? '9+' : notifications}
                </Badge>
              )}
            </Link>
          )}

          <Link
            to="/directory"
            viewTransition
            className={cn(
              'link-underline px-2 py-1 text-base transition-colors',
              // Phones get a deliberately bare header: the tab bar owns this
              // when signed in, and the landing page's domain and municipality
              // links do when signed out.
              'hidden sm:inline-block',
              linkTone(tone, isCurrent('/directory') || isCurrent('/creatives')),
            )}
          >
            Directory
          </Link>
          {user && (
            <>
              <Link
                to="/messages"
                viewTransition
                className={cn(
                  'link-underline hidden items-center gap-1.5 px-2 py-1 text-base transition-colors sm:inline-flex',
                  linkTone(tone, isCurrent('/messages')),
                )}
              >
                Messages
                {unread > 0 && (
                  <Badge tone="accent" variant="solid" className="tabular-nums">
                    {unread > 99 ? '99+' : unread}
                  </Badge>
                )}
              </Link>
              <Link
                to="/account"
                viewTransition
                className={cn(
                  'link-underline hidden px-2 py-1 text-base transition-colors sm:inline-block',
                  linkTone(tone, isCurrent('/account')),
                )}
              >
                Account
              </Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/admin" className={navClass(tone, false)}>
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
                <span className={cn('text-sm', brand ? 'text-on-primary-muted' : 'text-ink-muted')}>
                  {user.username}
                </span>
              </Link>
              <Button
                size="sm"
                variant={brand ? 'inverse' : 'secondary'}
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
                variant={brand ? 'inverse' : 'ghost'}
                size="sm"
                className="ml-1 hidden sm:inline-flex"
              >
                Sign in
              </ButtonLink>
              <ButtonLink
                to="/login"
                size="sm"
                variant={brand ? 'inverse' : 'primary'}
                className="sm:hidden"
              >
                Sign in
              </ButtonLink>
              <ButtonLink
                to="/register"
                size="sm"
                variant={brand ? 'accent' : 'primary'}
                className="hidden sm:inline-flex"
              >
                Register
              </ButtonLink>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
