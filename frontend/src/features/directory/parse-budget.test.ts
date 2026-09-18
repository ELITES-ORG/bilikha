import { describe, expect, it } from 'vitest';
import { parseBudget } from './parse-budget';

/**
 * Plan 0023 — the only pure logic in the filter move. Layout and the shared
 * setFilter stay untested here; inventing render coverage would not prove the
 * rail and panel share state.
 */
describe('parseBudget', () => {
  it('accepts a positive integer', () => {
    expect(parseBudget('500')).toBe(500);
  });

  it('rejects empty, zero, negative, and non-integers', () => {
    expect(parseBudget(null)).toBeUndefined();
    expect(parseBudget('')).toBeUndefined();
    expect(parseBudget('0')).toBeUndefined();
    expect(parseBudget('-1')).toBeUndefined();
    expect(parseBudget('12.5')).toBeUndefined();
    expect(parseBudget('abc')).toBeUndefined();
  });
});
