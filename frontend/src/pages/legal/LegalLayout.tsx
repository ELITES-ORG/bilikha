import { Children, isValidElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { transitionTo } from '@/components/page-transition/transition-to';
import type { MessageKey } from '@/i18n/catalogs/en';
// Registers the legal strings. They load with these pages, not on every first
// visit, and are in place before either page renders (ADR 0055).
import '@/i18n/catalogs/legal';
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
 * someone deciding whether to hand over their phone number. A comfortable
 * measure and generous leading beat anything decorative. The text keeps its
 * reading width at every size; on a wide screen the margin beside it holds the
 * list of sections, so a reader can go straight to the one they came for.
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
  // The sections, read off the page itself, so the list cannot drift from it.
  const sections = Children.toArray(children)
    .filter((child) => isValidElement<{ titleKey: MessageKey }>(child) && child.type === LegalSection)
    .map((child) => (child as { props: { titleKey: MessageKey } }).props.titleKey);

  return (
    <div className="bg-paper">
      <main className={pbBottomNav}>
        {/* Below lg: the reading column alone, as before. From lg: the list of
            sections in the margin, and the same reading column beside it. */}
        <div className="mx-auto w-full px-(--gutter) py-(--section-gap) lg:grid lg:max-w-[calc(var(--container-prose)+16rem)] lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-16">
          <nav aria-labelledby="legal-contents" className="hidden lg:block">
            <div className="sticky top-[calc(var(--staging-banner-h)+5.5rem)]">
              <p id="legal-contents" className="u-eyebrow">
                <LegalText k="legal.onThisPage" />
              </p>
              <ol className="mt-4 space-y-2.5 border-l border-hairline text-sm">
                {sections.map((key) => (
                  <li key={key}>
                    <a
                      href={`#${sectionId(key)}`}
                      className="-ml-px block border-l border-transparent pl-4 text-ink-muted transition-colors hover:border-navy-600 hover:text-ink"
                    >
                      <LegalText k={key} />
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          {/* The reading measure as before: the prose width less its gutters, which the wrapper now holds. */}
          <div className="mx-auto w-full max-w-[calc(var(--container-prose)-2*var(--gutter))] lg:mx-0">
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
          </div>
        </div>
      </main>
    </div>
  );
}

/** The anchor a section is reached by: `privacy.id.heading` is `#privacy-id`. */
function sectionId(titleKey: MessageKey): string {
  return titleKey.replace(/\.heading$/, '').replace(/\./g, '-');
}

/** One numbered section. The heading is what a person scans for. */
export function LegalSection({ titleKey, children }: { titleKey: MessageKey; children?: ReactNode }) {
  const { message } = useI18n();
  const title = message(titleKey);

  return (
    // Lands below the sticky header when reached from the list of sections.
    <section id={sectionId(titleKey)} className="scroll-mt-[calc(var(--staging-banner-h)+5.5rem)]">
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
