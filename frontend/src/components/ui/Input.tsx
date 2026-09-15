import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  /** Persistent helper text. Replaced by `error` when one is present. */
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required && (
            <span className="text-danger-600 ms-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        {iconLeft && (
          <span
            className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-subtle"
            aria-hidden="true"
          >
            {iconLeft}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'h-[2.375rem] w-full rounded-sm border bg-surface px-3 text-base text-ink',
            'transition-[border-color,box-shadow] placeholder:text-ink-subtle',
            'focus:outline-none focus-visible:outline-none',
            iconLeft && 'pl-9',
            error
              ? 'border-danger-500 focus:border-danger-600 focus:ring-2 focus:ring-danger-100'
              : 'border-hairline-strong hover:border-clay-400 focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100',
            'disabled:cursor-not-allowed disabled:bg-clay-100 disabled:text-clay-500',
            className,
          )}
          style={{ transitionDuration: 'var(--duration-fast)' }}
          {...props}
        />
      </div>

      {message && (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-danger-700' : 'text-ink-subtle')}
        >
          {message}
        </p>
      )}
    </div>
  );
});
