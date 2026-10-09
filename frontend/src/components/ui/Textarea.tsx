import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  /** Persistent helper text. Replaced by `error` when one is present. */
  hint?: string;
  error?: string;
}

/** Multi-line twin of `Input`: same label, border, focus and error treatment. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const messageId = `${fieldId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
          {label}
          {required && (
            <span className="text-danger-600 ms-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <textarea
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          'min-h-28 w-full rounded-sm border bg-surface px-3.5 py-2.5 text-base text-ink',
          'transition-[border-color,box-shadow] placeholder:text-ink-subtle',
          'focus:outline-none focus-visible:outline-none',
          error
            ? 'border-danger-500 focus:border-danger-600 focus:ring-4 focus:ring-danger-100'
            : 'border-hairline-strong hover:border-slate-400 focus:border-ring focus:ring-4 focus:ring-navy-100',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
          className,
        )}
        style={{ transitionDuration: 'var(--duration-fast)' }}
        {...props}
      />

      {message && (
        <p id={messageId} className={cn('text-xs', error ? 'text-danger-700' : 'text-ink-subtle')}>
          {message}
        </p>
      )}
    </div>
  );
});
