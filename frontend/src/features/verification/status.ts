import type { IdDeclinedDetails } from '@contracts/verification';
import type { AuthUser } from '@/features/auth/types';
import type { StorageLike } from '@/features/auth/session-cache';

/**
 * Where an account stands on ID verification (ADR 0057), as plain logic: the
 * test environment has no DOM (ADR 0031), so storage is a parameter.
 */

/** Where an account sends, and resends, its ID. */
export const ID_STEP_PATH = '/welcome/id';

/** The account still owes its ID: not yet sent, or sent back to try again. */
export function needsIdStep(user: AuthUser | null | undefined): boolean {
  const verification = user?.idVerification;
  if (!verification) return false;
  return (
    (verification.status === 'pending' && !verification.submitted)
    || verification.status === 'declined_retry'
  );
}

/**
 * Browse only: everything that changes something is refused by the server
 * until the ID is verified. No verification at all — every account that
 * existed before this shipped — is never browse-only.
 */
export function isBrowseOnly(user: AuthUser | null | undefined): boolean {
  const status = user?.idVerification?.status;
  return status === 'pending' || status === 'declined_retry';
}

const NOTICE_KEY = 'bilikha:decline-notice';

function defaultStore(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isNotice(value: unknown): value is IdDeclinedDetails {
  if (!value || typeof value !== 'object') return false;
  const { kind, reason } = value as Partial<IdDeclinedDetails>;
  return (
    (kind === 'retry' || kind === 'final' || kind === 'appealed')
    && (reason === null || typeof reason === 'string')
  );
}

/** Kept for the sign-in screen, which the page reload after a decline lands on. */
export function storeDeclineNotice(details: unknown, store: StorageLike | null = defaultStore()): void {
  if (!store || !isNotice(details)) return;
  try {
    store.setItem(NOTICE_KEY, JSON.stringify(details));
  } catch {
    // The sign-in screen says nothing extra; signing in again will.
  }
}

/**
 * The notice the last decline left, if any. Reading does not remove it: React
 * may run a state initializer twice in development, so the sign-in screen reads
 * here and clears in an effect.
 */
export function readDeclineNotice(store: StorageLike | null = defaultStore()): IdDeclinedDetails | null {
  if (!store) return null;
  try {
    const raw = store.getItem(NOTICE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isNotice(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Shown once: cleared after the sign-in screen has read it. */
export function clearDeclineNotice(store: StorageLike | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(NOTICE_KEY);
  } catch {
    // It stays until the tab closes; showing it twice is harmless.
  }
}
