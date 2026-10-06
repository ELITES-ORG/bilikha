import { describe, expect, it } from 'vitest';
import { NavigationType } from 'react-router-dom';
import {
  MAX_SCROLL_ENTRIES,
  SCROLL_STORAGE_KEY,
  readScrollPositions,
  scrollEntryKey,
  startsAtTop,
  writeScrollPositions,
} from './scroll-on-navigate';

describe('startsAtTop', () => {
  it('is true when a link opens a different page', () => {
    expect(startsAtTop('/', '/register', NavigationType.Push)).toBe(true);
  });

  it('is true for a redirect to a different page', () => {
    expect(startsAtTop('/account', '/login', NavigationType.Replace)).toBe(true);
  });

  it('is false on back and forward, where the browser restores the old place', () => {
    expect(startsAtTop('/register', '/', NavigationType.Pop)).toBe(false);
  });

  it('is false when only the query string changed, which is the same page refiltered', () => {
    expect(startsAtTop('/directory', '/directory', NavigationType.Push)).toBe(false);
  });

  it('is false on the page the tab landed on', () => {
    expect(startsAtTop(null, '/', NavigationType.Pop)).toBe(false);
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    raw: () => data.get(SCROLL_STORAGE_KEY),
  };
}

describe('saved scroll positions', () => {
  it('survive a round trip, which is what a reload goes through', () => {
    const storage = memoryStorage();
    const positions = new Map([[scrollEntryKey('k1', '/terms', ''), 1500]]);
    writeScrollPositions(storage, positions);
    expect(readScrollPositions(storage).get(scrollEntryKey('k1', '/terms', ''))).toBe(1500);
  });

  it('are kept per page, so a typed URL on the default key does not inherit another page', () => {
    expect(scrollEntryKey('default', '/terms', '')).not.toBe(scrollEntryKey('default', '/', ''));
  });

  it('keep only the most recent entries', () => {
    const storage = memoryStorage();
    const positions = new Map(
      Array.from({ length: MAX_SCROLL_ENTRIES + 10 }, (_, i) => [`k${i} /`, i] as [string, number]),
    );
    writeScrollPositions(storage, positions);
    const saved = readScrollPositions(storage);
    expect(saved.size).toBe(MAX_SCROLL_ENTRIES);
    expect(saved.has('k0 /')).toBe(false);
    expect(saved.get(`k${MAX_SCROLL_ENTRIES + 9} /`)).toBe(MAX_SCROLL_ENTRIES + 9);
  });

  it('read as none when missing, malformed or blocked', () => {
    expect(readScrollPositions(null).size).toBe(0);
    expect(readScrollPositions(memoryStorage()).size).toBe(0);
    expect(readScrollPositions(memoryStorage({ [SCROLL_STORAGE_KEY]: '{oops' })).size).toBe(0);
    expect(readScrollPositions(memoryStorage({ [SCROLL_STORAGE_KEY]: '[["k /", "1500"]]' })).size).toBe(0);
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readScrollPositions(blocked).size).toBe(0);
  });

  it('ignore a storage that refuses the write', () => {
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => writeScrollPositions(full, new Map([['k /', 1]]))).not.toThrow();
  });
});
