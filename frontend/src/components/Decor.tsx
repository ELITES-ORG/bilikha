import { cn } from '@/lib/cn';

/**
 * Organic navy and red shapes for screen corners — sign-in, the profile
 * banner, the landing hero. Purely decorative: hidden from assistive tech,
 * never hit-testable, and drawn in tokens so both themes follow.
 *
 * The parent must be `relative overflow-hidden`, and content that could sit
 * under a shape must be `relative` so it paints above it.
 */
type Placement = 'top-right' | 'bottom-left' | 'bottom-right';

const PLACEMENT: Record<Placement, string> = {
  'top-right': '-top-6 -right-6 size-36 sm:size-44 lg:size-64',
  'bottom-left': '-bottom-6 -left-6 size-36 sm:size-44 lg:size-64 rotate-180',
  'bottom-right': '-bottom-6 -right-6 h-32 w-72 sm:h-40 sm:w-96',
};

export function CornerBlob({
  placement,
  onNavy = false,
  className,
}: {
  placement: 'top-right' | 'bottom-left';
  /** On a navy surface the navy lobe steps lighter so it stays visible. */
  onNavy?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none absolute', PLACEMENT[placement], className)}
    >
      {/* A large navy lobe with a smaller red one tucked under its edge. */}
      <path
        className="fill-palayok-500"
        d="M200 120c-22 4-40 22-44 48-3 18-14 30-30 32h74Z"
      />
      <path
        className={onNavy ? 'fill-lawa-500' : 'fill-lawa-700'}
        d="M40 0c4 30 26 52 58 56 34 4 52 28 54 60 1 20 18 34 48 34V0Z"
      />
    </svg>
  );
}

/** Layered waves for the bottom edge of a hero. */
export function CornerWave({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 160"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none absolute', PLACEMENT['bottom-right'], className)}
    >
      <path className="fill-palayok-500" d="M400 20C320 30 280 80 200 96 150 106 110 100 80 120l320 0Z" />
      <path className="fill-lawa-700" d="M400 70C330 76 300 120 220 132 160 141 120 136 60 160h340Z" />
    </svg>
  );
}

/** A soft navy tint wash, for depth behind a headline. */
export function SoftBlob({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none absolute', className)}
    >
      <path
        className="fill-primary-soft"
        d="M152 26c26 18 42 52 36 86-6 36-36 66-74 74-40 8-82-12-100-46C-4 104 4 60 34 34 64 8 124 6 152 26Z"
      />
    </svg>
  );
}
