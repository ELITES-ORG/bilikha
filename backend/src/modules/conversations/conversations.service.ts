import { and, asc, count, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  conversations,
  conversationReports,
  creativeProfiles,
  messages,
  userBlocks,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import type {
  ListMessagesInput,
  ListThreadsInput,
  ReportInput,
  SendMessageInput,
  StartConversationInput,
} from './conversations.schema.js';

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

const BLOCKED_MESSAGE = 'This message cannot be delivered.';

/**
 * Resolves a conversation the caller actually participates in. Returns 404 for
 * both "no such conversation" and "not yours" — distinguishing them leaks the
 * existence of other people's threads.
 */
async function requireParticipant(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.clientUserId, userId), eq(conversations.creativeUserId, userId)),
      ),
    )
    .limit(1);

  if (!row) throw AppError.notFound('No such conversation.');
  return row;
}

async function assertNotBlockedEitherWay(userA: string, userB: string) {
  const [block] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerUserId, userA), eq(userBlocks.blockedUserId, userB)),
        and(eq(userBlocks.blockerUserId, userB), eq(userBlocks.blockedUserId, userA)),
      ),
    )
    .limit(1);

  if (block) throw AppError.forbidden(BLOCKED_MESSAGE);
}

function unreadCondition(conversation: typeof conversations.$inferSelect, userId: string) {
  const isClient = conversation.clientUserId === userId;
  const otherUserId = isClient ? conversation.creativeUserId : conversation.clientUserId;
  const lastRead = isClient ? conversation.clientLastReadAt : conversation.creativeLastReadAt;

  if (lastRead) {
    return and(
      eq(messages.conversationId, conversation.id),
      eq(messages.senderUserId, otherUserId),
      gt(messages.createdAt, lastRead),
    );
  }
  return and(
    eq(messages.conversationId, conversation.id),
    eq(messages.senderUserId, otherUserId),
  );
}

export async function startOrContinue(userId: string, input: StartConversationInput) {
  const [profile] = await db
    .select({
      id: creativeProfiles.id,
      userId: creativeProfiles.userId,
      status: creativeProfiles.status,
    })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.slug, input.profileSlug))
    .limit(1);

  if (!profile || profile.status !== 'published') {
    throw AppError.notFound('Creative not found.');
  }

  if (profile.userId === userId) {
    throw AppError.badRequest('You cannot contact your own profile.');
  }

  await assertNotBlockedEitherWay(userId, profile.userId);

  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.profileId, profile.id), eq(conversations.clientUserId, userId)),
      )
      .limit(1);

    let conversation = existing ?? null;
    if (!conversation) {
      const [created] = await tx
        .insert(conversations)
        .values({
          profileId: profile.id,
          creativeUserId: profile.userId,
          clientUserId: userId,
          subject: input.subject,
          lastMessageAt: now,
          clientLastReadAt: now,
        })
        .returning();
      conversation = created!;
    }

    const [message] = await tx
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderUserId: userId,
        body: input.body,
        createdAt: now,
      })
      .returning();

    await tx
      .update(conversations)
      .set({ lastMessageAt: now, clientLastReadAt: now })
      .where(eq(conversations.id, conversation.id));

    return {
      id: conversation.id,
      subject: conversation.subject,
      continued: Boolean(existing),
      message: {
        id: message!.id,
        body: message!.body,
        createdAt: message!.createdAt.toISOString(),
      },
    };
  });
}

export async function listThreads(userId: string, options: ListThreadsInput) {
  const offset = (options.page - 1) * options.limit;

  const totalRows = await db
    .select({ total: count() })
    .from(conversations)
    .where(
      or(eq(conversations.clientUserId, userId), eq(conversations.creativeUserId, userId)),
    );
  const total = Number(totalRows[0]?.total ?? 0);

  const rows = await db
    .select({
      id: conversations.id,
      subject: conversations.subject,
      lastMessageAt: conversations.lastMessageAt,
      clientUserId: conversations.clientUserId,
      creativeUserId: conversations.creativeUserId,
      clientLastReadAt: conversations.clientLastReadAt,
      creativeLastReadAt: conversations.creativeLastReadAt,
      profileSlug: creativeProfiles.slug,
    })
    .from(conversations)
    .innerJoin(creativeProfiles, eq(conversations.profileId, creativeProfiles.id))
    .where(
      or(eq(conversations.clientUserId, userId), eq(conversations.creativeUserId, userId)),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(options.limit)
    .offset(offset);

  const otherIds = [
    ...new Set(rows.map((r) => (r.clientUserId === userId ? r.creativeUserId : r.clientUserId))),
  ];
  const otherUsers =
    otherIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            firstName: users.firstName,
            middleName: users.middleName,
            lastName: users.lastName,
            suffix: users.suffix,
          })
          .from(users)
          .where(inArray(users.id, otherIds));
  const otherById = new Map(otherUsers.map((u) => [u.id, u]));

  const data = [];
  for (const row of rows) {
    const isClient = row.clientUserId === userId;
    const otherUserId = isClient ? row.creativeUserId : row.clientUserId;
    const other = otherById.get(otherUserId);
    const lastRead = isClient ? row.clientLastReadAt : row.creativeLastReadAt;

    const unreadWhere = lastRead
      ? and(
          eq(messages.conversationId, row.id),
          eq(messages.senderUserId, otherUserId),
          gt(messages.createdAt, lastRead),
        )
      : and(eq(messages.conversationId, row.id), eq(messages.senderUserId, otherUserId));

    const unreadRows = await db.select({ unread: count() }).from(messages).where(unreadWhere);
    const unread = Number(unreadRows[0]?.unread ?? 0);

    const [last] = await db
      .select({
        body: messages.body,
        senderUserId: messages.senderUserId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, row.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    data.push({
      id: row.id,
      subject: row.subject,
      profileSlug: row.profileSlug,
      otherPartyName: other ? formatName(other) : 'Unknown',
      role: isClient ? ('client' as const) : ('creative' as const),
      lastMessage: last
        ? {
            body: last.body,
            fromSelf: last.senderUserId === userId,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unreadCount: unread,
      lastMessageAt: row.lastMessageAt.toISOString(),
    });
  }

  return { data, meta: { total, page: options.page, limit: options.limit } };
}

export async function getThread(
  conversationId: string,
  userId: string,
  options: ListMessagesInput,
) {
  const conversation = await requireParticipant(conversationId, userId);

  const conditions = [eq(messages.conversationId, conversation.id)];
  if (options.after) {
    const [anchor] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.id, options.after), eq(messages.conversationId, conversation.id)))
      .limit(1);
    if (anchor) {
      conditions.push(gt(messages.createdAt, anchor.createdAt));
    }
  }

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderUserId: messages.senderUserId,
      createdAt: messages.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderUserId, users.id))
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt))
    .limit(options.limit);

  const isClient = conversation.clientUserId === userId;

  return {
    id: conversation.id,
    subject: conversation.subject,
    role: isClient ? ('client' as const) : ('creative' as const),
    messages: rows.map((row) => ({
      id: row.id,
      body: row.body,
      senderUserId: row.senderUserId,
      fromSelf: row.senderUserId === userId,
      senderName: `${row.firstName} ${row.lastName}`.trim(),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  input: SendMessageInput,
) {
  const conversation = await requireParticipant(conversationId, userId);
  const otherId =
    conversation.clientUserId === userId
      ? conversation.creativeUserId
      : conversation.clientUserId;

  await assertNotBlockedEitherWay(userId, otherId);

  const now = new Date();
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderUserId: userId,
      body: input.body,
      createdAt: now,
    })
    .returning();

  const readPatch =
    conversation.clientUserId === userId
      ? { clientLastReadAt: now, lastMessageAt: now }
      : { creativeLastReadAt: now, lastMessageAt: now };

  await db.update(conversations).set(readPatch).where(eq(conversations.id, conversation.id));

  return {
    id: message!.id,
    body: message!.body,
    fromSelf: true,
    createdAt: message!.createdAt.toISOString(),
  };
}

export async function markRead(conversationId: string, userId: string) {
  const conversation = await requireParticipant(conversationId, userId);
  const now = new Date();
  const patch =
    conversation.clientUserId === userId
      ? { clientLastReadAt: now }
      : { creativeLastReadAt: now };

  await db.update(conversations).set(patch).where(eq(conversations.id, conversation.id));
  return { ok: true as const };
}

export async function unreadCount(userId: string) {
  const threads = await db
    .select()
    .from(conversations)
    .where(
      or(eq(conversations.clientUserId, userId), eq(conversations.creativeUserId, userId)),
    );

  let total = 0;
  for (const thread of threads) {
    const unreadRows = await db
      .select({ unread: count() })
      .from(messages)
      .where(unreadCondition(thread, userId));
    total += Number(unreadRows[0]?.unread ?? 0);
  }

  return { count: total };
}

export async function reportConversation(
  conversationId: string,
  userId: string,
  input: ReportInput,
) {
  await requireParticipant(conversationId, userId);

  const [row] = await db
    .insert(conversationReports)
    .values({
      conversationId,
      reporterUserId: userId,
      reason: input.reason,
    })
    .returning();

  return { id: row!.id, status: row!.status };
}

export { assertNotBlockedEitherWay, requireParticipant, BLOCKED_MESSAGE };
