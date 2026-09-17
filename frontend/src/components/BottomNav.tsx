import { Link, useLocation } from 'react-router-dom';
import { Clock, House, MessageSquare, User } from 'lucide-react';
import { useCurrentUser } from '@/features/auth/api';
import { useUnreadCount } from '@/features/conversations/api';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/directory', label: 'Home', icon: House },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/account', label: 'Profile', icon: User },
] as const;

function tabIsActive(pathname: string, to: string) {
  if (to === '/messages') {
    return pathname === '/messages' || pathname.startsWith('/messages/');
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Onboarding is a flow, not a destination. Registration signs the user in, so
 * without this the tab bar appears over profile setup and offers a
 * half-registered creative three ways to wander off. ADR 0019 records that the
 * continuation from registration into setup is the thing keeping registrants
 * from bleeding away at the seam.
 */
function isOnboarding(pathname: string) {
  return pathname === '/welcome' || pathname.startsWith('/welcome/');
}

/**
 * Phone-only tab bar for signed-in users. Mounted once in App — not per page.
 * Desktop (`sm` and up) keeps the header nav; this component is `sm:hidden`.
 */
export function BottomNav() {
  const { data: user } = useCurrentUser();
  const unreadQuery = useUnreadCount(Boolean(user));
  const unread = unreadQuery.data ?? 0;
  const { pathname } = useLocation();

  if (!user || isOnboarding(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper pb-[env(safe-area-inset-bottom,0px)] sm:hidden"
      aria-label="Primary"
    >
      <ul className="flex">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = tabIsActive(pathname, to);
          const showBadge = to === '/messages' && unread > 0;

          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                viewTransition
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1.5',
                  'text-2xs tracking-wide',
                  active ? 'font-semibold text-ink' : 'font-medium text-ink-muted',
                )}
              >
                <span className="relative inline-flex">
                  <Icon className="size-5" aria-hidden />
                  {showBadge && (
                    <Badge
                      tone="accent"
                      className="absolute -top-2 -right-3 min-w-4 justify-center px-1 py-0 text-2xs tabular-nums"
                    >
                      {unread > 99 ? '99+' : unread}
                    </Badge>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
