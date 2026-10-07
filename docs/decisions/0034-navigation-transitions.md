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

## Amendment — 2026-10-07: branded transitions on a few deliberate links

**Context.** The view transition above is correct for moving around the app,
but it is anonymous: nothing says where you are going. The Elites site marks
each change of page with a full-screen curtain carrying the destination's
name, and the owner wanted that character in Bilikha, in Bilikha's own shapes.

**Decision.** Three overlays, in `frontend/src/components/page-transition/`,
each covering the screen, changing the route underneath and revealing it:

- **wave** — the hero's navy-and-red wave rolls up with the page's name.
  Between the public pages: the landing page's footer menu and "Browse the
  directory", the wordmark on the sign-in and registration pages, and every
  link to the privacy notice or terms of use.
- **bloom** — a navy circle grows from where the tap landed. The main calls to
  action: "Get listed", the header's Sign in and Register, and the Sign in and
  Register buttons that switch between the two auth pages.
- **panel** — a navy panel slides up under the header, which stays put. The
  header's section links, which only show from `sm` up.

Everything else keeps the view transition above and gains the **tide**, a red
line drawn across the top of the screen, inside 200ms.

**What is relaxed, and what is not.** The overlays run about 0.5 seconds,
over the 200ms rule. That is accepted only because they are confined to a few
links someone taps once in a visit, never tabs, filters, back links or the
phone tab bar. Everything else from this record holds: no library, transform
and opacity only, nothing in the first load beyond a little CSS and one
component. They are not view transitions because a view transition has
nowhere to put a label, and an overlay does not freeze the page.

**Fails to nothing.** Under reduced motion the click is not intercepted, so the
link navigates exactly as before. A phase moves on by timer if its animation
never reports finishing, as in a hidden tab, so no one is left behind a
curtain.

**The curtain lifts on the new page, not the old one.** After covering it
holds until the router has actually rendered a different history entry. The
legal pages are lazy, and the router keeps the old page on screen while a
chunk downloads, so lifting on a timer revealed the page being left and then
cut to the new one. The hold gives up after five seconds and reveals whatever
is there; the destination's name on the curtain is the loading state meanwhile.

**Rejected: the Elites curtain as it is.** About 1.5 seconds on every change of
page, driven by `motion`. On an app people move around constantly that is
1.5 seconds of waiting per tap, and it would put `motion` in the first load
([ADR 0047](./0047-animated-icons-load-lazily-with-motion.md)).

## Amendment — 2026-10-07: the back button, and a view transition that never ran

**Context.** Going back showed no transition at all, and checking why found a
larger gap. React Router reads the `viewTransition` flag only in a data router
(`RouterProvider`). The app mounts the declarative `<BrowserRouter>`, which
passes navigations straight to the history object and never calls
`startViewTransition`. The slide this record describes has been inert since it
landed. The back button is out of reach either way: it is no click, so neither
a link's flag nor `transitionTo` sees it, and by the time the page hears of it
the URL has already changed.

**Decision: the browser's back and forward buttons get a branded overlay.**
The owner chose this for every press, knowing it costs about half a second on
the most-used navigation there is. Which one: the overlay that brought you to
the page you are leaving, with the wave and panel run in reverse, or the wave
when a plain link did. Only a change of pathname; going back through filters
on the same page stays still.

It works because the router applies a history change as a React transition.
`PageTransitions` hears `popstate` first and draws the curtain as an urgent
update; `PageTransitionGate`, inside the routes' Suspense boundary, suspends the
render of the page being travelled to until the curtain is down. React keeps a
revealed boundary on screen rather than fall back during a transition, so the
old page stays put underneath. A timer releases the hold if the animation never
reports finishing. Under reduced motion nothing is intercepted.

The browser's scroll restoration is switched off for the same reason: it moved
the old page to the new offset the moment back was pressed, visibly, while the
curtain was still coming down. `ScrollOnNavigate` keeps positions per history
entry and restores them once the page underneath has changed. A reload now
opens at the top.

**Decision: every other change of page gets an entrance.** The new `main`
slides in from the right, 200ms, in a layout effect so it never paints a frame
unanimated, beside the tide. A change of query string alone does not trigger
it, which keeps the filters line drawn above.

**Rejected: moving to a data router.** It would make the flag work and reverse
the slide on back, but it means restructuring every route, more router code in
the first load, and a page frozen for the length of each transition, all for
the one half of the effect that an entrance cannot give: the old page leaving.

**Consequence.** The `viewTransition` props and the `::view-transition` block
in `motion.css` do nothing today. They stay so that a later move to a data
router turns them back on, but at that point the entrance must go, or every
page change animates twice; the gate would need rethinking too, since a data
router does not apply history changes the same way.

## Amendment — 2026-10-07: opening the app

**Context.** Opening or reloading the app showed three grey dots twice over:
the boot mark in `index.html` until the script ran, then `RouteFallback` while
the session was checked and the page's chunk arrived. Every change of page
after that carried the brand; the first impression did not.

**Decision.** The first load opens like a page transition. The boot mark is
the navy curtain with "✦ Bilikha", drawn by `index.html` alone, still invisible
for the first 400ms so a fast load never shows it (plan 0030's rule stands).
React's `BootCurtain` takes it over in the first commit at the same opacity:
its fade is delayed from the page-load clock rather than from mount, so the
handover cannot restart it. Every `RouteFallback` on screen holds the curtain,
and once the last has gone it lifts with the wave onto the first real page.
After that it never returns; later loading states are the ordinary dots. The
"server may be waking up" line moves onto the curtain.

**Cost.** A few hundred bytes of inline CSS, and two more pairs of colour
literals in `index.html` beside the paper pair, converted from the tokens
because the stylesheet has not arrived. On a slow first load the wordmark is
set in Georgia until Fraunces arrives.
