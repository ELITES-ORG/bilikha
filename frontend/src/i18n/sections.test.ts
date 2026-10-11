// @vitest-environment happy-dom

import {
  act,
  createElement,
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY } from '@/lib/locale';
import type { Catalog, MessageKey } from './catalogs/en';
import { useI18n } from './i18n-context';
import { I18nProvider } from './I18nProvider';
import { loadSection, registerSection, withSection } from './sections';

/**
 * A lazy route held by `withSection` (ADR 0055): a reader who chose Waray sees
 * the page once, in Waray — never a first render in English that then changes
 * language under them.
 *
 * Each test registers its own fixture section under its own key, because
 * registration lasts for the whole file and the provider loads every section.
 * Fixtures reuse real keys so they type-check; the values are fake markers,
 * never plausible Waray (ADR 0055 §4).
 */
const Provider = I18nProvider as ComponentType<{ children?: ReactNode }>;
const roots: Array<ReturnType<typeof createRoot>> = [];
const ENGLISH = 'fixture English title';
const WARAY = 'war-test-fixture-title';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  document.documentElement.lang = 'en';
  localStorage.clear();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** A fixture section whose Waray arrives when the test says so. */
function fixtureSection(name: string, key: MessageKey) {
  const waray = deferred<Catalog>();
  let fetches = 0;
  registerSection({
    name,
    en: { [key]: ENGLISH },
    loaders: {
      fil: async () => ({}),
      war: () => {
        fetches += 1;
        return waray.promise;
      },
    },
  });
  return { waray, fetches: () => fetches };
}

/** A lazy page that records every title it ever renders. */
function lazyPage(name: string, key: MessageKey, waitMs?: number) {
  const seen: Array<{ text: string; lang: string }> = [];
  function Page() {
    const { message } = useI18n();
    const title = message(key);
    seen.push(title);
    return createElement('h1', { lang: title.lang }, title.text);
  }
  const Lazy = lazy(() =>
    Promise.resolve({ default: Page }).then(withSection(name, waitMs)),
  );
  return { Lazy, seen };
}

async function mount(page: ComponentType) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        Provider,
        null,
        createElement(Suspense, { fallback: createElement('p', null, 'loading') }, createElement(page)),
      ),
    );
  });
  return host;
}

const settle = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

describe('withSection', () => {
  it('holds the page until the chosen language arrives, then renders it once, in that language', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'war');
    const section = fixtureSection('held', 'privacy.title');
    const { Lazy, seen } = lazyPage('held', 'privacy.title');

    const host = await mount(Lazy);
    expect(host.textContent).toBe('loading');

    await act(async () => section.waray.resolve({ 'privacy.title': WARAY }));
    await settle();

    expect(host.querySelector('h1')!.textContent).toBe(WARAY);
    expect(host.querySelector('h1')!.lang).toBe('war');
    expect(seen.map((title) => title.text)).not.toContain(ENGLISH);
    // The provider and the route asked for the same file; it was fetched once.
    expect(section.fetches()).toBe(1);
  });

  it('renders English after the wait if the translation is slow, and swaps when it arrives', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'war');
    const section = fixtureSection('slow', 'privacy.summary');
    const { Lazy } = lazyPage('slow', 'privacy.summary', 20);

    const host = await mount(Lazy);
    await settle(40);

    expect(host.querySelector('h1')!.textContent).toBe(ENGLISH);
    expect(host.querySelector('h1')!.lang).toBe('en');

    await act(async () => section.waray.resolve({ 'privacy.summary': WARAY }));
    await settle();
    expect(host.querySelector('h1')!.textContent).toBe(WARAY);
  });

  it('renders English straight away if the translation fails', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'war');
    const section = fixtureSection('failing', 'terms.title');
    const { Lazy } = lazyPage('failing', 'terms.title');

    const host = await mount(Lazy);
    await act(async () => section.waray.reject(new Error('offline')));
    await settle();

    expect(host.querySelector('h1')!.textContent).toBe(ENGLISH);
    expect(host.querySelector('h1')!.lang).toBe('en');
  });

  it('does not wait, or fetch anything, for an English reader', async () => {
    const section = fixtureSection('english', 'terms.summary');
    const { Lazy } = lazyPage('english', 'terms.summary');

    const host = await mount(Lazy);
    await settle();

    expect(host.querySelector('h1')!.textContent).toBe(ENGLISH);
    expect(section.fetches()).toBe(0);
  });
});

describe('loadSection', () => {
  it('fetches again after a failure instead of replaying it', async () => {
    let attempts = 0;
    registerSection({
      name: 'retry',
      en: {},
      loaders: {
        fil: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('offline');
          return { 'privacy.title': 'fil-test-title' };
        },
        war: async () => ({}),
      },
    });

    await expect(loadSection('retry', 'fil')).rejects.toThrow('offline');
    await expect(loadSection('retry', 'fil')).resolves.toEqual({ 'privacy.title': 'fil-test-title' });
    expect(attempts).toBe(2);
  });
});
