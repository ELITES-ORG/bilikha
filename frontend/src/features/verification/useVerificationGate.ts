import { useCurrentUser } from '@/features/auth/api';
import { useI18n, type ResolvedMessage } from '@/i18n/i18n-context';
import { isBrowseOnly } from './status';

/**
 * Whether this account may only browse until its ID is verified (ADR 0057),
 * and the sentence that says so. The server refuses the actions regardless;
 * this is what lets a screen explain itself instead of failing on a 403.
 */
export function useVerificationGate(): { browseOnly: boolean; explain: ResolvedMessage } {
  const { data: user } = useCurrentUser();
  const { message } = useI18n();
  return { browseOnly: isBrowseOnly(user), explain: message('verification.pending.explain') };
}
