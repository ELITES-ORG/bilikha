import { describe, expect, it } from 'vitest';
import { isProductionHost, PRODUCTION_ORIGIN } from './site-host';

/**
 * The staging banner is shown everywhere this says false. The failure that
 * matters is the banner appearing on production, so production is matched
 * exactly and everything else — staging, previews, a laptop — counts as not
 * the live site.
 */

describe('isProductionHost', () => {
  it('is true only for the production hostname', () => {
    expect(isProductionHost('bilikha.vercel.app')).toBe(true);
  });

  it('is false for staging, pull request previews and local development', () => {
    expect(isProductionHost('bilikha-staging.vercel.app')).toBe(false);
    expect(isProductionHost('bilikha-git-feat-x-elites-org.vercel.app')).toBe(false);
    expect(isProductionHost('localhost')).toBe(false);
    expect(isProductionHost('127.0.0.1')).toBe(false);
  });

  it('is not fooled by a hostname that merely contains the production one', () => {
    expect(isProductionHost('bilikha.vercel.app.example.com')).toBe(false);
    expect(isProductionHost('evil-bilikha.vercel.app')).toBe(false);
  });

  it('ignores case, as hostnames do', () => {
    expect(isProductionHost('Bilikha.Vercel.App')).toBe(true);
  });
});

describe('PRODUCTION_ORIGIN', () => {
  it('points at the production hostname over https', () => {
    expect(new URL(PRODUCTION_ORIGIN).hostname).toBe('bilikha.vercel.app');
    expect(new URL(PRODUCTION_ORIGIN).protocol).toBe('https:');
  });
});
