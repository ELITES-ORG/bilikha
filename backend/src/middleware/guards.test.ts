import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from './require-auth.js';
import { requireAdmin } from './require-admin.js';
import { makeAdmin, makeUser, suspend } from '../test/factories.js';

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
