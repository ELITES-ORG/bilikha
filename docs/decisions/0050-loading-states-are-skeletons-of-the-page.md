# 0050. Loading states are skeletons of the page

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related:** [0034](./0034-navigation-transitions.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Context

While a lazy page chunk arrived, or the session was still being checked,
`RouteFallback` drew three pulsing dots in the middle of an empty screen. Once
a page was in, most of them showed their own loading state as one or two grey
blocks (`h-40 w-full`) where a list or a detail would go. Neither said what
was coming, and both jumped when the real content landed: the dots gave way to
a full page, and a 160px block gave way to a list of a different height.

The owner asked for skeleton loaders that mimic the structure and layout of
the page, screen or tab being loaded.

## Decision

**Every loading state is a skeleton of what replaces it,** drawn in the frame
it will arrive in, from `components/page-skeleton/`.

- `PageSkeleton` maps the address being loaded to a skeleton of that page: the
  landing hero, the sign-in card, the directory grid, a profile, the inbox, an
  agreement. An address it does not know gets a plain page.
- `RouteFallback` draws it at the right depth through `FallbackScopeContext`.
  At the top of the routes it draws the page's chrome too (the navy landing
  bar, the auth layout, the onboarding and admin headers). Inside `SiteLayout`
  the real header is already up, so only the page is drawn. In the messages
  split view only the thread pane is drawn.
- The skeleton a page shows while its data loads lives in `parts.tsx` and is
  the same component its route fallback draws, so the hand-over from one to the
  other does not move.
- Text bars sit in a box the height of the real line (the size times its
  line height in `theme.css`), so a skeleton line takes the same space as the
  line of type that replaces it.

What stays from before: invisible for the first 250ms, so a cached chunk never
flashes; the opening curtain and the page-transition overlays still hold over
any fallback ([ADR 0034](./0034-navigation-transitions.md)); `RequireAdmin`
still shows a plain page rather than the admin tool it is guarding; the
"server may be waking up" line still appears after eight seconds.

## Alternatives considered

**Keep the dots and fix only the in-page blocks.** Fewer files, but the
route-level wait is the one people see on a slow connection, and it was the
emptiest.

**One generic skeleton everywhere** (a title and a few bars). Cheap and better
than dots, but it does not match the page, so it still jumps on arrival.

**Skeletons inside each page's own lazy chunk.** The fallback has to render
before that chunk exists, so it cannot come from it.

## Consequences

**Good.** The wait shows the page that is coming, and the arrival does not
jump.

**Bad.** A skeleton is a second drawing of the page. When a page's layout
changes, its skeleton must change with it, or it drifts and jumps again. Pages
that share a skeleton through `parts.tsx` keep the page and its fallback in
step; the route table in `PageSkeleton.tsx` has to be kept in step with the
routes by hand.

**Cost.** The skeleton module is in the first load, because the fallback has to
render before any page chunk. What it reuses (the site header, the auth layout,
the offer card skeleton) was already there; the rest is markup with no data.
