import { cn } from '@/lib/cn';

/**
 * The segmented-control look, shared by `Tabs` and by radio groups that are
 * styled as one (Account → Appearance, Mode). Kept apart from `Tabs` so a
 * radio group keeps its own semantics and only borrows the appearance.
 */
// Never wraps: a pill that breaks onto two lines reads as two controls. Items
// tighten their padding on small screens instead.
export const segmentTrackClass =
  'inline-flex max-w-full gap-1 rounded-full bg-clay-100 p-1';

export function segmentItemClass(selected: boolean): string {
  return cn(
    'interactive-press inline-flex min-h-10 cursor-pointer items-center justify-center gap-2',
    'rounded-full px-3 text-sm font-semibold whitespace-nowrap sm:px-4',
    selected
      ? 'bg-primary text-on-primary shadow-xs'
      : 'text-ink-muted hover:bg-surface hover:text-ink',
  );
}
