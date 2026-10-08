import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from './require-auth.js';
import { requireAdmin } from './require-admin.js';
import { makeAdmin, makeUser, suspend } from '../test/factories.js';
import { resetAccountPassword } from '../modules/admin/admin.service.js';
import { changePassword } from '../modules/me/me.service.js';

/**
 * The guards read the account's current status from the database on every
 * request (ADR 0028). These call them directly with a fake session, because the
 * behaviour under test is the database read, not Express.
 */
function fakeRequest(userId?: string): Request {
  const destroy = (cb: (err?: unknown) => void) => cb();
  return { session: { userId, destroy } } as unknown as Request;
}

async function run(
  guard: typeof requireAuth,
  req: Request,
): Promise<{ error: unknown; passed: boolean }> {
  return new Promise((resolve) => {
    const next: NextFunction = ((error?: unknown) =>
      resolve({ error, passed: error === undefined })) as NextFunction;
    guard(req, {} as Response, next);
  });
}

describe('requireAuth', () => {
  it('lets an active account through', async () => {
    const user = await makeUser();
    const result = await run(requireAuth, fakeRequest(user.id));
    expect(result.passed).toBe(true);
  });

  it('rejects a suspended account mid-session', async () => {
    // The hole this closes: suspension used to stop only a new sign-in, so an
    // existing session kept full write access for up to thirty days.
    const user = await makeUser();
    await suspend(user.id);

    const result = await run(requireAuth, fakeRequest(user.id));
    expect(result.passed).toBe(false);
    expect((result.error as { status?: number }).status).toBe(401);
  });

  it('answers 401, not 403, so the client treats it as signed out', async () => {
    const user = await makeUser();
    await suspend(user.id);
    const result = await run(requireAuth, fakeRequest(user.id));
    expect((result.error as { status?: number }).status).not.toBe(403);
  });

  it('rejects a session whose user row is gone', async () => {
    const result = await run(requireAuth, fakeRequest('00000000-0000-0000-0000-000000000000'));
    expect(result.passed).toBe(false);
  });

  it('rejects no session at all', async () => {
    const result = await run(requireAuth, fakeRequest(undefined));
    expect(result.passed).toBe(false);
  });

  it('destroys the session when it refuses a suspended account', async () => {
    const user = await makeUser();
    await suspend(user.id);

    const destroy = vi.fn((cb: (err?: unknown) => void) => cb());
    const req = { session: { userId: user.id, destroy } } as unknown as Request;
    await run(requireAuth, req);

    expect(destroy).toHaveBeenCalled();
  });
});

describe('requireAuth after an administrator password reset', () => {
  /**
   * The gate is matched on `originalUrl`, so these pass one — `fakeRequest`
   * alone would test the wrong thing.
   */
  function lockedRequest(userId: string, originalUrl: string): Request {
    const destroy = (cb: (err?: unknown) => void) => cb();
    return { session: { userId, destroy }, originalUrl } as unknown as Request;
  }

  async function lock(userId: string): Promise<void> {
    const admin = await makeAdmin();
    await resetAccountPassword({ adminId: admin.id, userId });
  }

  it('refuses an ordinary request with 403, not 401 — the session is still valid', async () => {
    const user = await makeUser();
    await lock(user.id);

    const result = await run(requireAuth, lockedRequest(user.id, '/api/v1/offers'));
    expect(result.passed).toBe(false);
    expect((result.error as { status?: number }).status).toBe(403);
    expect((result.error as { code?: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('lets through the two things a locked account needs', async () => {
    const user = await makeUser();
    await lock(user.id);

    for (const url of ['/api/v1/auth/me', '/api/v1/me/password']) {
      const result = await run(requireAuth, lockedRequest(user.id, url));
      expect(result.passed, `blocked ${url}`).toBe(true);
    }
  });

  it('is not fooled by a query string or a trailing slash', async () => {
    const user = await makeUser();
    await lock(user.id);

    for (const url of ['/api/v1/me/password?x=1', '/api/v1/me/password/']) {
      const result = await run(requireAuth, lockedRequest(user.id, url));
      expect(result.passed, `blocked ${url}`).toBe(true);
    }
  });

  it('does not let a near-miss path through', async () => {
    const user = await makeUser();
    await lock(user.id);

    for (const url of ['/api/v1/me/passwords', '/api/v1/me/password/extra', '/api/v1/me']) {
      const result = await run(requireAuth, lockedRequest(user.id, url));
      expect(result.passed, `allowed ${url}`).toBe(false);
    }
  });

  it('stops refusing once the password has been changed', async () => {
    const user = await makeUser();
    await lock(user.id);

    const locked = await run(requireAuth, lockedRequest(user.id, '/api/v1/offers'));
    expect(locked.passed).toBe(false);

    const { temporaryPassword } = await resetAccountPassword({
      adminId: (await makeAdmin()).id,
      userId: user.id,
    });
    await changePassword(user.id, {
      currentPassword: temporaryPassword,
      newPassword: 'a-password-they-chose-1234',
      confirmPassword: 'a-password-they-chose-1234',
    });

    const freed = await run(requireAuth, lockedRequest(user.id, '/api/v1/offers'));
    expect(freed.passed).toBe(true);
  });
});

describe('requireAdmin', () => {
  it('lets an administrator through', async () => {
    const admin = await makeAdmin();
    const result = await run(requireAdmin, fakeRequest(admin.id));
    expect(result.passed).toBe(true);
  });

  it('answers 404 to an ordinary account, not 403', async () => {
    // The existence of an admin surface is not something to confirm.
    const user = await makeUser();
    const result = await run(requireAdmin, fakeRequest(user.id));
    expect((result.error as { status?: number }).status).toBe(404);
  });

  it('answers 404 to nobody at all', async () => {
    const result = await run(requireAdmin, fakeRequest(undefined));
    expect((result.error as { status?: number }).status).toBe(404);
  });

  it('refuses a suspended administrator', async () => {
    const admin = await makeAdmin();
    await suspend(admin.id);
    const result = await run(requireAdmin, fakeRequest(admin.id));
    expect(result.passed).toBe(false);
  });
});
