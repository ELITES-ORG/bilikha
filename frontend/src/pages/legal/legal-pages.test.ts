// @vitest-environment happy-dom

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { en } from '@/i18n/catalogs/en';
import { enLegal } from '@/i18n/catalogs/legal/en';
import { I18nProvider } from '@/i18n/I18nProvider';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';

/**
 * The real pages, rendered whole: no key may reach the screen as itself.
 *
 * The legal strings are a catalogue section that `LegalLayout` registers when
 * the pages' chunk loads (ADR 0055). If that registration is lost, every
 * string renders as its key — "privacy.title" — and this is what notices.
 */
const Provider = I18nProvider as ComponentType<{ children?: ReactNode }>;
const KEYS = new Set<string>([...Object.keys(en), ...Object.keys(enLegal)]);
const roots: Array<ReturnType<typeof createRoot>> = [];

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

async function render(page: ComponentType) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(Provider, null, createElement(page))));
  });
  return host;
}

function textNodes(host: HTMLElement): string[] {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode.textContent!.trim());
  return texts.filter(Boolean);
}

describe.each([
  ['privacy notice', PrivacyPage, enLegal['privacy.title']],
  ['terms of use', TermsPage, enLegal['terms.title']],
] as const)('the %s', (_name, page, title) => {
  it('renders its English, and no key as itself', async () => {
    const host = await render(page);

    expect(host.querySelector('h1')!.textContent).toBe(title);
    expect(textNodes(host).filter((text) => KEYS.has(text))).toEqual([]);
    expect(textNodes(host).filter((text) => /^(privacy|terms|legal)\.\w/.test(text))).toEqual([]);
  });
});
