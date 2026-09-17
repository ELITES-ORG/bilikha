import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../../db/index.js';
import {
  agreementAcceptances,
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

  it('refuses deleting the client, and refuses clearing the way first', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAcceptedAgreement(conversation);

    // accepted_by_user_id is ON DELETE RESTRICT, so the bare delete stops here.
    await expect(async () => {
      await sql`delete from users where id = ${client.id}`;
    }).rejects.toThrow();

    // The way round it is to drop the acceptance first and then let the cascade
    // walk user → conversations → agreements. That route is closed too, which
    // is the point: the record cannot be cleared by removing what references it.
    await expect(async () => {
      await sql`delete from agreement_acceptances where agreement_id = ${agreement.id}`;
    }).rejects.toThrow(/acceptance cannot be changed or removed/i);

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

/**
 * Found auditing plan 0020. The agreement was frozen and undeletable while the
 * row proving it had been accepted — by whom, when, against what content — was
 * neither. ADR 0029 puts the evidential weight on exactly that row.
 */
describe('an acceptance is written once and never changes', () => {
  it('refuses changing the content hash', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAcceptedAgreement(conversation);

    await expect(async () => {
      await sql`update agreement_acceptances set content_hash = ${'b'.repeat(64)}
                where agreement_id = ${agreement.id}`;
    }).rejects.toThrow(/acceptance cannot be changed or removed/i);
  });

  it('refuses reassigning who accepted it', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAcceptedAgreement(conversation);

    await expect(async () => {
      await sql`update agreement_acceptances set accepted_by_user_id = ${creative.user.id}
                where agreement_id = ${agreement.id}`;
    }).rejects.toThrow(/acceptance cannot be changed or removed/i);

    const [row] = await db
      .select({ acceptedBy: agreementAcceptances.acceptedByUserId })
      .from(agreementAcceptances)
      .where(eq(agreementAcceptances.agreementId, agreement.id));
    expect(row?.acceptedBy).toBe(client.id);
  });

  it('refuses deleting it, so no accepted agreement is left without one', async () => {
    const creative = await makeCreative();
    const client = await makeUser();
    const conversation = await makeConversation(client.id, creative.profile);
    const { agreement } = await makeAcceptedAgreement(conversation);

    await expect(async () => {
      await sql`delete from agreement_acceptances where agreement_id = ${agreement.id}`;
    }).rejects.toThrow(/acceptance cannot be changed or removed/i);

    const [row] = await db
      .select({ id: agreementAcceptances.id })
      .from(agreementAcceptances)
      .where(eq(agreementAcceptances.agreementId, agreement.id));
    expect(row?.id).toBeTruthy();
  });
});
