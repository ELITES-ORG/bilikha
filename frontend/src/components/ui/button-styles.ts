import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Variants are separated by *role*, not decoration. Exactly one primary action
 * should be visible in any view; everything else steps down to secondary or
 * ghost. Radius stays small — buttons are not cards.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-lawa-700 text-clay-50 shadow-xs',
    'hover:bg-lawa-800 hover:shadow-sm',
    'active:bg-lawa-900',
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
    'bg-palayok-600 text-clay-50 shadow-xs',
    'hover:bg-palayok-700 hover:shadow-sm',
    'active:bg-palayok-800',
    'disabled:bg-clay-300 disabled:text-clay-500 disabled:shadow-none',
  ),
  danger: cn(
    'bg-danger-600 text-clay-50 shadow-xs',
    'hover:bg-danger-700 hover:shadow-sm',
    'active:bg-danger-700',
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
