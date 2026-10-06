import { describe, expect, it } from 'vitest';
import { routeLabel } from './route-labels';

describe('routeLabel', () => {
  it('names the page a link leads to', () => {
    expect(routeLabel('/register')).toBe('Join the registry');
    expect(routeLabel('/login')).toBe('Sign in');
  });

  it('ignores the query string and the hash', () => {
    expect(routeLabel('/directory?municipality=naval')).toBe('Directory');
    expect(routeLabel('/#coverage')).toBe('Home');
  });

  it('names a page inside a section after the section', () => {
    expect(routeLabel('/messages/3f2a')).toBe('Messages');
    expect(routeLabel('/account/security')).toBe('Your account');
  });

  it('does not match a section by a shared prefix alone', () => {
    expect(routeLabel('/directoryx')).toBe('Bilikha');
  });

  it('falls back to the product name for a page it does not know', () => {
    expect(routeLabel('/styleguide')).toBe('Bilikha');
  });
});
