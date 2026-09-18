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
