# 0034. Navigation transitions use the browser's, not a library

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0023](./0023-bottom-navigation-on-phones.md) ·
  [0010](./0010-theme-static-tokens.md) ·
  [operating constraints §3](../explanation/constraints.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Context

Every navigation was a hard cut. Tapping Home, switching the directory from
Offers to Creatives, opening Your postings and coming back — the content
replaced itself instantly with nothing connecting the two states. On a phone
that reads as a page reload rather than as movement within one app, and it is
the difference people describe when they say a web app "feels like a website".

The obvious fix is an animation library. That is the wrong shape here.
[Constraint 3](../explanation/constraints.md) puts this audience on budget
Android over metered data, where every kilobyte is paid for and every layout-
animating frame stutters. Shipping a runtime animation library to move a page
180ms is a poor trade.

## Decision

**Use the browser's View Transitions API**, driven by React Router's
`viewTransition` flag on a link or a navigation. No library, no dependency, no
bytes: the whole feature is a CSS block and an attribute.

**Where it is unsupported, nothing happens.** The navigation is ordinary and no
error is raised. That matters more than usual — Facebook's in-app browser
([constraint 4](../explanation/constraints.md)) is where much of this traffic
arrives, and a transition that throws there would be worse than no transition
anywhere.

**Only `main` carries a `view-transition-name`.** The app shell — header,
notification bell, tab bar — stays put while the content beneath it changes.
That is what makes a tab switch read as a tab switch rather than as the whole
application reloading, and it is why the named element is the content region and
not the root.

**Transforms and opacity only, 140–200ms.** Both rules are already in
[DESIGN.md](../../frontend/DESIGN.md) and neither is relaxed here. A view
transition freezes the page while it runs, so a slow one is worse on this
surface than anywhere else in the product.

**Not every navigation gets one.** Tab switches, the bottom bar, the header
links and back links do. **Filters and pagination do not.** They go through the
same `setSearchParams` call, they fire repeatedly while somebody narrows a
search, and a frozen page on every tap is exactly the lag DESIGN.md warns
against. The line is: a transition marks a change of *place*, not a change of
*contents*.

**Reduced motion keeps the cross-fade and loses the movement.** The existing
global reset matches `*`, which never reaches a pseudo-element, so the view
transition pseudo-elements need their own rule — an easy thing to miss, and the
reason it is called out here.

## Alternatives considered

**An animation library — Framer Motion or similar.** Rich, familiar, and
capable of far more than this needs. Rejected on
[constraint 3](../explanation/constraints.md): tens of kilobytes over a metered
connection to move a page, plus a JavaScript-driven animation on hardware that
struggles with them, in exchange for an effect the browser now does natively.

**Naming the root instead of `main`.** One line simpler. Rejected: it
cross-fades the header and the tab bar along with the content, so switching tabs
dims the tab bar that was switched — the shell appears to reload with the page.

**`viewTransition` on every `Link` in the codebase.** Consistent, and no thinking
required per call site. Rejected on the filters argument above, and because it
would transition things that are not navigations at all.

**Shared-element transitions** — the offer card morphing into the offer page.
The most impressive thing the API does. Rejected for now: each one needs a
matched `view-transition-name` on both sides, unique at any instant, and a
duplicate silently disables the whole transition. It is a feature to add
deliberately with its own verification, not as a flourish on this change.

## Consequences

**Good.** Movement between places for no dependency and no measurable weight.

**Good.** It fails to nothing. Unsupported browsers, reduced-motion users and
the in-app webview all get a working app.

**Bad.** The behaviour is invisible from the components. A `viewTransition` prop
and a CSS block in `motion.css` are the whole feature, and nothing in the page
being animated says so. This record and the comment in `motion.css` are what
connect them.

**Bad.** `view-transition-name` must be unique among rendered elements. Today
only one `<main>` renders at a time, but a future layout with two content
regions would silently lose the transition rather than fail loudly.

**Watch for.** Transitions creeping onto filters, sorting and pagination,
because the prop is easy to add and the reasoning for leaving them out lives
here rather than at the call site.
