import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { idVerifications, moderationActions, users } from '../../db/schema/index.js';
import { makeAdmin, makeIdVerification, makeUser } from '../../test/factories.js';

/**
 * Plan 0053 phase 1: the table ships with nothing that writes it, so these are
 * the guarantees that exist so far — and the ones a later service cannot
 * bypass. Attacked directly in SQL, with no service in front.
 */

const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps the driver's error and hangs the code off `cause`. */
function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== 'object') return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

async function expectPgError(work: Promise<unknown>, code: string): Promise<void> {
  try {
    await work;
  } catch (error) {
    expect(pgCode(error)).toBe(code);
    return;
  }
  throw new Error(`expected Postgres error ${code}, but the statement succeeded`);
}

describe('id_verifications', () => {
  it('gives an account no row unless one is written — no row means not required', async () => {
    const user = await makeUser();

    const rows = await db.select().from(idVerifications).where(eq(idVerifications.userId, user.id));
    expect(rows).toEqual([]);
  });

  it('starts a row pending, unsubmitted, with nothing decided', async () => {
    const user = await makeUser();

    const row = await makeIdVerification(user.id);

    expect(row.status).toBe('pending');
    expect(row.submittedAt).toBeNull();
    expect(row.decidedAt).toBeNull();
    expect(row.idNumberHash).toBeNull();
    expect(row.idNumberAbsent).toBe(false);
  });

  it('allows one open submission per account', async () => {
    const user = await makeUser();
    await makeIdVerification(user.id);

    await expectPgError(makeIdVerification(user.id), UNIQUE_VIOLATION);
  });

  it('allows a new submission once the last one is decided', async () => {
    const user = await makeUser();
    await makeIdVerification(user.id, { status: 'declined_retry', decidedAt: new Date() });

    const next = await makeIdVerification(user.id);

    expect(next.status).toBe('pending');
  });

  it('goes with the account when the account is deleted', async () => {
    const user = await makeUser();
    await makeIdVerification(user.id);

    await db.delete(users).where(eq(users.id, user.id));

    const rows = await db.select().from(idVerifications).where(eq(idVerifications.userId, user.id));
    expect(rows).toEqual([]);
  });

  it('keeps the audit row when the record it names is deleted', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    const row = await makeIdVerification(user.id);
    const [audit] = await db
      .insert(moderationActions)
      .values({ adminId: admin.id, subjectUserId: user.id, action: 'id_viewed', idVerificationId: row.id })
      .returning();

    await db.delete(idVerifications).where(eq(idVerifications.id, row.id));

    const [after] = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.id, audit!.id));
    expect(after?.action).toBe('id_viewed');
    expect(after?.idVerificationId).toBeNull();
  });

  it('keeps the decision when the deciding administrator is deleted', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    const row = await makeIdVerification(user.id, {
      status: 'verified',
      reviewedBy: admin.id,
      decidedAt: new Date(),
    });

    await db.delete(users).where(eq(users.id, admin.id));

    const [after] = await db.select().from(idVerifications).where(eq(idVerifications.id, row.id));
    expect(after?.status).toBe('verified');
    expect(after?.reviewedBy).toBeNull();
  });
});
