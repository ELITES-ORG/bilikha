# 0036. Persistent chrome holds a surface's most-used control

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0035](./0035-the-admin-area-is-a-layout.md) ·
  [0023](./0023-bottom-navigation-on-phones.md) ·
  [0027](./0027-account-is-a-hub.md) ·
  [operating constraints §1, §2, §3](../explanation/constraints.md)

## Context

[0035](./0035-the-admin-area-is-a-layout.md) gave the admin area a side
navigation. The obvious next question was whether the product's own navigation —
Directory, Messages, Account, Admin — should move there too.

Underneath that question is a real observation. The directory renders inside a
`wide` container (`max-w-7xl`) as a single-column divided list, so on a laptop
one offer occupies a full-width row with its content hugging the left and most
of the width empty. Desktop looks unfinished, and a left rail is the first idea
that would fill it.

## Decision

**A surface's persistent chrome holds the control used most *on that surface*.**

That is the rule, and it decides both cases:

- In the admin area, the thing used most is the section list. Moderation *is*
  switching between queues, so the sections earn the rail
  ([0035](./0035-the-admin-area-is-a-layout.md)).
- On the directory, the thing used most is the filters. Someone is there to
  narrow a list, not to leave the page.
- Navigation is neither. It is four fixed destinations used a handful of times
  in a session.

**So: the product's navigation stays in the top bar, and the directory's filters
become a persistent rail on wide screens.**

**The filter toggle stays for phones**, unchanged. The rail is an addition at a
breakpoint, not a replacement — on a 346px screen the space genuinely is not
there, and [0023](./0023-bottom-navigation-on-phones.md) already decided what
phones do.

**Results stay a single-column list, and the column narrows rather than
stretching.** The instinct for filling width is a grid, and it is wrong here.
[Constraint 1](../explanation/constraints.md) says the market is thin and
permanently so: a three-column grid holding eight offers advertises how little
there is, while a list makes a short set read as deliberate. Narrowing the
reading measure fixes the half-empty row without pretending to more inventory
than exists.

**Desktop is worth this work, which is not obvious.**
[Constraint 3](../explanation/constraints.md) puts the supply side on budget
Android and the whole product is built phone-first because of it. But
[constraint 2](../explanation/constraints.md) says demand is institutional —
municipal offices, schools, NGOs — and those people are at a desk. The desktop
directory is plausibly where the money browses, doing a search-and-compare task
that wants filters in view.

## Alternatives considered

**Move the product navigation into a rail, matching admin.** The question that
prompted this. Rejected on the rule above, and on three specifics: the nav list
is capped at four by [0023](./0023-bottom-navigation-on-phones.md) while the
filter list grows with the taxonomy; a rail on desktop against a tab bar on
phones splits one concept into two shapes for the same four destinations; and it
spends permanent horizontal space on the least-touched control, much of it
inside Facebook's in-app browser ([constraint 4](../explanation/constraints.md)),
which is narrow even on a laptop.

**A results grid.** Rejected above on constraint 1. Worth revisiting only if the
registry ever holds enough offers that a grid looks full rather than sparse.

**Leave the directory as it is.** Defensible — nothing is broken. Rejected
because the filters are the page's reason for existing and they are behind an
icon at every size, including screens with room to spare.

**A second rail, so desktop has navigation on one side and filters on the
other.** Rejected on sight. One persistent rail per surface.

## Consequences

**Good.** The width goes to the control that does the page's actual work, and
the half-empty row resolves without inventing inventory.

**Good.** There is now a stated rule for the next time this comes up, rather
than a case-by-case argument about sidebars.

**Bad.** Two directory layouts to keep working — a rail above the breakpoint and
a panel below it — with one set of filter state behind both. The state is shared
today, which is what makes this affordable; if the two ever diverge, that is the
warning sign.

**Bad.** The rule is a judgement, not a measurement. "Most-used control" is
obvious on these two surfaces and will be arguable on some future one.

**Watch for.** Pressure to put something else in the directory rail — saved
searches, a map, promoted creatives. The rail holds filters. Anything else
competing for it is a sign the page is doing two jobs.
