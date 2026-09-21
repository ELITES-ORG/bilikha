/**
 * How a creative's work is doing — derived on read from offers, conversations,
 * agreements and ratings (ADR 0039). No counter columns; reuse deriveState,
 * totalOf and summaryForProfile rather than a second answer to each question.
 */

import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import type { WorkSummary } from '../../contracts/work.js';
import type { OwnProfileStatus } from '../../contracts/me.js';
import { db } from '../../db/index.js';
import {
  agreementAcceptances,
  agreementEvents,
  agreementLineItems,
  agreements,
  conversations,
  creativeProfiles,
  messages,
  offers,
  savedOffers,
} from '../../db/schema/index.js';
import type { Agreement, AgreementEvent } from '../../db/schema/agreements.js';
import { AppError } from '../../lib/http-error.js';
import { medianCentavos } from '../../lib/median.js';
import { deriveState, totalOf } from '../agreements/agreements.service.js';
import { summaryForProfile } from '../ratings/ratings.service.js';

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

/**
 * A creative's work summary. 404 when the account has no creative profile —
 * the same answer a missing resource gets, so a client cannot learn that the
 * surface exists by probing.
 */
export async function workSummary(userId: string): Promise<WorkSummary> {
  const [profile] = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      status: creativeProfiles.status,
      editedSinceReviewAt: creativeProfiles.editedSinceReviewAt,
    })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) throw AppError.notFound('No creative profile.');

  const [offerRows, savedRows, inquiryRows, agreementRows, ratings] = await Promise.all([
    db
      .select({ id: offers.id })
      .from(offers)
      .where(eq(offers.profileId, profile.id)),
    db
      .select({ total: count() })
      .from(savedOffers)
      .innerJoin(offers, eq(savedOffers.offerId, offers.id))
      .where(and(eq(offers.profileId, profile.id), ne(savedOffers.userId, userId))),
    loadInquiries(userId),
    loadAgreements(userId),
    summaryForProfile(profile.slug),
  ]);

  return {
    profile: {
      slug: profile.slug,
      status: profile.status as OwnProfileStatus,
      editedSinceReviewAt: profile.editedSinceReviewAt?.toISOString() ?? null,
    },
    offers: {
      total: offerRows.length,
      savedByOthers: Number(savedRows[0]?.total ?? 0),
    },
    inquiries: inquiryRows,
    agreements: agreementRows.counts,
    money: agreementRows.money,
    ratings,
  };
}

/**
 * Conversations where this user is the creative. `awaitingYourReply` is the
 * count whose newest message is from the client — unread or not, that is the
 * message waiting on them.
 */
async function loadInquiries(userId: string): Promise<{
  total: number;
  awaitingYourReply: number;
}> {
  const threads = await db
    .select({
      id: conversations.id,
      clientUserId: conversations.clientUserId,
    })
    .from(conversations)
    .where(eq(conversations.creativeUserId, userId));

  if (threads.length === 0) return { total: 0, awaitingYourReply: 0 };

  const ids = threads.map((t) => t.id);
  // Ascending so the last write into the map is the newest message per thread.
  const messageRows = await db
    .select({
      conversationId: messages.conversationId,
      senderUserId: messages.senderUserId,
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .orderBy(asc(messages.createdAt));

  const latestById = new Map<string, string>();
  for (const row of messageRows) {
    latestById.set(row.conversationId, row.senderUserId);
  }

  let awaitingYourReply = 0;
  for (const thread of threads) {
    const sender = latestById.get(thread.id);
    if (sender && sender === thread.clientUserId) awaitingYourReply += 1;
  }

  return { total: threads.length, awaitingYourReply };
}

/**
 * Every agreement this creative participates in, classified by deriveState and
 * valued with totalOf — never by reading status as the lifecycle, never by a
 * fresh sum over line items.
 */
async function loadAgreements(userId: string): Promise<{
  counts: WorkSummary['agreements'];
  money: WorkSummary['money'];
}> {
  const rows = await db
    .select({ agreement: agreements })
    .from(agreements)
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .where(eq(conversations.creativeUserId, userId));

  const agreementList = rows.map((r) => r.agreement);
  const empty = {
    counts: {
      total: 0,
      awaitingClientAcceptance: 0,
      agreed: 0,
      inProgress: 0,
      awaitingClientConfirmation: 0,
      completed: 0,
      cancelled: 0,
    },
    money: emptyMoney(),
  };
  if (agreementList.length === 0) return empty;

  const ids = agreementList.map((a) => a.id);
  const [items, events, acceptances] = await Promise.all([
    db
      .select()
      .from(agreementLineItems)
      .where(inArray(agreementLineItems.agreementId, ids)),
    db
      .select()
      .from(agreementEvents)
      .where(inArray(agreementEvents.agreementId, ids)),
    db
      .select()
      .from(agreementAcceptances)
      .where(inArray(agreementAcceptances.agreementId, ids)),
  ]);

  const itemsById = groupBy(items, (row) => row.agreementId);
  const eventsById = groupBy(events, (row) => row.agreementId);
  const acceptanceById = new Map(acceptances.map((row) => [row.agreementId, row]));

  // `total` is incremented per counted state rather than taken from the row
  // count, so the states always partition it. Taking it from the rows is how a
  // superseded version ended up in the total and in no state, leaving a reader
  // with "2 agreements · 1 cancelled" and nowhere to find the second.
  //
  // Money accumulates in the same case that counts: a second pass is how two
  // numbers that must agree stop agreeing (plan 0027 audit / plan 0028).
  const counts = { ...empty.counts };
  const money = emptyMoney();
  /** Values a client accepted and did not cancel — the set the typical draws from. */
  const acceptedValues: number[] = [];

  for (const agreement of agreementList) {
    const lineItems = itemsById.get(agreement.id) ?? [];
    const value = totalOf(lineItems);
    const state = deriveState(
      agreement as Agreement,
      (eventsById.get(agreement.id) ?? []) as AgreementEvent[],
      acceptanceById.get(agreement.id) ?? null,
    ).state;

    switch (state) {
      case 'Awaiting response':
        counts.awaitingClientAcceptance += 1;
        counts.total += 1;
        money.proposedCentavos += value;
        break;
      case 'Agreed':
        counts.agreed += 1;
        counts.total += 1;
        money.agreedCentavos += value;
        money.committedCentavos += value;
        acceptedValues.push(value);
        break;
      case 'In progress':
        counts.inProgress += 1;
        counts.total += 1;
        money.inProgressCentavos += value;
        money.committedCentavos += value;
        acceptedValues.push(value);
        break;
      case 'Awaiting confirmation':
        counts.awaitingClientConfirmation += 1;
        counts.total += 1;
        money.awaitingConfirmationCentavos += value;
        money.committedCentavos += value;
        acceptedValues.push(value);
        break;
      case 'Completed':
        counts.completed += 1;
        counts.total += 1;
        money.completedCentavos += value;
        money.committedCentavos += value;
        acceptedValues.push(value);
        break;
      case 'Cancelled':
        counts.cancelled += 1;
        counts.total += 1;
        money.cancelledCentavos += value;
        break;
      default:
        // Superseded and Withdrawn are not live engagements: a superseded row
        // is an earlier version of the agreement counted beside it, and a
        // withdrawn one never became anything. Counting either would report a
        // single revised agreement as two. Neither is money.
        break;
    }
  }

  // A "typical" drawn from one agreement is that agreement. Only claim one
  // once there are at least two accepted values to stand between.
  money.typicalCentavos =
    acceptedValues.length >= 2 ? medianCentavos(acceptedValues) : null;

  return {
    counts,
    money,
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}
