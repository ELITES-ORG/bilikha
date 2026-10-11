import { describe, expect, it } from 'vitest';
import type { OwnIdVerification } from '@contracts/verification';
import type { AuthUser } from '@/features/auth/types';
import type { StorageLike } from '@/features/auth/session-cache';
import { CHANGE_PASSWORD_PATH, guardRedirect } from '@/features/auth/guard-redirect';
import {
  clearDeclineNotice,
  ID_STEP_PATH,
  isBrowseOnly,
  needsIdStep,
  readDeclineNotice,
  storeDeclineNotice,
} from './status';

function user(idVerification: OwnIdVerification | null, mustChangePassword = false): AuthUser {
  return {
    id: 'u1',
    username: 'juan',
    firstName: 'Juan',
    lastName: 'Cruz',
    email: 'juan@example.test',
    role: 'member',
    viewMode: 'hiring',
    municipalitySlug: 'naval',
    municipalityName: 'Naval',
    profileSlug: null,
    profileStatus: null,
    rejectionReason: null,
    avatarUrl: null,
    pendingAvatarUrl: null,
    avatarRejectionReason: null,
    mustChangePassword,
    idVerification,
  };
}

const unsent: OwnIdVerification = { status: 'pending', submitted: false, reason: null };
const waiting: OwnIdVerification = { status: 'pending', submitted: true, reason: null };
const retry: OwnIdVerification = { status: 'declined_retry', submitted: true, reason: 'Blurred.' };
const verified: OwnIdVerification = { status: 'verified', submitted: true, reason: null };

function memoryStore(): StorageLike & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe('where an account stands', () => {
  it('owes its ID when unsent or sent back, never when there is no verification', () => {
    expect(needsIdStep(user(unsent))).toBe(true);
    expect(needsIdStep(user(retry))).toBe(true);
    expect(needsIdStep(user(waiting))).toBe(false);
    expect(needsIdStep(user(verified))).toBe(false);
    expect(needsIdStep(user(null))).toBe(false);
    expect(needsIdStep(null)).toBe(false);
  });

  it('is browse-only while pending or sent back, and never without a verification', () => {
    expect(isBrowseOnly(user(unsent))).toBe(true);
    expect(isBrowseOnly(user(waiting))).toBe(true);
    expect(isBrowseOnly(user(retry))).toBe(true);
    expect(isBrowseOnly(user(verified))).toBe(false);
    expect(isBrowseOnly(user(null))).toBe(false);
  });
});

describe('the signed-in guard', () => {
  it('sends a forced password change first, and never away from its own page', () => {
    const locked = user(unsent, true);

    expect(guardRedirect(locked, '/directory', false)).toBe(CHANGE_PASSWORD_PATH);
    expect(guardRedirect(locked, ID_STEP_PATH, false)).toBe(CHANGE_PASSWORD_PATH);
    expect(guardRedirect(locked, CHANGE_PASSWORD_PATH, false)).toBeNull();
  });

  it('then sends an ID still owed to the ID step, and never away from it', () => {
    expect(guardRedirect(user(unsent), '/directory', false)).toBe(ID_STEP_PATH);
    expect(guardRedirect(user(retry), '/messages', false)).toBe(ID_STEP_PATH);
    expect(guardRedirect(user(unsent), ID_STEP_PATH, false)).toBeNull();
  });

  it('cannot loop: following each redirect once always lands somewhere that stays', () => {
    for (const account of [user(unsent, true), user(unsent), user(retry, true), user(waiting)]) {
      let path = '/directory';
      for (let hop = 0; hop < 3; hop += 1) {
        const next = guardRedirect(account, path, false);
        if (!next) break;
        path = next;
      }
      expect(guardRedirect(account, path, false)).toBeNull();
    }
  });

  it("does not act on the device's remembered session, only on the server's answer", () => {
    expect(guardRedirect(user(unsent), '/directory', true)).toBeNull();
  });

  it('leaves a submitted, verified or legacy account where it is', () => {
    for (const verification of [waiting, verified, null]) {
      expect(guardRedirect(user(verification), '/account', false)).toBeNull();
    }
  });
});

describe('the decline notice for the sign-in screen', () => {
  it('keeps a notice until it is cleared', () => {
    const store = memoryStore();
    storeDeclineNotice({ kind: 'retry', reason: 'The back is unreadable.' }, store);

    expect(readDeclineNotice(store)).toEqual({ kind: 'retry', reason: 'The back is unreadable.' });
    expect(readDeclineNotice(store)).not.toBeNull();
    clearDeclineNotice(store);
    expect(readDeclineNotice(store)).toBeNull();
  });

  it('ignores anything that is not a notice', () => {
    const store = memoryStore();
    storeDeclineNotice({ kind: 'nonsense' }, store);
    expect(store.items.size).toBe(0);

    store.setItem('bilikha:decline-notice', '{not json');
    expect(readDeclineNotice(store)).toBeNull();
  });

  it('works without storage at all', () => {
    expect(() => storeDeclineNotice({ kind: 'final', reason: 'x' }, null)).not.toThrow();
    expect(readDeclineNotice(null)).toBeNull();
  });
});
