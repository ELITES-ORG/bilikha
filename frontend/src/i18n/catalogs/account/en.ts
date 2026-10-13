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
} as const;

export type AccountKey = keyof typeof enAccount;
