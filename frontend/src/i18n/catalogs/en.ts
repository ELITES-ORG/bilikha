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
import type { OrganizationsKey } from './organizations/en';

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

  'directory.search.label': 'Search the directory',
  'directory.search.placeholder': 'Search by craft, name, or town',
  'directory.search.submit': 'Search',
  'directory.search.clear': 'Clear search',
  'directory.search.emptyTitle': 'No matches for your search',
  'directory.search.emptyDescription':
    'Check the spelling, try a shorter word, or browse by domain.',
  'directory.search.tryCreatives': 'Search creatives instead',
  'directory.search.tryOffers': 'Search offers instead',
  'directory.search.postingsNote':
    'Search covers offers and creatives. Client postings are not searched yet.',
  'directory.search.clearFilters': 'Clear filters',

  // Organisations — teams of creatives (ADR 0054). Only what screens outside
  // the organisation pages show: role and status labels, the account card, the
  // directory section. The pages' own strings are in `./organizations/`.
  // Sentences are whole, never a name glued between fragments, so a translator
  // can keep their own word order.
  'organizations.role.founder': 'Founder',
  'organizations.role.coFounder': 'Co-founder',
  'organizations.role.member': 'Member',
  'organizations.status.pendingReview': 'Waiting for review',
  'organizations.status.published': 'Public',
  'organizations.status.rejected': 'Needs changes',
  'organizations.status.suspended': 'Taken down',
  'organizations.account.heading': 'Organisations',
  'organizations.account.empty':
    'Creatives who work as a team can share one page. Found one, or ask its founder to invite you.',
  'organizations.account.found': 'Found an organisation',
  'organizations.account.invitation': 'Invitation',
  'organizations.account.invitedBy': 'Invited by',
  'organizations.account.accept': 'Accept',
  'organizations.account.decline': 'Decline',
  'organizations.account.answering': 'Answering…',
  'organizations.account.accepted': 'You joined the organisation',
  'organizations.account.declined': 'Invitation declined',
  'organizations.directory.heading': 'Organisations',
  'organizations.directory.intro': 'Teams of creatives. Each member also has their own profile.',
  'organizations.directory.members': 'Members:',
} as const;

/**
 * Every key the app may ask for: this file's and every lazy route's. The
 * import above is type-only, so naming the legal keys here costs no bytes —
 * their strings stay in the legal pages' chunk.
 */
export type MessageKey = keyof typeof en | LegalKey | OrganizationsKey;

export type Catalog = Readonly<Partial<Record<MessageKey, string>>>;
