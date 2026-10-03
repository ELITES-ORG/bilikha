import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger';
type Variant = 'soft' | 'solid';

/**
 * Low-chroma fills with a matching hairline. A tinted border stops pale chips
 * from dissolving into the page the way flat pastel fills do.
 */
const SOFT: Record<Tone, string> = {
  neutral: 'bg-clay-100 text-clay-700 ring-clay-200',
  brand: 'bg-lawa-50 text-lawa-800 ring-lawa-200',
  accent: 'bg-palayok-50 text-palayok-800 ring-palayok-200',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
};

/**
 * Solid fills: red for counts and SALE-style flags, navy for NEW and info.
 * Tones without a solid fill of their own fall back to soft — status colours
 * stay quiet so they never compete with the accent.
 */
const SOLID: Record<Tone, string> = {
  ...SOFT,
  brand: 'bg-primary text-on-primary ring-transparent',
  accent: 'bg-accent-solid text-on-primary ring-transparent',
  danger: 'bg-danger-solid text-on-primary ring-transparent',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** `solid` for counts (unread, active filters) and flags; `soft` for labels. */
  variant?: Variant;
  /**
   * Status badges must carry an icon as well as a colour — colour alone fails
   * for the ~5% of male users with a colour vision deficiency.
   */
  icon?: ReactNode;
}

export function Badge({
  tone = 'neutral',
  variant = 'soft',
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
        'text-xs font-semibold ring-1 ring-inset',
        (variant === 'solid' ? SOLID : SOFT)[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
