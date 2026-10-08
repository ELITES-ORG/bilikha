// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_STORAGE_KEY, parseLocale, readLocale, setLocale } from './locale';

/**
 * Plan 0050 — storage rules, plus the one DOM effect `setLocale` has.
 *
 * happy-dom rather than the default node environment, because `setLocale`
 * applies the choice to `<html lang>` as well as writing storage, and the
 * clearing-versus-writing branch is worth a test. Absent, unrecognised and throwing storage
 * all resolve to English, so a broken preference leaves somebody on the one
 * language the catalogue is guaranteed to have (ADR 0055).
 */
describe('parseLocale', () => {
  it('accepts the two non-default languages', () => {
    expect(parseLocale('fil')).toBe('fil');
    expect(parseLocale('war')).toBe('war');
  });

  it('treats absent and unrecognised values as English', () => {
    expect(parseLocale(null)).toBe('en');
    expect(parseLocale(undefined)).toBe('en');
    expect(parseLocale('')).toBe('en');
    expect(parseLocale('FIL')).toBe('en');
    expect(parseLocale('tl')).toBe('en');
    expect(parseLocale('ceb')).toBe('en');
  });
});

describe('readLocale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns English when nothing is stored', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readLocale()).toBe('en');
  });

  it('returns a stored language', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'war',
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readLocale()).toBe('war');
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readLocale()).toBe('en');
  });
});

describe('setLocale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the key for English rather than writing it', () => {
    const removed: string[] = [];
    const written: string[] = [];
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: (key: string) => written.push(key),
      removeItem: (key: string) => removed.push(key),
    });

    setLocale('en');

    expect(removed).toEqual([LOCALE_STORAGE_KEY]);
    expect(written).toEqual([]);
  });

  it('writes a non-default language', () => {
    const written: Array<[string, string]> = [];
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: (key: string, value: string) => written.push([key, value]),
      removeItem: () => {},
    });

    setLocale('fil');

    expect(written).toEqual([[LOCALE_STORAGE_KEY, 'fil']]);
  });

  it('still applies to the document when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => setLocale('war')).not.toThrow();
    expect(document.documentElement.lang).toBe('war');
  });
});
