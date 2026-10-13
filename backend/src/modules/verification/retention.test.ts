import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { idVerifications } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { deleteObject, listObjects, type StoredObject } from '../../lib/storage.js';
import { makeIdVerification, makeUser } from '../../test/factories.js';
import { claimForDeletion, purgeDecidedIdImages, purgeOrphanIdObjects } from './retention.js';

/**
 * Deleting ID photos (ADR 0057, plan 0053 Step 3.3). Storage is mocked; the
 * test turns storage "on" itself, because the test setup turns it off whatever
 * this machine's .env holds.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return { ...actual, deleteObject: vi.fn(), listObjects: vi.fn() };
});

const remove = vi.mocked(deleteObject);
const list = vi.mocked(listObjects);

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-20T08:00:00Z');
const saved = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  env.SUPABASE_URL = 'http://storage.test';
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
  remove.mockReset().mockResolvedValue(undefined);
  list.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  env.SUPABASE_URL = saved.url;
  env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  vi.restoreAllMocks();
});

async function decidedRow(daysAgo: number, overrides: Parameters<typeof makeIdVerification>[1] = {}) {
  const user = await makeUser();
  return makeIdVerification(user.id, {
    status: 'verified',
    idType: 'drivers_license',
    frontKey: `ids/${user.id}/${randomUUID()}-front.webp`,
    backKey: `ids/${user.id}/${randomUUID()}-back.webp`,
    submittedAt: new Date(NOW.getTime() - (daysAgo + 1) * DAY),
    decidedAt: new Date(NOW.getTime() - daysAgo * DAY),
    ...overrides,
  });
}

function object(name: string, ageMs: number): StoredObject {
  return {
    name,
    updatedAt: new Date(NOW.getTime() - ageMs).toISOString(),
    size: 1000,
    mimetype: 'image/webp',
  };
}

async function reload(id: string) {
  const [row] = await db.select().from(idVerifications).where(eq(idVerifications.id, id));
  return row!;
}

describe('deleting decided ID images', () => {
  it('deletes the images 7 days after the decision and keeps the record', async () => {
    const row = await decidedRow(8);

    expect(await purgeDecidedIdImages(NOW)).toBe(1);

    expect(remove).toHaveBeenCalledWith(row.frontKey, env.SUPABASE_ID_BUCKET);
    expect(remove).toHaveBeenCalledWith(row.backKey, env.SUPABASE_ID_BUCKET);
    const after = await reload(row.id);
    expect(after).toMatchObject({ status: 'verified', frontKey: null, backKey: null, idType: 'drivers_license' });
    expect(after.imagesDeletedAt?.getTime()).toBe(NOW.getTime());
    expect(after.decidedAt).not.toBeNull();
  });

  it('keeps the images within the 7 days, while waiting, and during an open appeal', async () => {
    const recent = await decidedRow(6);
    const appealed = await decidedRow(8, { status: 'appealed', appealedAt: new Date() });
    const waiting = await makeIdVerification((await makeUser()).id, {
      frontKey: 'ids/x/y-front.webp',
      submittedAt: new Date(NOW.getTime() - 30 * DAY),
    });

    expect(await purgeDecidedIdImages(NOW)).toBe(0);

    expect(remove).not.toHaveBeenCalled();
    for (const row of [recent, appealed, waiting]) {
      expect((await reload(row.id)).frontKey).not.toBeNull();
    }
  });

  it('logs a storage failure, carries on, and leaves the object to the unreferenced pass', async () => {
    const failing = await decidedRow(9);
    const fine = await decidedRow(8);
    const logged = vi.spyOn(logger, 'error');
    remove.mockImplementation(async (key: string) => {
      if (key === failing.frontKey) throw new Error('storage is down');
    });

    await expect(purgeDecidedIdImages(NOW)).resolves.toBe(2);

    // Claimed before the delete, so no row points at the object that failed...
    expect(await reload(failing.id)).toMatchObject({ frontKey: null, backKey: null });
    expect((await reload(fine.id)).imagesDeletedAt).not.toBeNull();
    expect(logged).toHaveBeenCalled();
    // By row, never by key.
    expect(JSON.stringify(logged.mock.calls[0]![0])).not.toContain('ids/');

    // ...and the unreferenced-object pass deletes it.
    remove.mockReset().mockResolvedValue(undefined);
    list.mockResolvedValue([object(failing.frontKey!, 9 * DAY)]);
    expect(await purgeOrphanIdObjects(NOW)).toBe(1);
    expect(remove).toHaveBeenCalledWith(failing.frontKey, env.SUPABASE_ID_BUCKET);
  });

  it('cannot claim a row appealed, or decided again, after it was found', async () => {
    // The purge finds rows first and claims each one after: these are the
    // states an appeal or a changed decision leaves in between.
    const appealed = await decidedRow(8, {
      status: 'appealed',
      appealMessage: 'I moved to Naval last year.',
      appealedAt: new Date(),
    });
    const changed = await decidedRow(8);
    await db.update(idVerifications).set({ decidedAt: NOW }).where(eq(idVerifications.id, changed.id));
    const due = await decidedRow(8);

    expect(await claimForDeletion(appealed.id, NOW)).toBe(false);
    expect(await claimForDeletion(changed.id, NOW)).toBe(false);
    expect(await claimForDeletion(due.id, NOW)).toBe(true);
    // Once: a second pass finds it already claimed.
    expect(await claimForDeletion(due.id, NOW)).toBe(false);

    for (const row of [appealed, changed]) {
      expect(await reload(row.id)).toMatchObject({ frontKey: row.frontKey, imagesDeletedAt: null });
    }
    expect(await reload(due.id)).toMatchObject({ frontKey: null, backKey: null });
  });

  it('does nothing without storage', async () => {
    await decidedRow(8);
    env.SUPABASE_URL = undefined;

    expect(await purgeDecidedIdImages(NOW)).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('deleting unreferenced ID objects', () => {

  it('deletes an old object no row points at, and keeps a fresh one and a referenced one', async () => {
    const referenced = await decidedRow(2);
    list.mockResolvedValue([
      object('ids/gone/old-front.webp', 2 * DAY),
      object('ids/new/fresh-front.webp', 60 * 60 * 1000),
      object(referenced.frontKey!, 3 * DAY),
    ]);

    expect(await purgeOrphanIdObjects(NOW)).toBe(1);

    expect(list).toHaveBeenCalledWith('ids/', env.SUPABASE_ID_BUCKET);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('ids/gone/old-front.webp', env.SUPABASE_ID_BUCKET);
  });

  it('leaves everything alone when the database is local and storage is hosted', async () => {
    env.SUPABASE_URL = 'https://abcdefgh.supabase.co';
    list.mockResolvedValue([object('ids/gone/old-front.webp', 5 * DAY)]);

    expect(await purgeOrphanIdObjects(NOW)).toBe(0);
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('logs a listing failure instead of throwing', async () => {
    const logged = vi.spyOn(logger, 'error');
    list.mockRejectedValue(new Error('storage is down'));

    await expect(purgeOrphanIdObjects(NOW)).resolves.toBe(0);
    expect(logged).toHaveBeenCalled();
  });
});
