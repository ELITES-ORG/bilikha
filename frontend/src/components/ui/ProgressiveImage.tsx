import { useReducer, useState, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  INITIAL_PROGRESSIVE_IMAGE_STATE,
  progressiveImageReducer,
  progressiveImageStatus,
  rememberLoaded,
  wasLoadedBefore,
} from './progressive-image-state';

export interface ProgressiveImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'className' | 'height' | 'src' | 'width'> {
  src: string;
  width: number;
  height: number;
  /** Sizes and positions the stable frame that owns the skeleton. */
  className?: string;
  /** Styles the image inside the frame, most often its object fit. */
  imageClassName?: string;
  /** Revealed if the image cannot load. */
  fallback?: ReactNode;
}

export function ProgressiveImage({
  src,
  width,
  height,
  className,
  imageClassName,
  fallback,
  onLoad,
  onError,
  loading = 'lazy',
  decoding = 'async',
  ...imageProps
}: ProgressiveImageProps) {
  const [state, dispatch] = useReducer(progressiveImageReducer, INITIAL_PROGRESSIVE_IMAGE_STATE);
  // Decided once per source when it first renders here, so a fade that starts
  // on this mount is not cut short when its own onLoad remembers the source.
  const [seen, setSeen] = useState(() => ({ src, before: wasLoadedBefore(src) }));
  if (seen.src !== src) setSeen({ src, before: wasLoadedBefore(src) });
  const instant = seen.src === src && seen.before && state.failedSrc !== src;
  const status = instant ? 'loaded' : progressiveImageStatus(state, src);
  const frameStyle = {
    '--progressive-media-width': `${width}px`,
    '--progressive-media-height': `${height}px`,
  } as CSSProperties;

  return (
    <span
      className={cn('progressive-media', status === 'loading' && 'skeleton', className)}
      style={frameStyle}
      data-media-state={status}
      data-media-instant={instant ? '' : undefined}
      aria-busy={status === 'loading' ? true : undefined}
    >
      {fallback && (
        <span className="progressive-media__fallback" aria-hidden="true">
          {fallback}
        </span>
      )}
      <img
        {...imageProps}
        src={src}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        className={cn('progressive-media__image', imageClassName)}
        onLoad={(event) => {
          rememberLoaded(src);
          dispatch({ type: 'loaded', src });
          onLoad?.(event);
        }}
        onError={(event) => {
          dispatch({ type: 'failed', src });
          onError?.(event);
        }}
      />
    </span>
  );
}
