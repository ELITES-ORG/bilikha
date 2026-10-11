import type { AuthUser } from './types';
import { ID_STEP_PATH, needsIdStep } from '@/features/verification/status';

/** Where RequireAuth sends an account whose password an administrator reset. */
export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * Where a signed-in page must send this account first, or null to render it.
 *
 * Two flows can each claim the whole app — a forced password change (ADR 0051)
 * and an ID still owed (ADR 0057) — and each lives on its own page inside the
 * guard. The password change always wins, and neither redirects from its own
 * page, so they can never send each other round in a loop.
 *
 * The ID step is decided only on a real answer from the server, never on the
 * device's remembered session: a stale hint must not pull someone into a step
 * they have already finished.
 */
export function guardRedirect(
  user: AuthUser,
  pathname: string,
  isPlaceholderData: boolean,
): string | null {
  if (user.mustChangePassword) {
    return pathname === CHANGE_PASSWORD_PATH ? null : CHANGE_PASSWORD_PATH;
  }
  if (!isPlaceholderData && needsIdStep(user) && pathname !== ID_STEP_PATH) {
    return ID_STEP_PATH;
  }
  return null;
}
