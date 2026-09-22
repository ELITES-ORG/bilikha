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

export function progressiveImageStatus(
  state: ProgressiveImageState,
  src: string,
): 'loading' | 'loaded' | 'failed' {
  if (state.loadedSrc === src) return 'loaded';
  if (state.failedSrc === src) return 'failed';
  return 'loading';
}
