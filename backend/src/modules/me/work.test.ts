import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { messages, savedOffers } from '../../db/schema/index.js';
import type { AppError } from '../../lib/http-error.js';
import {
  makeAcceptedAgreement,
  makeAgreement,
  makeCompletedAgreement,
  makeConversation,
  makeCreative,
  makeOffer,
  makeRating,
  makeUser,
} from '../../test/factories.js';
import { workSummary } from './work.service.js';

/** Every state a live agreement can be in, summed. Must equal `total`. */
function sumOfStates(a: {
  awaitingClientAcceptance: number;
  agreed: number;
  inProgress: number;
  awaitingClientConfirmation: number;
  completed: number;
  cancelled: number;
}): number {
  return (
    a.awaitingClientAcceptance +
    a.agreed +
    a.inProgress +
    a.awaitingClientConfirmation +
    a.completed +
    a.cancelled
  );
}

/** The refusal a call produced, so status and wording can both be checked. */
async function refusal(call: Promise<unknown>): Promise<AppError> {
  try {
    await call;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Expected the call to be refused, and it succeeded.');
}

describe('GET /me/work — workSummary', () => {
  it('404s for an account with no creative profile', async () => {
    const client = await makeUser();
    const error = await refusal(workSummary(client.id));
    expect(error.status).toBe(404);
  });

  it('returns zeros and a null rating average for a creative with nothing', async () => {
    const { user, profile } = await makeCreative();
    const summary = await workSummary(user.id);

    expect(summary.profile.slug).toBe(profile.slug);
    expect(summary.profile.status).toBe('published');
    expect(summary.offers).toEqual({ total: 0, savedByOthers: 0 });
    expect(summary.inquiries).toEqual({ total: 0, awaitingYourReply: 0 });
    expect(summary.agreements).toEqual({
      total: 0,
      awaitingClientAcceptance: 0,
      agreed: 0,
      inProgress: 0,
      awaitingClientConfirmation: 0,
      completed: 0,
      cancelled: 0,
    });
    expect(summary.money).toEqual({ agreedCentavos: 0, completedCentavos: 0 });
    expect(summary.ratings).toEqual({ average: null, count: 0 });
  });

  it('derives offers, saves, inquiries, agreements and money from existing rows', async () => {
    const { user, profile } = await makeCreative();
    const client = await makeUser();
    const other = await makeUser();

    const offer = await makeOffer(profile.id);
    await db.insert(savedOffers).values({ userId: other.id, offerId: offer.id });

    const conversation = await makeConversation(client.id, profile);
    await db.insert(messages).values({
      conversationId: conversation.id,
      senderUserId: client.id,
      body: 'Are you free in October?',
    });

    // Sent — awaiting client acceptance; not yet agreed money.
    await makeAgreement(conversation, {
      lineItems: [{ description: 'Scout day', priceCentavos: 100_000 }],
    });

    // Completed — agreed and completed money.
    const secondClient = await makeUser();
    const secondThread = await makeConversation(secondClient.id, profile);
    await makeCompletedAgreement(secondThread, {
      lineItems: [
        { description: 'Half-day', priceCentavos: 2_000_000 },
        { description: 'Edits', priceCentavos: 150_000 },
      ],
    });

    // Accepted with no events — Agreed state; counts toward agreed only.
    const thirdClient = await makeUser();
    const thirdThread = await makeConversation(thirdClient.id, profile);
    const accepted = await makeAcceptedAgreement(thirdThread, {
      lineItems: [{ description: 'Retainer', priceCentavos: 50_000 }],
    });
    await makeRating(accepted.agreement.id, thirdClient.id, { stars: 4 });

    const summary = await workSummary(user.id);

    expect(summary.offers).toEqual({ total: 1, savedByOthers: 1 });
    expect(summary.inquiries).toEqual({ total: 3, awaitingYourReply: 1 });
    expect(summary.agreements.total).toBe(3);
    expect(summary.agreements.awaitingClientAcceptance).toBe(1);
    expect(summary.agreements.completed).toBe(1);
    expect(summary.money).toEqual({
      agreedCentavos: 2_150_000 + 50_000,
      completedCentavos: 2_150_000,
    });
    expect(summary.ratings).toEqual({ average: 4, count: 1 });

    // The states must partition the total. A count that shows up in the total
    // and in none of the states cannot be reconciled by the person reading it.
    expect(sumOfStates(summary.agreements)).toBe(summary.agreements.total);
  });

  it('does not count a superseded version as a second agreement', async () => {
    const { user, profile } = await makeCreative();
    const client = await makeUser();
    const thread = await makeConversation(client.id, profile);

    // One engagement, revised once: version 1 superseded by version 2.
    const v1 = await makeAgreement(thread, {
      agreement: { status: 'superseded', version: 1 },
      lineItems: [{ description: 'First go', priceCentavos: 100_000 }],
    });
    await makeAgreement(thread, {
      agreement: { status: 'sent', version: 2, supersedesId: v1.agreement.id },
      lineItems: [{ description: 'Revised', priceCentavos: 150_000 }],
    });

    const summary = await workSummary(user.id);

    // Two rows, one live engagement. Reporting 2 would tell a creative they
    // have two agreements with a client they made one with.
    expect(summary.agreements.total).toBe(1);
    expect(summary.agreements.awaitingClientAcceptance).toBe(1);
    expect(sumOfStates(summary.agreements)).toBe(summary.agreements.total);

    // Neither a superseded version nor one still awaiting a reply is money
    // anyone agreed to.
    expect(summary.money).toEqual({ agreedCentavos: 0, completedCentavos: 0 });
  });

  it('counts an accepted agreement that has not started', async () => {
    const { user, profile } = await makeCreative();
    const client = await makeUser();
    const thread = await makeConversation(client.id, profile);
    await makeAcceptedAgreement(thread, {
      lineItems: [{ description: 'Booked', priceCentavos: 75_000 }],
    });

    const summary = await workSummary(user.id);

    expect(summary.agreements.agreed).toBe(1);
    expect(summary.agreements.total).toBe(1);
    expect(sumOfStates(summary.agreements)).toBe(summary.agreements.total);
    expect(summary.money.agreedCentavos).toBe(75_000);
    expect(summary.money.completedCentavos).toBe(0);
  });
});
