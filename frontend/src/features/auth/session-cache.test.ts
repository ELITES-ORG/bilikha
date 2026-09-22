import { describe, expect, it } from 'vitest';
import {
  clearLastSession,
  readLastSession,
  writeLastSession,
  type StorageLike,
} from './session-cache';
import type { AuthUser } from './types';

/**
 * This entry decides what the app paints before the server answers, so the way
 * it fails matters more than the way it works. Every failure has to read as
 * "no hint" — the behaviour before it existed — and never as a half-populated
 * user, which would render a header with somebody's name missing and nothing to
 * explain why.
 */

function fakeStore(initial?: string): StorageLike & { dump: () => string | undefined } {
  let value = initial;
  return {
    getItem: () => value ?? null,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = undefined;
    },
    dump: () => value,
  };
}

/** Throws on every operation, as a private window with blocked storage does. */
const hostileStore: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const user = {
  id: 'u1',
  username: 'tess',
  firstName: 'Tess',
  lastName: 'Cano',
  role: 'user',
  viewMode: 'creative',
  profileSlug: 'tess-cano',
  avatarUrl: null,
} as unknown as AuthUser;

describe('session cache', () => {
  it('returns undefined when nothing was ever stored', () => {
    expect(readLastSession(fakeStore())).toBeUndefined();
  });

  it('round-trips a user', () => {
    const store = fakeStore();
    writeLastSession(user, store);
    expect(readLastSession(store)).toEqual(user);
  });

  it('distinguishes a remembered signed-out state from no hint at all', () => {
    // A stored null means "this device saw nobody signed in" and is worth
    // painting at once. undefined means we do not know and must wait.
    const store = fakeStore();
    writeLastSession(null, store);
    expect(readLastSession(store)).toBeNull();
  });

  it('ignores an entry written by an older shape', () => {
    expect(readLastSession(fakeStore(JSON.stringify({ v: 0, user })))).toBeUndefined();
  });

  it('ignores anything that is not the JSON it wrote', () => {
    expect(readLastSession(fakeStore('not json at all'))).toBeUndefined();
    expect(readLastSession(fakeStore('null'))).toBeUndefined();
    expect(readLastSession(fakeStore('{"v":1}'))).toBeUndefined();
  });

  it('forgets on clear, so a shared phone keeps nobody signed in', () => {
    const store = fakeStore();
    writeLastSession(user, store);
    clearLastSession(store);
    expect(readLastSession(store)).toBeUndefined();
  });

  it('treats storage that throws as no hint rather than crashing the app', () => {
    // A private window blocks localStorage. Nothing here may take the app down.
    expect(readLastSession(hostileStore)).toBeUndefined();
    expect(() => writeLastSession(user, hostileStore)).not.toThrow();
    expect(() => clearLastSession(hostileStore)).not.toThrow();
  });

  it('does nothing at all when there is no storage', () => {
    expect(readLastSession(null)).toBeUndefined();
    expect(() => writeLastSession(user, null)).not.toThrow();
    expect(() => clearLastSession(null)).not.toThrow();
  });
});
