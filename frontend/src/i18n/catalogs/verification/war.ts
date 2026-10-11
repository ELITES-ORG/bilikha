/**
 * Waray for the ID step — **not yet translated.**
 *
 * The rules in `../war.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const warVerification: Catalog = {
  'idStep.eyebrow': '',
  'idStep.heading': '',
  'idStep.intro': '',
  'idStep.resubmit.heading': '',
  'idStep.resubmit.intro': '',
  'idStep.accepted.heading': '',
  'idStep.accepted.government': '',
  'idStep.accepted.local': '',
  'idStep.accepted.school': '',
  'idStep.accepted.notAccepted': '',
  'idStep.consent.heading': '',
  'idStep.consent.text': '',
  'idStep.consent.agree': '',
  'idStep.consent.first': '',
  'idStep.guidance.heading': '',
  'idStep.guidance.corners': '',
  'idStep.guidance.glare': '',
  'idStep.guidance.readable': '',
  'idStep.type.label': '',
  'idStep.type.placeholder': '',
  'idStep.side.front': '',
  'idStep.side.back': '',
  'idStep.side.frontOnly': '',
  'idStep.takePhoto': '',
  'idStep.choosePhoto': '',
  'idStep.uploading': '',
  'idStep.uploaded': '',
  'idStep.uploadFailed': '',
  'idStep.storageUnavailable': '',
  'idStep.submit': '',
};
