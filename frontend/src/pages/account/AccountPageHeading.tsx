import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * One row: back to the hub, and the page title.
 *
 * A separate back link above a display-sized heading spent three rows and most
 * of the top of a phone screen saying where you are. Folding them together is
 * the app-bar shape people already know from their phone.
 *
 * The chevron is its own link with its own label rather than wrapping the
 * title, because a link whose visible text is "Profile" but which navigates to
 * the account hub reads as a mistake to anyone using a screen reader. The title
 * stays an h1 so the page keeps a heading.
 */
export function AccountPageHeading({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link
        to="/account"
        viewTransition
        aria-label="Back to account"
        className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors hover:text-ink"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <h1 className="u-display min-w-0 truncate text-2xl text-ink">{title}</h1>
    </div>
  );
}
