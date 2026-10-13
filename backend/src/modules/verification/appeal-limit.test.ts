import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashPassword } from '../../lib/password.js';
import { makeIdVerification, makeUser, PASSWORD } from '../../test/factories.js';

/**
 * The appeal shares the sign-in limiter (plan 0053 Step 4.2): a guess at the
 * appeal is a guess at the password. In its own file, so the limiter's count
 * starts clean and no other test spends it.
 */
describe('the appeal and the sign-in limiter', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { error?: { code: string } };
    return { status: response.status, code: json.error?.code };
  };

  it('does not count an appeal refused after the right password, and counts wrong guesses with sign-in', async () => {
    const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    await makeIdVerification(user.id, {
      status: 'declined_retry',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decisionReason: 'Blurred.',
    });
    const message = 'This is long enough to be an appeal message.';

    // Right password, nothing to appeal: answered every time, never counted.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await post('/auth/id-appeal', { username: user.username, password: PASSWORD, message })).code).toBe(
        'ID_APPEAL_CLOSED',
      );
    }

    // Wrong guesses at the appeal and at sign-in share one count of ten.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post('/auth/id-appeal', { username: user.username, password: 'wrong', message })).status).toBe(401);
      expect((await post('/auth/login', { username: user.username, password: 'wrong' })).status).toBe(401);
    }
    expect((await post('/auth/id-appeal', { username: user.username, password: PASSWORD, message })).code).toBe(
      'RATE_LIMITED',
    );
  });
});
