/**
 * The registration page, in English (ADR 0055).
 *
 * Kept out of `../en.ts` because only `/register` uses these strings, and it is
 * a lazy route: they travel in its chunk, so a visitor who never registers
 * never downloads them (constraint 3). `./index.ts` registers them, and the
 * page imports it.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enRegister = {
  // Registration — the screen where the hardest-to-reach registrants are lost
  // (constraint 5). The two consent sentences are split around their link,
  // before / link / after, so a translator can move the link to wherever the
  // sentence needs it: word order differs between English, Filipino and Waray,
  // and gluing three English fragments together would force English order.
  // `after` may be just the closing punctuation.
  'register.signIn': 'Sign in',
  'register.eyebrow': 'Join the registry',
  'register.heading': 'Create your account',
  'register.intro': 'You can list your creative work in the next step, or add a profile later from your account.',
  'register.name.heading': 'Your name',
  'register.name.first': 'First name',
  'register.name.middle': 'Middle name',
  'register.name.last': 'Last name',
  'register.name.suffix': 'Suffix',
  'register.name.suffixPlaceholder': 'Jr., Sr., III',
  'register.account.heading': 'Account',
  'register.account.username': 'Username',
  'register.account.usernameHint': '3–30 characters. Letters, numbers, dots and underscores.',
  'register.account.password': 'Password',
  'register.account.passwordHint': 'At least 10 characters.',
  'register.account.confirmPassword': 'Confirm password',
  'register.contact.heading': 'Contact',
  'register.contact.email': 'Email',
  'register.contact.phone': 'Phone number',
  'register.contact.birthDate': 'Date of birth',
  'register.location.heading': 'Location',
  'register.location.intro': 'Bilikha is for Biliran. Choose your municipality and barangay.',
  'register.location.municipality': 'Municipality',
  'register.location.municipalityPlaceholder': 'Select a municipality',
  'register.location.barangay': 'Barangay',
  'register.location.barangayNeedsMunicipality': 'Select a municipality first',
  'register.location.barangayLoading': 'Loading…',
  'register.location.barangayPlaceholder': 'Select a barangay',
  'register.location.barangaysFailed': 'Could not load barangays for that municipality. Try again.',
  'register.consent.heading': 'Consent',
  'register.consent.privacyBefore': 'I have read and accept the ',
  'register.consent.privacyLink': 'privacy notice',
  'register.consent.privacyAfter': '.',
  'register.consent.termsBefore': 'I accept the ',
  'register.consent.termsLink': 'terms of use',
  'register.consent.termsAfter': '.',
  'register.errors.municipalityRequired': 'Select a municipality',
  'register.errors.barangayRequired': 'Select a barangay',
  'register.errors.privacyRequired': 'You must accept the privacy notice',
  'register.errors.termsRequired': 'You must accept the terms',
  'register.submit': 'Create account',
} as const;

export type RegisterKey = keyof typeof enRegister;
