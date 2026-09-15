import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Match the radius of whatever the skeleton stands in for. */
  radius?: 'xs' | 'sm' | 'md' | 'full';
}

const RADII = {
  xs: 'rounded-xs',
  sm: 'rounded-sm',
  md: 'rounded-md',
  full: 'rounded-full',
} as const;

/**
 * Placeholders should approximate the shape of the real content. A skeleton
 * that does not match what replaces it produces a visible jolt on load, which
 * is worse than showing nothing.
 */
export function Skeleton({ radius = 'sm', className, ...props }: SkeletonProps) {
  return <div className={cn('skeleton', RADII[radius], className)} aria-hidden="true" {...props} />;
}
