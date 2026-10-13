/**
 * The empty and error states of a conversation, in English (ADR 0055, plan 0059).
 *
 * Kept out of `../en.ts` because only these lazy pages use the strings: they
 * travel in the pages' chunk, so a visitor who never opens them never
 * downloads them (constraint 3). `./index.ts` registers them, and
 * `pages/ConversationPage.tsx` imports it.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enConversation = {
  'conversation.error.title': 'Could not load this conversation',
  'conversation.error.back': 'Back to messages',
} as const;

export type ConversationKey = keyof typeof enConversation;
