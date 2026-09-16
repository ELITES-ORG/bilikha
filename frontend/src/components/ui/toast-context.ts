import { createContext, useContext } from 'react';

/**
 * Split from Toast.tsx so that file exports only components, which is what
 * keeps fast refresh working — the same reason button-styles.ts is separate
 * from Button.tsx.
 */
export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  /**
   * Shows a pending toast, then turns it into a success or an error when the
   * work settles. One call site covers all three states, which is what keeps
   * them from drifting apart. Re-throws, so callers can still handle failure.
   */
  run: <T>(
    pendingMessage: string,
    work: () => Promise<T>,
    options?: { success?: string; error?: (error: unknown) => string },
  ) => Promise<T>;
};

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a <ToastProvider>');
  return api;
}
