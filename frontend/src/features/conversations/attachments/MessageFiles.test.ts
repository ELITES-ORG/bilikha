// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MessageFiles } from './MessageFiles';

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

describe("a message's files in the thread", () => {
  it('shows nothing, and does not fail, when the API sends no file list', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    // An API from before files in messages sends no `attachments` at all.
    const element = createElement(MessageFiles, { conversationId: 'c1', fromSelf: false });

    expect(() =>
      act(() => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, element))),
    ).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});
