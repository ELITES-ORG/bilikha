/**
 * Waray for the registration page.
 *
 * The rules in `../war.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose. The consent sentences are
 * split around their link — `…Before` keeps its own trailing space.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const warRegister: Catalog = {
  'register.signIn': 'Sumulod',
  'register.eyebrow': 'Apil ha rehistro',
  'register.heading': 'Himoa an imo account',
  'register.intro': 'Pwede mo ilista an imo mga creative work ha sunod nga hihimuon, o pagbutang hin profile niyan ha imo account.',
  'register.name.heading': 'An imo ngaran',
  'register.name.first': 'Syahan nga ngaran',
  'register.name.middle': 'Butnga nga ngaran',
  'register.name.last': 'Apelyido',
  'register.name.suffix': 'Sumpay han ngaran',
  'register.name.suffixPlaceholder': 'Jr., Sr., III',
  'register.account.heading': 'Account',
  'register.account.username': 'Username',
  'register.account.usernameHint': '3–30 ka karakter. Mga letra, numero, tuldok ngan underscore.',
  'register.account.password': 'Password',
  'register.account.passwordHint': 'Diri maminus hin 10 ka karakter.',
  'register.account.confirmPassword': 'Kumpirmahi an password',
  'register.contact.heading': 'Kontak',
  'register.contact.email': 'Email',
  'register.contact.phone': 'Numero han telepono',
  'register.contact.birthDate': 'Petsa han pagkatawo',
  'register.location.heading': 'Lugar',
  'register.location.intro': 'Bilikha para ha Biliran. Pilia an imo bungto ngan barangay.',
  'register.location.municipality': 'Bungto',
  'register.location.municipalityPlaceholder': 'Pili han bungto',
  'register.location.barangay': 'Barangay',
  'register.location.barangayNeedsMunicipality': 'Pilia anay hin bungto',
  'register.location.barangayLoading': 'Loading…',
  'register.location.barangayPlaceholder': 'Pili han barangay',
  'register.location.barangaysFailed': 'Diri nakarga an mga barangay para hini nga bungto. Alayon pag-utro.',
  'register.consent.heading': 'Pagsugot',
  'register.consent.privacyBefore': 'Nabasa ko ngan nauyon ako han ',
  'register.consent.privacyLink': 'pahibaro han pagkapribado',
  'register.consent.privacyAfter': '.',
  'register.consent.termsBefore': 'Nauyon ako han ',
  'register.consent.termsLink': 'mga termino han paggamit',
  'register.consent.termsAfter': '.',
  'register.errors.municipalityRequired': 'Pili han bungto',
  'register.errors.barangayRequired': 'Pili han barangay',
  'register.errors.privacyRequired': 'Kinahanglan umuyon ka han pahibaro han pagkapribado',
  'register.errors.termsRequired': 'Kinahanglan umuyon ka han termino han paggamit',
  'register.submit': 'Paghimo han account',
};
