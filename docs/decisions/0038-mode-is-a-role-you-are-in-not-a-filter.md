# 0038. Mode is a role you are in, not a filter you apply

- **Status:** Accepted
- **Date:** 2026-09-21
- **Related:** [0025](./0025-client-postings-and-mirrored-home.md) ·
  [0036](./0036-persistent-chrome-holds-the-most-used-control.md) ·
  [0019](./0019-one-account-creative-as-attachable-role.md) ·
  [0027](./0027-account-is-a-hub.md)

## Context

Creatives were put in front of the app and asked to use it. They reported that
the *I'm hiring* / *I'm for hire* control is confusing. Asked what they wanted
instead, they described going to their account and choosing to be in creative
mode or client mode — a place to say which of the two they currently are.

This is the second time these labels have failed. They replaced *Hiring* and
*My creative work*, changed because the second read as your own offers and
portfolio when the mode actually shows other people's job posts. The
[component's own comment](../../frontend/src/components/ModeSwitch.tsx) records
that. A wording problem fixed by rewording does not usually come back; this one
did, which is evidence the wording was never the problem.

**Look at where the control sits.** On the directory, in order down the page:
the mode toggle, then the `Offers | Creatives` tabs, then the filter icon. Three
segmented controls stacked, two of which really are filters for that list. The
third decides what the whole product shows you and follows you between devices.
Nothing about its position says so.

[0025](./0025-client-postings-and-mirrored-home.md) put it there deliberately,
and for a real reason:

> The mode control appears at the top of every mirrored surface, not only Home.
> If a list can be emptied by being in the wrong mode, the way out has to be on
> that list.

That reasoning is still correct. What it did not anticipate is that a control
repeated at the top of three list pages is read as belonging to those lists.

## Decision

**Mode is chosen on the account hub, and named for the role.** *Client mode* and
*Creative mode* — the words the creatives used about themselves, describing who
they are rather than what they are doing. [0027](./0027-account-is-a-hub.md)
already makes Account the place where account-wide settings live, and the theme
control added by plan 0024 sits there in the same shape.

**The page-header toggle is removed from the mirrored surfaces.** Directory,
Messages and History stop offering it.
[0036](./0036-persistent-chrome-holds-the-most-used-control.md) settled the rule
this follows: *a surface's persistent chrome holds the control used most on that
surface*. On the directory that is the filters. Mode is switched a handful of
times in an account's life — it never earned the space, and taking it out is
applying 0036 rather than departing from it.

**Each mirrored surface names the mode it is showing, without offering to change
it.** A quiet line under the page title — *Viewing as a creative* — and a plain
text link to Account for changing it. No buttons and no segmented control, so
there is nothing left on the page shaped like a filter. This is what keeps
0025's concern answered: the reason a list looks the way it does is stated on
the list.

**Empty states keep the switch.** `ModeAwareEmptyState` already puts one in
every empty mirrored list, and that is precisely the case 0025 was protecting —
a list emptied by being in the wrong mode, with the way out on the list. That
protection is independent of the header toggle and survives its removal. **This
is the load-bearing part of this decision**: without it, removing the toggle
would reintroduce the trap 0025 identified.

> **Amended 2026-09-22 — the escape stays, the toggle goes.**
>
> Shipped, this put two mode affordances on one screen: the notice at the top
> saying which mode you are in, and a segmented control in the empty state
> offering both. The registrant asked why the toggle was still there, having
> already been told mode lives on the account.
>
> They are right, and this record is the reason why. The finding above is that a
> **two-state control you pick between reads as a filter** — that is about the
> control's shape, not about which part of the page it sits in. Moving it from
> the header to the middle of an empty list does not change what it looks like.
>
> So the empty state keeps its one-tap way out and loses the toggle: a **single
> action button naming what will happen** — *Switch to Creative mode* — instead
> of a segmented control showing both states. An action is not a filter, and the
> notice above already says which mode you are in, so nothing is lost by the
> control no longer saying it twice.
>
> 0025's requirement is untouched: the way out is still on the list, still one
> tap, still at the moment it is needed. Sending someone to Account and back
> from an empty inbox would be the trap 0025 named.
>
> **And it must not be offered to someone who cannot take it.** An account with
> no creative profile is currently told to *switch to Creative mode* by copy it
> has no control for, because the control is correctly hidden. The copy has to be
> profile-aware, not only mode-aware.
> [Plan 0032](../plans/0032-an-action-not-a-toggle.md) carries it out.

**Nothing changes about what mode means or how it is stored.** It stays on the
user, server-side, following them between devices, with the same two values.
This is a change to how it is presented and nothing else — no migration, no API
change, no new state.

## Alternatives considered

**Rename the labels again, leave them where they are.** The cheapest change and
the one already tried once. The control would still sit in a stack of filters on
three pages. A third set of words would be a third guess at a problem that is
not about words.

**Move it to Account and show nothing anywhere else.** What was literally asked
for, and the closest to wrong. A creative who switches mode and then opens
Messages sees a shorter list with no explanation on the page. The empty states
would still rescue a *fully* empty list, but a partly empty one is worse — it
looks like data went missing rather than like a view changed.

**Put a mode badge in the global top bar.** Strongest at preventing "why is this
empty", and rejected on space: at 375px the header already carries the wordmark
and the notification bell, and [0023](./0023-bottom-navigation-on-phones.md) has
already spent that room. A badge on every page also asserts the mode matters
everywhere, when it only changes three surfaces.

**Make mode per-surface, so Messages could differ from Home.** Coherent on
paper and worse in practice: the person would have to hold two or three modes in
their head, and 0025 moved mode onto the account precisely so the product is not
a different product in two places.

## Consequences

**The mode becomes harder to change and easier to understand.** Switching costs
a trip to Account. That is the right trade for something switched rarely, and
the empty states still short-circuit it in the case where it is urgent.

**Three pages lose a control and gain a sentence.** The directory in particular
drops to one row of filter-shaped controls that really are filters.

**A creative who wants to flip back and forth while browsing will feel it.** If
that turns out to be common — and the same user contact that produced this
decision is how we would learn it — the answer is the top-bar badge above, not
the header toggle coming back.

**The label lives in one place.** Today the strings *I'm hiring* and *I'm for
hire* appear 23 times across five files — the switch itself and eleven
empty-state descriptions on Directory, History, Messages and My postings. Renaming them to Client and Creative touches all of
those; they should end up named once and imported, or the third rename will be
as scattered as the second.
