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
  'register.signIn': '',
  'register.eyebrow': '',
  'register.heading': '',
  'register.intro': '',
  'register.name.heading': '',
  'register.name.first': '',
  'register.name.middle': '',
  'register.name.last': '',
  'register.name.suffix': '',
  'register.name.suffixPlaceholder': '',
  'register.account.heading': '',
  'register.account.username': '',
  'register.account.usernameHint': '',
  'register.account.password': '',
  'register.account.passwordHint': '',
  'register.account.confirmPassword': '',
  'register.contact.heading': '',
  'register.contact.email': '',
  'register.contact.phone': '',
  'register.contact.birthDate': '',
  'register.location.heading': '',
  'register.location.intro': '',
  'register.location.municipality': '',
  'register.location.municipalityPlaceholder': '',
  'register.location.barangay': '',
  'register.location.barangayNeedsMunicipality': '',
  'register.location.barangayLoading': '',
  'register.location.barangayPlaceholder': '',
  'register.location.barangaysFailed': '',
  'register.consent.heading': '',
  'register.consent.privacyBefore': '',
  'register.consent.privacyLink': '',
  'register.consent.privacyAfter': '',
  'register.consent.termsBefore': '',
  'register.consent.termsLink': '',
  'register.consent.termsAfter': '',
  'register.errors.municipalityRequired': '',
  'register.errors.barangayRequired': '',
  'register.errors.privacyRequired': '',
  'register.errors.termsRequired': '',
  'register.submit': '',
};
