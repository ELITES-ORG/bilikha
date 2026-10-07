import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface OfferFormDialogProps {
  open: boolean;
  title: string;
  /** While true, Esc and the close button do nothing — a save is in flight. */
  busy: boolean;
  onClose: () => void;
  /** The form. It owns its scrolling body and sticky footer. */
  children: ReactNode;
}

/**
 * Full-screen sheet on a phone, centred panel from `sm`.
 *
 * Deliberately NOT a modal `<dialog>`. A modal dialog sits in the browser's top
 * layer, above every z-index, and this form reports progress and failure
 * through toasts — which would then render underneath it, so a failed save or
 * upload would happen in silence. Instead this portals above the page and the
 * tab bar (z-45) but below the toast region (z-50), and makes the app behind it
 * `inert`, which is what a modal dialog would have bought.
 */
export function OfferFormDialog({ open, title, busy, onClose, children }: OfferFormDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Background, scroll and focus: set once per opening. Create switches the
  // form to edit without closing, so this must not re-run on title changes.
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;

    root?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    panelRef.current
      ?.querySelector<HTMLElement>('input:not([type="file"]), textarea, [role="combobox"]')
      ?.focus();

    return () => {
      root?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      // A listbox inside the form handles its own Escape first.
      if (event.key !== 'Escape' || event.defaultPrevented || busy) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-45 flex items-end justify-center sm:items-center sm:p-6">
      {/* No close on backdrop tap: one stray tap would throw away a half-written offer. */}
      <div className="anim-fade-in absolute inset-0 bg-scrim/70" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-scale-in relative flex h-dvh w-full flex-col bg-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-lg sm:shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-3 sm:px-6">
          <h2 id={titleId} className="u-display text-xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-clay-100 hover:text-ink disabled:opacity-50"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
