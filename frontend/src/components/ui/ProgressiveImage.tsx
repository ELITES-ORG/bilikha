import { useReducer, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  INITIAL_PROGRESSIVE_IMAGE_STATE,
  progressiveImageReducer,
  progressiveImageStatus,
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
  const status = progressiveImageStatus(state, src);
  const frameStyle = {
    '--progressive-media-width': `${width}px`,
    '--progressive-media-height': `${height}px`,
  } as CSSProperties;

  return (
    <span
      className={cn('progressive-media', status === 'loading' && 'skeleton', className)}
      style={frameStyle}
      data-media-state={status}
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
