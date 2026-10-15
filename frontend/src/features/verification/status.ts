import type { IdDeclinedDetails } from '@contracts/verification';
import type { AuthUser } from '@/features/auth/types';
import type { StorageLike } from '@/features/auth/session-cache';
import { withNextParam } from '@/lib/return-path';

/**
 * Where an account stands on ID verification (ADR 0057), as plain logic: the
 * test environment has no DOM (ADR 0031), so storage is a parameter.
 */

/** Where an account sends, and resends, its ID. */
export const ID_STEP_PATH = '/welcome/id';

/** The question after the ID step: hire, or offer creative work. */
export const INTENT_PATH = '/welcome';

/**
 * Where registration goes (plan 0053 Step 5.2): the ID step, then the intent
 * question, then wherever the person was going. Carried as a `next` inside a
 * `next`, so the ID step itself needs no notion of registration: after a
 * submission it leaves for its `next`, which is the intent question here and,
 * after a *try again*, wherever the person was.
 */
export function afterRegistrationPath(next: string | null | undefined): string {
  return withNextParam(ID_STEP_PATH, withNextParam(INTENT_PATH, next));
}

/**
 * Where signing in goes for an account that still owes its ID: the ID step,
 * keeping where the person was going. The sign-in screen's own default, `/`,
 * is not a destination, so the ID step keeps its default instead.
 */
export function idStepPathFor(next: string): string {
  return withNextParam(ID_STEP_PATH, next === '/' ? null : next);
}

/** Whether the ID step is part of registration: it leads on to the intent question. */
export function inRegistrationFlow(next: string): boolean {
  const path = next.split(/[?#]/, 1)[0];
  return path === INTENT_PATH;
}

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
  const { kind, reason, appealUntil } = value as Partial<IdDeclinedDetails>;
  return (
    (kind === 'retry' || kind === 'final' || kind === 'appealed')
    && (reason === null || typeof reason === 'string')
    && (appealUntil === undefined || typeof appealUntil === 'string')
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

/* --- "Your ID is verified" (ADR 0057) ------------------------------------- */

/** How long after the decision the account is told its ID is verified. */
export const VERIFIED_NOTICE_MS = 7 * 24 * 60 * 60 * 1000;

const VERIFIED_SEEN_KEY = 'bilikha:id-verified-seen';

/**
 * Which decision a closed notice was for: the account and the moment it was
 * verified. A later verification — after a changed decision — is a new one.
 */
export function verifiedNoticeKey(user: AuthUser | null | undefined): string | null {
  const verification = user?.idVerification;
  if (!user || verification?.status !== 'verified' || !verification.decidedAt) return null;
  return `${user.id}:${verification.decidedAt}`;
}

/**
 * Whether to say "your ID is verified": a verified ID, decided within the last
 * 7 days, not yet closed on this device. Never for an account that needed no
 * verification, and never from an API too old to say when it was decided.
 */
export function showVerifiedNotice(
  user: AuthUser | null | undefined,
  seen: string | null,
  now: Date = new Date(),
): boolean {
  const key = verifiedNoticeKey(user);
  if (!key || key === seen) return false;
  const decidedAt = new Date(user!.idVerification!.decidedAt!).getTime();
  if (Number.isNaN(decidedAt)) return false;
  return now.getTime() - decidedAt < VERIFIED_NOTICE_MS;
}

function localStore(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The notice last closed on this device, if any. */
export function readVerifiedSeen(store: StorageLike | null = localStore()): string | null {
  if (!store) return null;
  try {
    return store.getItem(VERIFIED_SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Remembers a closed notice on this device. A convenience only: where storage
 * is unavailable, the notice closes for this visit and the 7 days still end it.
 */
export function rememberVerifiedSeen(key: string, store: StorageLike | null = localStore()): void {
  if (!store) return;
  try {
    store.setItem(VERIFIED_SEEN_KEY, key);
  } catch {
    // Closed for this visit; the 7 days end it anyway.
  }
}

/** The appeal message's length, as the API checks it (plan 0053 Step 4.2). */
export const APPEAL_MIN = 20;
export const APPEAL_MAX = 1000;

/**
 * Until when this decline can be appealed, or null: only a *not from Biliran*
 * decline whose window the server gave, and only until it closes.
 */
export function appealOpenUntil(notice: IdDeclinedDetails | null, now: Date = new Date()): Date | null {
  if (!notice || notice.kind !== 'final' || !notice.appealUntil) return null;
  const until = new Date(notice.appealUntil);
  return Number.isNaN(until.getTime()) || until.getTime() <= now.getTime() ? null : until;
}

/** What is missing before an appeal can be sent, or null when nothing is. */
export function appealFormProblem(form: {
  username: string;
  password: string;
  message: string;
}): 'needsCredentials' | 'tooShort' | null {
  if (!form.username.trim() || !form.password) return 'needsCredentials';
  if (form.message.trim().length < APPEAL_MIN) return 'tooShort';
  return null;
}
