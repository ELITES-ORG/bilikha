/**
 * One-time (idempotent) backfill: inquiries → conversations + messages.
 * Does not drop the inquiries table — that is Phase 8.
 *
 *   npm --prefix backend run migrate:inquiries
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../db/index.js';
import {
  conversations,
  creativeProfiles,
  inquiries,
  messages,
} from '../db/schema/index.js';

const rows = await db
  .select({
    id: inquiries.id,
    profileId: inquiries.profileId,
    senderUserId: inquiries.senderUserId,
    subject: inquiries.subject,
    message: inquiries.message,
    response: inquiries.response,
    readAt: inquiries.readAt,
    respondedAt: inquiries.respondedAt,
    createdAt: inquiries.createdAt,
    creativeUserId: creativeProfiles.userId,
  })
  .from(inquiries)
  .innerJoin(creativeProfiles, eq(inquiries.profileId, creativeProfiles.id))
  .orderBy(inquiries.createdAt);

let conversationsCreated = 0;
let conversationsReused = 0;
let messagesInserted = 0;
let responsesInserted = 0;

for (const row of rows) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.profileId, row.profileId),
          eq(conversations.clientUserId, row.senderUserId),
        ),
      )
      .limit(1);

    let conversation = existing ?? null;
    if (!conversation) {
      const [created] = await tx
        .insert(conversations)
        .values({
          profileId: row.profileId,
          creativeUserId: row.creativeUserId,
          clientUserId: row.senderUserId,
          subject: row.subject,
          createdAt: row.createdAt,
          lastMessageAt: row.createdAt,
          creativeLastReadAt: row.readAt ?? null,
        })
        .returning();
      conversation = created!;
      conversationsCreated += 1;
    } else {
      conversationsReused += 1;
    }

    const [opening] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          eq(messages.senderUserId, row.senderUserId),
          eq(messages.body, row.message),
          eq(messages.createdAt, row.createdAt),
        ),
      )
      .limit(1);

    if (!opening) {
      await tx.insert(messages).values({
        conversationId: conversation.id,
        senderUserId: row.senderUserId,
        body: row.message,
        createdAt: row.createdAt,
      });
      messagesInserted += 1;
    }

    let lastAt = row.createdAt;
    if (row.response) {
      const responseAt = row.respondedAt ?? row.createdAt;
      const [reply] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.senderUserId, row.creativeUserId),
            eq(messages.body, row.response),
            eq(messages.createdAt, responseAt),
          ),
        )
        .limit(1);

      if (!reply) {
        await tx.insert(messages).values({
          conversationId: conversation.id,
          senderUserId: row.creativeUserId,
          body: row.response,
          createdAt: responseAt,
        });
        responsesInserted += 1;
        messagesInserted += 1;
      }
      if (responseAt > lastAt) lastAt = responseAt;
    }

    const patch: {
      lastMessageAt?: Date;
      creativeLastReadAt?: Date | null;
    } = {};

    if (!conversation.lastMessageAt || lastAt > conversation.lastMessageAt) {
      patch.lastMessageAt = lastAt;
    }
    if (row.readAt) {
      const current = conversation.creativeLastReadAt;
      if (!current || row.readAt > current) {
        patch.creativeLastReadAt = row.readAt;
      }
    }

    if (Object.keys(patch).length > 0) {
      await tx.update(conversations).set(patch).where(eq(conversations.id, conversation.id));
    }
  });
}

const [counts] = await db.execute<{
  inquiries: string;
  conversations: string;
  with_response: string;
  messages: string;
}>(sql`
  SELECT
    (SELECT count(*)::text FROM inquiries) AS inquiries,
    (SELECT count(*)::text FROM conversations) AS conversations,
    (SELECT count(*)::text FROM inquiries WHERE response IS NOT NULL) AS with_response,
    (SELECT count(*)::text FROM messages) AS messages
`);

console.log('Migration complete.');
console.log({
  inquiriesProcessed: rows.length,
  conversationsCreated,
  conversationsReused,
  messagesInserted,
  responsesInserted,
  counts,
});

await closeDatabase();
process.exit(0);
