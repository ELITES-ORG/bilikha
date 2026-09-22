import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Container } from '@/components/ui';
import { pbBottomNav } from '@/lib/bottom-nav';
import { LEGAL_CONTACT, LEGAL_LAST_UPDATED } from '@/lib/legal';

/**
 * The shell both legal documents sit in.
 *
 * Deliberately plain: these are read once, under mild suspicion, often by
 * someone deciding whether to hand over their phone number. Long measure and
 * generous leading beat anything decorative, and there is nothing to click but
 * the other document.
 *
 * Public. Someone reads these before they have an account, which is the point.
 */
export function LegalLayout({
  title,
  summary,
  other,
  children,
}: {
  title: string;
  summary: string;
  other: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <main className={pbBottomNav}>
        <Container width="prose" className="py-(--section-gap)">
          <h1 className="u-display text-3xl text-ink">{title}</h1>
          <p className="mt-3 text-md text-ink-muted">{summary}</p>
          <p className="mt-2 text-sm text-ink-subtle">
            Last updated {LEGAL_LAST_UPDATED}.
          </p>

          <div className="mt-10 space-y-8">{children}</div>

          {!LEGAL_CONTACT && (
            <p className="mt-12 border-t border-hairline pt-6 text-sm text-ink-muted">
              A contact address for privacy requests is being set up. Until it is
              published here, reach whoever registered you — this notice will not
              name an address that nobody reads.
            </p>
          )}

          <p className="mt-12 border-t border-hairline pt-6 text-sm">
            <Link to={other.to} className="link-underline text-lawa-700">
              {other.label}
            </Link>
          </p>
        </Container>
      </main>
    </div>
  );
}

/** One numbered section. The heading is what a person scans for. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="u-display text-xl text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-md leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

/** A plain list. Used for the field-by-field parts, which are the useful parts. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-2 text-md leading-relaxed text-ink-muted">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-clay-400" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
