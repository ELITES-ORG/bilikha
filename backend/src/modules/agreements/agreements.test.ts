import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db, sql } from '../../db/index.js';
import { agreementAcceptances, agreements, messages } from '../../db/schema/index.js';
import type { AppError } from '../../lib/http-error.js';
import { hashPassword } from '../../lib/password.js';
import { getThread } from '../conversations/conversations.service.js';
import { listNotifications } from '../notifications/notifications.service.js';
import {
  PASSWORD,
  makeAgreement,
  makeConversation,
  makeCreative,
  makeUser,
  reinstate,
  suspend,
} from '../../test/factories.js';
import {
  acceptAgreement,
  canonicalContent,
  contentHash,
  getAgreement,
  issueAgreement,
  listAgreements,
  recordEvent,
  requestRevision,
} from './agreements.service.js';

/**
 * Plan 0016 steps 7.1 to 7.5, against a real database. The two things worth
 * having a suite for at all — the content hash and the advisory lock — are
 * exactly what a mocked database cannot see (rule 11). The lock is covered in
 * agreements.lifecycle.test.ts.
 */

const LINE_ITEMS = [
  { description: 'Half-day shoot', priceCentavos: 500_000 },
  { description: 'Twenty edited photographs', priceCentavos: 250_000 },
  { description: 'Online gallery for thirty days', priceCentavos: 50_000 },
];
const TOTAL = 800_000;

const INPUT = {
  packageTitle: 'Wedding coverage',
  notes: 'Travel within Biliran included.',
  startDate: '2026-10-03',
  durationDays: 14,
  lineItems: LINE_ITEMS,
};

/**
 * The client's password hash is real here: the shared one in factories.ts is a
 * placeholder, and acceptance is the one path that actually verifies it.
 */
async function thread() {
  const creative = await makeCreative();
  const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
  const conversation = await makeConversation(client.id, creative.profile);
  return { creative, client, conversation };
}

/** The error a call was refused with, so its wording can be read as well as its status. */
async function refusal(call: Promise<unknown>): Promise<AppError> {
  try {
    await call;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Expected the call to be refused, and it succeeded.');
}

describe('canonical content and its hash', () => {
  it('orders line items by sortOrder, not by the order they arrive in', () => {
    const agreement = {
      packageTitle: 'A',
      notes: null,
      startDate: '2026-01-01',
      durationDays: 3,
    };
    const forwards = canonicalContent(agreement, [
      { description: 'one', priceCentavos: 100, sortOrder: 0 },
      { description: 'two', priceCentavos: 200, sortOrder: 1 },
    ]);
    const backwards = canonicalContent(agreement, [
      { description: 'two', priceCentavos: 200, sortOrder: 1 },
      { description: 'one', priceCentavos: 100, sortOrder: 0 },
    ]);

    expect(forwards).toBe(backwards);
    expect(forwards).toBe(
      '{"packageTitle":"A","notes":null,"startDate":"2026-01-01","durationDays":3,'
        + '"lineItems":[["one",100],["two",200]]}',
    );
  });

  it('carries nothing derived — no total, no end date', () => {
    const content = canonicalContent(INPUT, LINE_ITEMS.map((item, i) => ({ ...item, sortOrder: i })));

    expect(content).not.toContain(String(TOTAL));
    expect(content).not.toContain('2026-10-17');
    expect(content).not.toContain('total');
  });

  it('changes when any priced term changes', () => {
    const items = LINE_ITEMS.map((item, i) => ({ ...item, sortOrder: i }));
    const before = contentHash(INPUT, items);
    const after = contentHash(INPUT, [
      ...items.slice(0, 2),
      { ...items[2]!, priceCentavos: 60_000 },
    ]);

    expect(before).toHaveLength(64);
    expect(after).not.toBe(before);
  });
});

describe('the happy path (7.1)', () => {
  it('issues, totals, dates and accepts with the correct password', async () => {
    const { creative, client, conversation } = await thread();

    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    expect(issued.version).toBe(1);

    const opened = await getAgreement(client.id, issued.id);
    expect(opened.lineItems).toHaveLength(3);
    // The sum of its lines, and start plus duration. Neither is a column.
    expect(opened.totalCentavos).toBe(TOTAL);
    expect(opened.endDate).toBe('2026-10-17');
    expect(opened.status).toBe('sent');
    expect(opened.state.state).toBe('Awaiting response');
    expect(opened.acceptance).toBeNull();

    const accepted = await acceptAgreement({
      userId: client.id,
      agreementId: issued.id,
      password: PASSWORD,
      seenHash: opened.contentHash,
    });
    expect(accepted.status).toBe('accepted');

    const after = await getAgreement(client.id, issued.id);
    expect(after.status).toBe('accepted');
    expect(after.state.state).toBe('Agreed');
    expect(after.acceptance?.acceptedByUserId).toBe(client.id);
    expect(after.acceptance?.acceptedByName).toBe(`${client.firstName} ${client.lastName}`);
    expect(after.acceptance?.acceptedAt).toBe(accepted.acceptedAt);
    expect(after.acceptance?.fingerprint).toBe(opened.contentHash.slice(0, 12));
  });

  it('puts a card in the thread that both parties can read', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);

    const beforeAccept = await getThread(conversation.id, client.id, { limit: 50 });
    const card = beforeAccept.messages.at(-1);
    expect(card?.body).toBe('Sent a work agreement: Wedding coverage');
    expect(card?.agreement).toMatchObject({
      id: issued.id,
      packageTitle: 'Wedding coverage',
      totalCentavos: TOTAL,
      endDate: '2026-10-17',
      state: 'Awaiting response',
    });
    expect(card?.agreementRemoved).toBe(false);

    const opened = await getAgreement(client.id, issued.id);
    await acceptAgreement({
      userId: client.id,
      agreementId: issued.id,
      password: PASSWORD,
      seenHash: opened.contentHash,
    });

    const afterAccept = await getThread(conversation.id, creative.user.id, { limit: 50 });
    expect(afterAccept.messages.at(-1)?.body).toBe('Accepted the work agreement: Wedding coverage');
    expect(afterAccept.messages.at(-1)?.agreement?.state).toBe('Agreed');
    // The card on the earlier message reports the same state — one record.
    expect(afterAccept.messages.at(0)?.agreement?.status).toBe('accepted');
  });

  it('leaves the message standing when the agreement row goes', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);

    // The foreign key is `set null`, as offer_id and posting_id are: the words
    // said in the thread survive the attachment they carried.
    await db.delete(agreements).where(eq(agreements.id, issued.id));

    const posted = await getThread(conversation.id, client.id, { limit: 50 });
    const card = posted.messages.at(-1);
    expect(card?.body).toBe('Sent a work agreement: Wedding coverage');
    expect(card?.agreement).toBeNull();
  });
});

describe('the wrong password (7.2)', () => {
  it('refuses, changes nothing, and says nothing about the agreement', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, issued.id);

    const error = await refusal(
      acceptAgreement({
        userId: client.id,
        agreementId: issued.id,
        password: 'not-the-right-password',
        seenHash: opened.contentHash,
      }),
    );

    expect(error.status).toBe(401);
    expect(error.message).toMatch(/password/i);
    expect(error.message).not.toMatch(/agreement|package|total|price/i);

    const [row] = await db.select().from(agreements).where(eq(agreements.id, issued.id));
    expect(row?.status).toBe('sent');

    const [tally] = await db.select({ value: count() }).from(agreementAcceptances);
    expect(tally?.value).toBe(0);
  });
});

describe('the changed document (7.3)', () => {
  it('refuses a stale hash and tells the client to review it again', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, issued.id);

    // The document moves under the client while the screen is open. Direct SQL
    // stands in for the only way this happens in production — an agreement that
    // is still `sent` is not frozen.
    await db
      .update(agreements)
      .set({ packageTitle: 'Wedding coverage, extended' })
      .where(eq(agreements.id, issued.id));

    const error = await refusal(
      acceptAgreement({
        userId: client.id,
        agreementId: issued.id,
        password: PASSWORD,
        seenHash: opened.contentHash,
      }),
    );

    expect(error.status).toBe(409);
    expect(error.message).toMatch(/changed/i);
    expect(error.message).toMatch(/review it again/i);

    const [tally] = await db.select({ value: count() }).from(agreementAcceptances);
    expect(tally?.value).toBe(0);
  });

  it('checks the hash before the password', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, issued.id);

    await db
      .update(agreements)
      .set({ durationDays: 21 })
      .where(eq(agreements.id, issued.id));

    // Wrong password *and* a stale hash: a client whose document changed is
    // told that, not asked for a password first.
    const error = await refusal(
      acceptAgreement({
        userId: client.id,
        agreementId: issued.id,
        password: 'not-the-right-password',
        seenHash: opened.contentHash,
      }),
    );

    expect(error.status).toBe(409);
    expect(error.message).not.toMatch(/password/i);
  });

  it('refuses a version that has been superseded, pointing at the newer one', async () => {
    const { creative, client, conversation } = await thread();
    const first = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, first.id);

    const second = await issueAgreement(creative.user.id, conversation.id, {
      ...INPUT,
      packageTitle: 'Wedding coverage, two days',
      supersedesId: first.id,
    });
    expect(second.version).toBe(2);

    const error = await refusal(
      acceptAgreement({
        userId: client.id,
        agreementId: first.id,
        password: PASSWORD,
        seenHash: opened.contentHash,
      }),
    );

    expect(error.status).toBe(400);
    expect(error.message).toMatch(/newer version/i);

    const stale = await getAgreement(client.id, first.id);
    expect(stale.status).toBe('superseded');
    expect(stale.state.state).toBe('Superseded');
    expect(stale.supersededById).toBe(second.id);
    expect(stale.supersededByVersion).toBe(2);
  });
});

describe('immutability (7.4)', () => {
  it('the database refuses to change an accepted agreement or its line items', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, issued.id);
    await acceptAgreement({
      userId: client.id,
      agreementId: issued.id,
      password: PASSWORD,
      seenHash: opened.contentHash,
    });

    await expect(async () => {
      await sql`update agreements set package_title = 'Something else' where id = ${issued.id}`;
    }).rejects.toThrow(/accepted agreements cannot be modified/i);

    await expect(async () => {
      await sql`update agreement_line_items set price_centavos = 1 where agreement_id = ${issued.id}`;
    }).rejects.toThrow(/cannot be modified/i);

    const unchanged = await getAgreement(client.id, issued.id);
    expect(unchanged.packageTitle).toBe('Wedding coverage');
    expect(unchanged.totalCentavos).toBe(TOTAL);
    expect(unchanged.contentHash).toBe(opened.contentHash);
  });

  it('the service refuses a second acceptance and a revision request', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, issued.id);
    await acceptAgreement({
      userId: client.id,
      agreementId: issued.id,
      password: PASSWORD,
      seenHash: opened.contentHash,
    });

    await expect(
      acceptAgreement({
        userId: client.id,
        agreementId: issued.id,
        password: PASSWORD,
        seenHash: opened.contentHash,
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      requestRevision(client.id, issued.id, 'Can we move the date?'),
    ).rejects.toMatchObject({ status: 400 });

    const [tally] = await db.select({ value: count() }).from(agreementAcceptances);
    expect(tally?.value).toBe(1);
  });
});

describe('wrong party, wrong thread (7.5)', () => {
  it('a creative cannot accept their own agreement', async () => {
    const { creative, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(creative.user.id, issued.id);

    await expect(
      acceptAgreement({
        userId: creative.user.id,
        agreementId: issued.id,
        password: PASSWORD,
        seenHash: opened.contentHash,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('a client cannot issue one, and a stranger gets 404 rather than 403', async () => {
    const { client, conversation } = await thread();
    const stranger = await makeUser();

    // Phase 3 verify, step 2.2: a client is a participant, so 403; a stranger
    // is not, so requireParticipant answers 404 before the role is considered.
    await expect(issueAgreement(client.id, conversation.id, INPUT)).rejects.toMatchObject({
      status: 403,
    });
    await expect(issueAgreement(stranger.id, conversation.id, INPUT)).rejects.toMatchObject({
      status: 404,
    });

    const [tally] = await db.select({ value: count() }).from(agreements);
    expect(tally?.value).toBe(0);
  });

  it('a third account gets 404 on every route for that agreement', async () => {
    const { creative, conversation } = await thread();
    const stranger = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);

    await expect(getAgreement(stranger.id, issued.id)).rejects.toMatchObject({ status: 404 });
    await expect(requestRevision(stranger.id, issued.id, 'Change it')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      acceptAgreement({
        userId: stranger.id,
        agreementId: issued.id,
        password: PASSWORD,
        seenHash: issued.contentHash,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      recordEvent({ userId: stranger.id, agreementId: issued.id, type: 'started' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('asking for changes, and the version that answers it', () => {
  it('records the note, keeps the status, and posts into the thread', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);

    await requestRevision(client.id, issued.id, 'Could we start a week later?');

    const after = await getAgreement(creative.user.id, issued.id);
    expect(after.status).toBe('sent');
    expect(after.revisionNote).toBe('Could we start a week later?');
    expect(after.revisionRequestedAt).not.toBeNull();

    const posted = await getThread(conversation.id, creative.user.id, { limit: 50 });
    expect(posted.messages.at(-1)?.body).toBe(
      'Asked for changes to the work agreement: Could we start a week later?',
    );
  });

  it('only the client may ask, and only while the version is still open', async () => {
    const { creative, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);

    await expect(
      requestRevision(creative.user.id, issued.id, 'Changing my own mind'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('supersedes the predecessor in the same transaction as the new version', async () => {
    const { creative, client, conversation } = await thread();
    const first = await issueAgreement(creative.user.id, conversation.id, INPUT);
    await requestRevision(client.id, first.id, 'Could we start a week later?');

    const second = await issueAgreement(creative.user.id, conversation.id, {
      ...INPUT,
      startDate: '2026-10-10',
      supersedesId: first.id,
    });

    expect(second.version).toBe(2);
    expect((await getAgreement(client.id, first.id)).status).toBe('superseded');
    expect((await getAgreement(client.id, second.id)).supersedesId).toBe(first.id);

    const posted = await getThread(conversation.id, client.id, { limit: 50 });
    expect(posted.messages.at(-1)?.body).toBe(
      'Sent an updated work agreement (version 2): Wedding coverage',
    );
  });

  it('refuses to supersede a version from another conversation', async () => {
    const first = await thread();
    const second = await thread();
    const theirs = await issueAgreement(first.creative.user.id, first.conversation.id, INPUT);

    await expect(
      issueAgreement(second.creative.user.id, second.conversation.id, {
        ...INPUT,
        supersedesId: theirs.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to supersede a version twice', async () => {
    const { creative, conversation } = await thread();
    const first = await issueAgreement(creative.user.id, conversation.id, INPUT);
    await issueAgreement(creative.user.id, conversation.id, { ...INPUT, supersedesId: first.id });

    await expect(
      issueAgreement(creative.user.id, conversation.id, { ...INPUT, supersedesId: first.id }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('notifications', () => {
  it('tells the other party at each step, and links to the record', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);

    const forClient = await listNotifications(client.id, { page: 1, limit: 10 });
    expect(forClient.data[0]?.type).toBe('agreement_issued');
    expect(forClient.data[0]?.link).toBe(`/agreements/${issued.id}`);

    await requestRevision(client.id, issued.id, 'Could we start a week later?');
    const opened = await getAgreement(client.id, issued.id);
    await acceptAgreement({
      userId: client.id,
      agreementId: issued.id,
      password: PASSWORD,
      seenHash: opened.contentHash,
    });

    const forCreative = await listNotifications(creative.user.id, { page: 1, limit: 10 });
    expect(forCreative.data.map((n) => n.type).sort()).toEqual([
      'agreement_accepted',
      'agreement_revision_requested',
    ]);
    expect(forCreative.data.every((n) => n.link === `/agreements/${issued.id}`)).toBe(true);

    // Nobody is told about their own action: the client asked and accepted, so
    // it still has only the one it was sent.
    const clientAgain = await listNotifications(client.id, { page: 1, limit: 10 });
    expect(clientAgain.data).toHaveLength(1);
  });
});

describe('the index, mirrored by mode (6.5)', () => {
  it('lists what a creative issued and what a client received, and never the other', async () => {
    const creative = await makeCreative();
    const otherCreative = await makeCreative();
    // One account holding agreements on both sides.
    const both = await makeCreative();

    const asClient = await makeConversation(both.user.id, creative.profile);
    const asCreative = await makeConversation(otherCreative.user.id, both.profile);

    await issueAgreement(creative.user.id, asClient.id, {
      ...INPUT,
      packageTitle: 'Received package',
    });
    await issueAgreement(both.user.id, asCreative.id, {
      ...INPUT,
      packageTitle: 'Issued package',
    });

    const issued = await listAgreements(both.user.id, { mode: 'creative' });
    expect(issued.data.map((row) => row.packageTitle)).toEqual(['Issued package']);
    expect(issued.data[0]?.totalCentavos).toBe(TOTAL);
    expect(issued.data[0]?.endDate).toBe('2026-10-17');
    expect(issued.data[0]?.state).toBe('Awaiting response');

    const received = await listAgreements(both.user.id, { mode: 'hiring' });
    expect(received.data.map((row) => row.packageTitle)).toEqual(['Received package']);

    const stranger = await makeUser();
    expect((await listAgreements(stranger.id, { mode: 'hiring' })).data).toEqual([]);
    expect((await listAgreements(stranger.id, { mode: 'creative' })).data).toEqual([]);
  });

  it('hides a suspended counterparty’s name without dropping the agreement', async () => {
    const { creative, client, conversation } = await thread();
    await issueAgreement(creative.user.id, conversation.id, INPUT);

    const visible = await listAgreements(client.id, { mode: 'hiring' });
    expect(visible.data[0]?.otherPartyName).toBe(
      `${creative.user.firstName} ${creative.user.lastName}`,
    );

    await suspend(creative.user.id);
    const hidden = await listAgreements(client.id, { mode: 'hiring' });
    expect(hidden.data).toHaveLength(1);
    expect(hidden.data[0]?.otherPartyName).toBe('Unknown');

    await reinstate(creative.user.id);
    const back = await listAgreements(client.id, { mode: 'hiring' });
    expect(back.data[0]?.otherPartyName).not.toBe('Unknown');
  });

  it('sorts awaiting-response first, then by start date', async () => {
    const { creative, client, conversation } = await thread();

    await makeAgreement(conversation, {
      agreement: { packageTitle: 'Closed, starts first', startDate: '2026-01-05' },
    });
    const early = await issueAgreement(creative.user.id, conversation.id, {
      ...INPUT,
      packageTitle: 'Open, starts second',
      startDate: '2026-02-01',
    });
    await issueAgreement(creative.user.id, conversation.id, {
      ...INPUT,
      packageTitle: 'Open, starts third',
      startDate: '2026-03-01',
    });

    await db
      .update(agreements)
      .set({ status: 'withdrawn' })
      .where(eq(agreements.packageTitle, 'Closed, starts first'));

    const listed = await listAgreements(client.id, { mode: 'hiring' });
    expect(listed.data.map((row) => row.packageTitle)).toEqual([
      'Open, starts second',
      'Open, starts third',
      'Closed, starts first',
    ]);
    expect(listed.data[0]?.id).toBe(early.id);
  });
});

describe('no password material anywhere', () => {
  it('leaves nothing password-shaped in the rows it writes', async () => {
    const { creative, client, conversation } = await thread();
    const issued = await issueAgreement(creative.user.id, conversation.id, INPUT);
    const opened = await getAgreement(client.id, issued.id);
    const accepted = await acceptAgreement({
      userId: client.id,
      agreementId: issued.id,
      password: PASSWORD,
      seenHash: opened.contentHash,
    });

    expect(JSON.stringify(accepted)).not.toContain(PASSWORD);
    expect(JSON.stringify(await getAgreement(client.id, issued.id))).not.toContain(PASSWORD);

    const [acceptance] = await db.select().from(agreementAcceptances);
    expect(JSON.stringify(acceptance)).not.toContain(PASSWORD);

    const rows = await db.select().from(messages).where(eq(messages.agreementId, issued.id));
    expect(rows.every((row) => !row.body.includes(PASSWORD))).toBe(true);
  });
});
