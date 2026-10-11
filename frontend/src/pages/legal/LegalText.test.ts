// @vitest-environment happy-dom

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from '@/i18n/catalogs/en';
import { en } from '@/i18n/catalogs/en';
import { I18nProvider } from '@/i18n/I18nProvider';
import { LOCALE_STORAGE_KEY } from '@/lib/locale';
import { LegalSection, LegalText } from './LegalLayout';

/**
 * Fixture "translations" are deliberately fake markers like `[war] …`, never
 * plausible Filipino or Waray: ADR 0055 forbids generated text in those
 * languages, and a convincing fixture is one copy-paste from a catalogue.
 *
 * Plan 0050 phase 6. The privacy notice and terms are rendered through
 * `LegalText`, so this is what decides two things a reader of a consent
 * document depends on: that an untranslated string still shows the English, and
 * that whatever is shown is marked with the language it is actually written
 * in — a screen reader picks its voice from that.
 */

type Loader = (locale: 'fil' | 'war') => Promise<Catalog>;
const Provider = I18nProvider as ComponentType<{ children?: ReactNode; catalogLoader?: Loader }>;
const roots: Array<ReturnType<typeof createRoot>> = [];

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

async function render(tree: ReactNode, loader: Loader = async () => ({})) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(Provider, { catalogLoader: loader }, tree));
  });
  // Let a chosen catalogue's promise settle and re-render.
  await act(async () => {});
  return host;
}

describe('LegalText', () => {
  it('shows the English, marked as English, by default', async () => {
    const host = await render(createElement(LegalText, { k: 'privacy.title' }));
    const span = host.querySelector('span')!;

    expect(span.textContent).toBe(en['privacy.title']);
    expect(span.lang).toBe('en');
  });

  it('falls back to English — and says so — when Waray has no translation yet', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'war');
    const host = await render(createElement(LegalText, { k: 'privacy.title' }), async () => ({}));
    const span = host.querySelector('span')!;

    expect(span.textContent).toBe(en['privacy.title']);
    // English text under a Waray document language must still be marked
    // English, or a screen reader reads English words in a Waray voice.
    expect(span.lang).toBe('en');
    expect(document.documentElement.lang).toBe('war');
  });

  it('shows a written translation, marked with its own language', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'war');
    const host = await render(createElement(LegalText, { k: 'privacy.title' }), async () => ({
      'privacy.title': '[war] privacy title',
    }));
    const span = host.querySelector('span')!;

    expect(span.textContent).toBe('[war] privacy title');
    expect(span.lang).toBe('war');
  });

  it('keeps a leading space in a continuation key, so a bold lead-in still reads as one sentence', async () => {
    const host = await render(createElement(LegalText, { k: 'privacy.collect.nameRest' }));

    expect(host.querySelector('span')!.textContent).toBe(en['privacy.collect.nameRest']);
    expect(en['privacy.collect.nameRest'].startsWith(' ')).toBe(true);
  });
});

describe('LegalSection', () => {
  it('marks its heading with the language it is written in', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fil');
    const host = await render(
      createElement(LegalSection, { titleKey: 'terms.law.heading' }),
      async () => ({ 'terms.law.heading': '[fil] governing law heading' }),
    );
    const heading = host.querySelector('h2')!;

    expect(heading.textContent).toBe('[fil] governing law heading');
    expect(heading.lang).toBe('fil');
  });
});
