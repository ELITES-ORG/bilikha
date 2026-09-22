import { useCallback, useState, useSyncExternalStore } from 'react';
import { installPromptStore } from '@/lib/install-prompt-store';

/**
 * Reads the install offer that `install-prompt-store` caught at startup.
 *
 * The listener deliberately does **not** live here: this hook is used from a
 * lazily-loaded route, and `beforeinstallprompt` fires long before that chunk
 * mounts. Subscribing to a store that has been listening since the first script
 * ran is the difference between the button appearing and not.
 *
 * What this cannot do, on any browser: install silently. `prompt()` opens the
 * browser's own dialog and the person still chooses. That boundary is why a
 * website cannot put itself on your home screen, and is not a gap to work
 * around.
 */
export function useInstallPrompt() {
  const pending = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.getPending,
    () => null,
  );
  const installed = useSyncExternalStore(
    installPromptStore.subscribe,
    installPromptStore.isInstalled,
    () => false,
  );

  /** Set when the browser's dialog was opened and not accepted. */
  const [declined, setDeclined] = useState(false);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const event = installPromptStore.getPending();
    if (!event) return 'unavailable';
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      installPromptStore.clearPending();
      setDeclined(outcome !== 'accepted');
      return outcome;
    } catch {
      installPromptStore.clearPending();
      setDeclined(true);
      return 'unavailable';
    }
  }, []);

  return { canInstall: pending !== null, installed, declined, install };
}
