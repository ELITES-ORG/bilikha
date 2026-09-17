import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Variants are separated by *role*, not decoration. Exactly one primary action
 * should be visible in any view; everything else steps down to secondary or
 * ghost. Radius stays small — buttons are not cards.
 *
 * Solid fills use --color-primary* / accent-solid / danger-solid so the numbered
 * ramps can invert under prefers-color-scheme without breaking hover darkening.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-primary text-on-primary shadow-xs',
    'hover:bg-primary-hover hover:shadow-sm',
    'active:bg-primary-active',
    'disabled:bg-clay-300 disabled:text-clay-500 disabled:shadow-none',
  ),
  secondary: cn(
    'bg-surface text-ink border border-hairline-strong shadow-xs',
    'hover:bg-clay-50 hover:border-clay-400',
    'active:bg-clay-100',
    'disabled:bg-clay-100 disabled:text-clay-400 disabled:border-hairline disabled:shadow-none',
  ),
  ghost: cn(
    'text-ink-muted',
    'hover:bg-clay-100 hover:text-ink',
    'active:bg-clay-200',
    'disabled:text-clay-400 disabled:bg-transparent',
  ),
  accent: cn(
    'bg-accent-solid text-on-primary shadow-xs',
    'hover:bg-accent-solid-hover hover:shadow-sm',
    'active:bg-accent-solid-active',
    'disabled:bg-clay-300 disabled:text-clay-500 disabled:shadow-none',
  ),
  danger: cn(
    'bg-danger-solid text-on-primary shadow-xs',
    'hover:bg-danger-solid-hover hover:shadow-sm',
    'active:bg-danger-solid-hover',
    'disabled:bg-clay-300 disabled:text-clay-500 disabled:shadow-none',
  ),
};

/* Heights land on 32/38/46px — comfortable for a thumb at md and up, compact
   enough that dense toolbars do not bloat. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-sm',
  md: 'h-[2.375rem] px-4 text-base gap-2 rounded-sm',
  lg: 'h-[2.875rem] px-5 text-md gap-2 rounded-md',
};

/**
 * Shared appearance for anything that should look like a button. Kept in its
 * own module so a navigation link can adopt the look without nesting a
 * <button> inside an <a> — invalid markup that also breaks keyboard handling.
 */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'interactive-press relative inline-flex select-none items-center justify-center',
    'font-medium whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}
