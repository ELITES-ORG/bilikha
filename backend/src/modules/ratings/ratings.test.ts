import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { moderationActions, ratingReports, ratings } from '../../db/schema/index.js';
import type { AppError } from '../../lib/http-error.js';
import { recordEvent } from '../agreements/agreements.service.js';
import { listNotifications } from '../notifications/notifications.service.js';
import {
  makeAcceptedAgreement,
  makeAdmin,
  makeAgreement,
  makeCompletedAgreement,
  makeConversation,
  makeCreative,
  makeUser,
  reinstate,
  suspend,
} from '../../test/factories.js';
import {
  EDIT_WINDOW_DAYS,
  adminDismissReport,
  adminListOpenReports,
  adminRemoveRating,
  deleteRating,
  listForProfile,
  rateAgreement,
  reportRating,
  summaryForProfile,
  updateRating,
} from './ratings.service.js';

/**
 * Plan 0021 steps 7.1 to 7.5. What is on trial here is the enforcement, not the
 * happy path: this feature publishes an opinion about a named person in a
 * province of 180,000, and every refusal below is the only thing standing
 * between the registry and somebody's reputation.
 */

async function engagement() {
  const creative = await makeCreative();
  const client = await makeUser();
  const conversation = await makeConversation(client.id, creative.profile);
  return { creative: creative.user, profile: creative.profile, client, conversation };
}

type Engagement = Awaited<ReturnType<typeof engagement>>;

/** Every lifecycle state a rating could be attempted from. */
async function agreementIn(
  ctx: Engagement,
  state:
    | 'Awaiting response'
    | 'Agreed'
    | 'In progress'
    | 'Awaiting confirmation'
    | 'Cancelled'
    | 'Completed',
) {
  if (state === 'Awaiting response') return (await makeAgreement(ctx.conversation)).agreement;
  if (state === 'Completed') return (await makeCompletedAgreement(ctx.conversation)).agreement;

  const { agreement } = await makeAcceptedAgreement(ctx.conversation);
  if (state === 'Agreed') return agreement;

  if (state === 'Cancelled') {
    await recordEvent({
      userId: ctx.client.id,
      agreementId: agreement.id,
      type: 'cancelled',
      note: 'The venue fell through.',
    });
    return agreement;
  }

  await recordEvent({ userId: ctx.creative.id, agreementId: agreement.id, type: 'started' });
  if (state === 'In progress') return agreement;

  await recordEvent({
    userId: ctx.creative.id,
    agreementId: agreement.id,
    type: 'delivery_marked',
  });
  return agreement;
}

async function refusal(call: Promise<unknown>): Promise<AppError> {
  try {
    await call;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Expected the call to be refused, and it succeeded.');
}

async function ratingCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(ratings);
  return row?.value ?? 0;
}

async function backdate(ratingId: string, days: number): Promise<void> {
  await db
    .update(ratings)
    .set({ createdAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) })
    .where(eq(ratings.id, ratingId));
}

describe('only a completed agreement earns a rating (7.1)', () => {
  it('refuses every state short of Completed, and allows that one', async () => {
    const ctx = await engagement();
    const refused = [
      'Awaiting response',
      'Agreed',
      'In progress',
      'Awaiting confirmation',
      'Cancelled',
    ] as const;

    for (const state of refused) {
      const agreement = await agreementIn(ctx, state);
      const error = await refusal(
        rateAgreement({ userId: ctx.client.id, agreementId: agreement.id, stars: 5 }),
      );

      expect(error.status, `rating was allowed from ${state}`).toBe(400);
      expect(error.message).toMatch(/completed/i);
    }

    expect(await ratingCount()).toBe(0);

    const completed = await agreementIn(ctx, 'Completed');
    const rating = await rateAgreement({
      userId: ctx.client.id,
      agreementId: completed.id,
      stars: 5,
      comment: 'Everything we agreed, on the day we agreed it.',
    });

    expect(rating.stars).toBe(5);
    expect(await ratingCount()).toBe(1);
  });

  it('refuses the creative rating their own work', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);

    const error = await refusal(
      rateAgreement({ userId: ctx.creative.id, agreementId: agreement.id, stars: 5 }),
    );

    expect(error.status).toBe(403);
    expect(error.message).toMatch(/only the client/i);
    expect(await ratingCount()).toBe(0);
  });

  it('never admits to a third account that the agreement exists', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);
    const stranger = await makeUser();

    const error = await refusal(
      rateAgreement({ userId: stranger.id, agreementId: agreement.id, stars: 5 }),
    );

    // 404, not 403: a 403 would confirm that someone else's agreement is there.
    expect(error.status).toBe(404);
    expect(await ratingCount()).toBe(0);
  });
});

describe('one each (7.2)', () => {
  it('refuses a second rating on the same agreement, at the index', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);

    await rateAgreement({ userId: ctx.client.id, agreementId: agreement.id, stars: 5 });

    const error = await refusal(
      rateAgreement({ userId: ctx.client.id, agreementId: agreement.id, stars: 1 }),
    );
    expect(error.status).toBe(409);
    expect(error.message).toMatch(/already rated/i);

    // And with the service out of the way, so this is the index refusing rather
    // than a check the service could be talked out of.
    await expect(
      db.insert(ratings).values({
        agreementId: agreement.id,
        raterUserId: ctx.client.id,
        stars: 1,
      }),
    ).rejects.toMatchObject({
      cause: { code: '23505', constraint_name: 'ratings_agreement_idx' },
    });

    expect(await ratingCount()).toBe(1);
  });

  it('lets a repeat client rate a second completed agreement with the same creative', async () => {
    const ctx = await engagement();
    const first = await makeCompletedAgreement(ctx.conversation);
    const second = await makeCompletedAgreement(ctx.conversation);

    await rateAgreement({ userId: ctx.client.id, agreementId: first.agreement.id, stars: 5 });
    await rateAgreement({ userId: ctx.client.id, agreementId: second.agreement.id, stars: 3 });

    expect(await summaryForProfile(ctx.profile.slug)).toEqual({ average: 4, count: 2 });
  });
});

describe('the fourteen-day window (7.3)', () => {
  it('edits and deletes inside it', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);
    const rating = await rateAgreement({
      userId: ctx.client.id,
      agreementId: agreement.id,
      stars: 5,
      comment: 'Delighted.',
    });

    // A day short of the edge is still inside it.
    await backdate(rating.id, EDIT_WINDOW_DAYS - 1);

    const updated = await updateRating({
      userId: ctx.client.id,
      ratingId: rating.id,
      stars: 3,
      comment: 'On reflection, the gallery was late.',
    });
    expect(updated.stars).toBe(3);

    const listed = await listForProfile(ctx.profile.slug, { page: 1, limit: 10 });
    expect(listed.data[0]?.stars).toBe(3);
    expect(listed.data[0]?.comment).toBe('On reflection, the gallery was late.');

    await deleteRating({ userId: ctx.client.id, ratingId: rating.id });

    expect(await ratingCount()).toBe(0);
    expect(await summaryForProfile(ctx.profile.slug)).toEqual({ average: null, count: 0 });
  });

  it('refuses both once it has closed, and leaves the row exactly as it was', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);
    const rating = await rateAgreement({
      userId: ctx.client.id,
      agreementId: agreement.id,
      stars: 5,
      comment: 'Delighted.',
    });

    await backdate(rating.id, EDIT_WINDOW_DAYS + 1);

    const editError = await refusal(
      updateRating({ userId: ctx.client.id, ratingId: rating.id, stars: 1, comment: 'Awful.' }),
    );
    expect(editError.status).toBe(400);
    expect(editError.message).toMatch(/14 days/);

    const deleteError = await refusal(
      deleteRating({ userId: ctx.client.id, ratingId: rating.id }),
    );
    expect(deleteError.status).toBe(400);

    const [row] = await db.select().from(ratings).where(eq(ratings.id, rating.id));
    expect(row?.stars).toBe(5);
    expect(row?.comment).toBe('Delighted.');
  });

  it('answers 404 to anyone who is not the author, inside the window or out', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);
    const rating = await rateAgreement({
      userId: ctx.client.id,
      agreementId: agreement.id,
      stars: 2,
    });

    for (const userId of [ctx.creative.id, (await makeUser()).id]) {
      await expect(
        updateRating({ userId, ratingId: rating.id, stars: 5 }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(deleteRating({ userId, ratingId: rating.id })).rejects.toMatchObject({
        status: 404,
      });
    }

    expect(await ratingCount()).toBe(1);
  });
});

describe('a suspended rater leaves by derivation (7.4)', () => {
  it('drops from the list, the count and the average together, and comes back', async () => {
    const ctx = await engagement();
    const secondClient = await makeUser();
    const secondConversation = await makeConversation(secondClient.id, ctx.profile);

    const first = await makeCompletedAgreement(ctx.conversation);
    const second = await makeCompletedAgreement(secondConversation);

    await rateAgreement({
      userId: ctx.client.id,
      agreementId: first.agreement.id,
      stars: 5,
      comment: 'Faultless.',
    });
    await rateAgreement({
      userId: secondClient.id,
      agreementId: second.agreement.id,
      stars: 3,
      comment: 'Fine, but late.',
    });

    const before = await listForProfile(ctx.profile.slug, { page: 1, limit: 10 });
    expect(before.data).toHaveLength(2);
    expect(await summaryForProfile(ctx.profile.slug)).toEqual({ average: 4, count: 2 });

    await suspend(secondClient.id);

    const during = await listForProfile(ctx.profile.slug, { page: 1, limit: 10 });
    const duringSummary = await summaryForProfile(ctx.profile.slug);
    expect(during.data).toHaveLength(1);
    expect(during.data[0]?.comment).toBe('Faultless.');
    expect(duringSummary).toEqual({ average: 5, count: 1 });
    // The bug shape this codebase has shipped twice: a count that disagrees
    // with the list it is printed beside.
    expect(during.total).toBe(duringSummary.count);
    expect(during.data).toHaveLength(duringSummary.count);

    // The row is still there. It left the profile by derivation, not by delete.
    expect(await ratingCount()).toBe(2);

    await reinstate(secondClient.id);

    const after = await listForProfile(ctx.profile.slug, { page: 1, limit: 10 });
    const afterSummary = await summaryForProfile(ctx.profile.slug);
    expect(after.data).toHaveLength(2);
    expect(afterSummary).toEqual({ average: 4, count: 2 });
    expect(after.total).toBe(afterSummary.count);
  });
});

describe('appeals (7.5)', () => {
  it('lets a creative report a rating on their own profile and not one on anybody else’s', async () => {
    const mine = await engagement();
    const theirs = await engagement();

    const myAgreement = await makeCompletedAgreement(mine.conversation);
    const theirAgreement = await makeCompletedAgreement(theirs.conversation);

    const onMyProfile = await rateAgreement({
      userId: mine.client.id,
      agreementId: myAgreement.agreement.id,
      stars: 1,
      comment: 'Never turned up.',
    });
    const onTheirProfile = await rateAgreement({
      userId: theirs.client.id,
      agreementId: theirAgreement.agreement.id,
      stars: 1,
    });

    const report = await reportRating({
      userId: mine.creative.id,
      ratingId: onMyProfile.id,
      reason: 'I was there; there are photographs with timestamps.',
    });
    expect(report.status).toBe('open');

    const error = await refusal(
      reportRating({
        userId: mine.creative.id,
        ratingId: onTheirProfile.id,
        reason: 'I do not like it.',
      }),
    );
    expect(error.status).toBe(404);

    // Nor can the client appeal against their own words.
    await expect(
      reportRating({
        userId: mine.client.id,
        ratingId: onMyProfile.id,
        reason: 'Second thoughts.',
      }),
    ).rejects.toMatchObject({ status: 404 });

    const queue = await adminListOpenReports({ page: 1, limit: 10 });
    expect(queue.total).toBe(1);
    expect(queue.data[0]?.rating.id).toBe(onMyProfile.id);
    expect(queue.data[0]?.rating.comment).toBe('Never turned up.');
    expect(queue.data[0]?.profileSlug).toBe(mine.profile.slug);
  });

  it('records rating_removed when an admin removes it, and the rating leaves the profile', async () => {
    const ctx = await engagement();
    const admin = await makeAdmin();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);

    const rating = await rateAgreement({
      userId: ctx.client.id,
      agreementId: agreement.id,
      stars: 1,
      comment: 'Names somebody who is not on this agreement.',
    });
    await reportRating({
      userId: ctx.creative.id,
      ratingId: rating.id,
      reason: 'It names a third party.',
    });

    await adminRemoveRating({
      adminId: admin.id,
      ratingId: rating.id,
      reason: 'Names a third party.',
    });

    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.action, 'rating_removed'));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.adminId).toBe(admin.id);
    expect(audit[0]?.subjectUserId).toBe(ctx.client.id);
    expect(audit[0]?.profileId).toBe(ctx.profile.id);
    expect(audit[0]?.reason).toBe('Names a third party.');

    // Removed, not rewritten. Nobody edits someone else's words (ADR 0033).
    expect(await ratingCount()).toBe(0);
    expect((await listForProfile(ctx.profile.slug, { page: 1, limit: 10 })).data).toHaveLength(0);
    expect(await summaryForProfile(ctx.profile.slug)).toEqual({ average: null, count: 0 });
    expect(await db.select().from(ratingReports)).toHaveLength(0);
  });

  it('closes an appeal without touching the rating when it is dismissed', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);
    const rating = await rateAgreement({
      userId: ctx.client.id,
      agreementId: agreement.id,
      stars: 2,
      comment: 'Two hours late.',
    });
    const report = await reportRating({
      userId: ctx.creative.id,
      ratingId: rating.id,
      reason: 'I disagree with it.',
    });

    expect(await adminDismissReport(report.id)).toMatchObject({ status: 'dismissed' });
    expect((await adminListOpenReports({ page: 1, limit: 10 })).total).toBe(0);
    expect((await summaryForProfile(ctx.profile.slug)).count).toBe(1);
  });
});

describe('telling the creative (2.4)', () => {
  it('notifies the creative, pointing at their own profile', async () => {
    const ctx = await engagement();
    const { agreement } = await makeCompletedAgreement(ctx.conversation);

    await rateAgreement({ userId: ctx.client.id, agreementId: agreement.id, stars: 4 });

    const forCreative = await listNotifications(ctx.creative.id, { page: 1, limit: 10 });
    expect(forCreative.data).toHaveLength(1);
    expect(forCreative.data[0]?.type).toBe('rating_received');
    expect(forCreative.data[0]?.link).toBe(`/creatives/${ctx.profile.slug}`);

    // The client rated; nobody tells them about their own action.
    expect((await listNotifications(ctx.client.id, { page: 1, limit: 10 })).data).toHaveLength(0);
  });
});
