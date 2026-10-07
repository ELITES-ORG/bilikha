import { describe, expect, it } from 'vitest';
import {
  ARRIVED_BY_STORAGE_KEY,
  MAX_ARRIVED_BY_ENTRIES,
  arrivedByKey,
  readArrivedBy,
  writeArrivedBy,
} from './arrived-by';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('the record of which overlay brought each page on screen', () => {
  it('survives a round trip, which is what a reload goes through', () => {
    const storage = memoryStorage();
    writeArrivedBy(storage, new Map([[arrivedByKey('k1', '/login'), 'bloom']]));
    expect(readArrivedBy(storage).get(arrivedByKey('k1', '/login'))).toBe('bloom');
  });

  it('is kept per page, so a typed URL on the default key does not inherit another page', () => {
    expect(arrivedByKey('default', '/login')).not.toBe(arrivedByKey('default', '/'));
  });

  it('keeps only the most recent entries', () => {
    const storage = memoryStorage();
    const record = new Map(
      Array.from({ length: MAX_ARRIVED_BY_ENTRIES + 10 }, (_, i) => [`k${i} /`, 'wave'] as const),
    );
    writeArrivedBy(storage, record);
    const saved = readArrivedBy(storage);
    expect(saved.size).toBe(MAX_ARRIVED_BY_ENTRIES);
    expect(saved.has('k0 /')).toBe(false);
    expect(saved.has(`k${MAX_ARRIVED_BY_ENTRIES + 9} /`)).toBe(true);
  });

  it('reads as empty when missing, malformed, blocked or naming an unknown overlay', () => {
    expect(readArrivedBy(null).size).toBe(0);
    expect(readArrivedBy(memoryStorage()).size).toBe(0);
    expect(readArrivedBy(memoryStorage({ [ARRIVED_BY_STORAGE_KEY]: '{oops' })).size).toBe(0);
    expect(readArrivedBy(memoryStorage({ [ARRIVED_BY_STORAGE_KEY]: '[["k /", "fade"]]' })).size).toBe(0);
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readArrivedBy(blocked).size).toBe(0);
  });

  it('ignores a storage that refuses the write', () => {
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => writeArrivedBy(full, new Map([['k /', 'bloom']]))).not.toThrow();
  });
});
