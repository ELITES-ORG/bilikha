import { and, asc, count, desc, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type {
  ConversationAgreementCard,
  ConversationListResult,
  ConversationOfferCard,
  ConversationPostingCard,
  ConversationThread,
} from '../../contracts/conversations.js';
import { db } from '../../db/index.js';
import {
  conversations,
  conversationReports,
  creativeProfiles,
  creativeSubdomains,
  messages,
  municipalities,
  offerImages,
  offers,
  postings,
  userBlocks,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { isStorageConfigured, publicUrl } from '../../lib/storage.js';
import { notifyOnce } from '../notifications/notifications.service.js';
import { loadAgreementCards } from '../agreements/agreements.service.js';
import type {
  EnsureConversationInput,
  ListHistoryInput,
  ListMessagesInput,
  ListThreadsInput,
  ReportInput,
  SendMessageInput,
  StartConversationInput,
} from './conversations.schema.js';

export type {
  ConversationListItem,
  ConversationListResult,
  ConversationMessage,
  ConversationThread,
} from '../../contracts/conversations.js';

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
 * Three attachment columns, three branches. ADR 0029 fixes the line here: a
 * fourth means revisiting that decision, not adding another pair of fields.
 */
function messageAttachmentFields(
  offerId: string | null,
  postingId: string | null,
  agreementId: string | null,
  offerCards: Map<string, ConversationOfferCard>,
  postingCards: Map<string, ConversationPostingCard>,
  agreementCards: Map<string, ConversationAgreementCard>,
) {
  const offer = offerId ? (offerCards.get(offerId) ?? null) : null;
  const posting = postingId ? (postingCards.get(postingId) ?? null) : null;
  const agreement = agreementId ? (agreementCards.get(agreementId) ?? null) : null;
  return {
    offer,
    offerRemoved: Boolean(offerId && !offer),
    posting,
    postingRemoved: Boolean(postingId && !posting),
    agreement,
    agreementRemoved: Boolean(agreementId && !agreement),
  };
}

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

async function assertCanMessage(senderUserId: string, otherUserId: string) {
  // Directional: the other party blocking the sender stops delivery. The
  // sender having blocked the other does not — see ADR 0018 / schema comment.
  const [block] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerUserId, otherUserId),
        eq(userBlocks.blockedUserId, senderUserId),
      ),
    )
    .limit(1);

  if (block) throw AppError.forbidden(BLOCKED_MESSAGE);
}

/** Published creative the caller may contact (not self). */
async function requireContactableProfile(userId: string, profileSlug: string) {
  const [profile] = await db
    .select({
      id: creativeProfiles.id,
      userId: creativeProfiles.userId,
      status: creativeProfiles.status,
      ownerStatus: users.status,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .where(eq(creativeProfiles.slug, profileSlug))
    .limit(1);

  // Suspended accounts are gone from the directory, so starting a new thread
  // with one has to fail the same way a missing profile does.
  if (!profile || profile.status !== 'published' || profile.ownerStatus !== 'active') {
    throw AppError.notFound('Creative not found.');
  }

  if (profile.userId === userId) {
    throw AppError.badRequest('You cannot contact your own profile.');
  }

  await assertCanMessage(userId, profile.userId);
  return profile;
}

/**
 * Offer must belong to the creative profile on the thread. Used when attaching
 * an offer card to a newly sent message.
 */
async function resolveOfferForProfile(offerId: string, profileId: string): Promise<string> {
  const [offer] = await db
    .select({ id: offers.id, profileId: offers.profileId })
    .from(offers)
    .where(eq(offers.id, offerId))
    .limit(1);

  if (!offer || offer.profileId !== profileId) {
    throw AppError.badRequest('That offer does not belong to this creative.', {
      field: 'offerId',
    });
  }
  return offer.id;
}

/** Batch-load offer cards for a page of messages — one query each for offers and images. */
async function loadOfferCards(offerIds: string[]): Promise<Map<string, ConversationOfferCard>> {
  const unique = [...new Set(offerIds.filter((id): id is string => Boolean(id)))];
  const result = new Map<string, ConversationOfferCard>();
  if (unique.length === 0) return result;

  const offerRows = await db
    .select({
      id: offers.id,
      title: offers.title,
      priceMinCentavos: offers.priceMinCentavos,
      priceMaxCentavos: offers.priceMaxCentavos,
    })
    .from(offers)
    .where(inArray(offers.id, unique));

  const firstImageByOfferId = new Map<string, { url: string; thumbUrl: string }>();
  if (isStorageConfigured()) {
    const imageRows = await db
      .select({
        offerId: offerImages.offerId,
        objectKey: offerImages.objectKey,
        thumbKey: offerImages.thumbKey,
      })
      .from(offerImages)
      .where(inArray(offerImages.offerId, unique))
      .orderBy(asc(offerImages.offerId), asc(offerImages.sortOrder), asc(offerImages.createdAt));

    for (const row of imageRows) {
      if (firstImageByOfferId.has(row.offerId)) continue;
      firstImageByOfferId.set(row.offerId, {
        url: publicUrl(row.objectKey),
        thumbUrl: publicUrl(row.thumbKey),
      });
    }
  }

  for (const offer of offerRows) {
    result.set(offer.id, {
      id: offer.id,
      title: offer.title,
      priceMinCentavos: offer.priceMinCentavos,
      priceMaxCentavos: offer.priceMaxCentavos,
      image: firstImageByOfferId.get(offer.id) ?? null,
      available: true,
    });
  }
  return result;
}

/** Batch-load posting cards for messages — closed/expired rows stay readable. */
async function loadPostingCards(postingIds: string[]): Promise<Map<string, ConversationPostingCard>> {
  const unique = [...new Set(postingIds.filter((id): id is string => Boolean(id)))];
  const result = new Map<string, ConversationPostingCard>();
  if (unique.length === 0) return result;

  const now = new Date();
  const rows = await db
    .select({
      id: postings.id,
      title: postings.title,
      budgetMinCentavos: postings.budgetMinCentavos,
      budgetMaxCentavos: postings.budgetMaxCentavos,
      status: postings.status,
      expiresAt: postings.expiresAt,
      municipalityName: municipalities.name,
      subdomainName: creativeSubdomains.name,
    })
    .from(postings)
    .innerJoin(municipalities, eq(postings.municipalityId, municipalities.id))
    .innerJoin(creativeSubdomains, eq(postings.subdomainId, creativeSubdomains.id))
    .where(inArray(postings.id, unique));

  for (const row of rows) {
    const available = row.status === 'open' && row.expiresAt > now;
    result.set(row.id, {
      id: row.id,
      title: row.title,
      budgetMinCentavos: row.budgetMinCentavos,
      budgetMaxCentavos: row.budgetMaxCentavos,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      available,
      municipalityName: row.municipalityName,
      subdomainName: row.subdomainName,
    });
  }
  return result;
}

async function requireCallerCreativeProfile(userId: string) {
  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    throw AppError.forbidden('A creative profile is required.');
  }
  return profile;
}

async function resolvePostingForReply(
  postingId: string,
  callerUserId: string,
  conversation: typeof conversations.$inferSelect,
): Promise<string> {
  const [posting] = await db
    .select({
      id: postings.id,
      userId: postings.userId,
      status: postings.status,
      expiresAt: postings.expiresAt,
    })
    .from(postings)
    .where(eq(postings.id, postingId))
    .limit(1);

  if (!posting) {
    throw AppError.badRequest('That posting is not available.', { field: 'postingId' });
  }

  const now = new Date();
  if (posting.status !== 'open' || posting.expiresAt <= now) {
    throw AppError.badRequest('That posting is not available.', { field: 'postingId' });
  }

  if (posting.userId === callerUserId) {
    throw AppError.badRequest('You cannot reply to your own posting.');
  }

  if (conversation.creativeUserId !== callerUserId) {
    throw AppError.badRequest('That posting does not belong in this conversation.', {
      field: 'postingId',
    });
  }

  if (posting.userId !== conversation.clientUserId) {
    throw AppError.badRequest('That posting does not belong in this conversation.', {
      field: 'postingId',
    });
  }

  return posting.id;
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
  const profile = await requireContactableProfile(userId, input.profileSlug);

  let resolvedOfferId: string | null = null;
  if (input.offerId) {
    resolvedOfferId = await resolveOfferForProfile(input.offerId, profile.id);
  }

  const offerCards = await loadOfferCards(resolvedOfferId ? [resolvedOfferId] : []);
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
        offerId: resolvedOfferId,
        createdAt: now,
      })
      .returning();

    await tx
      .update(conversations)
      .set({
        lastMessageAt: now,
        clientLastReadAt: now,
      })
      .where(eq(conversations.id, conversation.id));

    return {
      id: conversation.id,
      continued: Boolean(existing),
      message: {
        id: message!.id,
        body: message!.body,
        createdAt: message!.createdAt.toISOString(),
        ...messageAttachmentFields(
          resolvedOfferId,
          null,
          null,
          offerCards,
          new Map<string, ConversationPostingCard>(),
          new Map<string, ConversationAgreementCard>(),
        ),
      },
    };
  });
}

/**
 * Get or create the client↔profile thread without sending a message. Used by
 * Inquire so the composer can attach an offer before the client types.
 */
export async function ensureConversation(userId: string, input: EnsureConversationInput) {
  if (input.postingId) {
    const postingId = input.postingId;
    const posting = await (async () => {
      const [row] = await db
        .select({
          id: postings.id,
          userId: postings.userId,
          status: postings.status,
          expiresAt: postings.expiresAt,
        })
        .from(postings)
        .where(eq(postings.id, postingId))
        .limit(1);

      if (!row) throw AppError.notFound('No such posting.');

      const now = new Date();
      if (row.status !== 'open' || row.expiresAt <= now) {
        throw AppError.badRequest('That posting is not available.', { field: 'postingId' });
      }

      if (row.userId === userId) {
        throw AppError.badRequest('You cannot reply to your own posting.');
      }

      return row;
    })();

    const profile = await requireCallerCreativeProfile(userId);
    await assertCanMessage(userId, posting.userId);
    const now = new Date();

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.profileId, profile.id),
            eq(conversations.clientUserId, posting.userId),
          ),
        )
        .limit(1);

      if (existing) {
        return { id: existing.id };
      }

      const [created] = await tx
        .insert(conversations)
        .values({
          profileId: profile.id,
          creativeUserId: userId,
          clientUserId: posting.userId,
          lastMessageAt: now,
          creativeLastReadAt: now,
        })
        .returning({ id: conversations.id });

      return { id: created!.id };
    });
  }

  const profile = await requireContactableProfile(userId, input.profileSlug!);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.profileId, profile.id), eq(conversations.clientUserId, userId)),
      )
      .limit(1);

    if (existing) {
      return { id: existing.id };
    }

    const [created] = await tx
      .insert(conversations)
      .values({
        profileId: profile.id,
        creativeUserId: profile.userId,
        clientUserId: userId,
        lastMessageAt: now,
        clientLastReadAt: now,
      })
      .returning({ id: conversations.id });

    return { id: created!.id };
  });
}

/**
 * Client inquiry history: own sent messages that carry an offer, grouped by
 * offer (asking thrice → one row), newest lastAskedAt first.
 */
async function listHistoryHiring(userId: string) {
  const rows = await db
    .select({
      offerId: messages.offerId,
      conversationId: messages.conversationId,
      createdAt: messages.createdAt,
      profileId: conversations.profileId,
      creativeUserId: conversations.creativeUserId,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.senderUserId, userId),
        eq(conversations.clientUserId, userId),
        isNotNull(messages.offerId),
      ),
    )
    .orderBy(desc(messages.createdAt));

  if (rows.length === 0) {
    return { data: [] };
  }

  // One row per offer; keep the newest ask.
  type Group = {
    offerId: string;
    conversationId: string;
    profileId: string;
    creativeUserId: string;
    lastAskedAt: Date;
  };
  const byOffer = new Map<string, Group>();
  for (const row of rows) {
    if (!row.offerId) continue;
    const existing = byOffer.get(row.offerId);
    if (!existing) {
      byOffer.set(row.offerId, {
        offerId: row.offerId,
        conversationId: row.conversationId,
        profileId: row.profileId,
        creativeUserId: row.creativeUserId,
        lastAskedAt: row.createdAt,
      });
    }
  }

  const groups = [...byOffer.values()].sort(
    (a, b) => b.lastAskedAt.getTime() - a.lastAskedAt.getTime(),
  );

  const offerIds = groups.map((g) => g.offerId);
  const profileIds = [...new Set(groups.map((g) => g.profileId))];
  const conversationIds = [...new Set(groups.map((g) => g.conversationId))];

  const offerCards = await loadOfferCards(offerIds);

  const creativeRows = await db
    .select({
      profileId: creativeProfiles.id,
      slug: creativeProfiles.slug,
      displayName: creativeProfiles.displayName,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      municipality: municipalities.name,
      avatarKey: users.avatarKey,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(inArray(creativeProfiles.id, profileIds));
  const creativeByProfileId = new Map(creativeRows.map((c) => [c.profileId, c]));

  // replied = creative sent any message after the client's last ask for that offer.
  const replyRows =
    conversationIds.length === 0
      ? []
      : await db
          .select({
            conversationId: messages.conversationId,
            createdAt: messages.createdAt,
            senderUserId: messages.senderUserId,
          })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(
            and(
              inArray(messages.conversationId, conversationIds),
              eq(messages.senderUserId, conversations.creativeUserId),
            ),
          );

  const repliesByConversation = new Map<string, Date[]>();
  for (const row of replyRows) {
    const list = repliesByConversation.get(row.conversationId) ?? [];
    list.push(row.createdAt);
    repliesByConversation.set(row.conversationId, list);
  }

  return {
    data: groups
      .map((group) => {
        const offer = offerCards.get(group.offerId);
        // Deleted offers null the FK on messages over time; once the card is
        // gone, History stops listing that inquiry (plan 7.4).
        if (!offer) return null;

        const creative = creativeByProfileId.get(group.profileId);
        const replies = repliesByConversation.get(group.conversationId) ?? [];
        const replied = replies.some((at) => at.getTime() > group.lastAskedAt.getTime());

        return {
          conversationId: group.conversationId,
          lastAskedAt: group.lastAskedAt.toISOString(),
          replied,
          offer,
          creative: {
            slug: creative?.slug ?? '',
            displayName: creative
              ? creative.displayName?.trim() || formatName(creative)
              : 'Unknown',
            municipality: creative?.municipality ?? '',
            avatarUrl:
              creative?.avatarKey && isStorageConfigured() ? publicUrl(creative.avatarKey) : null,
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null),
  };
}

/**
 * Creative reply history: own sent messages that carry a posting, grouped by
 * posting (replying twice → one row), newest lastRepliedAt first.
 */
async function listHistoryCreative(userId: string) {
  const rows = await db
    .select({
      postingId: messages.postingId,
      conversationId: messages.conversationId,
      createdAt: messages.createdAt,
      clientUserId: conversations.clientUserId,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.senderUserId, userId),
        eq(conversations.creativeUserId, userId),
        isNotNull(messages.postingId),
      ),
    )
    .orderBy(desc(messages.createdAt));

  if (rows.length === 0) {
    return { data: [] };
  }

  type Group = {
    postingId: string;
    conversationId: string;
    clientUserId: string;
    lastRepliedAt: Date;
  };
  const byPosting = new Map<string, Group>();
  for (const row of rows) {
    if (!row.postingId) continue;
    const existing = byPosting.get(row.postingId);
    if (!existing) {
      byPosting.set(row.postingId, {
        postingId: row.postingId,
        conversationId: row.conversationId,
        clientUserId: row.clientUserId,
        lastRepliedAt: row.createdAt,
      });
    }
  }

  const groups = [...byPosting.values()].sort(
    (a, b) => b.lastRepliedAt.getTime() - a.lastRepliedAt.getTime(),
  );

  const postingIds = groups.map((g) => g.postingId);
  const conversationIds = [...new Set(groups.map((g) => g.conversationId))];
  const clientUserIds = [...new Set(groups.map((g) => g.clientUserId))];

  const postingCards = await loadPostingCards(postingIds);

  const clientRows =
    clientUserIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            firstName: users.firstName,
            middleName: users.middleName,
            lastName: users.lastName,
            suffix: users.suffix,
            avatarKey: users.avatarKey,
          })
          .from(users)
          .where(inArray(users.id, clientUserIds));
  const clientById = new Map(clientRows.map((c) => [c.id, c]));

  const replyRows =
    conversationIds.length === 0
      ? []
      : await db
          .select({
            conversationId: messages.conversationId,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(
            and(
              inArray(messages.conversationId, conversationIds),
              eq(messages.senderUserId, conversations.clientUserId),
            ),
          );

  const repliesByConversation = new Map<string, Date[]>();
  for (const row of replyRows) {
    const list = repliesByConversation.get(row.conversationId) ?? [];
    list.push(row.createdAt);
    repliesByConversation.set(row.conversationId, list);
  }

  return {
    data: groups
      .map((group) => {
        const posting = postingCards.get(group.postingId);
        if (!posting) return null;

        const client = clientById.get(group.clientUserId);
        const replies = repliesByConversation.get(group.conversationId) ?? [];
        const replied = replies.some((at) => at.getTime() > group.lastRepliedAt.getTime());

        return {
          conversationId: group.conversationId,
          lastRepliedAt: group.lastRepliedAt.toISOString(),
          replied,
          posting,
          client: {
            name: client ? formatName(client) : 'Unknown',
            avatarUrl:
              client?.avatarKey && isStorageConfigured() ? publicUrl(client.avatarKey) : null,
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null),
  };
}

export async function listHistory(userId: string, options: ListHistoryInput) {
  if (options.mode === 'creative') {
    return listHistoryCreative(userId);
  }
  return listHistoryHiring(userId);
}

export async function listThreads(
  userId: string,
  options: ListThreadsInput,
): Promise<ConversationListResult> {
  const offset = (options.page - 1) * options.limit;

  /**
   * ensureConversation creates the row before anything is said, so that Inquire
   * can open a thread. Until the client actually sends, that thread is not a
   * conversation — showing it would put an empty thread from a stranger in the
   * creative's inbox, and make tapping Inquire a way to plant one.
   *
   * Applied to the count as well as the page, or pagination reports more rows
   * than it returns.
   */
  const hasMessages = sql`exists (
    select 1 from messages m where m.conversation_id = ${conversations.id}
  )`;

  const mine = and(
    options.mode === 'creative'
      ? eq(conversations.creativeUserId, userId)
      : eq(conversations.clientUserId, userId),
    hasMessages,
  );

  const totalRows = await db
    .select({ total: count() })
    .from(conversations)
    .where(mine);
  const total = Number(totalRows[0]?.total ?? 0);

  const rows = await db
    .select({
      id: conversations.id,
      lastMessageAt: conversations.lastMessageAt,
      clientUserId: conversations.clientUserId,
      creativeUserId: conversations.creativeUserId,
      clientLastReadAt: conversations.clientLastReadAt,
      creativeLastReadAt: conversations.creativeLastReadAt,
      profileSlug: creativeProfiles.slug,
    })
    .from(conversations)
    .innerJoin(creativeProfiles, eq(conversations.profileId, creativeProfiles.id))
    .where(mine)
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
            avatarKey: users.avatarKey,
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
      profileSlug: row.profileSlug,
      otherPartyName: other ? formatName(other) : 'Unknown',
      otherPartyAvatarUrl:
        other?.avatarKey && isStorageConfigured() ? publicUrl(other.avatarKey) : null,
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
): Promise<ConversationThread> {
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
      offerId: messages.offerId,
      postingId: messages.postingId,
      agreementId: messages.agreementId,
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

  const offerCards = await loadOfferCards(
    rows.map((r) => r.offerId).filter((id): id is string => Boolean(id)),
  );
  const postingCards = await loadPostingCards(
    rows.map((r) => r.postingId).filter((id): id is string => Boolean(id)),
  );
  const agreementCards = await loadAgreementCards(
    rows.map((r) => r.agreementId).filter((id): id is string => Boolean(id)),
  );

  const isClient = conversation.clientUserId === userId;
  const otherUserId = isClient ? conversation.creativeUserId : conversation.clientUserId;
  const [other] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      avatarKey: users.avatarKey,
    })
    .from(users)
    .where(eq(users.id, otherUserId))
    .limit(1);

  return {
    id: conversation.id,
    role: isClient ? ('client' as const) : ('creative' as const),
    otherPartyUserId: otherUserId,
    otherPartyName: other ? `${other.firstName} ${other.lastName}`.trim() : 'Unknown',
    otherPartyAvatarUrl:
      other?.avatarKey && isStorageConfigured() ? publicUrl(other.avatarKey) : null,
    messages: rows.map((row) => ({
      id: row.id,
      body: row.body,
      senderUserId: row.senderUserId,
      fromSelf: row.senderUserId === userId,
      senderName: `${row.firstName} ${row.lastName}`.trim(),
      createdAt: row.createdAt.toISOString(),
      ...messageAttachmentFields(
        row.offerId,
        row.postingId,
        row.agreementId,
        offerCards,
        postingCards,
        agreementCards,
      ),
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

  await assertCanMessage(userId, otherId);

  let resolvedOfferId: string | null = null;
  if (input.offerId) {
    resolvedOfferId = await resolveOfferForProfile(input.offerId, conversation.profileId);
  }

  let resolvedPostingId: string | null = null;
  if (input.postingId) {
    resolvedPostingId = await resolvePostingForReply(input.postingId, userId, conversation);
  }

  const now = new Date();
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      senderUserId: userId,
      body: input.body,
      offerId: resolvedOfferId,
      postingId: resolvedPostingId,
      createdAt: now,
    })
    .returning();

  const readPatch =
    conversation.clientUserId === userId
      ? { clientLastReadAt: now, lastMessageAt: now }
      : { creativeLastReadAt: now, lastMessageAt: now };

  await db.update(conversations).set(readPatch).where(eq(conversations.id, conversation.id));

  // A reply carrying a posting is a creative answering a client's brief, and
  // that has nowhere else to surface — the Messages badge counts unread threads
  // but says nothing about which of your postings got an answer.
  //
  // notifyOnce, not notify: two replies to the same brief are one thing to look
  // at, and the first is still unread until they open it.
  if (resolvedPostingId) {
    await notifyOnce({
      userId: otherId,
      actorUserId: userId,
      type: 'posting_replied',
      targetId: conversation.id,
    });
  }

  const offerCards = await loadOfferCards(resolvedOfferId ? [resolvedOfferId] : []);
  const postingCards = await loadPostingCards(resolvedPostingId ? [resolvedPostingId] : []);

  return {
    id: message!.id,
    body: message!.body,
    fromSelf: true,
    createdAt: message!.createdAt.toISOString(),
    ...messageAttachmentFields(
      resolvedOfferId,
      resolvedPostingId,
      null,
      offerCards,
      postingCards,
      new Map<string, ConversationAgreementCard>(),
    ),
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

export { assertCanMessage, requireParticipant, BLOCKED_MESSAGE };
