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

  // Organisations — teams of creatives (ADR 0054). Sentences are whole, never
  // a name glued between fragments, so a translator can keep their own word order.
  'organizations.role.founder': 'Founder',
  'organizations.role.coFounder': 'Co-founder',
  'organizations.role.member': 'Member',
  'organizations.status.pendingReview': 'Waiting for review',
  'organizations.status.published': 'Public',
  'organizations.status.rejected': 'Needs changes',
  'organizations.status.suspended': 'Taken down',
  'organizations.page.kind': 'Organisation',
  'organizations.page.share': 'Share this organisation',
  'organizations.page.manage': 'Manage team',
  'organizations.page.team': 'The team',
  'organizations.fields.name': 'Organisation name',
  'organizations.fields.nameHint':
    'Use the name people know you by. The page address is made from it once and never changes.',
  'organizations.fields.bio': 'About the organisation',
  'organizations.fields.bioHint': 'What the team makes, and for whom.',
  'organizations.fields.municipality': 'Municipality',
  'organizations.fields.municipalityPlaceholder': 'Select a municipality',
  'organizations.fields.crafts': 'Crafts',
  'organizations.fields.craftsLimit': 'From at most two areas of work.',
  'organizations.fields.craftsFounderOnly': 'Only the founder changes the crafts.',
  'organizations.fields.craftsRequired': 'Choose at least one craft and mark one as primary.',
  'organizations.found.eyebrow': 'New organisation',
  'organizations.found.heading': 'Found an organisation',
  'organizations.found.intro':
    'A page for a team of creatives who work together. It is reviewed before anyone can see it. You can invite your team while you wait.',
  'organizations.found.submit': 'Submit for review',
  'organizations.manage.eyebrow': 'Your organisation',
  'organizations.manage.yourRole': 'Your role:',
  'organizations.manage.viewPublic': 'View the public page',
  'organizations.manage.cancel': 'Cancel',
  'organizations.manage.notice.pending':
    'An administrator checks every new organisation before it is public. You can invite your team in the meantime.',
  'organizations.manage.notice.rejected':
    'An administrator asked for changes. Edit the page and save it to send it back for review.',
  'organizations.manage.notice.suspended':
    'An administrator has taken this page down. It cannot be edited, and nobody can be invited.',
  'organizations.manage.edit.heading': 'The page',
  'organizations.manage.edit.publishedNote':
    'Changes show straight away. An administrator looks over them afterwards.',
  'organizations.manage.edit.draftNote': 'Everything here is public once the page is approved.',
  'organizations.manage.edit.nothingChanged': 'Nothing has changed.',
  'organizations.manage.edit.save': 'Save changes',
  'organizations.manage.edit.resubmit': 'Save and resubmit',
  'organizations.manage.edit.saved': 'Saved',
  'organizations.manage.edit.resubmitted': 'Sent back for review',
  'organizations.manage.team.note':
    'Only members whose own profile is public appear on the public page.',
  'organizations.manage.team.invited': 'Invited',
  'organizations.manage.team.expired': 'Expired — invite them again to renew',
  'organizations.manage.team.until': 'Open until',
  'organizations.manage.member.you': '(you)',
  'organizations.manage.member.profileHidden':
    'Their profile is not public, so they are not on the public page.',
  'organizations.manage.member.makeFounder': 'Make founder',
  'organizations.manage.member.remove': 'Remove',
  'organizations.manage.member.handOver': 'Hand over',
  'organizations.manage.member.confirmRemove': 'Remove this person from the team?',
  'organizations.manage.member.confirmHandOver':
    'Make this person the founder? You stay on as a co-founder, and only they can hand it back.',
  'organizations.manage.member.removing': 'Removing…',
  'organizations.manage.member.removed': 'Removed from the team',
  'organizations.manage.member.handingOver': 'Handing over…',
  'organizations.manage.member.handedOver': 'The founder has changed',
  'organizations.manage.invite.heading': 'Invite someone',
  'organizations.manage.invite.intro':
    'They need a creative profile. The invitation waits on their account for seven days.',
  'organizations.manage.invite.username': 'Their username',
  'organizations.manage.invite.role': 'Role',
  'organizations.manage.invite.roleHint': 'A co-founder can edit the page and invite people.',
  'organizations.manage.invite.title': 'Their title',
  'organizations.manage.invite.titleHint': 'Optional. What they do on the team, such as “Editor”.',
  'organizations.manage.invite.submit': 'Send invitation',
  'organizations.manage.invite.sent': 'Invitation sent',
  'organizations.manage.invite.resent': 'Invitation sent again',
  'organizations.manage.leave.heading': 'Leave the organisation',
  'organizations.manage.leave.closeHeading': 'Close the organisation',
  'organizations.manage.leave.member':
    'You will no longer appear on its page. You can be invited back.',
  'organizations.manage.leave.founderAlone':
    'You are the only member, so leaving closes the organisation and removes its page.',
  'organizations.manage.leave.founderBlocked':
    'The founder cannot leave while others are on the team. Make someone else the founder first.',
  'organizations.manage.leave.confirm': 'Leave',
  'organizations.manage.leave.confirmClose': 'Close it',
  'organizations.manage.leave.leaving': 'Leaving…',
  'organizations.manage.leave.left': 'You left the organisation',
  'organizations.manage.leave.closed': 'Organisation closed',
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
export type MessageKey = keyof typeof en | LegalKey;

export type Catalog = Readonly<Partial<Record<MessageKey, string>>>;
