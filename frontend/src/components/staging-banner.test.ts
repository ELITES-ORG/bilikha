import { describe, expect, it } from 'vitest';

/**
 * Source checks, in the style of site-layout.test.ts. The regressions worth
 * catching: the banner moving inside a layout route, where some pages would
 * lose it; the banner deciding by anything other than the hostname rule that
 * keeps it off production; and a new sticky bar or full-height screen that
 * ignores the banner's height, so the banner covers it or makes it scroll.
 */

const raw = (glob: Record<string, string>, key: string) => glob[key]!;

const appSource = raw(
  import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }),
  '../App.tsx',
);

const bannerSource = raw(
  import.meta.glob('./StagingBanner.tsx', { query: '?raw', import: 'default', eager: true }),
  './StagingBanner.tsx',
);

const sources = import.meta.glob(['../**/*.tsx', '!../**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sourceOf = (suffix: string) =>
  Object.entries(sources).find(([path]) => path.endsWith(suffix))?.[1];

describe('the staging banner', () => {
  it('is rendered once by App, outside the routes, so every page has it', () => {
    expect(appSource.split('<StagingBanner />')).toHaveLength(2);
    expect(appSource.indexOf('<StagingBanner />')).toBeLessThan(appSource.indexOf('<Routes>'));
  });

  it('is hidden by the production hostname rule and nothing else', () => {
    expect(bannerSource).toContain('if (isProductionHost(window.location.hostname)) return null;');
    expect(bannerSource).not.toMatch(/import\.meta\.env/);
  });

  it('links to the live site', () => {
    expect(bannerSource).toContain('href={PRODUCTION_ORIGIN}');
  });

  it('is sticky and publishes its height for the rest of the layout', () => {
    expect(bannerSource).toContain('sticky top-0');
    expect(bannerSource).toContain("setProperty('--staging-banner-h'");
    expect(bannerSource).toContain("removeProperty('--staging-banner-h')");
  });
});

describe('the layout makes room for the staging banner', () => {
  it('every bar stuck to the top sits below it, not under it', () => {
    for (const suffix of ['/SiteHeader.tsx', '/ConversationPage.tsx', '/AdminLayout.tsx']) {
      expect(sourceOf(suffix), suffix).toContain('sticky top-(--staging-banner-h)');
    }
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('/StagingBanner.tsx'))
      .filter(([, source]) => /\bsticky top-0\b/.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('every notice fixed below the header is offset by it', () => {
    for (const suffix of ['/ui/Toast.tsx', '/NewBuildNotice.tsx']) {
      expect(sourceOf(suffix), suffix).toContain('top-[calc(var(--staging-banner-h)+4rem');
    }
  });

  it('no full-height screen inside the app uses the raw viewport height', () => {
    // AppErrorBoundary renders in place of App, so there is no banner beside it.
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('/AppErrorBoundary.tsx'))
      .filter(([, source]) => /\bmin-h-(dvh|svh|screen)\b/.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
