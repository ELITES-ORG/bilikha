/**
 * Filipino for the registration page.
 *
 * The rules in `../fil.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose. The consent sentences are
 * split around their link — `…Before` keeps its own trailing space.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const filRegister: Catalog = {
  'register.signIn': 'Mag sign-in',
  'register.eyebrow': 'Sumali sa rehistro',
  'register.heading': 'Lumikha ng account',
  // Blank until retranslated: the old sentence promised the creative step next,
  // and the ID step now comes first (plan 0053 Phase 5; ADR 0055, no machine
  // translation). English shows until then.
  'register.intro': '',
  'register.name.heading': 'Pangalan',
  'register.name.first': 'Unang pangalan',
  'register.name.middle': 'Gitnang pangalan',
  'register.name.last': 'Apelyido',
  'register.name.suffix': 'Kasukdugan',
  'register.name.suffixPlaceholder': '',
  'register.account.heading': 'Account',
  'register.account.username': 'Username',
  'register.account.usernameHint': '3–30 na karakter. Mga titik, numero, tuldok, at underscore.',
  'register.account.password': 'Password',
  'register.account.passwordHint': 'Hindi bababa sa 10 karakter.',
  'register.account.confirmPassword': 'Kumpirmahin ang password',
  'register.contact.heading': 'Kontak',
  'register.contact.email': 'Email',
  'register.contact.phone': 'Numero ng telepono',
  'register.contact.birthDate': 'Petsa ng kapanganakan',
  'register.location.heading': 'Lokasyon',
  'register.location.intro': 'Ang Bilikha ay para sa mga nasa Biliran. Piliin ang iyong munisipalidad at barangay.',
  'register.location.municipality': 'Munisipalidad',
  'register.location.municipalityPlaceholder': 'Pumili ng munisipalidad',
  'register.location.barangay': 'Barangay',
  'register.location.barangayNeedsMunicipality': 'Kailangan munang pumili ng munisipalidad',
  'register.location.barangayLoading': 'Loading…',
  'register.location.barangayPlaceholder': 'Pumili ng barangay',
  'register.location.barangaysFailed': 'Hindi ma-load ang mga barangay para sa munisipalidad na ito. Subukan muli.',
  'register.consent.heading': 'Pagsang-ayon',
  'register.consent.privacyBefore': 'Nabasa ko at tinatanggap ko ang ',
  'register.consent.privacyLink': 'Abiso sa Pagkapribado',
  'register.consent.privacyAfter': '.',
  'register.consent.termsBefore': 'Tinatanggap ko ang ',
  'register.consent.termsLink': 'Mga Termino ng Paggamit',
  'register.consent.termsAfter': '.',
  'register.errors.municipalityRequired': 'Kailangan pumili ng munisipalidad',
  'register.errors.barangayRequired': 'Kailangan pumili ng barangay',
  'register.errors.privacyRequired': 'Kinakailangang tanggapin ang Abiso sa Pagkapribado',
  'register.errors.termsRequired': 'Kinakailangang tanggapin ang Mga Termino ng Paggamit',
  'register.submit': 'Lumikha ng account',
};
