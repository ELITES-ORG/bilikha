import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, { box: string; text: string; px: number }> = {
  sm: { box: 'size-8', text: 'text-xs', px: 32 },
  md: { box: 'size-12', text: 'text-sm', px: 48 },
  lg: { box: 'size-20', text: 'text-xl', px: 80 },
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Undefined as well as null: an older API payload may omit the field. */
  src: string | null | undefined;
  name: string;
  size?: AvatarSize;
}

export function Avatar({ src, name, size = 'md', className, ...props }: AvatarProps) {
  const dims = SIZES[size];
  const initials = initialsFromName(name);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-lawa-100 text-lawa-800 ring-1 ring-inset ring-lawa-200',
        dims.box,
        className,
      )}
      aria-hidden={src ? undefined : true}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={dims.px}
          height={dims.px}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className={cn('font-medium tabular-nums', dims.text)}>{initials}</span>
      )}
    </span>
  );
}
