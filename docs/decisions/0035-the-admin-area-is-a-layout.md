# 0035. The admin area is a layout, not five pages

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0027](./0027-account-is-a-hub.md) ·
  [0023](./0023-bottom-navigation-on-phones.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [operating constraints §3](../explanation/constraints.md)

## Context

The admin area is five pages that each build their own chrome. There is no
shared shell, so navigation between sections is whatever links each page
happens to carry, and the result is already asymmetric at four sections:

| From | Can reach |
|---|---|
| Review queue | Media, Accounts, Ratings |
| Media | Queue, Ratings |
| Accounts | Queue only |
| Ratings | Queue only |

From Accounts there is no way to Media or Ratings except back through the
queue, which has become an accidental hub. Every new moderation surface means
editing every other page to add a link, which is exactly why the graph is
already inconsistent — Ratings was added and only Media got a link to it.

Each page also hand-builds the same header, and each wraps itself in
`RequireAdmin`. **One of them did not.** `AdminAccountsPage` shipped without the
guard, so a signed-in non-admin who typed the URL was shown the suspend-and-
reinstate interface with its searches failing underneath. Nothing could be done
from it — `requireAdmin` answers 404 on the server precisely so that the
existence of an admin surface is not confirmed to an ordinary user — and then
the client confirmed it anyway.

That is the argument in miniature. A guard repeated five times is a guard that
will be forgotten once, and the forgetting is silent.

## Decision

**A route-level layout wraps `/admin/*`.** It owns the header, the section
navigation and the guard. The pages become content.

**The sections are one list, in one file.** Adding a moderation surface is a new
entry and a new route, not an edit to every sibling page.

**`RequireAdmin` moves into the layout.** Structural rather than remembered. No
admin page can be reachable without it, because there is no longer a way to
mount one outside the layout.

**Side navigation on desktop, a horizontally scrolling row on phones.** Not a
drawer: a drawer hides the sections behind a tap and needs state, and the whole
point is seeing what is waiting. A scrolling row is always visible, needs no
JavaScript, and degrades honestly as the list grows.

**The app's bottom bar stays.** An administrator is also a user, and
[0023](./0023-bottom-navigation-on-phones.md) is how they get back to the
product. The admin navigation is *inside* the page; the tab bar remains the way
out of it.

**This area is desktop-first, and that is a deliberate inversion.** The rest of
Bilikha is built phone-first for supply-side users on budget Android
([constraints §3](../explanation/constraints.md)). Administrators are a
different population — in practice the registrant, at a desk, comparing queues.
Optimising moderation for a 375px screen would cost the people who actually do
it, to serve a case that barely happens. The phone layout still works; it is
just not what the design is aimed at.

**A sidebar, not a hub — the opposite of [0027](./0027-account-is-a-hub.md), on
purpose.** That decision made `/account` a list you return to, because someone
enters it to do one thing and leave, and a hub saves loading everything at once.
Moderation is the reverse: the job *is* bouncing between queues in a single
sitting, and a hub charges a round trip for every switch. Same product, opposite
pattern, because the usage is opposite. Recorded here so the inconsistency reads
as a decision rather than drift.

## Alternatives considered

**Leave it, and fix the missing links.** Cheapest today. Rejected: it fixes this
instance of a problem that recurs on every new section, and it does nothing
about the repeated guard — which is the part that has already failed.

**An admin hub page, matching [0027](./0027-account-is-a-hub.md).** Consistent
with the pattern next door. Rejected on the usage difference above: a hub is
right for rarely-visited settings and wrong for a queue you compare against
another queue.

**A drawer on phones.** Saves horizontal space. Rejected: it hides the section
list behind a tap and adds open/closed state, on the one surface where knowing
what is waiting is the entire purpose.

**Put the admin sections in the main bottom tab bar, behind a role check.**
Rejected: four more tabs at 346px for a population of roughly one, and it would
put moderation in front of every ordinary user's thumb.

**Counts on each section — "Review 3", "Reported 1".** Genuinely the most useful
thing a moderation nav can carry, and deliberately not in this decision. It is a
query per section on every admin page load, it needs its own caching answer, and
bundling it here would mean the layout ships late for a reason unrelated to
layout.

## Consequences

**Good.** One place to add a section. One header. One guard, enforced by
structure rather than by memory.

**Good.** The navigation graph stops depending on which page an author happened
to edit.

**Bad.** Admin pages lose control of their own chrome. If one ever needs a
different header — a full-width detail view, say — it will fight the layout, and
the fix is a layout option rather than a local change.

**Bad.** A desktop-first area inside a phone-first product is a real
inconsistency. It is justified by who uses it, and it is still a thing somebody
will trip over while carrying assumptions from the rest of the codebase.

**Watch for.** The section list outgrowing a flat sidebar. Past roughly eight
entries it needs grouping, and the honest moment to do that is when it happens,
not now.
