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
import type { VerificationKey } from './verification/en';

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

  // ID verification (ADR 0057). The ID step's own copy is a section of its
  // own (`./verification/`); these show on screens every account can reach.
  'verification.pending.explain': 'You can browse, but not do this until your ID is verified.',
  'verification.banner.missing.label': 'ID needed',
  'verification.banner.missing.message':
    'Add a photo of your Biliran ID to finish registering. Until it is verified you can browse offers and creatives.',
  'verification.banner.missing.action': 'Add your ID',
  'verification.banner.review.label': 'Being verified',
  'verification.banner.review.message':
    'Your registration is being verified. You can browse offers and creatives; everything else unlocks once an administrator checks your ID.',
  'verification.banner.retry.label': 'ID not accepted',
  'verification.banner.retry.message': 'Your ID could not be verified. Submit it again to finish registering.',
  'verification.banner.retry.action': 'Submit your ID again',
  'verification.reasonLabel': 'Reason given:',
  'signIn.declined.retry': 'Your ID could not be verified. Sign in to submit it again.',
  'signIn.declined.final': 'Your ID was declined, so this account cannot be used.',
  'signIn.declined.appealed': 'Your appeal is being reviewed. You can sign in if it is granted.',

  // Where a creative's own offer stands in review (ADR 0058). The detail is
  // the app speaking; an administrator's reason is shown apart from it, under
  // `reasonLabel`, in their own words.
  'offers.review.pending.label': 'Waiting for review',
  'offers.review.pending.detail': 'Clients will see it once an administrator approves it.',
  'offers.review.rejected.label': 'Not approved',
  'offers.review.rejected.detail': 'Edit the offer and save it to send it back for review.',
  'offers.review.changesPending.label': 'Changes waiting for review',
  'offers.review.changesPending.detail':
    'Clients see the approved version until your changes are approved.',
  'offers.review.changesRejected.label': 'Last changes not approved',
  'offers.review.changesRejected.detail':
    'Clients still see the approved version. Edit the offer to try again.',
  'offers.review.live.label': 'Live',
  'offers.review.live.detail': 'Clients can find it in the directory.',
  'offers.review.reasonLabel': 'Reason from the administrator',
} as const;

/**
 * Every key the app may ask for: this file's and every lazy route's. The
 * import above is type-only, so naming the legal keys here costs no bytes —
 * their strings stay in the legal pages' chunk.
 */
export type MessageKey = keyof typeof en | LegalKey | OrganizationsKey | VerificationKey;

export type Catalog = Readonly<Partial<Record<MessageKey, string>>>;
