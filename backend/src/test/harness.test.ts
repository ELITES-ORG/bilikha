import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { municipalities, users } from '../db/schema/index.js';
import { makeCreative, makeUser } from './factories.js';

describe('the harness', () => {
  it('starts each test with no users', async () => {
    const [row] = await db.select({ value: count() }).from(users);
    expect(row?.value).toBe(0);
  });

  it('leaves a user behind within a test', async () => {
    await makeUser();
    await makeUser();
    const [row] = await db.select({ value: count() }).from(users);
    expect(row?.value).toBe(2);
  });

  it('has truncated them again by the next test', async () => {
    const [row] = await db.select({ value: count() }).from(users);
    expect(row?.value).toBe(0);
  });

  it('keeps reference data across truncation', async () => {
    const [row] = await db.select({ value: count() }).from(municipalities);
    expect(row?.value).toBeGreaterThan(0);
  });

  it('builds a creative the services can find', async () => {
    const { user, profile } = await makeCreative();
    const [found] = await db.select().from(users).where(eq(users.id, user.id));
    expect(found?.status).toBe('active');
    expect(profile.status).toBe('published');
  });
});
