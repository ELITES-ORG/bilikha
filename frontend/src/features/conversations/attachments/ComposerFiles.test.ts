// @vitest-environment happy-dom

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { KindLimitView, MediaKind } from '@contracts/media';
import { AttachTray } from './ComposerFiles';
import type { MessageFileLimits } from './message-files';
import type { MessageUploads, PendingFile } from './use-message-uploads';

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
  return { container, rerender: (next: ReactNode) => act(() => root.render(next)) };
}

const kind = (overrides: Partial<KindLimitView>): KindLimitView => ({
  enabled: true,
  maxBytes: 10_000_000,
  maxPickedBytes: null,
  maxDurationSeconds: null,
  mimeTypes: [],
  perTarget: 5,
  transport: 'tus',
  ...overrides,
});

const limits: MessageFileLimits = {
  kinds: {
    image: kind({}),
    audio: kind({}),
    video: kind({}),
    document: kind({}),
  } as Record<MediaKind, KindLimitView>,
  filesPerMessage: 5,
  accept: 'application/pdf,.pdf',
};

const pending = (state: PendingFile['state']): PendingFile => ({
  key: 1,
  name: 'report.pdf',
  kind: 'document',
  state,
  reservationId: null,
});

const uploadsWith = (files: PendingFile[]) =>
  ({
    files,
    notice: null,
    busy: false,
    readyIds: [],
    add: async () => {},
    remove: () => {},
    sent: () => {},
    refused: () => {},
    blockingReason: () => null,
  }) as unknown as MessageUploads;

describe('the composer tray', () => {
  it('announces a finished file in a status line, and never the progress list', () => {
    const { container, rerender } = mount(
      createElement(AttachTray, {
        limits,
        uploads: uploadsWith([pending({ status: 'uploading', sent: 1_000, total: 4_000 })]),
        onClose: () => {},
      }),
    );

    // Progress changes many times a second: the list itself must not be a live region.
    expect(container.querySelector('ul')?.hasAttribute('aria-live')).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('');

    rerender(
      createElement(AttachTray, {
        limits,
        uploads: uploadsWith([pending({ status: 'confirming' })]),
        onClose: () => {},
      }),
    );

    expect(container.querySelector('[role="status"]')?.textContent).toBe('report.pdf · ready to send');
  });
});
