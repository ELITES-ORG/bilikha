/**
 * The empty and error states of the account pages, in English (ADR 0055, plan 0059).
 *
 * Kept out of `../en.ts` because only these lazy pages use the strings: they
 * travel in the pages' chunk, so a visitor who never opens them never
 * downloads them (constraint 3). `./index.ts` registers them, and
 * each page under `pages/account/` imports it.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enAccount = {
  'account.error.account': 'Could not load your account',
  'account.error.work': 'Could not load how your work is doing',
  'account.error.profile': 'Could not load your profile',
  'account.work.noOffers': 'No offers yet — clients cannot hire what they cannot see priced.',
  'account.work.noInquiries': 'No inquiries yet — when a client contacts you, the thread lands in Messages.',
  'account.work.noAgreements': 'No work agreements yet — they appear here once you issue one from a conversation.',
  'account.work.noMoney': 'Nothing agreed yet — the figure here is what you and a client put in writing, not what changed hands.',
  'account.work.noRatings': 'No ratings yet — they appear after a completed engagement.',
} as const;

export type AccountKey = keyof typeof enAccount;
