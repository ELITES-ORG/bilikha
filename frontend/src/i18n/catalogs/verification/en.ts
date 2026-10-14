/**
 * The ID step, in English (ADR 0057, ADR 0055).
 *
 * Kept out of `../en.ts` because only `/welcome/id` uses these strings, and it
 * is a lazy route: the strings travel in its chunk. The banner, the sign-in
 * notices and the browse-only sentence stay in `../en.ts`, because screens
 * every account reaches show them. `./index.ts` registers this section, and
 * the ID step imports it.
 *
 * The ID documents' own names are not here: they are proper names, kept as
 * data in `features/verification/id-types.ts`.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enVerification = {
  'idStep.eyebrow': 'Verify your ID',
  // In place of the eyebrow during registration: ID, then intent, then profile.
  'idStep.step': 'Step 1 of 3',
  'idStep.heading': 'Show that you are from Biliran',
  'idStep.intro':
    'Bilikha is for people from Biliran. Add a photo of an ID that shows a Biliran address or was issued in Biliran. An administrator checks it; until then you can browse offers and creatives.',
  'idStep.resubmit.heading': 'Submit your ID again',
  'idStep.resubmit.intro': 'Your ID could not be verified. Take new photos and submit it again.',
  'idStep.accepted.heading': 'Accepted IDs',
  'idStep.accepted.government': 'Government-issued, showing an address in Biliran',
  'idStep.accepted.local': 'Issued in Biliran',
  'idStep.accepted.school': 'Schools in Biliran — you must still be 18 or older',
  'idStep.accepted.notAccepted':
    'Passports and PRC, SSS, GSIS, TIN, PhilHealth and company IDs show no address, so they are not accepted on their own. Every barangay issues a Certificate of Residency.',
  'idStep.consent.heading': 'How your ID is used',
  'idStep.consent.text':
    'Your ID is seen only by Bilikha\'s administrators, to confirm you are from Biliran. It is kept until they review it and for 7 days after you get their decision (longer only while an appeal you make is being reviewed), then deleted. We keep only a one-way code made from your ID number, so the same ID cannot be used to register again after it is declined.',
  'idStep.consent.agree': 'I understand and agree',
  'idStep.consent.first': 'Agree to how your ID is used before adding photos.',
  'idStep.guidance.heading': 'Taking the photos',
  'idStep.guidance.corners': 'All four corners in the frame',
  'idStep.guidance.glare': 'No glare or shadow across the text',
  'idStep.guidance.readable': 'Name, photo and address readable',
  'idStep.type.label': 'Which ID is it?',
  'idStep.type.placeholder': 'Choose your ID',
  'idStep.side.front': 'Front',
  'idStep.side.back': 'Back',
  'idStep.side.frontOnly': 'This ID has one side: add its front only.',
  'idStep.takePhoto': 'Take photo',
  'idStep.choosePhoto': 'Choose photo',
  'idStep.uploading': 'Uploading…',
  'idStep.uploaded': 'Added',
  'idStep.uploadFailed': 'The photo did not upload. Check your connection and try again.',
  'idStep.storageUnavailable': 'ID uploads are unavailable right now. Try again in a few minutes.',
  'idStep.submit': 'Submit for review',
} as const;

export type VerificationKey = keyof typeof enVerification;
