// @vitest-environment happy-dom

import {
  act,
  createElement,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Locale } from '@/lib/locale';
import type { Catalog, MessageKey } from './catalogs/en';
import { I18nProvider } from './I18nProvider';
import { useI18n, type I18nApi, type ResolvedMessage } from './i18n-context';

type CatalogLocale = Exclude<Locale, 'en'>;
type CatalogLoader = (locale: CatalogLocale) => Promise<Catalog>;

interface TestableProviderProps {
  children?: ReactNode;
  catalogLoader?: CatalogLoader;
}

const TestableProvider = I18nProvider as ComponentType<TestableProviderProps>;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) act(() => root.unmount());
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

function Probe() {
  const api = useI18n() as I18nApi & {
    message?: (key: MessageKey) => ResolvedMessage;
  };
  const resolved = api.message?.('signIn.heading');

  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', onClick: () => api.choose('fil') }, 'fil'),
    createElement('button', { type: 'button', onClick: () => api.choose('war') }, 'war'),
    createElement(
      'output',
      { 'data-message-language': resolved?.lang ?? 'missing' },
      resolved?.text ?? api.t('signIn.heading'),
    ),
  );
}

function mountProvider(catalogLoader: CatalogLoader) {
  const container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(
      createElement(TestableProvider, { catalogLoader }, createElement(Probe)),
    );
  });

  return {
    container,
    choose(locale: CatalogLocale) {
      const button = [...container.querySelectorAll('button')].find(
        (candidate) => candidate.textContent === locale,
      )!;
      act(() => button.click());
    },
    output() {
      return container.querySelector('output')!;
    },
  };
}

describe('I18nProvider', () => {
  it('marks untranslated fallback copy as English under the chosen document language', async () => {
    localStorage.setItem('bilikha-locale', 'war');
    const view = mountProvider(async () => ({}));

    await act(async () => Promise.resolve());

    expect(document.documentElement.lang).toBe('war');
    expect(view.container.lang).toBe('en');
    expect(view.output().textContent).toBe('Sign in');
    expect(view.output().dataset.messageLanguage).toBe('en');
  });

  it('marks real catalogue copy as the selected language', async () => {
    const view = mountProvider(async () => ({ 'signIn.heading': 'war-test-heading' }));

    view.choose('war');
    await act(async () => Promise.resolve());

    expect(view.output().textContent).toBe('war-test-heading');
    expect(view.output().dataset.messageLanguage).toBe('war');
  });

  it('ignores a slower catalogue after the reader chooses another language', async () => {
    const fil = deferred<Catalog>();
    const war = deferred<Catalog>();
    const view = mountProvider((locale) => (locale === 'fil' ? fil.promise : war.promise));

    view.choose('fil');
    view.choose('war');
    await act(async () => war.resolve({ 'signIn.heading': 'war-test-heading' }));
    expect(view.output().textContent).toBe('war-test-heading');

    await act(async () => fil.resolve({ 'signIn.heading': 'fil-test-heading' }));
    expect(view.output().textContent).toBe('war-test-heading');
    expect(view.output().dataset.messageLanguage).toBe('war');
  });

  it('uses English instead of a stale catalogue when the next load fails', async () => {
    const fil = deferred<Catalog>();
    const war = deferred<Catalog>();
    const view = mountProvider((locale) => (locale === 'fil' ? fil.promise : war.promise));

    view.choose('fil');
    await act(async () => fil.resolve({ 'signIn.heading': 'fil-test-heading' }));
    expect(view.output().textContent).toBe('fil-test-heading');

    view.choose('war');
    await act(async () => war.reject(new Error('offline')));

    expect(view.output().textContent).toBe('Sign in');
    expect(view.output().dataset.messageLanguage).toBe('en');
  });
});
