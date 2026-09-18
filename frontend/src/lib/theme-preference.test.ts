import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemePreference,
  parseThemePreference,
  readThemePreference,
  setThemePreference,
  THEME_STORAGE_KEY,
} from './theme-preference';

/**
 * Plan 0024 — pure logic only. Absent, unrecognised, and throwing storage all
 * resolve to System so a broken or empty preference never strands someone on
 * Light or Dark.
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
    localStorage.removeItem(THEME_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it('returns system when nothing is stored', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('returns a stored light or dark choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
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

describe('setThemePreference', () => {
  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('writes light and sets data-theme', () => {
    setThemePreference('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('clears storage and the attribute for system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('applyThemePreference', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('does not touch storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    applyThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
