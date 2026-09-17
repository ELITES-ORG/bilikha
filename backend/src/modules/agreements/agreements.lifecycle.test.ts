import { describe, expect, it } from 'vitest';
import { count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agreementEvents } from '../../db/schema/index.js';
import type { AppError } from '../../lib/http-error.js';
import { getThread } from '../conversations/conversations.service.js';
import { listNotifications } from '../notifications/notifications.service.js';
import {
  makeAcceptedAgreement,
  makeAgreement,
  makeConversation,
  makeCreative,
  makeUser,
} from '../../test/factories.js';
import { deriveState, getAgreement, listAgreements, recordEvent } from './agreements.service.js';

/**
 * Plan 0016 steps 7.6, 7.7 and 7.8b. The engagement lifecycle: every move is an
 * act by a named person, and nothing moves because a date passed.
 */

async function engagement(overrides: Parameters<typeof makeAcceptedAgreement>[1] = {}) {
  const creative = await makeCreative();
  const client = await makeUser();
  const conversation = await makeConversation(client.id, creative.profile);
  const { agreement } = await makeAcceptedAgreement(conversation, overrides);
  return { creative: creative.user, client, conversation, agreement };
}

async function refusal(call: Promise<unknown>): Promise<AppError> {
  try {
    await call;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Expected the call to be refused, and it succeeded.');
}

describe('deriveState (2.6)', () => {
  const issuer = '00000000-0000-0000-0000-00000000000a';
  const actor = '00000000-0000-0000-0000-00000000000b';
  const at = new Date('2026-10-01T08:00:00Z');
  const base = { issuedByUserId: issuer, createdAt: at };

  it('reads the document status before it reads any event', () => {
    expect(deriveState({ ...base, status: 'sent' }, []).state).toBe('Awaiting response');
    expect(deriveState({ ...base, status: 'superseded' }, []).state).toBe('Superseded');
    expect(deriveState({ ...base, status: 'withdrawn' }, []).state).toBe('Withdrawn');
  });

  it('reads the newest event on an accepted agreement, and names who set it', () => {
    const accepted = { ...base, status: 'accepted' as const };
    const acceptance = { acceptedByUserId: actor, acceptedAt: at };

    expect(deriveState(accepted, [], acceptance)).toEqual({
      state: 'Agreed',
      actorUserId: actor,
      at: at.toISOString(),
    });

    const started = { type: 'started' as const, actorUserId: issuer, createdAt: new Date(at) };
    const delivered = {
      type: 'delivery_marked' as const,
      actorUserId: issuer,
      createdAt: new Date('2026-10-05T08:00:00Z'),
    };
    const confirmed = {
      type: 'completion_confirmed' as const,
      actorUserId: actor,
      createdAt: new Date('2026-10-06T08:00:00Z'),
    };

    expect(deriveState(accepted, [started], acceptance).state).toBe('In progress');
    expect(deriveState(accepted, [started, delivered], acceptance).state).toBe(
      'Awaiting confirmation',
    );
    // Order in the array must not matter — the newest timestamp decides.
    expect(deriveState(accepted, [confirmed, delivered, started], acceptance)).toEqual({
      state: 'Completed',
      actorUserId: actor,
      at: confirmed.createdAt.toISOString(),
    });
  });
});

describe('the lifecycle, in order (7.6)', () => {
  it('walks Agreed → In progress → Awaiting confirmation → Completed', async () => {
    const { creative, client, conversation, agreement } = await engagement();

    expect((await getAgreement(client.id, agreement.id)).state.state).toBe('Agreed');

    const started = await recordEvent({
      userId: creative.id,
      agreementId: agreement.id,
      type: 'started',
    });
    const afterStart = await getAgreement(client.id, agreement.id);
    expect(afterStart.state.state).toBe('In progress');
    expect(afterStart.state.actorUserId).toBe(creative.id);
    expect(afterStart.state.actorName).toBe(`${creative.firstName} ${creative.lastName}`);
    expect(afterStart.state.at).toBe(started.at);

    const delivered = await recordEvent({
      userId: creative.id,
      agreementId: agreement.id,
      type: 'delivery_marked',
    });
    const afterDelivery = await getAgreement(client.id, agreement.id);
    expect(afterDelivery.state.state).toBe('Awaiting confirmation');
    expect(afterDelivery.state.at).toBe(delivered.at);

    const confirmed = await recordEvent({
      userId: client.id,
      agreementId: agreement.id,
      type: 'completion_confirmed',
    });
    const afterConfirmation = await getAgreement(creative.id, agreement.id);
    expect(afterConfirmation.state.state).toBe('Completed');
    expect(afterConfirmation.state.actorUserId).toBe(client.id);
    expect(afterConfirmation.state.at).toBe(confirmed.at);

    // Every move, in order, each naming its actor.
    expect(afterConfirmation.events.map((event) => event.type)).toEqual([
      'started',
      'delivery_marked',
      'completion_confirmed',
    ]);
    expect(afterConfirmation.events.map((event) => event.actorUserId)).toEqual([
      creative.id,
      creative.id,
      client.id,
    ]);

    // And each one shows up in the conversation.
    const posted = await getThread(conversation.id, client.id, { limit: 50 });
    expect(posted.messages.map((message) => message.body)).toEqual([
      'Marked the work as started.',
      'Marked the work delivered.',
      'Confirmed the work is complete.',
    ]);
    expect(posted.messages.every((message) => message.agreement?.id === agreement.id)).toBe(true);
  });

  it('tells the other party, and never the person who moved it', async () => {
    const { creative, client, agreement } = await engagement();

    await recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'started' });

    const forClient = await listNotifications(client.id, { page: 1, limit: 10 });
    expect(forClient.data[0]?.type).toBe('agreement_event');
    expect(forClient.data[0]?.link).toBe(`/agreements/${agreement.id}`);
    expect((await listNotifications(creative.id, { page: 1, limit: 10 })).data).toHaveLength(0);
  });

  it('cancels from any non-terminal state, with the reason on the record', async () => {
    const { creative, client, conversation, agreement } = await engagement();
    await recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'started' });

    await recordEvent({
      userId: client.id,
      agreementId: agreement.id,
      type: 'cancelled',
      note: 'The venue fell through.',
    });

    const after = await getAgreement(client.id, agreement.id);
    expect(after.state.state).toBe('Cancelled');
    expect(after.state.actorUserId).toBe(client.id);
    expect(after.events.at(-1)?.note).toBe('The venue fell through.');
    // Nothing is deleted: the agreement and its whole history stay.
    expect(after.status).toBe('accepted');
    expect(after.lineItems).toHaveLength(3);

    const posted = await getThread(conversation.id, creative.id, { limit: 50 });
    expect(posted.messages.at(-1)?.body).toBe(
      'Cancelled the engagement: The venue fell through.',
    );
  });
});

describe('the lifecycle, against the rules (7.7)', () => {
  it('refuses the creative confirming completion of their own work', async () => {
    const { creative, agreement } = await engagement();
    await recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'started' });
    await recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'delivery_marked' });

    const error = await refusal(
      recordEvent({
        userId: creative.id,
        agreementId: agreement.id,
        type: 'completion_confirmed',
      }),
    );

    expect(error.status).toBe(403);
    expect(error.message).toMatch(/only the client/i);
    expect((await getAgreement(creative.id, agreement.id)).state.state).toBe(
      'Awaiting confirmation',
    );
  });

  it('refuses the client marking work started or delivered', async () => {
    const { client, agreement } = await engagement();

    await expect(
      recordEvent({ userId: client.id, agreementId: agreement.id, type: 'started' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      recordEvent({ userId: client.id, agreementId: agreement.id, type: 'delivery_marked' }),
    ).rejects.toMatchObject({ status: 403 });

    const [tally] = await db.select({ value: count() }).from(agreementEvents);
    expect(tally?.value).toBe(0);
  });

  it('refuses anything at all against an agreement that is still sent', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAgreement(conversation);

    const error = await refusal(
      recordEvent({ userId: creative.user.id, agreementId: agreement.id, type: 'started' }),
    );
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/not been accepted/i);

    await expect(
      recordEvent({
        userId: client.id,
        agreementId: agreement.id,
        type: 'cancelled',
        note: 'Changed my mind.',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses anything after Completed or Cancelled', async () => {
    const completed = await engagement();
    await recordEvent({
      userId: completed.creative.id,
      agreementId: completed.agreement.id,
      type: 'started',
    });
    await recordEvent({
      userId: completed.creative.id,
      agreementId: completed.agreement.id,
      type: 'delivery_marked',
    });
    await recordEvent({
      userId: completed.client.id,
      agreementId: completed.agreement.id,
      type: 'completion_confirmed',
    });

    await expect(
      recordEvent({
        userId: completed.client.id,
        agreementId: completed.agreement.id,
        type: 'cancelled',
        note: 'Actually, no.',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      recordEvent({
        userId: completed.creative.id,
        agreementId: completed.agreement.id,
        type: 'started',
      }),
    ).rejects.toMatchObject({ status: 400 });

    const cancelled = await engagement();
    await recordEvent({
      userId: cancelled.client.id,
      agreementId: cancelled.agreement.id,
      type: 'cancelled',
      note: 'Budget went.',
    });

    await expect(
      recordEvent({
        userId: cancelled.creative.id,
        agreementId: cancelled.agreement.id,
        type: 'started',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a cancellation with no reason', async () => {
    const { client, agreement } = await engagement();

    const error = await refusal(
      recordEvent({ userId: client.id, agreementId: agreement.id, type: 'cancelled' }),
    );
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/reason/i);

    await expect(
      recordEvent({
        userId: client.id,
        agreementId: agreement.id,
        type: 'cancelled',
        note: '   ',
      }),
    ).rejects.toMatchObject({ status: 400 });

    const [tally] = await db.select({ value: count() }).from(agreementEvents);
    expect(tally?.value).toBe(0);
  });

  /**
   * Rule 8, and the check that the feature means what it says. Both dates are
   * years in the past and the engagement has not moved, because nobody moved it.
   */
  it('does not move a state because a date passed', async () => {
    const { creative, client, agreement } = await engagement({
      agreement: { startDate: '2020-01-01', durationDays: 5 },
    });

    const record = await getAgreement(client.id, agreement.id);
    expect(record.startDate).toBe('2020-01-01');
    expect(record.endDate).toBe('2020-01-06');
    expect(record.state.state).toBe('Agreed');

    const listed = await listAgreements(creative.id, { mode: 'creative' });
    expect(listed.data[0]?.state).toBe('Agreed');

    const [tally] = await db.select({ value: count() }).from(agreementEvents);
    expect(tally?.value).toBe(0);
  });

  it('does not move an unaccepted agreement whose start date has passed either', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAgreement(conversation, {
      agreement: { startDate: '2019-06-01', durationDays: 3 },
    });

    expect((await getAgreement(client.id, agreement.id)).state.state).toBe('Awaiting response');
  });
});

describe('the lock actually holds (7.8b)', () => {
  it('lands exactly one of two concurrent transitions', async () => {
    const { creative, agreement } = await engagement();

    const results = await Promise.allSettled([
      recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'started' }),
      recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'started' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [tally] = await db.select({ value: count() }).from(agreementEvents);
    expect(tally?.value).toBe(1);
    expect((await getAgreement(creative.id, agreement.id)).state.state).toBe('In progress');
  });

  /**
   * The same race with the advisory lock removed, which is the only way to show
   * the test above is testing something. Both transactions read the same newest
   * event, both pass the transition check, and both insert — the state ends up
   * decided by two people who never saw each other's move.
   *
   * `skipLock` is refused outside NODE_ENV=test, so no production path can
   * reach this.
   */
  it('both land once the lock is gone', async () => {
    const { creative, agreement } = await engagement();

    const results = await Promise.allSettled([
      recordEvent(
        { userId: creative.id, agreementId: agreement.id, type: 'started' },
        { skipLock: true },
      ),
      recordEvent(
        { userId: creative.id, agreementId: agreement.id, type: 'started' },
        { skipLock: true },
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);

    const [tally] = await db.select({ value: count() }).from(agreementEvents);
    expect(tally?.value).toBe(2);
  });

  it('serialises two different transitions rather than interleaving them', async () => {
    const { creative, client, agreement } = await engagement();

    const results = await Promise.allSettled([
      recordEvent({ userId: creative.id, agreementId: agreement.id, type: 'started' }),
      recordEvent({
        userId: client.id,
        agreementId: agreement.id,
        type: 'cancelled',
        note: 'Calling it off.',
      }),
    ]);

    // Both are legal from Agreed, so both may land — but in an order, never at
    // once, and the second one sees the first.
    const landed = results.filter((result) => result.status === 'fulfilled');
    expect(landed.length).toBeGreaterThanOrEqual(1);

    const record = await getAgreement(client.id, agreement.id);
    expect(['In progress', 'Cancelled']).toContain(record.state.state);
    expect(record.events).toHaveLength(landed.length);
  });
});
