/**
 * The organisation pages, in English (ADR 0054, ADR 0055).
 *
 * Kept out of `../en.ts` because only the organisation pages use these
 * strings — the public page, founding and managing — and all three are lazy
 * routes: the strings travel in their chunks, so a visitor who never opens one
 * never downloads them (constraint 3). The role and status labels, the account
 * card and the directory section stay in `../en.ts`, because screens outside
 * these routes show them. `./index.ts` registers this section, and each
 * organisation page imports it.
 *
 * Sentences are whole, never a name glued between fragments, so a translator
 * keeps their own word order. Adding a key here means adding it to `fil.ts`
 * and `war.ts` beside this file with an empty value. `catalogs.test.ts` fails
 * if you forget.
 */
export const enOrganizations = {
  'organizations.page.kind': 'Organisation',
  'organizations.page.share': 'Share this organisation',
  'organizations.page.manage': 'Manage team',
  'organizations.page.team': 'The team',
  'organizations.page.message': 'Message',
  'organizations.page.signInToMessage': 'Sign in to message',
  'organizations.page.messageNote': 'Your message goes to the founder alone:',
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
  'organizations.manage.logo.heading': 'Logo',
  'organizations.manage.logo.intro':
    'Shown on the page and in the directory. A square image works best; it is resized on your device before it uploads. An administrator looks at every new logo.',
  'organizations.manage.logo.add': 'Add a logo',
  'organizations.manage.logo.replace': 'Replace logo',
  'organizations.manage.logo.remove': 'Remove',
  'organizations.manage.logo.working': 'Working…',
  'organizations.manage.logo.uploading': 'Uploading the logo…',
  'organizations.manage.logo.updated': 'Logo updated',
  'organizations.manage.logo.removing': 'Removing the logo…',
  'organizations.manage.logo.removed': 'Logo removed',
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
} as const;

export type OrganizationsKey = keyof typeof enOrganizations;
