/**
 * Catches the browser's install offer the instant it arrives.
 *
 * `beforeinstallprompt` fires once, early, and only once per page load. The
 * listener used to live in a `useEffect` inside `InstallGuide`, which is
 * rendered by `AccountPage` — a lazily-loaded route chunk (plan 0031). So
 * nothing was listening until that chunk had downloaded and mounted, by which
 * time the event had usually already fired and been lost. The Install button
 * then silently fell back to "How to install", intermittently, depending on
 * whether the browser happened to be slower than the chunk.
 *
 * This module is imported from `main.tsx` so the listener is attached during
 * the first script evaluation, before React renders anything. The event is kept
 * here and handed to whichever component asks for it, whenever it mounts.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Remembers an install across reloads: a browser tab cannot otherwise tell. */
const INSTALLED_KEY = 'bilikha:installed';

let pending: BeforeInstallPromptEvent | null = null;
let installed = readInstalled();
const listeners = new Set<() => void>();

function readInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberInstalled(value: boolean): void {
  try {
    if (value) localStorage.setItem(INSTALLED_KEY, 'yes');
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // Only affects whether the row reappears; nothing depends on it.
  }
}

function announce(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this the browser shows its own mini-infobar and the page never
    // gets to ask at a sensible moment.
    event.preventDefault();
    pending = event as BeforeInstallPromptEvent;
    // The browser only offers when the app is not installed, so an offer is
    // also the most reliable signal that a remembered install is out of date —
    // somebody uninstalled it.
    if (installed) {
      installed = false;
      rememberInstalled(false);
    }
    announce();
  });

  window.addEventListener('appinstalled', () => {
    pending = null;
    installed = true;
    rememberInstalled(true);
    announce();
  });
}

export const installPromptStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getPending: (): BeforeInstallPromptEvent | null => pending,
  isInstalled: (): boolean => installed,
  /** Called after a prompt is spent — it cannot be reopened from the same event. */
  clearPending(): void {
    pending = null;
    announce();
  },
};
