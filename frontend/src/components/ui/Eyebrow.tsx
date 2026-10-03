import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Small uppercase kicker above a heading, led by a short red rule. Use it to
 * place a section, not to repeat its title.
 */
export function Eyebrow({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('u-eyebrow flex items-center gap-2.5', className)} {...props}>
      <span className="inline-block h-0.5 w-6 shrink-0 rounded-full bg-palayok-500" aria-hidden="true" />
      {children}
    </p>
  );
}
