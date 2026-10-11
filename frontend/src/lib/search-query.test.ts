import { describe, expect, it } from 'vitest';
import { normalizeSearch } from './search-query';

describe('normalizeSearch', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeSearch('  wedding    photographer ')).toBe('wedding photographer');
    expect(normalizeSearch('Naval\n')).toBe('Naval');
  });

  it('treats nothing and one character as no search', () => {
    expect(normalizeSearch(null)).toBeUndefined();
    expect(normalizeSearch(undefined)).toBeUndefined();
    expect(normalizeSearch('')).toBeUndefined();
    expect(normalizeSearch('   ')).toBeUndefined();
    expect(normalizeSearch(' a ')).toBeUndefined();
    expect(normalizeSearch('ab')).toBe('ab');
  });

  it('cuts at 100 characters without leaving a trailing space', () => {
    expect(normalizeSearch('x'.repeat(150))).toHaveLength(100);
    expect(normalizeSearch(`${'x'.repeat(99)} yz`)).toBe('x'.repeat(99));
  });
});
