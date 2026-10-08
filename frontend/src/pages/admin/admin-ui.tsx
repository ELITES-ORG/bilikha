import type { ReactNode } from 'react';
import {
  Archive,
  Ban,
  CheckCircle2,
  Clock,
  FilePen,
  Flag,
  PencilLine,
  ShieldCheck,
} from 'lucide-react';
import { Badge, Button, Eyebrow } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * The admin area's shared patterns, taken from the media review page: one
 * editorial header, one toolbar, divided lists instead of boxed cards, quiet
 * status badges and small-caps facts. Buttons, inputs, tabs and empty states
 * are the app's own primitives — the admin area restyles nothing they already
 * do, so it cannot drift from the rest of the product.
 *
 * Lives beside the admin pages so it ships in their lazy chunk, never in the
 * first load of the public site (plan 0031).
 */

/** Eyebrow, serif title, a short description, and optional figures or an action. */
export function AdminPageHeader({
  eyebrow = 'Administration',
  title,
  description,
  aside,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Figures (a `<dl>` of `StatItem`s) or the page's primary action. */
  aside?: ReactNode;
  /** Extra lines under the title, such as a username or a status. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-2xl min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="u-display mt-3 text-3xl break-words text-ink sm:text-4xl xl:text-5xl">
          {title}
        </h1>
        {children}
        {description && <div className="mt-3 text-md text-pretty text-ink-muted">{description}</div>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/**
 * Tabs, search and sort under the header. Stacked until `xl`, because beside
 * the admin sidebar a single row squeezes every control at tablet widths.
 */
export function AdminToolbar({
  children,
  ruled = true,
  className,
}: {
  children: ReactNode;
  /** Off when a ruled list follows directly, so the two lines do not stack. */
  ruled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between',
        ruled && 'border-b border-hairline pb-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * For `Tabs` in a toolbar: hugs its tabs, scrolls sideways rather than
 * squashing them, and keeps a 44px target on touch screens.
 */
export const adminTabsClass =
  'u-no-scrollbar self-start max-w-full overflow-x-auto *:min-h-11 *:shrink-0 pointer-fine:*:min-h-10';

/** A tab's text and its count. */
export function AdminTabLabel({ text, count, active }: { text: string; count?: number; active: boolean }) {
  return (
    <>
      {text}
      {count !== undefined && (
        <Badge tone={active ? 'brand' : 'neutral'} data-numeric>
          {count}
        </Badge>
      )}
    </>
  );
}

/** A titled block within a page — a serif heading and a muted line under it. */
export function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-(--section-gap)', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="u-display text-2xl text-ink">{title}</h2>
          {description && <p className="mt-1.5 max-w-xl text-sm text-ink-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Rows separated by hairlines, ruled top and bottom — the admin's list. */
export const adminListClass = 'divide-y divide-hairline border-y border-hairline';

/** A row that is one link: hover tints it, and the arrow nudges. */
export const adminRowLinkClass =
  'group relative transition-colors duration-150 hover:bg-surface-sunken focus-within:bg-surface-sunken';

/** Small uppercase term over its value. The parent is a `<dl>`. */
export function AdminFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wider text-ink-subtle uppercase">{term}</dt>
      <dd className="mt-1 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

export type AdminStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'suspended'
  | 'edited'
  | 'active'
  | 'archived'
  | 'flagged'
  | 'admin';

const STATUS: Record<AdminStatus, { label: string; tone: Parameters<typeof Badge>[0]['tone']; icon: ReactNode }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: <FilePen className="size-3.5" aria-hidden="true" /> },
  pending_review: { label: 'Pending', tone: 'warning', icon: <Clock className="size-3.5" aria-hidden="true" /> },
  published: { label: 'Published', tone: 'success', icon: <CheckCircle2 className="size-3.5" aria-hidden="true" /> },
  suspended: { label: 'Suspended', tone: 'danger', icon: <Ban className="size-3.5" aria-hidden="true" /> },
  edited: { label: 'Edited', tone: 'brand', icon: <PencilLine className="size-3.5" aria-hidden="true" /> },
  active: { label: 'Active', tone: 'success', icon: <CheckCircle2 className="size-3.5" aria-hidden="true" /> },
  archived: { label: 'Archived', tone: 'warning', icon: <Archive className="size-3.5" aria-hidden="true" /> },
  flagged: { label: 'Flagged', tone: 'warning', icon: <Flag className="size-3.5" aria-hidden="true" /> },
  admin: { label: 'Administrator', tone: 'brand', icon: <ShieldCheck className="size-3.5" aria-hidden="true" /> },
};

/** A status as a word and an icon, never colour alone. */
export function AdminStatusBadge({ status, label }: { status: AdminStatus; label?: string }) {
  const meta = STATUS[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon} className="shrink-0">
      {label ?? meta.label}
    </Badge>
  );
}

/** Previous / next with the page between them. Renders nothing for one page. */
export function AdminPagination({
  page,
  pages,
  onPage,
  previousLabel = 'Previous',
  nextLabel = 'Next',
}: {
  page: number;
  pages: number;
  onPage: (next: number) => void;
  previousLabel?: string;
  nextLabel?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
      <p className="text-sm text-ink-muted" data-numeric>
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
          {previousLabel}
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
