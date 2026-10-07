import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { moderationActions, sessions, users } from '../../db/schema/index.js';
import { makeAdmin, makeUser } from '../../test/factories.js';
import { verifyPassword } from '../../lib/password.js';
import { changePassword } from '../me/me.service.js';
import { resetAccountPassword } from './admin.service.js';

/** A session row as express-session would leave one, so revocation has something real to delete. */
async function giveSession(userId: string, sid: string) {
  await db.insert(sessions).values({
    sid,
    data: JSON.stringify({ cookie: {}, userId }),
    expiresAt: new Date(Date.now() + 60_000),
    userId,
  });
}

async function userRow(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

describe('an administrator resetting a password', () => {
  it('replaces the password with one that works', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const before = (await userRow(target.id))!.passwordHash;

    const { temporaryPassword, username } = await resetAccountPassword({
      adminId: admin.id,
      userId: target.id,
    });

    const after = (await userRow(target.id))!;
    expect(username).toBe(target.username);
    expect(after.passwordHash).not.toBe(before);
    expect(await verifyPassword(after.passwordHash, temporaryPassword)).toBe(true);
  });

  it('forces a change before the account can do anything', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    expect((await userRow(target.id))!.mustChangePassword).toBe(false);
    await resetAccountPassword({ adminId: admin.id, userId: target.id });
    expect((await userRow(target.id))!.mustChangePassword).toBe(true);
  });

  it('revokes every session that account holds, and nobody else’s', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const bystander = await makeUser();

    await giveSession(target.id, 'sid-target-phone');
    await giveSession(target.id, 'sid-target-laptop');
    await giveSession(bystander.id, 'sid-bystander');

    await resetAccountPassword({ adminId: admin.id, userId: target.id });

    const theirs = await db.select().from(sessions).where(eq(sessions.userId, target.id));
    const others = await db.select().from(sessions).where(eq(sessions.userId, bystander.id));

    expect(theirs).toHaveLength(0);
    expect(others).toHaveLength(1);
  });

  it('records the reset without recording the password', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    const { temporaryPassword } = await resetAccountPassword({
      adminId: admin.id,
      userId: target.id,
    });

    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.subjectUserId, target.id));

    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('password_reset');
    expect(audit[0]?.adminId).toBe(admin.id);
    expect(audit[0]?.reason).toBeNull();
    // The whole row, not just `reason` — the password must not reach this table
    // by any column.
    expect(JSON.stringify(audit[0])).not.toContain(temporaryPassword);
  });

  it('mints a different password every time, invalidating the last', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    const first = await resetAccountPassword({ adminId: admin.id, userId: target.id });
    const second = await resetAccountPassword({ adminId: admin.id, userId: target.id });

    expect(second.temporaryPassword).not.toBe(first.temporaryPassword);

    const hash = (await userRow(target.id))!.passwordHash;
    expect(await verifyPassword(hash, first.temporaryPassword)).toBe(false);
    expect(await verifyPassword(hash, second.temporaryPassword)).toBe(true);
  });

  it('refuses to reset your own password', async () => {
    const admin = await makeAdmin();

    await expect(
      resetAccountPassword({ adminId: admin.id, userId: admin.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to reset another administrator', async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();

    await expect(
      resetAccountPassword({ adminId: admin.id, userId: other.id }),
    ).rejects.toMatchObject({ status: 400 });

    // And nothing was written on the way to the refusal.
    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.subjectUserId, other.id));
    expect(audit).toHaveLength(0);
  });

  it('404s an account that does not exist', async () => {
    const admin = await makeAdmin();

    await expect(
      resetAccountPassword({
        adminId: admin.id,
        userId: '0f2c8f1e-1111-2222-3333-444455556666',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('the way out of a forced change', () => {
  it('accepts the temporary password as the current one and clears the flag', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    const { temporaryPassword } = await resetAccountPassword({
      adminId: admin.id,
      userId: target.id,
    });

    await changePassword(target.id, {
      currentPassword: temporaryPassword,
      newPassword: 'a-password-they-chose-1234',
      confirmPassword: 'a-password-they-chose-1234',
    });

    const after = (await userRow(target.id))!;
    expect(after.mustChangePassword).toBe(false);
    expect(await verifyPassword(after.passwordHash, 'a-password-they-chose-1234')).toBe(true);
    // Single-use in practice: it no longer opens anything.
    expect(await verifyPassword(after.passwordHash, temporaryPassword)).toBe(false);
  });

  it('leaves the account locked when the wrong current password is given', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    await resetAccountPassword({ adminId: admin.id, userId: target.id });

    await expect(
      changePassword(target.id, {
        currentPassword: 'not-the-temporary-one',
        newPassword: 'a-password-they-chose-1234',
        confirmPassword: 'a-password-they-chose-1234',
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect((await userRow(target.id))!.mustChangePassword).toBe(true);
  });
});
