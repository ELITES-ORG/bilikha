/**
 * Shared facts for the privacy notice and the terms of use.
 *
 * These live in one place because both documents cite them and because a date
 * or an address that disagrees between the two pages is worse than not having
 * one — a reader who spots the mismatch stops trusting either.
 */

/**
 * Where a person writes to exercise a right under RA 10173, or to reach
 * whoever runs the registry.
 *
 * **This is null until a real inbox exists.** Both pages then say plainly that
 * the address is being set up rather than printing one that bounces, because a
 * privacy notice naming an unmonitored address is a worse failure than one
 * admitting the channel is not ready: the first looks answered, the second
 * looks unfinished, and only the second is true.
 *
 * Set it to the address and both pages complete themselves.
 */
export const LEGAL_CONTACT: string | null = null;

/**
 * When these documents were last changed. Shown on both pages: a notice with no
 * date cannot be checked against what a person agreed to.
 */
export const LEGAL_LAST_UPDATED = '22 September 2026';

/**
 * Mirrors `CONSENT_VERSION` in `backend/src/modules/auth/auth.service.ts`,
 * which is stamped on every account at registration. Kept deliberately equal:
 * these documents describe what the service has done since that date rather
 * than introducing new terms, so bumping it — and with it every stored consent
 * record — would misstate what happened.
 */
export const CONSENT_VERSION = '2026-09-15';
