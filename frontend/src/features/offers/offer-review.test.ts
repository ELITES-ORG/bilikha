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
  it('says a new offer is waiting, and that clients will see it once approved', () => {
    expect(reviewNotice({ ...base, status: 'pending_review' })).toMatchObject({
      tone: 'warning',
      label: 'Waiting for review',
    });
  });

  it("quotes an administrator's reason for a rejected offer, and says how to resubmit", () => {
    const notice = reviewNotice({ ...base, status: 'rejected', rejectionReason: 'Remove the phone number.' });
    expect(notice.tone).toBe('danger');
    expect(notice.detail).toContain('Remove the phone number.');
    expect(notice.detail).toContain('send it back for review');
  });

  it('says a published offer with a waiting change still shows the approved version', () => {
    expect(reviewNotice({ ...base, pendingChanges: changes })).toMatchObject({
      label: 'Changes waiting for review',
      detail: expect.stringContaining('approved version'),
    });
  });

  it('quotes why the last change was not approved, and that the approved version still shows', () => {
    const notice = reviewNotice({ ...base, revisionRejectionReason: 'Blurry photo.' });
    expect(notice).toMatchObject({ tone: 'danger', label: 'Last changes not approved' });
    expect(notice.detail).toContain('Blurry photo.');
  });

  it('a waiting change outranks an older rejected one', () => {
    expect(reviewNotice({ ...base, pendingChanges: changes, revisionRejectionReason: 'Old reason.' }).label).toBe(
      'Changes waiting for review',
    );
  });

  it('says a published offer with nothing waiting is live', () => {
    expect(reviewNotice(base)).toMatchObject({ tone: 'success', label: 'Live' });
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
