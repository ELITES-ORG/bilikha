import { describe, expect, it } from 'vitest';

/**
 * Source checks, in the style of site-layout.test.ts. The regressions worth
 * catching: the pinned banners moving inside a layout route, where some pages
 * would lose them; the staging banner deciding by anything other than the
 * hostname rule that keeps it off production; and a new sticky bar or
 * full-height screen that ignores the banners' height, so they cover it or
 * make it scroll.
 *
 * `PinnedBanners` holds the staging banner and the ID verification banner
 * (ADR 0057). Only it is sticky, and only it measures.
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

const pinnedSource = raw(
  import.meta.glob('./PinnedBanners.tsx', { query: '?raw', import: 'default', eager: true }),
  './PinnedBanners.tsx',
);

const sources = import.meta.glob(['../**/*.tsx', '!../**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sourceOf = (suffix: string) =>
  Object.entries(sources).find(([path]) => path.endsWith(suffix))?.[1];

describe('the pinned banners', () => {
  it('are rendered once by App, outside the routes, so every page has them', () => {
    expect(appSource.split('<PinnedBanners />')).toHaveLength(2);
    expect(appSource.indexOf('<PinnedBanners />')).toBeLessThan(appSource.indexOf('<Routes>'));
    expect(appSource).not.toContain('<StagingBanner />');
  });

  it('hold the staging banner and the verification banner, always rendered', () => {
    expect(pinnedSource).toContain('<StagingBanner />');
    expect(pinnedSource).toContain('<VerificationBanner />');
    // No early return: the wrapper is what publishes 0px when neither shows.
    expect(pinnedSource).not.toMatch(/return null/);
  });

  it('are sticky as one, and publish their height for the rest of the layout', () => {
    expect(pinnedSource).toContain('sticky top-0');
    expect(pinnedSource).toContain("setProperty('--staging-banner-h'");
    expect(pinnedSource).toContain("removeProperty('--staging-banner-h')");
  });
});

describe('the staging banner', () => {

  it('is hidden by the production hostname rule and nothing else', () => {
    expect(bannerSource).toContain('if (isProductionHost(window.location.hostname)) return null;');
    expect(bannerSource).not.toMatch(/import\.meta\.env/);
  });

  it('links to the live site', () => {
    expect(bannerSource).toContain('href={PRODUCTION_ORIGIN}');
  });

  it('leaves pinning and measuring to the wrapper', () => {
    expect(bannerSource).not.toContain('sticky');
    expect(bannerSource).not.toContain('--staging-banner-h');
  });
});

describe('the layout makes room for the staging banner', () => {
  it('every bar stuck to the top sits below it, not under it', () => {
    for (const suffix of ['/SiteHeader.tsx', '/ConversationPage.tsx', '/AdminLayout.tsx']) {
      expect(sourceOf(suffix), suffix).toContain('sticky top-(--staging-banner-h)');
    }
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('/PinnedBanners.tsx'))
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
