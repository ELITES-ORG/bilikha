import type { AuthUser } from './types';

/**
 * The last session this device saw, kept so the app can paint before the server
 * answers.
 *
 * **This is a hint about what to draw first, never a decision about what
 * somebody may see.** Every request is still authorised on the server; a
 * tampered entry here buys a shell and a row of 401s. The moment `/auth/me`
 * answers, its word replaces this one, including when its word is "nobody".
 * `RequireAdmin` does not accept the hint at all.
 *
 * Why it exists: the API sleeps on its free tier and takes about a minute to
 * wake, and the app used to render nothing at all for the whole of that wait.
 * Even awake, it is a round trip over mobile data (constraint 3). A returning
 * creative already knows they are signed in; the app should not need to ask
 * permission to believe them.
 *
 * The store is a parameter so the logic can be tested as logic — the test
 * environment is `node` with no DOM on purpose (ADR 0031), and reaching for
 * jsdom to test six lines of JSON handling would be the wrong trade.
 */

const KEY = 'bilikha:last-session';

/** Bumped when `AuthUser` changes shape, so an old entry is ignored rather than
 *  rendered half-populated. */
const VERSION = 1;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Stored {
  v: number;
  user: AuthUser | null;
}

/** Null when there is no usable storage: no DOM, private mode, blocked cookies. */
function defaultStore(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * `undefined` means "no hint" and is not the same as a stored `null`, which is
 * a remembered signed-out state and is worth painting immediately.
 */
export function readLastSession(store: StorageLike | null = defaultStore()): AuthUser | null | undefined {
  if (!store) return undefined;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || parsed.v !== VERSION || !('user' in parsed)) return undefined;
    return parsed.user;
  } catch {
    // Unparseable, or hand-edited. "No hint" is the old behaviour and is safe.
    return undefined;
  }
}

export function writeLastSession(
  user: AuthUser | null,
  store: StorageLike | null = defaultStore(),
): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ v: VERSION, user } satisfies Stored));
  } catch {
    // Not being able to remember costs a loading state next time, nothing more.
  }
}

/**
 * Called on sign-out. Leaving a name and photo on a shared phone after somebody
 * signs out is its own small betrayal, separate from anything about auth.
 */
export function clearLastSession(store: StorageLike | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing to do; the entry is only ever a hint.
  }
}
