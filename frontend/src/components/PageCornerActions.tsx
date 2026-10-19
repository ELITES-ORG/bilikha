import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2 } from 'lucide-react';
import { useToast } from '@/components/ui';
import { canGoBackInApp } from '@/lib/history';

/**
 * A button over a photo or the navy cover band: the icon alone, white, with a
 * dark outline around its strokes so it still reads on a bright photo. The scrim
 * colour is always dark, so this holds in both themes. The button keeps its
 * 44px tap area; only the box around the icon is gone.
 */
export const onPhotoButtonClass =
  'interactive-press grid size-11 place-items-center rounded-sm text-on-primary on-photo-outline';

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
      <button type="button" aria-label="Back" className={onPhotoButtonClass} onClick={() => void navigate(-1)}>
        <ArrowLeft className="size-6" aria-hidden="true" />
      </button>
    );
  }
  return (
    <Link to="/directory" aria-label="Back" className={onPhotoButtonClass}>
      <ArrowLeft className="size-6" aria-hidden="true" />
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
      className={onPhotoButtonClass}
      onClick={() => void share()}
    >
      <Share2 className="size-6" aria-hidden="true" />
    </button>
  );
}
