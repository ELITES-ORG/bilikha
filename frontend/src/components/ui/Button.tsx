import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner, disables interaction, and preserves the button's width. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {/* The label fades rather than unmounting, so the button keeps its width
          and the surrounding row never reflows mid-submit. */}
      <span
        className={cn(
          'inline-flex items-center gap-[inherit] transition-opacity',
          loading ? 'opacity-0' : 'opacity-100',
        )}
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        {iconLeft}
        {children}
        {iconRight}
      </span>

      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <span
            className="anim-spin size-4 rounded-full border-2 border-current border-t-transparent opacity-70"
            aria-hidden="true"
          />
        </span>
      )}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

/** In-app navigation that looks like a button. Renders a real anchor. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconLeft,
  iconRight,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, fullWidth, className })} {...props}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}

export interface ExternalButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Same appearance for links that leave the app. */
export function ExternalButtonLink({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  ...props
}: ExternalButtonLinkProps) {
  return <a className={buttonStyles({ variant, size, fullWidth, className })} {...props} />;
}
