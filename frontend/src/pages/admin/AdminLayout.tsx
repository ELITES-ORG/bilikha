import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ButtonLink, Container } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { RequireAdmin } from '@/features/auth/RequireAdmin';
import { cn } from '@/lib/cn';
import { pbBottomNav } from '@/lib/bottom-nav';
import { ADMIN_SECTIONS, isAdminSectionActive } from './admin-sections';

/**
 * One shell for `/admin/*`: header, section nav, and the guard. Pages become
 * content. The guard lives here so it cannot be forgotten on a new page
 * (ADR 0035).
 */
export function AdminLayout() {
  return (
    <RequireAdmin>
      <AdminShell />
    </RequireAdmin>
  );
}

function AdminShell() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="wide" className="flex h-16 items-center justify-between">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
          <ButtonLink to="/" variant="ghost" size="sm">
            Back to site
          </ButtonLink>
        </Container>
      </header>

      <RegistrationStatusBanner />

      {/* Phones: always-visible scrolling row. No drawer, no open/closed state. */}
      <AdminPhoneNav pathname={pathname} />

      <div className="sm:flex sm:min-h-[calc(100dvh-4rem)]">
        <aside className="hidden w-56 shrink-0 border-r border-hairline sm:block">
          <nav aria-label="Administration" className="sticky top-0 p-4">
            <p className="u-eyebrow px-3">Administration</p>
            <ul className="mt-4 space-y-1">
              {ADMIN_SECTIONS.map((section) => {
                const active = isAdminSectionActive(pathname, section.path);
                return (
                  <li key={section.path}>
                    <Link
                      to={section.path}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'block rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-clay-100 text-ink'
                          : 'text-ink-muted hover:bg-clay-50 hover:text-ink',
                      )}
                    >
                      {section.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* pbBottomNav: the app tab bar is still global and still overlaps. */}
        <main className={cn('min-w-0 flex-1', pbBottomNav)}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminPhoneNav({ pathname }: { pathname: string }) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' });
  }, [pathname]);

  return (
    <nav
      aria-label="Administration"
      className="border-b border-hairline sm:hidden"
    >
      <div
        className={cn(
          'flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain px-3 py-2',
          // Last item fully reachable past the edge; hide the bar, keep keyboard scroll.
          'scroll-px-3',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {ADMIN_SECTIONS.map((section) => {
          const active = isAdminSectionActive(pathname, section.path);
          return (
            <Link
              key={section.path}
              ref={active ? activeRef : undefined}
              to={section.path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-11 shrink-0 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-clay-100 text-ink'
                  : 'text-ink-muted hover:bg-clay-50 hover:text-ink',
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
