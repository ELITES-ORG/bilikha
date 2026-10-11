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
} as const;

export type OffersKey = keyof typeof enOffers;
