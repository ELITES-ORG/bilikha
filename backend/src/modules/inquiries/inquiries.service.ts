import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeProfiles, inquiries, users } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import type { RespondInput, SendInquiryInput } from './inquiries.schema.js';

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

function revealContact(
  preference: string,
  owner: { phone: string; email: string },
): { channel: string; value: string } | null {
  if (preference === 'email') {
    return { channel: 'email', value: owner.email };
  }
  // Default and any other preference: phone.
  return { channel: 'phone', value: owner.phone };
}

export async function send(input: SendInquiryInput & { senderUserId: string }) {
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

  if (profile.userId === input.senderUserId) {
    throw AppError.badRequest('You cannot send an inquiry to yourself.');
  }

  const [open] = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.profileId, profile.id),
        eq(inquiries.senderUserId, input.senderUserId),
        inArray(inquiries.status, ['sent', 'read']),
      ),
    )
    .limit(1);

  if (open) {
    throw AppError.conflict(
      'You already have an open inquiry with this creative. Wait for a response before sending another.',
    );
  }

  const [row] = await db
    .insert(inquiries)
    .values({
      profileId: profile.id,
      senderUserId: input.senderUserId,
      subject: input.subject,
      message: input.message,
    })
    .returning();

  if (!row) throw new Error('Inquiry insert returned no row');

  return {
    id: row.id,
    profileSlug: input.profileSlug,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listReceived(
  userId: string,
  options: { page: number; limit: number },
) {
  const [profile] = await db
    .select({ id: creativeProfiles.id })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    return { data: [], total: 0 };
  }

  const offset = (options.page - 1) * options.limit;

  const rows = await db
    .select({
      id: inquiries.id,
      subject: inquiries.subject,
      message: inquiries.message,
      status: inquiries.status,
      response: inquiries.response,
      readAt: inquiries.readAt,
      respondedAt: inquiries.respondedAt,
      createdAt: inquiries.createdAt,
      senderFirstName: users.firstName,
      senderMiddleName: users.middleName,
      senderLastName: users.lastName,
      senderSuffix: users.suffix,
      senderUsername: users.username,
    })
    .from(inquiries)
    .innerJoin(users, eq(inquiries.senderUserId, users.id))
    .where(eq(inquiries.profileId, profile.id))
    .orderBy(desc(inquiries.createdAt))
    .limit(options.limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(inquiries)
    .where(eq(inquiries.profileId, profile.id));

  return {
    data: rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      message: row.message,
      status: row.status,
      response: row.response,
      readAt: row.readAt?.toISOString() ?? null,
      respondedAt: row.respondedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sender: {
        username: row.senderUsername,
        fullName: formatName({
          firstName: row.senderFirstName,
          middleName: row.senderMiddleName,
          lastName: row.senderLastName,
          suffix: row.senderSuffix,
        }),
      },
    })),
    total: totalRow?.total ?? 0,
  };
}

export async function listSent(userId: string, options: { page: number; limit: number }) {
  const offset = (options.page - 1) * options.limit;

  const rows = await db
    .select({
      id: inquiries.id,
      subject: inquiries.subject,
      message: inquiries.message,
      status: inquiries.status,
      response: inquiries.response,
      respondedAt: inquiries.respondedAt,
      createdAt: inquiries.createdAt,
      profileSlug: creativeProfiles.slug,
      displayName: creativeProfiles.displayName,
      contactPreference: creativeProfiles.contactPreference,
      ownerFirstName: users.firstName,
      ownerMiddleName: users.middleName,
      ownerLastName: users.lastName,
      ownerSuffix: users.suffix,
      ownerPhone: users.phone,
      ownerEmail: users.email,
    })
    .from(inquiries)
    .innerJoin(creativeProfiles, eq(inquiries.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .where(eq(inquiries.senderUserId, userId))
    .orderBy(desc(inquiries.createdAt))
    .limit(options.limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ total: count() })
    .from(inquiries)
    .where(eq(inquiries.senderUserId, userId));

  return {
    data: rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      message: row.message,
      status: row.status,
      response: row.response,
      respondedAt: row.respondedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      profile: {
        slug: row.profileSlug,
        name:
          row.displayName ??
          formatName({
            firstName: row.ownerFirstName,
            middleName: row.ownerMiddleName,
            lastName: row.ownerLastName,
            suffix: row.ownerSuffix,
          }),
      },
      contact:
        row.status === 'responded'
          ? revealContact(row.contactPreference, {
              phone: row.ownerPhone,
              email: row.ownerEmail,
            })
          : null,
    })),
    total: totalRow?.total ?? 0,
  };
}

export async function markRead(inquiryId: string, userId: string) {
  const [row] = await db
    .select({
      id: inquiries.id,
      status: inquiries.status,
      profileUserId: creativeProfiles.userId,
    })
    .from(inquiries)
    .innerJoin(creativeProfiles, eq(inquiries.profileId, creativeProfiles.id))
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (!row || row.profileUserId !== userId) {
    throw AppError.notFound('Inquiry not found.');
  }

  if (row.status !== 'sent') {
    return { id: row.id, status: row.status };
  }

  const now = new Date();
  const [updated] = await db
    .update(inquiries)
    .set({ status: 'read', readAt: now, updatedAt: now })
    .where(eq(inquiries.id, inquiryId))
    .returning({ id: inquiries.id, status: inquiries.status });

  return updated ?? { id: row.id, status: 'read' as const };
}

export async function respond(
  inquiryId: string,
  userId: string,
  input: RespondInput,
) {
  const [row] = await db
    .select({
      id: inquiries.id,
      status: inquiries.status,
      readAt: inquiries.readAt,
      profileUserId: creativeProfiles.userId,
      contactPreference: creativeProfiles.contactPreference,
      ownerPhone: users.phone,
      ownerEmail: users.email,
    })
    .from(inquiries)
    .innerJoin(creativeProfiles, eq(inquiries.profileId, creativeProfiles.id))
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .where(eq(inquiries.id, inquiryId))
    .limit(1);

  if (!row || row.profileUserId !== userId) {
    throw AppError.notFound('Inquiry not found.');
  }

  if (row.status === 'responded' || row.status === 'declined') {
    throw AppError.conflict('This inquiry has already been answered.');
  }

  if (input.action === 'responded' && !input.response?.trim()) {
    throw AppError.badRequest('A response message is required.', { field: 'response' });
  }

  const now = new Date();
  const [updated] = await db
    .update(inquiries)
    .set({
      status: input.action,
      response:
        input.action === 'responded'
          ? input.response!.trim()
          : (input.response?.trim() ?? null),
      respondedAt: now,
      updatedAt: now,
      // Answering implies the creative has seen it.
      readAt: row.readAt ?? now,
    })
    .where(eq(inquiries.id, inquiryId))
    .returning();

  if (!updated) throw new Error('Inquiry update returned no row');

  return {
    id: updated.id,
    status: updated.status,
    response: updated.response,
    respondedAt: updated.respondedAt?.toISOString() ?? null,
    contact:
      input.action === 'responded'
        ? revealContact(row.contactPreference, {
            phone: row.ownerPhone,
            email: row.ownerEmail,
          })
        : null,
  };
}
