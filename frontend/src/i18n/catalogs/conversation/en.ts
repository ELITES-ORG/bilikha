/**
 * The error state of a conversation, in English (ADR 0055, plan 0059).
 *
 * Kept out of `../en.ts` because only this lazy page uses the strings: they
 * travel in the page's chunk, so a visitor who never opens it never
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
