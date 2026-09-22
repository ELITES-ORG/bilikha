/**
 * Shared clearance for the phone bottom tab bar.
 *
 * **Every class here is a complete literal.** Tailwind scans source text and
 * emits nothing for a class it cannot see whole, so these must not be built by
 * template literal or concatenation however repetitive that reads.
 *
 * All three measure the same thing: `var(--bottom-nav-h)` is the bar's content
 * height, `1px` is its top border, and `env(safe-area-inset-bottom)` is the
 * home-indicator inset it pads itself with. `BottomNav` takes its height from
 * the same token, so the bar and everything measuring against it move together.
 */

/**
 * Page `<main>` (or outermost scroll content) — clears the fixed bar below sm,
 * with half a rem of air so the last row sits comfortably above the tabs.
 */
export const pbBottomNav =
  'max-sm:pb-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom,0px)+0.5rem)] sm:pb-0';

/**
 * Conversation thread: also clears the fixed phone composer above the bar. The
 * composer's own 3.75rem is an estimate, which is fine — over-padding a scroll
 * container is invisible, unlike over-offsetting a fixed element.
 */
export const pbConversationComposer =
  'max-sm:pb-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom,0px)+3.75rem)] sm:pb-0';

/**
 * Fixed reply bar on phones, sitting directly on the tab bar. Desktop stays
 * in-flow.
 *
 * This offset must equal the bar's occupied height exactly. It previously
 * reused the page-padding figure, which deliberately carries extra air — so the
 * composer floated that much too high and the thread showed through the gap
 * beneath it.
 */
export const fixedComposerAboveNav = [
  'max-sm:fixed max-sm:inset-x-0 max-sm:z-30',
  'max-sm:bottom-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom,0px))]',
  'max-sm:border-t max-sm:border-hairline max-sm:bg-paper max-sm:px-3 max-sm:py-2',
  'sm:static sm:mt-8 sm:border-t sm:border-hairline sm:bg-transparent sm:px-0 sm:pt-6 sm:pb-0',
].join(' ');

/**
 * Offer detail actions on phones. Same occupied height as the conversation
 * composer estimate (~3.75rem): Inquire + Save in one dock row.
 *
 * Signed-in visitors also clear BottomNav; guests only clear the home indicator
 * because BottomNav does not render for them.
 */
export const pbOfferActionDock =
  'max-sm:pb-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom,0px)+3.75rem)] sm:pb-0';

export const pbOfferActionDockGuest =
  'max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+3.75rem)] sm:pb-0';

export const fixedOfferActionDockAboveNav = [
  'max-sm:fixed max-sm:inset-x-0 max-sm:z-30',
  'max-sm:bottom-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom,0px))]',
  'max-sm:border-t max-sm:border-hairline max-sm:bg-paper/90 max-sm:px-3 max-sm:py-2 max-sm:backdrop-blur-sm',
  'sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none',
].join(' ');

export const fixedOfferActionDockGuest = [
  'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-30',
  'max-sm:border-t max-sm:border-hairline max-sm:bg-paper/90',
  'max-sm:px-3 max-sm:pt-2 max-sm:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] max-sm:backdrop-blur-sm',
  'sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none',
].join(' ');
