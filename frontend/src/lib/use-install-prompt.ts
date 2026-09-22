import { useEffect, useState } from 'react';

/**
 * Holds the browser's install prompt so a button in the page can open it.
 *
 * The event fires once, early, and only when the browser considers the site
 * installable — so it has to be caught and kept rather than asked for on click.
 *
 * What this cannot do, on any browser: install silently. `prompt()` opens the
 * browser's own dialog and the person still chooses. That boundary is the
 * reason a website cannot put itself on your home screen, and it is not a gap
 * to be worked around.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      // Without this the browser shows its own mini-infobar instead, and the
      // page never gets the chance to ask at a sensible moment.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setEvent(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!event) return 'unavailable';
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // The event is single-use; a dismissed prompt cannot be reopened from the
      // same one, and the browser fires a fresh event when it is ready to ask
      // again.
      setEvent(null);
      return outcome;
    } catch {
      setEvent(null);
      return 'unavailable';
    }
  }

  return { canInstall: event !== null, installed, install };
}
