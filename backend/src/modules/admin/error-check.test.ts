import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashPassword } from '../../lib/password.js';
import { makeAdmin, makeUser, PASSWORD } from '../../test/factories.js';

/**
 * Through the real app, because what matters is the stack around the handler:
 * the admin guard in front of it and the error handler behind it.
 */
describe('POST /api/v1/admin/error-check', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  async function signIn(username: string): Promise<string> {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    return response.headers.get('set-cookie')!.split(';')[0]!;
  }

  it('answers an administrator with the generic 500 the error handler gives any bug', async () => {
    const admin = await makeAdmin({ passwordHash: await hashPassword(PASSWORD) });
    const response = await fetch(`${base}/admin/error-check`, {
      method: 'POST',
      headers: { cookie: await signIn(admin.username) },
    });

    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'INTERNAL_SERVER_ERROR',
    );
  });

  it('is not there for anyone else, like the rest of the admin surface', async () => {
    const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const signedIn = await fetch(`${base}/admin/error-check`, {
      method: 'POST',
      headers: { cookie: await signIn(user.username) },
    });
    const signedOut = await fetch(`${base}/admin/error-check`, { method: 'POST' });

    expect(signedIn.status).toBe(404);
    expect(signedOut.status).toBe(404);
  });
});
