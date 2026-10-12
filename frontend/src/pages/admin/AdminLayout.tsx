import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Badge, ButtonLink } from '@/components/ui';
import { useAdminSummary, useSummaryFollowsDecisions } from '@/features/admin/api';
import { Wordmark } from '@/components/Wordmark';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { cn } from '@/lib/cn';
import { pbBottomNav } from '@/lib/bottom-nav';
import { ADMIN_GROUPS, ADMIN_SECTIONS, isAdminSectionActive, type AdminSection } from './admin-sections';

/** What waits in a section, or null when nothing does or it is a tool: a zero is not drawn. */
function useWaiting(): (section: AdminSection) => number | null {
  const summary = useAdminSummary();
  return (section) => {
    if (!section.waiting || !summary.data) return null;
    const count = section.waiting(summary.data);
    return count > 0 ? count : null;
  };
}

function WaitingBadge({ count, label }: { count: number | null; label: string }) {
  if (count === null) return null;
  return (
    <Badge tone="brand" className="ml-auto" data-numeric>
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{`${count} waiting in ${label}`}</span>
    </Badge>
  );
}

/**
 * One shell for `/admin/*`: header, section nav, and the outlet. The
 * `RequireAdmin` guard lives on the route in `App.tsx`, outside this lazy
 * module, so a non-admin redirect never downloads the admin chunk
 * (plan 0031 / ADR 0035).
 */
export function AdminLayout() {
  return <AdminShell />;
}

function AdminShell() {
  const { pathname } = useLocation();
  useSummaryFollowsDecisions();
  const waiting = useWaiting();

  return (
    <div className="min-h-page bg-paper">
      <header className="border-b border-hairline">
        {/*
          Logo sits in the same w-56 column as the aside, with the same p-4 +
          px-3 inset as the nav links, so "Bilikha" shares a left edge with
          "Creatives". Phones keep a simple gutter — there is no sidebar.
        */}
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center px-3 sm:w-56 sm:shrink-0 sm:px-4">
            <Link to="/" className="flex min-h-11 items-center sm:px-3">
              <Wordmark />
            </Link>
          </div>
          <div className="pr-3 sm:pr-(--gutter)">
            <ButtonLink to="/" variant="ghost" size="sm">
              Back to site
            </ButtonLink>
          </div>
        </div>
      </header>

      <RegistrationStatusBanner />

      {/* Phones: always-visible scrolling row. No drawer, no open/closed state. */}
      <AdminPhoneNav pathname={pathname} waiting={waiting} />

      <div className="sm:flex sm:min-h-[calc(100dvh-4rem-var(--staging-banner-h))]">
        <aside className="hidden w-56 shrink-0 border-r border-hairline sm:block">
          <nav aria-label="Administration" className="sticky top-(--staging-banner-h) short:top-0 p-4">
            {ADMIN_GROUPS.map((group, index) => (
            <div key={group.id} className={index > 0 ? 'mt-8' : undefined}>
            <p className="u-eyebrow px-3">{group.label}</p>
            <ul className="mt-4 space-y-1">
              {ADMIN_SECTIONS.filter((section) => section.group === group.id).map((section) => {
                const active = isAdminSectionActive(pathname, section.path);
                return (
                  <li key={section.path}>
                    <Link
                      to={section.path}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-slate-100 text-ink'
                          : 'text-ink-muted hover:bg-slate-50 hover:text-ink',
                      )}
                    >
                      <section.icon
                        className={cn(
                          'size-5 shrink-0 transition-colors',
                          active ? 'text-navy-700' : 'text-ink-subtle group-hover:text-ink',
                        )}
                        aria-hidden="true"
                      />
                      {section.label}
                      <WaitingBadge count={waiting(section)} label={section.label} />
                    </Link>
                  </li>
                );
              })}
            </ul>
            </div>
            ))}
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

function AdminPhoneNav({
  pathname,
  waiting,
}: {
  pathname: string;
  waiting: (section: AdminSection) => number | null;
}) {
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
          // `relative`: a badge's screen-reader text is absolutely positioned,
          // and without a positioned ancestor here it is placed against the
          // page, not clipped by this scroller, and widens the whole page.
          'relative flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain px-3 py-2',
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
                'inline-flex h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-slate-100 text-ink'
                  : 'text-ink-muted hover:bg-slate-50 hover:text-ink',
              )}
            >
              <section.icon
                className={cn('size-4 shrink-0', active ? 'text-navy-700' : 'text-ink-subtle')}
                aria-hidden="true"
              />
              {section.label}
              <WaitingBadge count={waiting(section)} label={section.label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
