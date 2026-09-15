import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Width = 'prose' | 'narrow' | 'default' | 'wide';

/**
 * Horizontal padding comes from the shared --gutter token rather than per-page
 * breakpoint classes, so every screen indents identically and a change to page
 * margins is made once.
 */
const WIDTHS: Record<Width, string> = {
  prose: 'max-w-(--container-prose)',
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
};

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: Width;
}

export function Container({ width = 'default', className, ...props }: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-(--gutter)', WIDTHS[width], className)}
      {...props}
    />
  );
}
