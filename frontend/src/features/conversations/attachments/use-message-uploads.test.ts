// @vitest-environment happy-dom

import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KindLimitView, MediaKind } from '@contracts/media';
import { abandonUploadTicket } from '@/features/media/limits-api';
import { transferFile } from '@/features/media/transfer';
import type { MessageFileLimits } from './message-files';
import { useMessageUploads, type MessageUploads } from './use-message-uploads';

vi.mock('@/features/media/limits-api', () => ({
  requestUploadTicket: vi.fn(),
  abandonUploadTicket: vi.fn(async () => {}),
}));

vi.mock('@/features/media/probe', () => ({
  readDuration: async () => 5,
  videoCodec: async () => null,
}));

vi.mock('@/features/media/transfer', () => ({
  isAbort: (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  transferFile: vi.fn(),
}));

const mountedRoots: Root[] = [];
const hooks = {} as { current: MessageUploads };

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

beforeEach(() => {
  vi.mocked(abandonUploadTicket).mockClear();
  vi.mocked(transferFile).mockReset();
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
});

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

/** A PDF limit of four bytes, so a small test file passes and a larger one is refused. */
const limits: MessageFileLimits = {
  kinds: {
    image: kind({}),
    audio: kind({}),
    video: kind({}),
    document: kind({ maxBytes: 4, mimeTypes: ['application/pdf'] }),
  } as Record<MediaKind, KindLimitView>,
  filesPerMessage: 5,
  accept: 'application/pdf,.pdf',
};

function Harness({ conversationId, limits }: { conversationId: string; limits: MessageFileLimits }) {
  const uploads = useMessageUploads(conversationId, limits);
  useEffect(() => {
    hooks.current = uploads;
  });
  return null;
}

function harness() {
  return createElement(Harness, { conversationId: 'c1', limits });
}

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(element));
  return { root };
}

const pdf = (size: number) => new File([new Uint8Array(size)], 'a.pdf', { type: 'application/pdf' });

/** Waits for the upload started by `add` to reach the point the mock leaves it at. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe("a message's files while it is written", () => {
  it('refuses a file over its limit before any byte is sent', async () => {
    mount(harness());

    await act(async () => {
      await hooks.current.add([pdf(9)]);
    });

    expect(transferFile).not.toHaveBeenCalled();
    expect(hooks.current.files).toEqual([]);
    expect(hooks.current.notice).toContain('This file is');
  });

  it('gives back a reservation when its upload is removed before the message is sent', async () => {
    vi.mocked(transferFile).mockImplementation(async (_file, _kind, _duration, { onEvent, signal }) => {
      onEvent({ type: 'ticket', reservationId: 'r1' });
      onEvent({ type: 'checked', total: 2 });
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      });
      return 'r1';
    });
    mount(harness());

    await act(async () => {
      await hooks.current.add([pdf(2)]);
    });
    act(() => hooks.current.remove(hooks.current.files[0]!.key));

    expect(abandonUploadTicket).toHaveBeenCalledWith('r1');
    expect(hooks.current.files).toEqual([]);
  });

  it('gives back what was not sent when the thread is left', async () => {
    vi.mocked(transferFile).mockImplementation(async (_file, _kind, _duration, { onEvent, signal }) => {
      onEvent({ type: 'ticket', reservationId: 'r2' });
      onEvent({ type: 'checked', total: 2 });
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      });
      return 'r2';
    });
    const { root } = mount(harness());

    await act(async () => {
      await hooks.current.add([pdf(2)]);
    });
    act(() => root.unmount());
    mountedRoots.splice(mountedRoots.indexOf(root), 1);

    expect(abandonUploadTicket).toHaveBeenCalledWith('r2');
  });

  it('keeps a finished file for the message: sending it gives nothing back', async () => {
    vi.mocked(transferFile).mockImplementation(async (_file, _kind, _duration, { onEvent }) => {
      onEvent({ type: 'ticket', reservationId: 'r3' });
      onEvent({ type: 'checked', total: 2 });
      return 'r3';
    });
    mount(harness());

    await act(async () => {
      await hooks.current.add([pdf(2)]);
    });
    await settle();

    expect(hooks.current.readyIds).toEqual(['r3']);
    act(() => hooks.current.sent());

    expect(abandonUploadTicket).not.toHaveBeenCalled();
    expect(hooks.current.files).toEqual([]);
  });
});
