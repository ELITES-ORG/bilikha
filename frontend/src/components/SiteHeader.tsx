import { Link } from 'react-router-dom';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { useReceivedInquiries } from '@/features/inquiries/api';
import { Badge, Button, ButtonLink, Container } from '@/components/ui';

export function SiteHeader() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const hasProfile = Boolean(user?.profileSlug);
  const inbox = useReceivedInquiries(1, hasProfile);
  const unread = inbox.data?.data.filter((row) => row.status === 'sent').length ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur-sm">
      <Container width="wide" className="flex h-16 items-center justify-between gap-6">
        <Link to="/" className="group flex items-baseline gap-2.5">
          <span className="u-display text-xl font-semibold tracking-tight text-ink">Bilikha</span>
          <span className="hidden text-2xs text-ink-subtle sm:inline">BILIRAN</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/directory"
            className="link-underline hidden px-2 py-1 text-base text-ink-muted transition-colors hover:text-ink sm:inline-block"
          >
            Directory
          </Link>
          {hasProfile && (
            <Link
              to="/inbox"
              className="link-underline hidden items-center gap-1.5 px-2 py-1 text-base text-ink-muted transition-colors hover:text-ink sm:inline-flex"
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
              <Link
                to="/inquiries"
                className="link-underline hidden px-2 py-1 text-base text-ink-muted transition-colors hover:text-ink sm:inline-block"
              >
                Inquiries
              </Link>
              <Link
                to="/account"
                className="link-underline px-2 py-1 text-base text-ink-muted transition-colors hover:text-ink"
              >
                Account
              </Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className="link-underline hidden px-2 py-1 text-base text-ink-muted transition-colors hover:text-ink sm:inline-block"
            >
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
