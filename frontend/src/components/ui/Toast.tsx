import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { bottomAboveNav } from '@/lib/bottom-nav';
import { ToastContext, type ToastApi } from './toast-context';

type ToastTone = 'pending' | 'success' | 'error';

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

/**
 * Pending toasts are dismissed by the work finishing, not by a clock. Errors
 * linger far longer than successes: a success only confirms what you just did,
 * an error has to be read and often acted on.
 */
const DISMISS_AFTER_MS: Record<ToastTone, number | null> = {
  pending: null,
  success: 4000,
  error: 9000,
};

// Complete literals, never interpolated — an interpolated Tailwind class
// generates no CSS and fails silently. Tones match the inline confirmation and
// error styles already used in the account forms.
const TONE_STYLES: Record<ToastTone, string> = {
  pending: 'border-hairline-strong bg-surface text-ink',
  success: 'border-success-100 bg-success-50 text-success-700',
  error: 'border-danger-100 bg-danger-50 text-danger-700',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, tone: ToastTone) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.delete(id);

      const after = DISMISS_AFTER_MS[tone];
      if (after == null) return;
      timers.current.set(id, setTimeout(() => dismiss(id), after));
    },
    [dismiss],
  );

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current, { id, tone, message }]);
      schedule(id, tone);
      return id;
    },
    [schedule],
  );

  const settle = useCallback(
    (id: number, tone: ToastTone, message: string) => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, tone, message } : toast)),
      );
      schedule(id, tone);
    },
    [schedule],
  );

  // Timers outlive the component if a toast is showing at unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => {
        push('success', message);
      },
      error: (message) => {
        push('error', message);
      },
      async run(pendingMessage, work, options) {
        const id = push('pending', pendingMessage);
        try {
          const result = await work();
          settle(id, 'success', options?.success ?? 'Done');
          return result;
        } catch (error) {
          const message = options?.error
            ? options.error(error)
            : error instanceof Error
              ? error.message
              : 'Something went wrong.';
          settle(id, 'error', message);
          throw error;
        }
      },
    }),
    [push, settle],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    // Bottom on phones, where it is within thumb reach and clear of the header.
    // pointer-events-none on the stack so the empty area never blocks the page.
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 p-4',
        bottomAboveNav,
        'sm:inset-x-auto sm:right-0 sm:items-end',
      )}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      // Errors interrupt; progress and confirmation do not.
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'anim-rise-in pointer-events-auto flex w-full max-w-sm items-start gap-3',
        'rounded-md border px-4 py-3 text-sm shadow-md',
        TONE_STYLES[toast.tone],
      )}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {toast.tone === 'pending' && <LoaderCircle className="anim-spin size-4" />}
        {toast.tone === 'success' && <Check className="size-4" />}
        {toast.tone === 'error' && <TriangleAlert className="size-4" />}
      </span>

      <p className="flex-1 text-pretty">{toast.message}</p>

      {toast.tone !== 'pending' && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="-mr-1 shrink-0 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lawa-100"
          style={{ transitionDuration: 'var(--duration-fast)' }}
          aria-label="Dismiss notification"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
