import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2 } from 'lucide-react';
import { useToast } from '@/components/ui';
import { canGoBackInApp } from '@/lib/history';

/** White pill over a photo or the navy cover band. */
const pillClass =
  'interactive-press inline-flex h-11 items-center gap-1.5 rounded-sm bg-surface px-4 text-sm font-semibold text-ink shadow-sm';

/**
 * Back from a page people often open from a shared link. With in-app history
 * it goes back; opened directly, it goes to the directory rather than out of
 * Bilikha to wherever the link was tapped.
 */
export function BackPill() {
  const navigate = useNavigate();
  // Subscribes to navigation, so the history state below is re-read on each.
  useLocation();

  if (canGoBackInApp(window.history.state)) {
    return (
      <button type="button" className={pillClass} onClick={() => void navigate(-1)}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </button>
    );
  }
  return (
    <Link to="/directory" className={pillClass}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back
    </Link>
  );
}

/**
 * Shares the current URL: the system share sheet where there is one, the
 * clipboard otherwise.
 */
export function ShareButton({ title, label }: { title: string; label: string }) {
  const toast = useToast();

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      // Dismissing the share sheet rejects; that is not an error to report.
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  return (
    <button
      type="button"
      aria-label={label}
      className="interactive-press grid size-11 place-items-center rounded-sm bg-surface text-ink shadow-sm hover:text-lawa-700"
      onClick={() => void share()}
    >
      <Share2 className="size-5" aria-hidden="true" />
    </button>
  );
}
