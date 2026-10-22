/**
 * Filipino for files in a conversation — **not yet translated.**
 *
 * The rules in `../fil.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const filMessages: Catalog = {
  'messages.files.attach': '',
  'messages.files.closeTray': '',
  'messages.files.choose': '',
  'messages.files.limits': '',
  'messages.files.kept': '',
  'messages.files.preparing': '',
  'messages.files.uploading': '',
  'messages.files.progress': '',
  'messages.files.ready': '',
  'messages.files.cancel': '',
  'messages.files.remove': '',
  'messages.files.leaveWarning': '',
  'messages.files.waitForUploads': '',
  'messages.files.refused.type': '',
  'messages.files.refused.size': '',
  'messages.files.refused.duration': '',
  'messages.files.refused.codec': '',
  'messages.files.refused.unreadable': '',
  'messages.files.refused.full': '',
  'messages.files.failed': '',
  'messages.files.resend': '',
  'messages.files.kind.image': '',
  'messages.files.kind.audio': '',
  'messages.files.kind.video': '',
  'messages.files.kind.document': '',
  'messages.files.viewPhoto': '',
  'messages.files.closePhoto': '',
  'messages.files.play': '',
  'messages.files.open': '',
  'messages.files.download': '',
  'messages.files.until': '',
  'messages.files.expired.image': '',
  'messages.files.expired.audio': '',
  'messages.files.expired.video': '',
  'messages.files.expired.document': '',
  'messages.files.unavailable': '',
};
