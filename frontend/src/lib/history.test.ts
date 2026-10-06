import { describe, expect, it } from 'vitest';
import { canGoBackInApp } from './history';

describe('canGoBackInApp', () => {
  it('is false on the page the tab landed on', () => {
    expect(canGoBackInApp({ usr: null, key: 'default', idx: 0 })).toBe(false);
  });

  it('stays false after a replace on that page, which keeps the index but changes the key', () => {
    expect(canGoBackInApp({ usr: null, key: 'k3x9a1', idx: 0 })).toBe(false);
  });

  it('is true after an in-app push', () => {
    expect(canGoBackInApp({ usr: null, key: 'p2q8z0', idx: 1 })).toBe(true);
  });

  it('is false when the state is missing or was not written by the router', () => {
    expect(canGoBackInApp(null)).toBe(false);
    expect(canGoBackInApp(undefined)).toBe(false);
    expect(canGoBackInApp({ idx: '2' })).toBe(false);
  });
});
