import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
} from './theme-preference';

/**
 * Plan 0024 — pure logic only. Absent, unrecognised, and throwing storage all
 * resolve to System so a broken or empty preference never strands someone on
 * Light or Dark. DOM application is not covered here.
 */
describe('parseThemePreference', () => {
  it('accepts light and dark', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('treats absent and unrecognised values as system', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference('System')).toBe('system');
    expect(parseThemePreference('auto')).toBe('system');
  });
});

describe('readThemePreference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns system when nothing is stored', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readThemePreference()).toBe('system');
  });

  it('returns a stored light or dark choice', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? 'dark' : null),
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readThemePreference()).toBe('dark');
  });

  it('returns system when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readThemePreference()).toBe('system');
  });
});
