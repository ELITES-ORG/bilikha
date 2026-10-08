// @vitest-environment happy-dom

import { act, createElement, Fragment, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TabPanels, Tabs } from './Tabs';

const mountedRoots: Root[] = [];

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(element));
  return container;
}

describe('tabs and their panels', () => {
  it('keeps every controlled panel in the document and hides the inactive ones', () => {
    const values = ['pending', 'published'] as const;
    const container = mount(
      createElement(
        Fragment,
        null,
        createElement(Tabs, {
          label: 'Queue',
          idPrefix: 'queue',
          value: 'pending',
          onChange: () => undefined,
          items: values.map((value) => ({ value, label: value })),
        }),
        createElement(
          TabPanels,
          { idPrefix: 'queue', values, value: 'pending' },
          createElement('p', null, 'Pending registrations'),
        ),
      ),
    );

    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs).toHaveLength(2);

    for (const tab of tabs) {
      const panelId = tab.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      const panel = container.querySelector<HTMLElement>(`#${panelId}`);
      expect(panel, `${panelId} exists`).not.toBeNull();
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    }

    expect(container.querySelector('#queue-panel-pending')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('#queue-panel-pending')?.textContent).toBe(
      'Pending registrations',
    );
    expect(container.querySelector('#queue-panel-published')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('#queue-panel-published')?.textContent).toBe('');
  });

  it('selects and focuses with arrows, Home and End while keeping one tab in the Tab order', () => {
    const values = ['pending', 'edited', 'published'] as const;

    function Harness() {
      const [value, setValue] = useState<(typeof values)[number]>('pending');
      return createElement(Tabs, {
        label: 'Queue',
        value,
        onChange: (next) => setValue(next as (typeof values)[number]),
        items: values.map((item) => ({ value: item, label: item })),
      });
    }

    const container = mount(createElement(Harness));
    const tablist = container.querySelector<HTMLElement>('[role="tablist"]')!;
    const selected = () => container.querySelector<HTMLElement>('[aria-selected="true"]')!;
    const inTabOrder = () => [...container.querySelectorAll('[role="tab"]')].filter(
      (tab) => tab.getAttribute('tabindex') === '0',
    );

    act(() => tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(selected().textContent).toBe('edited');
    expect(document.activeElement).toBe(selected());
    expect(inTabOrder()).toEqual([selected()]);

    act(() => tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(selected().textContent).toBe('published');

    act(() => tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(selected().textContent).toBe('pending');

    act(() => tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(selected().textContent).toBe('published');
  });
});
