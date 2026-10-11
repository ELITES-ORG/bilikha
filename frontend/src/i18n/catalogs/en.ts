/**
 * The English catalogue — the source of truth and the fallback (ADR 0055).
 *
 * Bundled rather than fetched, because this *is* the interface text: moving a
 * string out of a component and into here moves bytes rather than adding
 * them. Every other language is a dynamic import, so an English-only visitor
 * downloads nothing extra (constraint 3).
 *
 * Only screens in the first-load bundle keep their strings here. A screen that
 * is a lazy route keeps its English in its own folder, so it loads with the
 * route instead of on every first visit — the legal pages' strings are in
 * `legal/`, and `../sections.ts` explains how they are registered.
 *
 * Keys are dotted and named for where the string appears, not for what it
 * says, so rewording the copy never means renaming the key.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` with an empty
 * value. `catalogs.test.ts` fails if you forget.
 */
import type { LegalKey } from './legal/en';

export const en = {
  'signIn.eyebrow': 'Welcome back',
  'signIn.heading': 'Sign in',
  'signIn.intro': 'Use the username and password you chose at registration.',
  'signIn.username': 'Username',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.register': 'Register',
  'signIn.noSelfService':
    'Forgotten your password? An administrator must reset it — there is no self-service reset in this release.',

  'account.language.label': 'Language',
  'account.language.description':
    'Changes the interface on this device. Not everything is translated yet.',
} as const;

/**
 * Every key the app may ask for: this file's and every lazy route's. The
 * import above is type-only, so naming the legal keys here costs no bytes —
 * their strings stay in the legal pages' chunk.
 */
export type MessageKey = keyof typeof en | LegalKey;

export type Catalog = Readonly<Partial<Record<MessageKey, string>>>;
