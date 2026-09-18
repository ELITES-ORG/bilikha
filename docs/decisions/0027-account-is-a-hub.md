# 0027. The account page is a hub, not a page

- **Status:** Accepted
- **Date:** 2026-09-17
- **Related:** [0023](./0023-bottom-navigation-on-phones.md) ·
  [0025](./0025-client-postings-and-mirrored-home.md) ·
  [operating constraints §3](../explanation/constraints.md)

## Context

`/account` renders six sections in a flat stack: Your postings, Photo, Offer
your creative work, Profile, Offers and Security. Between them they mount about
1,300 lines of editor components — `OfferEditor` is 523 on its own, and
`ProfileEditor` with its craft fields and the sub-domain picker is another 560.

Two things follow from that, neither of which is about taste.

**The profile form has a single Save at the very bottom.** Changing a display
name means scrolling past the bio, a nine-domain sub-domain picker, location and
contact preference to reach it.

**Everything loads whether it is needed or not.** Opening the page to change a
password also fetches the profile, the offers list and the taxonomy. On the
metered connections [constraints §3](../explanation/constraints.md) describes,
that is paid for by someone who came to do one small thing.

It is also the Profile tab — one of four in the bottom bar
([0023](./0023-bottom-navigation-on-phones.md)) — so it is opened often and
casually.

## Decision

**`/account` becomes a hub: a list of categories, each linking to its own
page.** Nothing is edited on it.

| Entry | Route |
|---|---|
| Profile | `/account/profile` |
| Offers | `/account/offers` |
| Your postings | `/postings/mine` (already exists) |
| Security | `/account/security` |

**The editors move to those routes unchanged.** This is where a naive version of
this change goes wrong: splitting the *profile form itself* into per-field pages
would be a bigger change than it looks, because `PUT /me/profile` takes the
whole profile — name, craft, location and contact preference together. A page
editing only the bio would still have to load and resend all of it, or the API
would need partial updates first.

Moving whole editors to their own routes needs no backend change at all, and
removes most of the cost immediately.

**Each entry carries a one-line summary of its current state** — "4 sub-domains,
published", "1 of 6 offers used" — so the hub answers the common question
without opening anything.

**Splitting the profile form further is a separate decision**, and it depends on
the API supporting partial updates.

## Amended 2026-09-19: one control lives on the hub

"Nothing is edited on it" now has an exception: the theme choice
([0026](./0026-dark-mode-follows-the-device.md)) sits on the hub itself rather
than behind an entry.

The rule was never about controls in the abstract. It was about *loading* — the
page was mounting some 1,300 lines of editors and fetching a profile, a list of
offers and the taxonomy to show four rows. A theme choice fetches nothing, holds
no server state and has no save. Giving it a page of its own would cost a tap to
reach one switch.

The test for the next one is the same: a control that loads nothing and saves
nothing may sit on the hub. Anything that queries belongs behind an entry.

## Alternatives considered

**Collapsible sections on one page.** Cheapest. Rejected: an accordion keeps
everything mounted, so it fixes the scrolling and none of the loading, and it
hides state behind a control people have to discover.

**Tabs across the top of one page.** Same objection, plus tabs are awkward at
346px and would compete with the segment controls already used for modes and
History.

**Split the profile form into per-field pages now.** The full Facebook shape.
Rejected for this round only, on the payload problem above. It is the right
eventual destination if editing stays awkward.

**Leave it.** Rejected: it is the Profile tab, it gets opened casually, and it
currently costs several queries and a long scroll to do anything.

## Consequences

**Good.** Each page loads only what it edits. A password change stops fetching
offers. Each editor keeps its own form and its own save, so nothing about
validation or the API changes. The hub is a cheap place to surface state that is
currently invisible until you scroll to it.

**Bad.** Every edit gains a tap. That is the trade: fewer things loaded and
found, one more step to reach them. For a page opened casually and edited
rarely, it is the right side of the trade, but it is a real cost for someone
making several changes in one sitting.

**Bad.** Four more routes to keep guarded and to keep out of the wrong mode, and
four more places for a back button to behave oddly on a phone.

**Watch for.** People not finding Offers. It is a creative's most important
surface after their profile, and it currently sits in the open on a page they
already visit. Behind a hub entry it could go quiet — the per-entry summary line
is partly there to keep it visible.
