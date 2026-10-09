import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  /** Persistent helper text. Replaced by `error` when one is present. */
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  /**
   * Interactive control inside the field's right edge — an inline submit, a
   * reveal toggle. Unlike `iconLeft` it receives pointer events.
   */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, trailing, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-ink">
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
            className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-ink-subtle"
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
            'h-11 w-full rounded-sm border bg-surface px-3.5 text-base text-ink',
            'transition-[border-color,box-shadow] placeholder:text-ink-subtle',
            'focus:outline-none focus-visible:outline-none',
            iconLeft && 'pl-10',
            trailing && 'pr-14',
            error
              ? 'border-danger-500 focus:border-danger-600 focus:ring-4 focus:ring-danger-100'
              : 'border-hairline-strong hover:border-slate-400 focus:border-ring focus:ring-4 focus:ring-navy-100',
            'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
            className,
          )}
          style={{ transitionDuration: 'var(--duration-fast)' }}
          {...props}
        />

        {trailing && (
          <span className="absolute inset-y-0 right-1.5 grid place-items-center">{trailing}</span>
        )}
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
