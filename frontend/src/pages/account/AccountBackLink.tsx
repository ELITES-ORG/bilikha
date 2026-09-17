import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/** In-page back to the account hub — the Profile tab also lands on /account. */
export function AccountBackLink() {
  return (
    <Link
      to="/account"
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Account
    </Link>
  );
}
