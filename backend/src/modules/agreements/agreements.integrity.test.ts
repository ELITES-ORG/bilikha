import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../../db/index.js';
import {
  agreements,
  conversations,
  notifications,
  users,
} from '../../db/schema/index.js';
import { listNotifications } from '../notifications/notifications.service.js';
import {
  makeAcceptedAgreement,
  makeAgreement,
  makeConversation,
  makeCreative,
  makeUser,
} from '../../test/factories.js';

/**
 * Plan 0020: precise notification regression for `agreement_event`, and the
 * accepted-agreement deletion guard (ADR 0032) attacked in SQL — the same way
 * the freeze gap was found.
 */

describe('rows written before plan 0020 still render (1.4)', () => {
  it('keeps the agreement_event title and link for an old row', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAcceptedAgreement(conversation);

    // Insert the legacy type directly — it is no longer emitted.
    await db.insert(notifications).values({
      userId: client.id,
      actorUserId: creative.user.id,
      type: 'agreement_event',
      targetId: agreement.id,
    });

    const { data } = await listNotifications(client.id, { page: 1, limit: 10 });
    expect(data).toHaveLength(1);
    expect(data[0]?.type).toBe('agreement_event');
    expect(data[0]?.title).toBe('A work agreement was updated');
    expect(data[0]?.link).toBe(`/agreements/${agreement.id}`);
  });
});

describe('an accepted agreement is not deleted (3.1, 3.2)', () => {
  it('refuses DELETE on an accepted row, and allows it on a draft', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement: accepted } = await makeAcceptedAgreement(conversation);
    const { agreement: draft } = await makeAgreement(conversation);

    await expect(async () => {
      await sql`delete from agreements where id = ${accepted.id}`;
    }).rejects.toThrow(/accepted agreements cannot be deleted/i);

    const [stillThere] = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(eq(agreements.id, accepted.id));
    expect(stillThere?.id).toBe(accepted.id);

    await sql`delete from agreements where id = ${draft.id}`;
    const [gone] = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(eq(agreements.id, draft.id));
    expect(gone).toBeUndefined();
  });

  it('refuses deleting the conversation under an accepted agreement; allows it under a draft', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const withAccepted = await makeConversation(client.id, creative.profile);
    await makeAcceptedAgreement(withAccepted);

    const otherClient = await makeUser();
    const withDraft = await makeConversation(otherClient.id, creative.profile);
    await makeAgreement(withDraft);

    await expect(async () => {
      await sql`delete from conversations where id = ${withAccepted.id}`;
    }).rejects.toThrow(/accepted agreements cannot be deleted/i);

    const [conversationRemains] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, withAccepted.id));
    expect(conversationRemains?.id).toBe(withAccepted.id);

    await sql`delete from conversations where id = ${withDraft.id}`;
    const [draftConversationGone] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, withDraft.id));
    expect(draftConversationGone).toBeUndefined();
  });

  it('refuses deleting the client once the acceptance RESTRICT is out of the way', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAcceptedAgreement(conversation);

    // Today accepted_by_user_id is ON DELETE RESTRICT, so a bare user delete
    // never reaches the agreement. The failure mode ADR 0032 designs against is
    // erasure that detaches those FKs and then walks user → conversations →
    // agreements. Drop the acceptance row first so the cascade is what hits.
    await sql`delete from agreement_acceptances where agreement_id = ${agreement.id}`;

    await expect(async () => {
      await sql`delete from users where id = ${client.id}`;
    }).rejects.toThrow(/accepted agreements cannot be deleted/i);

    const [userRemains] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, client.id));
    expect(userRemains?.id).toBe(client.id);

    const [agreementRemains] = await db
      .select({ id: agreements.id, status: agreements.status })
      .from(agreements)
      .where(eq(agreements.id, agreement.id));
    expect(agreementRemains?.status).toBe('accepted');
  });
});
