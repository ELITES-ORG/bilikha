// @vitest-environment happy-dom

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The header is rendered once, by SiteLayout, and stays mounted across
 * navigation. Each page used to render its own, so every click on the top nav
 * unmounted one header and mounted another — the avatar visibly reloaded.
 *
 * Two kinds of check. The source ones (in the style of mode-controls.test.ts)
 * catch the regression that is easiest to make: a page importing SiteHeader
 * again, or a new page added outside the layout. The rendered one proves the
 * layout itself keeps a single header through navigation.
 */

const header = vi.hoisted(() => ({ mounts: 0, classNames: [] as Array<string | undefined> }));

vi.mock('@/components/SiteHeader', () => ({
  SiteHeader: ({ className }: { className?: string }) => {
    header.classNames.push(className);
    useEffect(() => {
      header.mounts += 1;
    }, []);
    return createElement('header', { className }, 'header');
  },
}));

const { SiteLayout } = await import('./SiteLayout');

const pageSource = import.meta.glob('../pages/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const appSource = (
  import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)['../App.tsx']!;

describe('the site header is rendered once, by SiteLayout', () => {
  it('no page renders its own header, except the landing page and its navy bar', () => {
    const offenders = Object.entries(pageSource)
      .filter(([, source]) => source.includes('<SiteHeader'))
      .map(([path]) => path);
    expect(offenders).toEqual(['../pages/HomePage.tsx']);
  });

  it('every page that had a header is routed inside the layout', () => {
    const start = appSource.indexOf('<Route element={<SiteLayout />}>');
    expect(start).toBeGreaterThan(-1);
    const inside = appSource.slice(start, appSource.indexOf('\n              </Route>', start));
    for (const path of ['/directory', '/messages/:id', '/account/security', '/notifications', '/privacy', '/terms']) {
      expect(inside, path).toContain(`path="${path}"`);
    }
  });
});

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  header.mounts = 0;
  header.classNames.length = 0;
});

/** A page that exposes navigation to the test, the way a nav link would. */
let go: (to: string) => void = () => {};
function Page({ name }: { name: string }) {
  const navigate = useNavigate();
  go = (to) => void navigate(to);
  return createElement('main', null, name);
}

function mountAt(path: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(SiteLayout) },
            createElement(Route, { path: '/directory', element: createElement(Page, { name: 'directory' }) }),
            createElement(Route, { path: '/messages', element: createElement(Page, { name: 'messages' }) }),
            createElement(Route, { path: '/messages/:id', element: createElement(Page, { name: 'thread' }) }),
          ),
        ),
      ),
    );
  });
  return container;
}

describe('SiteLayout', () => {
  it('keeps one header mounted while the page below it changes', () => {
    const container = mountAt('/directory');
    expect(container.textContent).toContain('directory');

    act(() => go('/messages'));
    expect(container.textContent).toContain('messages');
    act(() => go('/directory'));
    expect(container.textContent).toContain('directory');

    expect(header.mounts).toBe(1);
  });

  it('hides the header on phones inside a conversation, and only there', () => {
    mountAt('/messages');
    expect(header.classNames.at(-1)).toBeUndefined();

    act(() => go('/messages/abc'));
    expect(header.classNames.at(-1)).toBe('hidden sm:block');
    expect(header.mounts).toBe(1);
  });
});
