/**
 * The empty and error states of a client's own postings, in English (ADR 0055, plan 0059).
 *
 * Kept out of `../en.ts` because only these lazy pages use the strings: they
 * travel in the pages' chunk, so a visitor who never opens them never
 * downloads them (constraint 3). `./index.ts` registers them, and
 * `pages/MyPostingsPage.tsx` imports it.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enMyPostings = {
  'myPostings.post': 'Post work',
  'myPostings.empty.title': 'No postings yet',
  'myPostings.empty.description':
    'Publish work you need done — matching creatives will see it on their Home feed.',
} as const;

export type MyPostingsKey = keyof typeof enMyPostings;
