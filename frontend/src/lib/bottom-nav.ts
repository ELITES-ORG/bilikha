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

/**
 * Conversation thread: clears the fixed phone composer (~3.75rem) sitting above
 * the bottom nav. Desktop stays in document flow so no extra pad.
 */
export const pbConversationComposer =
  'max-sm:pb-[calc(3.5rem+3.75rem+env(safe-area-inset-bottom,0px))] sm:pb-0';

/** Fixed/sticky bottoms (toasts, chat composer) — sit above the bar below sm. */
export const bottomAboveNav =
  'max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-0';

/** Fixed reply bar on phones, above the tab bar. Desktop stays in-flow. */
export const fixedComposerAboveNav = [
  'max-sm:fixed max-sm:inset-x-0 max-sm:z-30',
  'max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]',
  'max-sm:border-t max-sm:border-hairline max-sm:bg-paper max-sm:px-3 max-sm:py-2',
  'sm:static sm:mt-8 sm:border-t sm:border-hairline sm:bg-transparent sm:px-0 sm:pt-6 sm:pb-0',
].join(' ');
