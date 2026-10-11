import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { transitionTo } from '@/components/page-transition/transition-to';
import { Container } from '@/components/ui';
import type { MessageKey } from '@/i18n/catalogs/en';
import { useI18n } from '@/i18n/i18n-context';
import { pbBottomNav } from '@/lib/bottom-nav';
import { LEGAL_CONTACT, LEGAL_LAST_UPDATED } from '@/lib/legal';

/**
 * One catalogue string, marked with the language it is actually written in.
 *
 * Both legal documents are about 130 strings between them, so this keeps each
 * one a single element rather than a hand-written `<span lang>` pair. An
 * untranslated string falls back to English and says so (`lang="en"`), which is
 * what a screen reader picks its voice from (ADR 0055).
 */
export function LegalText({ k }: { k: MessageKey }) {
  const { message } = useI18n();
  const resolved = message(k);
  return <span lang={resolved.lang}>{resolved.text}</span>;
}

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
  titleKey,
  summaryKey,
  other,
  children,
}: {
  titleKey: MessageKey;
  summaryKey: MessageKey;
  other: { to: string; labelKey: MessageKey };
  children: ReactNode;
}) {
  const { message } = useI18n();
  const title = message(titleKey);
  const summary = message(summaryKey);

  return (
    <div className="bg-paper">
      <main className={pbBottomNav}>
        <Container width="prose" className="py-(--section-gap)">
          <h1 lang={title.lang} className="u-display text-3xl text-ink">
            {title.text}
          </h1>
          <p lang={summary.lang} className="mt-3 text-md text-ink-muted">
            {summary.text}
          </p>
          {/*
            The date itself is a constant in lib/legal.ts and stays as written —
            it names when the English documents changed.
          */}
          <p className="mt-2 text-sm text-ink-subtle">
            <LegalText k="legal.lastUpdatedBefore" />
            {LEGAL_LAST_UPDATED}
            <LegalText k="legal.lastUpdatedAfter" />
          </p>

          <div className="mt-10 space-y-8">{children}</div>

          {!LEGAL_CONTACT && (
            <p className="mt-12 border-t border-hairline pt-6 text-sm text-ink-muted">
              <LegalText k="legal.contactPending" />
            </p>
          )}

          <p className="mt-12 border-t border-hairline pt-6 text-sm">
            <Link
              to={other.to}
              className="link-underline text-navy-700"
              onClick={transitionTo('wave')}
            >
              <LegalText k={other.labelKey} />
            </Link>
          </p>
        </Container>
      </main>
    </div>
  );
}

/** One numbered section. The heading is what a person scans for. */
export function LegalSection({ titleKey, children }: { titleKey: MessageKey; children?: ReactNode }) {
  const { message } = useI18n();
  const title = message(titleKey);

  return (
    <section>
      <h2 lang={title.lang} className="u-display text-xl text-ink">
        {title.text}
      </h2>
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
          <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-slate-400" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
