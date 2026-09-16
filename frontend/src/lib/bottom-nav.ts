/**
 * Shared clearance for the phone bottom tab bar. Literals must stay complete —
 * Tailwind does not emit CSS for interpolated class names.
 *
 * Bar content is min-h-11 (2.75rem); 3.5rem leaves a little air above the tabs
 * so the last list row stays fully tappable.
 */
export const BOTTOM_NAV_OFFSET = 'calc(3.5rem + env(safe-area-inset-bottom, 0px))';

/** Page `<main>` (or outermost scroll content) — clears the fixed bar below sm. */
export const pbBottomNav =
  'max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0';

/** Fixed/sticky bottoms (toasts, chat composer) — sit above the bar below sm. */
export const bottomAboveNav =
  'max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-0';

/** Sticky chat composer on phones only — desktop stays in document flow. */
export const stickyComposerAboveNav =
  'max-sm:sticky max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]';
