/**
 * The empty states of a client's own postings, in English (ADR 0055, plan 0059).
 *
 * Kept out of `../en.ts` because only this lazy page uses the strings: they
 * travel in the page's chunk, so a visitor who never opens it never
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
