/**
 * Shared facts for the privacy notice and the terms of use.
 *
 * These live in one place because both documents cite them and because a date
 * or an address that disagrees between the two pages is worse than not having
 * one — a reader who spots the mismatch stops trusting either.
 */

/**
 * Who operates the registry: the personal information controller under
 * RA 10173. The province funds and runs Bilikha; Elites builds and maintains
 * the software for it. Named by the privacy notice and the site footer.
 */
export const LEGAL_OPERATOR = 'Provincial Government of Biliran';

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
export const LEGAL_LAST_UPDATED = '13 October 2026';

/**
 * Mirrors `CONSENT_VERSION` in `backend/src/modules/auth/auth.service.ts`,
 * which is stamped on every account at registration. Keep the two equal.
 *
 * 2026-09-15 stood while the documents described what the service had done
 * since launch. It moved to 2026-10-11 when the privacy notice began naming
 * Sentry and the transfer of error reports to the United States: processing
 * that started after the earlier version, so an account registered before it
 * agreed to a notice without them, and its stored version says so.
 * It moved to 2026-10-13 when the terms began listing audio, video and PDF on
 * offers, and saying uploads must be the uploader's own work or theirs to share.
 */
export const CONSENT_VERSION = '2026-10-13';
