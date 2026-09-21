import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { agreementEvents, messages, savedOffers } from '../../db/schema/index.js';
import type { AppError } from '../../lib/http-error.js';
import type { WorkSummary } from '../../contracts/work.js';
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
function sumOfStates(a: WorkSummary['agreements']): number {
  return (
    a.awaitingClientAcceptance +
    a.agreed +
    a.inProgress +
    a.awaitingClientConfirmation +
    a.completed +
    a.cancelled
  );
}

/**
 * The six per-state money figures must sum to committed + proposed + cancelled.
 * Same partition lesson as the agreement counts (plan 0027 audit / plan 0028).
 */
function sumOfMoneyStates(m: WorkSummary['money']): number {
  return (
    m.proposedCentavos +
    m.agreedCentavos +
    m.inProgressCentavos +
    m.awaitingConfirmationCentavos +
    m.completedCentavos +
    m.cancelledCentavos
  );
}

function emptyMoney(): WorkSummary['money'] {
  return {
    proposedCentavos: 0,
    agreedCentavos: 0,
    inProgressCentavos: 0,
    awaitingConfirmationCentavos: 0,
    completedCentavos: 0,
    cancelledCentavos: 0,
    committedCentavos: 0,
    typicalCentavos: null,
  };
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
    expect(summary.money).toEqual(emptyMoney());
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

    // Sent — proposed money only; nobody has accepted it.
    await makeAgreement(conversation, {
      lineItems: [{ description: 'Scout day', priceCentavos: 100_000 }],
    });

    // Completed — completed and committed, not "agreed" (that state is earlier).
    const secondClient = await makeUser();
    const secondThread = await makeConversation(secondClient.id, profile);
    await makeCompletedAgreement(secondThread, {
      lineItems: [
        { description: 'Half-day', priceCentavos: 2_000_000 },
        { description: 'Edits', priceCentavos: 150_000 },
      ],
    });

    // Accepted with no events — Agreed state alone. Under the new shape this is
    // the only contribution to agreedCentavos; the old assertion summed this
    // with the completed total and called that "agreed".
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
    expect(summary.agreements.agreed).toBe(1);
    expect(summary.money).toEqual({
      proposedCentavos: 100_000,
      agreedCentavos: 50_000,
      inProgressCentavos: 0,
      awaitingConfirmationCentavos: 0,
      completedCentavos: 2_150_000,
      cancelledCentavos: 0,
      committedCentavos: 2_150_000 + 50_000,
      // Two accepted values [50_000, 2_150_000]; even count → lower middle.
      typicalCentavos: 50_000,
    });
    expect(summary.ratings).toEqual({ average: 4, count: 1 });

    expect(sumOfStates(summary.agreements)).toBe(summary.agreements.total);
    expect(sumOfMoneyStates(summary.money)).toBe(
      summary.money.committedCentavos +
        summary.money.proposedCentavos +
        summary.money.cancelledCentavos,
    );
  });

  it('does not count a superseded version as a second agreement or as money', async () => {
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

    // Superseded contributes nothing; the live draft is only proposed.
    expect(summary.money).toEqual({
      ...emptyMoney(),
      proposedCentavos: 150_000,
    });
    expect(sumOfMoneyStates(summary.money)).toBe(
      summary.money.committedCentavos +
        summary.money.proposedCentavos +
        summary.money.cancelledCentavos,
    );
  });

  it('counts an accepted agreement that has not started as agreed only', async () => {
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
    expect(summary.money.committedCentavos).toBe(75_000);
    expect(summary.money.completedCentavos).toBe(0);
    // One accepted value is not a pattern — no typical.
    expect(summary.money.typicalCentavos).toBeNull();
  });

  it('partitions money across every lifecycle state', async () => {
    const { user, profile } = await makeCreative();

    // Proposed
    await makeAgreement(await makeConversation((await makeUser()).id, profile), {
      lineItems: [{ description: 'Proposed', priceCentavos: 10_000 }],
    });

    // Agreed
    await makeAcceptedAgreement(await makeConversation((await makeUser()).id, profile), {
      lineItems: [{ description: 'Agreed', priceCentavos: 20_000 }],
    });

    // In progress
    {
      const thread = await makeConversation((await makeUser()).id, profile);
      const { agreement } = await makeAcceptedAgreement(thread, {
        lineItems: [{ description: 'Running', priceCentavos: 30_000 }],
      });
      await db.insert(agreementEvents).values({
        agreementId: agreement.id,
        actorUserId: profile.userId,
        type: 'started',
      });
    }

    // Awaiting confirmation
    {
      const thread = await makeConversation((await makeUser()).id, profile);
      const { agreement } = await makeAcceptedAgreement(thread, {
        lineItems: [{ description: 'Delivered', priceCentavos: 40_000 }],
      });
      const base = Date.now();
      await db.insert(agreementEvents).values([
        {
          agreementId: agreement.id,
          actorUserId: profile.userId,
          type: 'started',
          createdAt: new Date(base),
        },
        {
          agreementId: agreement.id,
          actorUserId: profile.userId,
          type: 'delivery_marked',
          createdAt: new Date(base + 1000),
        },
      ]);
    }

    // Completed
    await makeCompletedAgreement(await makeConversation((await makeUser()).id, profile), {
      lineItems: [{ description: 'Done', priceCentavos: 50_000 }],
    });

    // Cancelled
    {
      const thread = await makeConversation((await makeUser()).id, profile);
      const { agreement } = await makeAcceptedAgreement(thread, {
        lineItems: [{ description: 'Off', priceCentavos: 60_000 }],
      });
      await db.insert(agreementEvents).values({
        agreementId: agreement.id,
        actorUserId: profile.userId,
        type: 'cancelled',
        note: 'Client postponed indefinitely.',
      });
    }

    const summary = await workSummary(user.id);

    expect(summary.money).toEqual({
      proposedCentavos: 10_000,
      agreedCentavos: 20_000,
      inProgressCentavos: 30_000,
      awaitingConfirmationCentavos: 40_000,
      completedCentavos: 50_000,
      cancelledCentavos: 60_000,
      committedCentavos: 20_000 + 30_000 + 40_000 + 50_000,
      // Accepted (not cancelled): 20, 30, 40, 50 → even → lower of 30 and 40.
      typicalCentavos: 30_000,
    });
    expect(sumOfMoneyStates(summary.money)).toBe(
      summary.money.committedCentavos +
        summary.money.proposedCentavos +
        summary.money.cancelledCentavos,
    );
    expect(sumOfStates(summary.agreements)).toBe(summary.agreements.total);
    expect(summary.agreements).toMatchObject({
      awaitingClientAcceptance: 1,
      agreed: 1,
      inProgress: 1,
      awaitingClientConfirmation: 1,
      completed: 1,
      cancelled: 1,
      total: 6,
    });
  });

  it('reports no typical until there are two accepted agreements', async () => {
    const { user, profile } = await makeCreative();
    await makeAcceptedAgreement(await makeConversation((await makeUser()).id, profile), {
      lineItems: [{ description: 'Only', priceCentavos: 100_000 }],
    });
    expect((await workSummary(user.id)).money.typicalCentavos).toBeNull();

    await makeCompletedAgreement(await makeConversation((await makeUser()).id, profile), {
      lineItems: [{ description: 'Second', priceCentavos: 300_000 }],
    });
    // [100_000, 300_000] → lower middle = 100_000
    expect((await workSummary(user.id)).money.typicalCentavos).toBe(100_000);

    await makeCompletedAgreement(await makeConversation((await makeUser()).id, profile), {
      lineItems: [{ description: 'Third', priceCentavos: 200_000 }],
    });
    // [100_000, 200_000, 300_000] → middle = 200_000
    expect((await workSummary(user.id)).money.typicalCentavos).toBe(200_000);
  });
});
