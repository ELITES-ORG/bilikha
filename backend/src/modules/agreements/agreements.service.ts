import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  agreementAcceptances,
  agreementEvents,
  agreementLineItems,
  agreements,
  conversations,
  messages,
  users,
} from '../../db/schema/index.js';
import type {
  Agreement,
  AgreementAcceptance,
  AgreementEvent,
  AgreementLineItem,
} from '../../db/schema/agreements.js';
import { AppError } from '../../lib/http-error.js';
import { verifyPassword } from '../../lib/password.js';
import { notify } from '../notifications/notifications.service.js';
import { requireParticipant } from '../conversations/conversations.service.js';
import type { IssueAgreementInput, ListAgreementsInput } from './agreements.schema.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AgreementState =
  | 'Awaiting response'
  | 'Superseded'
  | 'Withdrawn'
  | 'Agreed'
  | 'In progress'
  | 'Awaiting confirmation'
  | 'Completed'
  | 'Cancelled';

export interface DerivedState {
  state: AgreementState;
  /** Who put it in this state. Null only when an accepted row has no acceptance to read. */
  actorUserId: string | null;
  at: string | null;
}

export interface AgreementCard {
  id: string;
  version: number;
  packageTitle: string;
  totalCentavos: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: Agreement['status'];
  state: AgreementState;
}

type CanonicalAgreement = Pick<
  Agreement,
  'packageTitle' | 'notes' | 'startDate' | 'durationDays'
>;
type CanonicalLineItem = Pick<AgreementLineItem, 'description' | 'priceCentavos' | 'sortOrder'>;

/**
 * The exact bytes an acceptance is a hash of. Keys in a fixed order, no
 * whitespace, and nothing derived — no total, no end date, no formatted price.
 * A derived value here would mean a change to a formatting helper silently
 * invalidates every acceptance ever recorded.
 */
export function canonicalContent(
  agreement: CanonicalAgreement,
  lineItems: CanonicalLineItem[],
): string {
  const ordered = [...lineItems].sort((a, b) => a.sortOrder - b.sortOrder);

  return JSON.stringify({
    packageTitle: agreement.packageTitle,
    notes: agreement.notes ?? null,
    startDate: agreement.startDate,
    durationDays: agreement.durationDays,
    lineItems: ordered.map((item) => [item.description, item.priceCentavos]),
  });
}

export function contentHash(
  agreement: CanonicalAgreement,
  lineItems: CanonicalLineItem[],
): string {
  return createHash('sha256').update(canonicalContent(agreement, lineItems)).digest('hex');
}

/** `start_date + duration_days`, never a column (ADR 0029). */
export function endDateOf(startDate: string, durationDays: number): string {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end.toISOString().slice(0, 10);
}

export function totalOf(lineItems: Pick<AgreementLineItem, 'priceCentavos'>[]): number {
  return lineItems.reduce((sum, item) => sum + item.priceCentavos, 0);
}

const STATE_FOR_EVENT: Record<AgreementEvent['type'], AgreementState> = {
  started: 'In progress',
  delivery_marked: 'Awaiting confirmation',
  completion_confirmed: 'Completed',
  cancelled: 'Cancelled',
};

const TERMINAL_STATES: AgreementState[] = ['Completed', 'Cancelled'];

type StatefulAgreement = Pick<Agreement, 'status' | 'issuedByUserId' | 'createdAt'>;
type StatefulEvent = Pick<AgreementEvent, 'type' | 'actorUserId' | 'createdAt'>;
type StatefulAcceptance = Pick<AgreementAcceptance, 'acceptedByUserId' | 'acceptedAt'>;

function newestEvent<T extends StatefulEvent>(events: T[]): T | null {
  let newest: T | null = null;
  for (const event of events) {
    if (!newest || event.createdAt.getTime() >= newest.createdAt.getTime()) newest = event;
  }
  return newest;
}

/**
 * The engagement's current state, from the document's status and the newest
 * event. Pure: no database access, no clock. Nothing here reads `now()` or
 * `startDate` — a date arriving is not an event (ADR 0029).
 *
 * `acceptance` is optional and carries only the actor and timestamp of the
 * Agreed state; the state itself never depends on it.
 */
export function deriveState(
  agreement: StatefulAgreement,
  events: StatefulEvent[],
  acceptance?: StatefulAcceptance | null,
): DerivedState {
  if (agreement.status === 'sent') {
    return {
      state: 'Awaiting response',
      actorUserId: agreement.issuedByUserId,
      at: agreement.createdAt.toISOString(),
    };
  }

  if (agreement.status === 'superseded' || agreement.status === 'withdrawn') {
    return {
      state: agreement.status === 'superseded' ? 'Superseded' : 'Withdrawn',
      actorUserId: agreement.issuedByUserId,
      at: agreement.createdAt.toISOString(),
    };
  }

  const newest = newestEvent(events);
  if (!newest) {
    return {
      state: 'Agreed',
      actorUserId: acceptance?.acceptedByUserId ?? null,
      at: acceptance?.acceptedAt.toISOString() ?? null,
    };
  }

  return {
    state: STATE_FOR_EVENT[newest.type],
    actorUserId: newest.actorUserId,
    at: newest.createdAt.toISOString(),
  };
}

function formatName(parts: {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName, parts.suffix]
    .filter(Boolean)
    .join(' ');
}

/**
 * Resolves an agreement the caller participates in. 404 for both "no such
 * agreement" and "not yours", matching `requireParticipant` — a 403 would
 * confirm that someone else's agreement exists.
 */
async function requireAgreementAccess(userId: string, agreementId: string) {
  const [row] = await db
    .select({ agreement: agreements, conversation: conversations })
    .from(agreements)
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .where(
      and(
        eq(agreements.id, agreementId),
        or(eq(conversations.clientUserId, userId), eq(conversations.creativeUserId, userId)),
      ),
    )
    .limit(1);

  if (!row) throw AppError.notFound('No such work agreement.');
  return row;
}

async function lineItemsOf(agreementId: string, tx: Tx | typeof db = db) {
  return tx
    .select()
    .from(agreementLineItems)
    .where(eq(agreementLineItems.agreementId, agreementId))
    .orderBy(asc(agreementLineItems.sortOrder));
}

/** Posts into the thread and bumps its recency, exactly as `sendMessage` does. */
async function postIntoThread(
  tx: Tx,
  input: {
    conversationId: string;
    senderUserId: string;
    clientUserId: string;
    body: string;
    agreementId: string;
    now: Date;
  },
) {
  const [message] = await tx
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      senderUserId: input.senderUserId,
      body: input.body,
      agreementId: input.agreementId,
      createdAt: input.now,
    })
    .returning();

  const readPatch =
    input.clientUserId === input.senderUserId
      ? { clientLastReadAt: input.now, lastMessageAt: input.now }
      : { creativeLastReadAt: input.now, lastMessageAt: input.now };

  await tx
    .update(conversations)
    .set(readPatch)
    .where(eq(conversations.id, input.conversationId));

  return message!;
}

/**
 * Batch-load the derived parts of a set of agreements — total, end date and
 * lifecycle state — in three queries rather than three per row.
 */
async function loadDerived(rows: Agreement[]) {
  const ids = rows.map((row) => row.id);
  const derived = new Map<string, { totalCentavos: number; endDate: string; state: DerivedState }>();
  if (ids.length === 0) return derived;

  const [items, events, acceptances] = await Promise.all([
    db
      .select({
        agreementId: agreementLineItems.agreementId,
        priceCentavos: agreementLineItems.priceCentavos,
      })
      .from(agreementLineItems)
      .where(inArray(agreementLineItems.agreementId, ids)),
    db
      .select()
      .from(agreementEvents)
      .where(inArray(agreementEvents.agreementId, ids))
      .orderBy(asc(agreementEvents.createdAt)),
    db
      .select()
      .from(agreementAcceptances)
      .where(inArray(agreementAcceptances.agreementId, ids)),
  ]);

  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.agreementId, (totals.get(item.agreementId) ?? 0) + item.priceCentavos);
  }

  const eventsById = new Map<string, AgreementEvent[]>();
  for (const event of events) {
    const list = eventsById.get(event.agreementId) ?? [];
    list.push(event);
    eventsById.set(event.agreementId, list);
  }

  const acceptanceById = new Map(acceptances.map((row) => [row.agreementId, row]));

  for (const row of rows) {
    derived.set(row.id, {
      totalCentavos: totals.get(row.id) ?? 0,
      endDate: endDateOf(row.startDate, row.durationDays),
      state: deriveState(row, eventsById.get(row.id) ?? [], acceptanceById.get(row.id) ?? null),
    });
  }

  return derived;
}

/** Batch-load agreement cards for a page of messages, matching `loadOfferCards`. */
export async function loadAgreementCards(
  agreementIds: string[],
): Promise<Map<string, AgreementCard>> {
  const unique = [...new Set(agreementIds.filter((id): id is string => Boolean(id)))];
  const cards = new Map<string, AgreementCard>();
  if (unique.length === 0) return cards;

  const rows = await db.select().from(agreements).where(inArray(agreements.id, unique));
  const derived = await loadDerived(rows);

  for (const row of rows) {
    const extra = derived.get(row.id)!;
    cards.set(row.id, {
      id: row.id,
      version: row.version,
      packageTitle: row.packageTitle,
      totalCentavos: extra.totalCentavos,
      startDate: row.startDate,
      endDate: extra.endDate,
      durationDays: row.durationDays,
      status: row.status,
      state: extra.state.state,
    });
  }

  return cards;
}

export async function issueAgreement(
  userId: string,
  conversationId: string,
  input: IssueAgreementInput,
) {
  const conversation = await requireParticipant(conversationId, userId);

  // The creative issues; the client accepts. A client drafting one is out of
  // scope by decision, not by omission (ADR 0029).
  if (conversation.creativeUserId !== userId) {
    throw AppError.forbidden('Only the creative in this conversation can send a work agreement.');
  }

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    let version = 1;

    if (input.supersedesId) {
      const [predecessor] = await tx
        .select()
        .from(agreements)
        .where(eq(agreements.id, input.supersedesId))
        .for('update')
        .limit(1);

      if (!predecessor || predecessor.conversationId !== conversation.id) {
        throw AppError.badRequest('That work agreement does not belong to this conversation.', {
          field: 'supersedesId',
        });
      }
      if (predecessor.status !== 'sent') {
        throw AppError.badRequest('That work agreement can no longer be replaced.', {
          field: 'supersedesId',
        });
      }

      version = predecessor.version + 1;

      // In the same transaction as the insert. A second statement leaves a
      // window where the client can accept the version being replaced.
      await tx
        .update(agreements)
        .set({ status: 'superseded' })
        .where(eq(agreements.id, predecessor.id));
    }

    const [agreement] = await tx
      .insert(agreements)
      .values({
        conversationId: conversation.id,
        issuedByUserId: userId,
        version,
        supersedesId: input.supersedesId ?? null,
        packageTitle: input.packageTitle,
        notes: input.notes ?? null,
        startDate: input.startDate,
        durationDays: input.durationDays,
        createdAt: now,
      })
      .returning();

    const lineItems = await tx
      .insert(agreementLineItems)
      .values(
        input.lineItems.map((item, index) => ({
          agreementId: agreement!.id,
          description: item.description,
          priceCentavos: item.priceCentavos,
          sortOrder: index,
        })),
      )
      .returning();

    const body =
      version === 1
        ? `Sent a work agreement: ${input.packageTitle}`
        : `Sent an updated work agreement (version ${version}): ${input.packageTitle}`;

    const message = await postIntoThread(tx, {
      conversationId: conversation.id,
      senderUserId: userId,
      clientUserId: conversation.clientUserId,
      body,
      agreementId: agreement!.id,
      now,
    });

    return { agreement: agreement!, lineItems, messageId: message.id };
  });

  // After the commit, and it swallows its own failures — the agreement stands
  // either way.
  await notify({
    userId: conversation.clientUserId,
    actorUserId: userId,
    type: 'agreement_issued',
    targetId: created.agreement.id,
  });

  return {
    id: created.agreement.id,
    version: created.agreement.version,
    conversationId: conversation.id,
    packageTitle: created.agreement.packageTitle,
    status: created.agreement.status,
    startDate: created.agreement.startDate,
    endDate: endDateOf(created.agreement.startDate, created.agreement.durationDays),
    durationDays: created.agreement.durationDays,
    totalCentavos: totalOf(created.lineItems),
    contentHash: contentHash(created.agreement, created.lineItems),
    messageId: created.messageId,
  };
}

export async function requestRevision(userId: string, agreementId: string, note: string) {
  const { agreement, conversation } = await requireAgreementAccess(userId, agreementId);

  if (conversation.clientUserId !== userId) {
    throw AppError.forbidden('Only the client can ask for changes to a work agreement.');
  }
  if (agreement.status !== 'sent') {
    throw AppError.badRequest(refusalFor(agreement.status));
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    // The status stays `sent` — asking for changes is a note back, not a
    // rejection. The creative answers it with version 2.
    await tx
      .update(agreements)
      .set({ revisionNote: note, revisionRequestedAt: now })
      .where(eq(agreements.id, agreement.id));

    await postIntoThread(tx, {
      conversationId: conversation.id,
      senderUserId: userId,
      clientUserId: conversation.clientUserId,
      body: `Asked for changes to the work agreement: ${note}`,
      agreementId: agreement.id,
      now,
    });
  });

  await notify({
    userId: conversation.creativeUserId,
    actorUserId: userId,
    type: 'agreement_revision_requested',
    targetId: agreement.id,
  });

  return { id: agreement.id, revisionRequestedAt: now.toISOString() };
}

export async function acceptAgreement(input: {
  userId: string;
  agreementId: string;
  password: string;
  seenHash: string;
}) {
  const { agreement, conversation } = await requireAgreementAccess(
    input.userId,
    input.agreementId,
  );

  if (conversation.clientUserId !== input.userId) {
    throw AppError.forbidden('Only the client can accept this work agreement.');
  }
  if (agreement.status !== 'sent') {
    throw AppError.badRequest(refusalFor(agreement.status));
  }

  const lineItems = await lineItemsOf(agreement.id);
  const hash = contentHash(agreement, lineItems);

  // Before the password check: a client whose document changed under them
  // should be told that, not asked for a password first.
  if (hash !== input.seenHash) {
    throw AppError.conflict(
      'This work agreement changed since you opened it. Review it again before accepting.',
    );
  }

  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const correct = account ? await verifyPassword(account.passwordHash, input.password) : false;
  if (!correct) {
    // Says nothing about the agreement: this endpoint must not become an
    // oracle for anything other than the password itself.
    throw AppError.unauthorized('That password is not correct.');
  }

  const accepted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${agreement.id}))`);

    const [current] = await tx
      .select({ status: agreements.status })
      .from(agreements)
      .where(eq(agreements.id, agreement.id))
      .limit(1);
    if (!current) throw AppError.notFound('No such work agreement.');
    if (current.status !== 'sent') throw AppError.badRequest(refusalFor(current.status));

    const now = new Date();
    const [row] = await tx
      .insert(agreementAcceptances)
      .values({
        agreementId: agreement.id,
        acceptedByUserId: input.userId,
        contentHash: hash,
        acceptedAt: now,
      })
      .returning();

    await tx
      .update(agreements)
      .set({ status: 'accepted' })
      .where(eq(agreements.id, agreement.id));

    await postIntoThread(tx, {
      conversationId: conversation.id,
      senderUserId: input.userId,
      clientUserId: conversation.clientUserId,
      body: `Accepted the work agreement: ${agreement.packageTitle}`,
      agreementId: agreement.id,
      now,
    });

    return row!;
  });

  await notify({
    userId: conversation.creativeUserId,
    actorUserId: input.userId,
    type: 'agreement_accepted',
    targetId: agreement.id,
  });

  return {
    id: agreement.id,
    status: 'accepted' as const,
    acceptedAt: accepted.acceptedAt.toISOString(),
    fingerprint: hash.slice(0, 12),
  };
}

/** Why a document that is no longer `sent` cannot be acted on. */
function refusalFor(status: Agreement['status']): string {
  switch (status) {
    case 'superseded':
      return 'This work agreement was replaced by a newer version. Review that one instead.';
    case 'accepted':
      return 'This work agreement has already been accepted.';
    default:
      return 'This work agreement is no longer open.';
  }
}

export async function getAgreement(userId: string, agreementId: string) {
  const { agreement, conversation } = await requireAgreementAccess(userId, agreementId);

  const [lineItems, events, acceptanceRows, successorRows, people] = await Promise.all([
    lineItemsOf(agreement.id),
    db
      .select()
      .from(agreementEvents)
      .where(eq(agreementEvents.agreementId, agreement.id))
      .orderBy(asc(agreementEvents.createdAt)),
    db
      .select()
      .from(agreementAcceptances)
      .where(eq(agreementAcceptances.agreementId, agreement.id))
      .limit(1),
    db
      .select({ id: agreements.id, version: agreements.version })
      .from(agreements)
      .where(eq(agreements.supersedesId, agreement.id))
      .limit(1),
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        middleName: users.middleName,
        lastName: users.lastName,
        suffix: users.suffix,
      })
      .from(users)
      .where(
        inArray(users.id, [conversation.clientUserId, conversation.creativeUserId]),
      ),
  ]);

  const nameOf = (id: string | null) => {
    if (!id) return null;
    const person = people.find((row) => row.id === id);
    return person ? formatName(person) : null;
  };

  const acceptance = acceptanceRows[0] ?? null;
  const state = deriveState(agreement, events, acceptance);

  return {
    id: agreement.id,
    conversationId: agreement.conversationId,
    role: conversation.clientUserId === userId ? ('client' as const) : ('creative' as const),
    version: agreement.version,
    supersedesId: agreement.supersedesId,
    supersededById: successorRows[0]?.id ?? null,
    supersededByVersion: successorRows[0]?.version ?? null,
    packageTitle: agreement.packageTitle,
    notes: agreement.notes,
    startDate: agreement.startDate,
    durationDays: agreement.durationDays,
    endDate: endDateOf(agreement.startDate, agreement.durationDays),
    status: agreement.status,
    totalCentavos: totalOf(lineItems),
    contentHash: contentHash(agreement, lineItems),
    lineItems: lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      priceCentavos: item.priceCentavos,
      sortOrder: item.sortOrder,
    })),
    issuedBy: { userId: agreement.issuedByUserId, name: nameOf(agreement.issuedByUserId) },
    createdAt: agreement.createdAt.toISOString(),
    revisionNote: agreement.revisionNote,
    revisionRequestedAt: agreement.revisionRequestedAt?.toISOString() ?? null,
    acceptance: acceptance
      ? {
          acceptedByUserId: acceptance.acceptedByUserId,
          acceptedByName: nameOf(acceptance.acceptedByUserId),
          acceptedAt: acceptance.acceptedAt.toISOString(),
          // The first 12 characters, labelled a fingerprint of the accepted
          // terms. The full hash is returned above for the accept round-trip.
          fingerprint: acceptance.contentHash.slice(0, 12),
        }
      : null,
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      note: event.note,
      actorUserId: event.actorUserId,
      actorName: nameOf(event.actorUserId),
      createdAt: event.createdAt.toISOString(),
    })),
    state: {
      state: state.state,
      actorUserId: state.actorUserId,
      actorName: nameOf(state.actorUserId),
      at: state.at,
    },
  };
}

const EVENT_RULES: Record<
  AgreementEvent['type'],
  { side: 'creative' | 'client' | 'either'; from: AgreementState[]; refusal: string }
> = {
  started: {
    side: 'creative',
    from: ['Agreed'],
    refusal: 'Only the creative can mark this work as started, and only once it is agreed.',
  },
  delivery_marked: {
    side: 'creative',
    from: ['In progress'],
    refusal: 'Only the creative can mark this work delivered, and only once it is in progress.',
  },
  // The creative cannot complete their own work. ADR 0029, and it is refused
  // here rather than merely hidden in the interface.
  completion_confirmed: {
    side: 'client',
    from: ['Awaiting confirmation'],
    refusal: 'Only the client can confirm completion, and only once the work is delivered.',
  },
  cancelled: {
    side: 'either',
    from: ['Agreed', 'In progress', 'Awaiting confirmation'],
    refusal: 'This engagement can no longer be cancelled.',
  },
};

export async function recordEvent(
  input: {
    userId: string;
    agreementId: string;
    type: AgreementEvent['type'];
    note?: string | null;
  },
  options: { skipLock?: boolean } = {},
) {
  const { agreement, conversation } = await requireAgreementAccess(
    input.userId,
    input.agreementId,
  );

  const rule = EVENT_RULES[input.type];
  const side = conversation.clientUserId === input.userId ? 'client' : 'creative';
  if (rule.side !== 'either' && rule.side !== side) {
    throw AppError.forbidden(rule.refusal);
  }

  const note = input.note?.trim() || null;
  if (input.type === 'cancelled' && !note) {
    throw AppError.badRequest('Give a reason for cancelling.', { field: 'note' });
  }

  /**
   * The advisory lock is what makes two concurrent taps resolve to one event:
   * without it both transactions read the same newest event and both insert.
   *
   * It can only be skipped under NODE_ENV=test, and exists solely so plan 0016
   * step 7.8b can show the concurrency test failing when the lock is gone.
   */
  const useLock = !(options.skipLock && process.env.NODE_ENV === 'test');

  const created = await db.transaction(async (tx) => {
    if (useLock) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${agreement.id}))`);
    }

    const [current] = await tx
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreement.id))
      .limit(1);
    if (!current) throw AppError.notFound('No such work agreement.');

    // Nothing moves on an agreement nobody has accepted yet.
    if (current.status !== 'accepted') {
      throw AppError.badRequest('This work agreement has not been accepted yet.');
    }

    const events = await tx
      .select()
      .from(agreementEvents)
      .where(eq(agreementEvents.agreementId, agreement.id))
      .orderBy(asc(agreementEvents.createdAt));

    const [acceptance] = await tx
      .select()
      .from(agreementAcceptances)
      .where(eq(agreementAcceptances.agreementId, agreement.id))
      .limit(1);

    const state = deriveState(current, events, acceptance ?? null);

    if (TERMINAL_STATES.includes(state.state)) {
      throw AppError.badRequest(`This engagement is ${state.state.toLowerCase()}.`);
    }
    if (!rule.from.includes(state.state)) {
      throw AppError.badRequest(rule.refusal);
    }

    // Stamped inside the lock, so the order of the rows matches the order the
    // transitions actually happened in.
    const now = new Date();
    const [event] = await tx
      .insert(agreementEvents)
      .values({
        agreementId: agreement.id,
        actorUserId: input.userId,
        type: input.type,
        note,
        createdAt: now,
      })
      .returning();

    await postIntoThread(tx, {
      conversationId: conversation.id,
      senderUserId: input.userId,
      clientUserId: conversation.clientUserId,
      body: eventMessageBody(input.type, note),
      agreementId: agreement.id,
      now,
    });

    return { event: event!, state: STATE_FOR_EVENT[input.type] };
  });

  const otherUserId =
    conversation.clientUserId === input.userId
      ? conversation.creativeUserId
      : conversation.clientUserId;

  // Precise types per ADR 0030. `started` is deliberately absent — a client
  // whose work has begun is required to do nothing, so the bell stays quiet
  // (plan 0020). `agreement_event` is no longer emitted; its title remains for
  // rows written before this plan.
  const EVENT_NOTIFICATION = {
    delivery_marked: 'agreement_delivered',
    completion_confirmed: 'agreement_completed',
    cancelled: 'agreement_cancelled',
  } as const satisfies Partial<
    Record<AgreementEvent['type'], 'agreement_delivered' | 'agreement_completed' | 'agreement_cancelled'>
  >;

  const notificationType =
    input.type in EVENT_NOTIFICATION
      ? EVENT_NOTIFICATION[input.type as keyof typeof EVENT_NOTIFICATION]
      : undefined;

  if (notificationType) {
    await notify({
      userId: otherUserId,
      actorUserId: input.userId,
      type: notificationType,
      targetId: agreement.id,
    });
  }

  return {
    id: created.event.id,
    agreementId: agreement.id,
    type: created.event.type,
    state: created.state,
    actorUserId: created.event.actorUserId,
    at: created.event.createdAt.toISOString(),
  };
}

function eventMessageBody(type: AgreementEvent['type'], note: string | null): string {
  switch (type) {
    case 'started':
      return 'Marked the work as started.';
    case 'delivery_marked':
      return 'Marked the work delivered.';
    case 'completion_confirmed':
      return 'Confirmed the work is complete.';
    case 'cancelled':
      return `Cancelled the engagement: ${note}`;
  }
}

/**
 * The History index, mirrored by mode: a creative sees what it issued, a client
 * sees what it received.
 */
export async function listAgreements(userId: string, options: ListAgreementsInput) {
  const mine =
    options.mode === 'creative'
      ? eq(conversations.creativeUserId, userId)
      : eq(conversations.clientUserId, userId);

  // The other party, and only while their account is active — a suspended
  // counterparty's name must not surface (ADR 0028). The agreement stays: it is
  // a record of something that happened.
  const otherPartyId =
    options.mode === 'creative' ? conversations.clientUserId : conversations.creativeUserId;

  const rows = await db
    .select({
      agreement: agreements,
      otherPartyUserId: otherPartyId,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
    })
    .from(agreements)
    .innerJoin(conversations, eq(agreements.conversationId, conversations.id))
    .leftJoin(users, and(eq(users.id, otherPartyId), eq(users.status, 'active')))
    .where(mine)
    .orderBy(
      // Awaiting response first, then by start date. Both are facts about the
      // document, never about today's date.
      sql`case when ${agreements.status} = 'sent' then 0 else 1 end`,
      asc(agreements.startDate),
    );

  const derived = await loadDerived(rows.map((row) => row.agreement));

  return {
    data: rows.map((row) => {
      const extra = derived.get(row.agreement.id)!;
      return {
        id: row.agreement.id,
        conversationId: row.agreement.conversationId,
        version: row.agreement.version,
        packageTitle: row.agreement.packageTitle,
        totalCentavos: extra.totalCentavos,
        startDate: row.agreement.startDate,
        endDate: extra.endDate,
        durationDays: row.agreement.durationDays,
        status: row.agreement.status,
        state: extra.state.state,
        stateAt: extra.state.at,
        otherPartyName: row.firstName
          ? formatName({
              firstName: row.firstName,
              middleName: row.middleName,
              lastName: row.lastName!,
              suffix: row.suffix,
            })
          : 'Unknown',
      };
    }),
  };
}
