// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProgressiveImage } from './ProgressiveImage';
import {
  forgetLoadedImages,
  progressiveImageReducer,
  progressiveImageStatus,
} from './progressive-image-state';

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.replaceChildren();
  forgetLoadedImages();
});

function mountImage(callbacks: { onLoad?: () => void; onError?: () => void } = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  const render = (src: string) => {
    act(() => {
      root.render(
        createElement(ProgressiveImage, {
          src,
          alt: '',
          width: 120,
          height: 120,
          fallback: createElement('span', null, 'BK'),
          ...callbacks,
        }),
      );
    });
  };

  render('/offer.webp');
  return { container, render };
}

describe('progressive image loading', () => {
  it('renders a dimensioned, busy media frame before the image is ready', () => {
    const html = renderToStaticMarkup(
      createElement(ProgressiveImage, {
        src: '/offer.webp',
        alt: '',
        width: 120,
        height: 120,
        fallback: createElement('span', null, 'BK'),
      }),
    );

    expect(html).toContain('data-media-state="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('width="120"');
    expect(html).toContain('height="120"');
    expect(html).toContain('--progressive-media-width:120px');
    expect(html).toContain('--progressive-media-height:120px');
    expect(html).toContain('class="progressive-media__image');
  });

  it('marks only the source that finished loading as ready', () => {
    const state = progressiveImageReducer(
      { loadedSrc: null, failedSrc: null },
      { type: 'loaded', src: '/first.webp' },
    );

    expect(state).toEqual({ loadedSrc: '/first.webp', failedSrc: null });
    expect(progressiveImageStatus(state, '/first.webp')).toBe('loaded');
    expect(progressiveImageStatus(state, '/second.webp')).toBe('loading');
  });

  it('stops loading and exposes the fallback when the current source fails', () => {
    const state = progressiveImageReducer(
      { loadedSrc: null, failedSrc: null },
      { type: 'failed', src: '/broken.webp' },
    );

    expect(state).toEqual({ loadedSrc: null, failedSrc: '/broken.webp' });
    expect(progressiveImageStatus(state, '/broken.webp')).toBe('failed');
  });

  it('removes the busy skeleton after load and forwards the image event', () => {
    const onLoad = vi.fn();
    const { container } = mountImage({ onLoad });
    const frame = container.querySelector<HTMLElement>('[data-media-state]')!;
    const image = container.querySelector('img')!;

    expect(frame.dataset.mediaState).toBe('loading');
    expect(frame.classList.contains('skeleton')).toBe(true);

    act(() => image.dispatchEvent(new Event('load')));

    expect(frame.dataset.mediaState).toBe('loaded');
    expect(frame.getAttribute('aria-busy')).toBeNull();
    expect(frame.classList.contains('skeleton')).toBe(false);
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('returns to loading for a new source and reveals fallback on error', () => {
    const onError = vi.fn();
    const { container, render } = mountImage({ onError });
    const image = container.querySelector('img')!;

    act(() => image.dispatchEvent(new Event('load')));
    render('/replacement.webp');

    const frame = container.querySelector<HTMLElement>('[data-media-state]')!;
    expect(frame.dataset.mediaState).toBe('loading');
    expect(frame.getAttribute('aria-busy')).toBe('true');

    act(() => image.dispatchEvent(new Event('error')));

    expect(frame.dataset.mediaState).toBe('failed');
    expect(frame.textContent).toContain('BK');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('shows a source loaded earlier in this tab at once, without the fade', () => {
    const first = mountImage();
    act(() => first.container.querySelector('img')!.dispatchEvent(new Event('load')));

    // The header remounting on navigation: a fresh component, same source.
    const again = mountImage();
    const frame = again.container.querySelector<HTMLElement>('[data-media-state]')!;

    expect(frame.dataset.mediaState).toBe('loaded');
    expect(frame.hasAttribute('data-media-instant')).toBe(true);
    expect(frame.classList.contains('skeleton')).toBe(false);
    expect(frame.getAttribute('aria-busy')).toBeNull();
  });

  it('keeps the fade for a first load, and does not cut it short on load', () => {
    const { container } = mountImage();
    const frame = container.querySelector<HTMLElement>('[data-media-state]')!;

    expect(frame.dataset.mediaState).toBe('loading');
    expect(frame.hasAttribute('data-media-instant')).toBe(false);

    act(() => container.querySelector('img')!.dispatchEvent(new Event('load')));

    expect(frame.dataset.mediaState).toBe('loaded');
    expect(frame.hasAttribute('data-media-instant')).toBe(false);
  });

  it('still reveals the fallback when a remembered source fails', () => {
    const first = mountImage();
    act(() => first.container.querySelector('img')!.dispatchEvent(new Event('load')));

    const again = mountImage();
    act(() => again.container.querySelector('img')!.dispatchEvent(new Event('error')));

    const frame = again.container.querySelector<HTMLElement>('[data-media-state]')!;
    expect(frame.dataset.mediaState).toBe('failed');
    expect(frame.hasAttribute('data-media-instant')).toBe(false);
    expect(frame.textContent).toContain('BK');
  });
});
