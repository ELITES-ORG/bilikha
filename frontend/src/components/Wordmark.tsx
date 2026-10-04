import { cn } from '@/lib/cn';

export interface WordmarkProps {
  /** `inverse` sets the name in white for a navy surface. */
  tone?: 'default' | 'inverse';
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * The red four-point spark and the name. The spark is decorative; the name is
 * the accessible text, so a link wrapping this needs no extra label.
 */
export function Wordmark({ tone = 'default', size = 'md', className }: WordmarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('shrink-0 fill-palayok-500', size === 'lg' ? 'size-6' : 'size-5')}
      >
        <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
      </svg>
      <span
        className={cn(
          'u-display font-semibold tracking-tight',
          size === 'lg' ? 'text-3xl' : 'text-2xl',
          tone === 'inverse' ? 'text-on-primary' : 'text-wordmark',
        )}
      >
        Bilikha
      </span>
    </span>
  );
}
