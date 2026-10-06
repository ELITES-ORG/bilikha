import { describe, expect, it } from 'vitest';
import { NavigationType } from 'react-router-dom';
import { startsAtTop } from './scroll-on-navigate';

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
