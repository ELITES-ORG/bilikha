export type ProgressiveImageState = {
  loadedSrc: string | null;
  failedSrc: string | null;
};

export type ProgressiveImageAction = {
  type: 'loaded' | 'failed';
  src: string;
};

export const INITIAL_PROGRESSIVE_IMAGE_STATE: ProgressiveImageState = {
  loadedSrc: null,
  failedSrc: null,
};

export function progressiveImageReducer(
  state: ProgressiveImageState,
  action: ProgressiveImageAction,
): ProgressiveImageState {
  if (action.type === 'loaded') {
    if (state.loadedSrc === action.src && state.failedSrc === null) return state;
    return { loadedSrc: action.src, failedSrc: null };
  }

  if (state.failedSrc === action.src && state.loadedSrc === null) return state;
  return { loadedSrc: null, failedSrc: action.src };
}

/**
 * Sources this tab has already finished loading.
 *
 * A component that mounts again — the header on every navigation, a thumbnail
 * when you go back — starts from "loading" and fades the image in, though the
 * browser already holds it. Showing a remembered source at once removes that
 * flash; the fade stays for images actually arriving over the network.
 *
 * Bounded so a long session over many listings cannot grow it without limit;
 * forgetting only costs one extra fade.
 */
const loadedThisSession = new Set<string>();
const REMEMBER_AT_MOST = 500;

export function rememberLoaded(src: string): void {
  if (loadedThisSession.size >= REMEMBER_AT_MOST) loadedThisSession.clear();
  loadedThisSession.add(src);
}

export function wasLoadedBefore(src: string): boolean {
  return loadedThisSession.has(src);
}

/** For tests, which share this module across cases. */
export function forgetLoadedImages(): void {
  loadedThisSession.clear();
}

export function progressiveImageStatus(
  state: ProgressiveImageState,
  src: string,
): 'loading' | 'loaded' | 'failed' {
  if (state.loadedSrc === src) return 'loaded';
  if (state.failedSrc === src) return 'failed';
  return 'loading';
}
