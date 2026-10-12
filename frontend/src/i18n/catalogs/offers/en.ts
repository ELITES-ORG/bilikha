/**
 * A creative's own offers, in English (ADR 0055, ADR 0058).
 *
 * Kept out of `../en.ts` because only the offer editor reads these strings,
 * and it is a lazy route: they travel in its chunk, so nobody who never opens
 * it downloads them (constraint 3). `./index.ts` registers this section, and
 * `features/offers/OfferReviewNotice.tsx` imports it.
 *
 * The review detail is the app speaking. An administrator's reason is shown
 * apart from it, under `offers.review.reasonLabel`, in their own words.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enOffers = {
  // Where an offer stands in review: a badge, then what to do next.
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

  // The toast after a save, in the words that fit where the offer stands.
  'offers.saved.created': 'Offer sent for review',
  'offers.saved.changesSent': 'Changes sent for review',
  'offers.saved.changesWithdrawn': 'Changes withdrawn — the approved version stays',
  'offers.saved.waiting': 'Saved and waiting for review',
  'offers.saved.changes': 'Changes saved',

  // Media in the offer editor
  'offers.media.heading': 'Photos, audio, video and documents',
  'offers.media.add': 'Add media',
  'offers.media.addImage': 'Add image',
  'offers.media.limits':
    'Images up to 20 MB · Audio up to 15 MB and 10 minutes · Video up to 300 MB and 5 minutes · PDF up to 10 MB',
  'offers.media.limitsImagesOnly': 'Images up to 20 MB.',
  'offers.media.quota': '{used} of {total} used',
  'offers.media.rights': 'Only upload work you made or have the rights to share.',
  'offers.media.rightsLink': 'Terms of use',
  'offers.media.uploading': 'Uploading {name}',
  'offers.media.progress': '{sent} of {total} · {percent}%',
  'offers.media.cancel': 'Cancel',
  'offers.media.remove': 'Remove',
  'offers.media.leaveWarning': 'An upload is still in progress.',
  'offers.media.untitled': 'Untitled',
  'offers.media.refused.type':
    'This file type can’t be added. Use MP3, M4A or OGG audio, MP4 or WebM video, or a PDF.',
  'offers.media.refused.typeImagesOnly': 'This file type can’t be added. Use a JPEG, PNG, WebP or HEIC image.',
  'offers.media.refused.size': 'This file is {size}. This kind can be up to {limit}.',
  'offers.media.refused.duration': 'This recording is {length} long. This kind can be up to {limit}.',
  'offers.media.refused.codec':
    'This video uses a format many phones can’t play. Export it as MP4 (H.264) and try again.',
  'offers.media.refused.unreadable': 'This file couldn’t be read. Try another copy.',
  'offers.media.refused.count': 'This offer already has as many of these as it can hold.',
  'offers.media.refused.quota': 'Your storage is full. Remove something first.',
  'offers.media.failed': 'The upload stopped. Try again.',
  'offers.media.kind.image': 'Image',
  'offers.media.kind.audio': 'Audio',
  'offers.media.kind.video': 'Video',
  'offers.media.kind.document': 'PDF',
  'offers.media.state.pendingAdd': 'Waiting for review',
  'offers.media.state.pendingRemove': 'Removal waiting for review',
} as const;

export type OffersKey = keyof typeof enOffers;
