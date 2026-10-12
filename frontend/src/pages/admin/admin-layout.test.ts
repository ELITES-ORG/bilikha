import { describe, expect, it } from 'vitest';

/**
 * Source checks, in the style of site-layout.test.ts.
 *
 * On phones the admin sections are one row that scrolls sideways. Each badge in
 * it carries screen-reader text ("6 waiting in Creatives") that is absolutely
 * positioned. Unless the scrolling row is itself positioned, that text is
 * placed against the page rather than clipped by the row, and every admin page
 * scrolls sideways at 375px — by 117px when #86 shipped.
 */

const layoutSource = import.meta.glob('./AdminLayout.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})['./AdminLayout.tsx'] as string;

describe('the phone section row', () => {
  it('positions its scroller, so badge text stays inside it', () => {
    const scroller = layoutSource
      .split('\n')
      .find((line) => line.includes('overflow-x-auto'));

    expect(scroller, 'the scrolling row').toBeDefined();
    expect(scroller).toMatch(/['\s]relative\s/);
  });

  it('still gives each badge its screen-reader text', () => {
    expect(layoutSource).toContain('className="sr-only"');
  });
});
