import { describe, expect, it } from 'vitest';
import type { WorkSummary } from '@contracts/work';
import { nextAction } from './next-action';

function summary(overrides: Partial<WorkSummary> = {}): WorkSummary {
  return {
    profile: {
      slug: 'test-creative',
      status: 'published',
      editedSinceReviewAt: null,
      ...overrides.profile,
    },
    offers: { total: 1, savedByOthers: 0, ...overrides.offers },
    inquiries: { total: 0, awaitingYourReply: 0, ...overrides.inquiries },
    agreements: {
      total: 0,
      awaitingClientAcceptance: 0,
      agreed: 0,
      inProgress: 0,
      awaitingClientConfirmation: 0,
      completed: 0,
      cancelled: 0,
      ...overrides.agreements,
    },
    money: {
      proposedCentavos: 0,
      agreedCentavos: 0,
      inProgressCentavos: 0,
      awaitingConfirmationCentavos: 0,
      completedCentavos: 0,
      cancelledCentavos: 0,
      committedCentavos: 0,
      typicalCentavos: null,
      ...overrides.money,
    },
    ratings: { average: null, count: 0, ...overrides.ratings },
  };
}

describe('nextAction', () => {
  it('says waiting on review when the profile is pending', () => {
    const action = nextAction(summary({ profile: { status: 'pending_review' } as WorkSummary['profile'] }));
    expect(action.headline).toMatch(/review/i);
    expect(action.to).toBeUndefined();
  });

  it('points at the profile when suspended', () => {
    const action = nextAction(summary({ profile: { status: 'suspended' } as WorkSummary['profile'] }));
    expect(action.headline).toMatch(/suspended/i);
    expect(action.to).toBe('/account/profile');
  });

  it('says the edit is queued when edited since review', () => {
    const action = nextAction(
      summary({
        profile: {
          slug: 'test-creative',
          status: 'published',
          editedSinceReviewAt: '2026-09-01T00:00:00.000Z',
        },
      }),
    );
    expect(action.headline).toMatch(/queued/i);
  });

  it('asks for an offer when published with none', () => {
    const action = nextAction(summary({ offers: { total: 0, savedByOthers: 0 } }));
    expect(action.headline).toMatch(/offer/i);
    expect(action.to).toBe('/account/offers');
  });

  it('asks to reply when an inquiry is awaiting', () => {
    const action = nextAction(
      summary({
        offers: { total: 1, savedByOthers: 0 },
        inquiries: { total: 1, awaitingYourReply: 1 },
      }),
    );
    expect(action.headline).toMatch(/reply/i);
    expect(action.to).toBe('/messages');
  });

  it('asks to mark delivery when an engagement is in progress', () => {
    const action = nextAction(
      summary({
        agreements: {
          total: 1,
          awaitingClientAcceptance: 0,
          agreed: 0,
          inProgress: 1,
          awaitingClientConfirmation: 0,
          completed: 0,
          cancelled: 0,
        },
      }),
    );
    expect(action.headline).toMatch(/delivery/i);
    expect(action.to).toBe('/history');
  });

  it('says waiting on the client when confirmation is theirs', () => {
    const action = nextAction(
      summary({
        agreements: {
          total: 1,
          awaitingClientAcceptance: 0,
          agreed: 0,
          inProgress: 0,
          awaitingClientConfirmation: 1,
          completed: 0,
          cancelled: 0,
        },
      }),
    );
    expect(action.headline).toMatch(/waiting on the client/i);
    expect(action.to).toBeUndefined();
  });

  it('says up to date when nothing needs attention', () => {
    const action = nextAction(summary());
    expect(action.headline).toMatch(/up to date/i);
  });

  it('lets an unanswered inquiry outrank "add an offer"', () => {
    const action = nextAction(
      summary({
        offers: { total: 0, savedByOthers: 0 },
        inquiries: { total: 1, awaitingYourReply: 1 },
      }),
    );
    expect(action.headline).toMatch(/reply/i);
    expect(action.headline).not.toMatch(/offer/i);
  });

  it('lets an unanswered inquiry outrank a queued edit', () => {
    // The regression this guards: "your edit is queued" is informational and
    // carries no link, and it used to sit above a waiting client. The page then
    // led with nothing-to-do while reporting the inquiry one line below.
    const action = nextAction(
      summary({
        profile: {
          slug: 'test-creative',
          status: 'published',
          editedSinceReviewAt: '2026-09-21T15:14:29.922Z',
        },
        inquiries: { total: 1, awaitingYourReply: 1 },
      }),
    );

    expect(action.headline).toMatch(/reply/i);
    expect(action.to).toBe('/messages');
  });

  it('lets anything actionable outrank a profile under review', () => {
    const action = nextAction(
      summary({
        profile: { slug: 'test-creative', status: 'pending_review', editedSinceReviewAt: null },
        offers: { total: 0, savedByOthers: 0 },
      }),
    );

    // Adding an offer is useful work while the profile is with the team.
    expect(action.headline).toMatch(/offer/i);
  });

  it('still reports a queued edit when there is nothing to act on', () => {
    const action = nextAction(
      summary({
        profile: {
          slug: 'test-creative',
          status: 'published',
          editedSinceReviewAt: '2026-09-21T15:14:29.922Z',
        },
      }),
    );

    expect(action.headline).toMatch(/edit is queued/i);
  });

  it('lets a suspended profile outrank everything else', () => {
    const action = nextAction(
      summary({
        profile: {
          slug: 'test-creative',
          status: 'suspended',
          editedSinceReviewAt: '2026-09-01T00:00:00.000Z',
        },
        offers: { total: 0, savedByOthers: 0 },
        inquiries: { total: 2, awaitingYourReply: 2 },
        agreements: {
          total: 1,
          awaitingClientAcceptance: 0,
          agreed: 0,
          inProgress: 1,
          awaitingClientConfirmation: 0,
          completed: 0,
          cancelled: 0,
        },
      }),
    );
    expect(action.headline).toMatch(/suspended/i);
  });
});
