/**
 * Waray — **not yet translated.**
 *
 * Every value here must be written or reviewed by a fluent speaker. Machine
 * translation is not acceptable in this file, including "just to see the
 * layout" (ADR 0055 §4): generated Waray reads as plausible to a
 * non-speaker and wrong to a speaker, which is the worst combination for a
 * registry whose whole problem is trust in a small province.
 *
 * An empty value falls back to English, visibly and on purpose. A missing
 * translation is honest; a fabricated one is not.
 *
 * Keys must match `en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from './en';

export const war: Catalog = {
  'signIn.eyebrow': '',
  'signIn.heading': '',
  'signIn.intro': '',
  'signIn.username': '',
  'signIn.password': '',
  'signIn.submit': '',
  'signIn.register': '',
  'signIn.noSelfService': '',
  'account.language.label': '',
  'account.language.description': '',
  'directory.search.label': '',
  'directory.search.placeholder': '',
  'directory.search.submit': '',
  'directory.search.clear': '',
  'directory.search.emptyTitle': '',
  'directory.search.emptyDescription': '',
  'directory.search.tryCreatives': '',
  'directory.search.tryOffers': '',
  'directory.search.postingsNote': '',
  'directory.search.clearFilters': '',
  'organizations.role.founder': '',
  'organizations.role.coFounder': '',
  'organizations.role.member': '',
  'organizations.status.pendingReview': '',
  'organizations.status.published': '',
  'organizations.status.rejected': '',
  'organizations.status.suspended': '',
  'organizations.account.heading': '',
  'organizations.account.empty': '',
  'organizations.account.found': '',
  'organizations.account.invitation': '',
  'organizations.account.invitedBy': '',
  'organizations.account.accept': '',
  'organizations.account.decline': '',
  'organizations.account.answering': '',
  'organizations.account.accepted': '',
  'organizations.account.declined': '',
  'organizations.directory.heading': '',
  'organizations.directory.intro': '',
  'organizations.directory.members': '',
  'verification.pending.explain': '',
  'verification.banner.missing.label': '',
  'verification.banner.missing.message': '',
  'verification.banner.missing.action': '',
  'verification.banner.review.label': '',
  'verification.banner.review.message': '',
  'verification.banner.retry.label': '',
  'verification.banner.retry.message': '',
  'verification.banner.retry.action': '',
  'verification.reasonLabel': '',
  'signIn.declined.retry': '',
  'signIn.declined.final': '',
  'signIn.declined.appealed': '',
  'offers.review.pending.label': '',
  'offers.review.pending.detail': '',
  'offers.review.rejected.label': '',
  'offers.review.rejected.detail': '',
  'offers.review.changesPending.label': '',
  'offers.review.changesPending.detail': '',
  'offers.review.changesRejected.label': '',
  'offers.review.changesRejected.detail': '',
  'offers.review.live.label': '',
  'offers.review.live.detail': '',
  'offers.review.reasonLabel': '',
};
