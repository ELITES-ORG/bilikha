import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Variants are separated by *role*, not decoration. Exactly one primary action
 * should be visible in any view; everything else steps down to secondary or
 * ghost. `accent` (red) is for the one call to action a screen exists for —
 * search the registry, publish — and `inverse` sits on a navy surface.
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
    'bg-surface text-lawa-700 border border-lawa-700 shadow-xs',
    'hover:bg-primary-soft',
    'active:bg-lawa-100',
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
  inverse: cn(
    'text-on-primary border border-on-primary-muted',
    'hover:bg-on-primary hover:text-primary',
    'disabled:opacity-60',
  ),
};

/* Every size is 44px on a touch screen — the minimum touch target, in any
   orientation. `sm` drops to 36px only with a mouse or trackpad
   (`pointer-fine`), so a phone held in landscape keeps 44px even though it is
   wider than the `sm` breakpoint. `lg` is the 48px primary call to action. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 pointer-fine:h-9 px-4 text-sm gap-1.5 rounded-sm',
  md: 'h-11 px-5 text-base gap-2 rounded-sm',
  lg: 'h-12 px-6 text-md gap-2 rounded-sm',
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
    'font-semibold whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}
