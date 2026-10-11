import { describe, expect, it } from 'vitest';
import { reviewNotice, savedMessage } from './offer-review';
import type { OfferPendingChanges } from './api';

const changes: OfferPendingChanges = {
  title: 'New title',
  description: null,
  priceMinCentavos: null,
  priceMaxCentavos: null,
  subdomainSlug: 'filmmakers',
  subdomainName: 'Filmmakers',
  submittedAt: null,
};

const base = {
  status: 'published' as const,
  rejectionReason: null,
  revisionRejectionReason: null,
  pendingChanges: null,
};

describe('reviewNotice', () => {
  it('says a new offer is waiting', () => {
    expect(reviewNotice({ ...base, status: 'pending_review' })).toEqual({ state: 'pending', reason: null });
  });

  it("keeps an administrator's reason for a rejected offer apart, exactly as written", () => {
    expect(reviewNotice({ ...base, status: 'rejected', rejectionReason: 'Irrelevant' })).toEqual({
      state: 'rejected',
      reason: 'Irrelevant',
    });
  });

  it('a rejected offer with a blank reason has no reason to show', () => {
    expect(reviewNotice({ ...base, status: 'rejected', rejectionReason: '   ' }).reason).toBeNull();
  });

  it('says a published offer has a change waiting', () => {
    expect(reviewNotice({ ...base, pendingChanges: changes })).toEqual({ state: 'changesPending', reason: null });
  });

  it('keeps why the last change was not approved apart', () => {
    expect(reviewNotice({ ...base, revisionRejectionReason: 'Blurry photo.' })).toEqual({
      state: 'changesRejected',
      reason: 'Blurry photo.',
    });
  });

  it('a waiting change outranks an older rejected one', () => {
    expect(reviewNotice({ ...base, pendingChanges: changes, revisionRejectionReason: 'Old reason.' })).toEqual({
      state: 'changesPending',
      reason: null,
    });
  });

  it('says a published offer with nothing waiting is live', () => {
    expect(reviewNotice(base)).toEqual({ state: 'live', reason: null });
  });
});

describe('savedMessage', () => {
  it('fits where the offer stands', () => {
    expect(savedMessage(base, true)).toBe('Offer sent for review');
    expect(savedMessage({ ...base, pendingChanges: changes }, false)).toBe('Changes sent for review');
    expect(savedMessage(base, false)).toContain('withdrawn');
    expect(savedMessage({ ...base, status: 'pending_review' }, false)).toBe('Saved and waiting for review');
  });
});
