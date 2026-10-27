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
import type { AccountKey } from './account/en';
import type { ConversationKey } from './conversation/en';
import type { LegalKey } from './legal/en';
import type { MessagesKey } from './messages/en';
import type { MyPostingsKey } from './my-postings/en';
import type { OffersKey } from './offers/en';
import type { OrganizationsKey } from './organizations/en';
import type { VerificationKey } from './verification/en';
import type { RegisterKey } from './register/en';

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
  'verification.pending.explain': 'This unlocks once your ID is verified. Until then, you can look around offers and creatives.',
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
  'verification.banner.verified.label': 'ID verified',
  'verification.banner.verified.message': 'Your ID is verified. You can now message creatives, save offers and post work.',
  'verification.banner.verified.dismiss': 'Close',
  'verification.banner.verified.action': 'Set up your creative profile',
  'verification.reasonLabel': 'Reason given:',
  'signIn.declined.retry': 'Your ID could not be verified. Sign in to submit it again.',
  'signIn.declined.final': 'Your ID was declined, so this account cannot be used.',
  'signIn.declined.appealed': 'Your appeal is being reviewed. You can sign in if it is granted.',
  // The one appeal against a *not from Biliran* decline (ADR 0057, plan 0053 Step 4.2).
  'signIn.appeal.until': 'You can appeal this decision once, until',
  'signIn.appeal.open': 'Appeal this decision',
  'signIn.appeal.messageLabel': 'Your appeal',
  'signIn.appeal.messageHint': 'Say why the decision is wrong: for example, that you live in Biliran and how your ID shows it. At least 20 characters.',
  'signIn.appeal.credentials': 'Your appeal is sent with the username and password below, so we know it is yours.',
  'signIn.appeal.needsCredentials': 'Type your username and password below first.',
  'signIn.appeal.tooShort': 'Write at least 20 characters.',
  'signIn.appeal.submit': 'Send appeal',
  'signIn.appeal.cancel': 'Cancel',
  'signIn.appeal.sent': 'Your appeal has been sent. An administrator will look at your ID again; try signing in in a few days. If the appeal is granted, you can sign in.',

  // An offer's audio, video and PDF (ADR 0046): on the offer page, and as a
  // badge on its card.
  'media.listen': 'Listen',
  'media.watch': 'Watch',
  'media.read': 'Read',
  'media.openPdf': 'Open PDF',
  'media.badge.audio': 'Audio',
  'media.badge.video': 'Video',
  'media.badge.document': 'PDF',
  'media.noPoster': 'Video',
  // The conversation list, for a last message with files and no text (ADR 0060)
  'conversations.sent.image': 'Sent a photo',
  'conversations.sent.audio': 'Sent an audio clip',
  'conversations.sent.video': 'Sent a video',
  'conversations.sent.document': 'Sent a PDF',
  'conversations.sent.files': 'Sent {count} files',

  // Empty states on the pages every visitor can load first (plan 0059).
  'common.tryAgain': 'Try again',
  'directory.error.postings': 'Could not load postings',
  'directory.error.offers': 'Could not load offers',
  'directory.error.creatives': 'Could not load creatives',
  'directory.empty.postingsTitle': 'No postings yet',
  'directory.empty.postingsDescription': 'No postings match your sub-domains yet.',
  'directory.empty.offersTitle': 'No offers here yet',
  'directory.empty.offersDescription':
    'No offers match these filters yet — try another filter, or browse creatives.',
  'directory.empty.offersDescriptionGuest': 'Try another filter, or browse creatives instead.',
  'directory.empty.browseCreatives': 'Browse creatives',
  'directory.empty.creativesTitle': 'Nobody listed here yet',
  'directory.empty.creativesDescription':
    'No creatives match these filters yet — try another filter, or browse offers.',
  'directory.empty.creativesInSubdomain': 'This sub-domain has no published creatives yet.',
  'directory.empty.creativesInDomain': 'This domain has no published creatives yet.',
  'directory.empty.creativesInMunicipality': 'No published creatives in that municipality yet.',
  'directory.empty.creativesAnywhere':
    'Published creatives will appear here as the registry grows.',
  'directory.empty.browseOffers': 'Browse offers',
  'offer.gone.title': 'This offer is no longer listed',
  'offer.gone.description':
    'It may have been removed by the creative. Others like it are in the directory.',
  'offer.gone.browse': 'Browse the directory',
  'offer.error.title': 'Could not load this offer',
  'notifications.error.title': 'Could not load notifications',
  'notifications.empty.title': 'Nothing yet',
  'notifications.empty.description':
    'When an administrator reviews your creative profile, or a creative replies to something you posted, it shows up here.',
  'creative.services.emptyTitle': 'No services yet',
  'creative.services.emptyDescription': "{name} hasn't added any services.",
  'creative.portfolio.emptyTitle': 'No portfolio items yet',
  'creative.portfolio.emptyDescription': 'Images added to offers appear here.',
  'messages.pick.title': 'Select a conversation',
  'messages.pick.description': 'Choose a thread on the left to read and reply.',
  'home.domains.errorTitle': 'Could not load the domains',
  'creative.ratings.empty': 'No ratings yet.',
  'creative.reviews.empty': 'No ratings yet. Ratings come from clients who confirmed an engagement complete.',
} as const;

/**
 * Every key the app may ask for: this file's and every lazy route's. The
 * import above is type-only, so naming the legal keys here costs no bytes —
 * their strings stay in the legal pages' chunk.
 */
export type MessageKey =
  | keyof typeof en
  | LegalKey
  | MessagesKey
  | OffersKey
  | OrganizationsKey
  | VerificationKey
  | RegisterKey
  | AccountKey
  | MyPostingsKey
  | ConversationKey;

export type Catalog = Readonly<Partial<Record<MessageKey, string>>>;
