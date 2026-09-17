# 0030. Notifications: a record, and two ways to deliver it

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0029](./0029-work-agreements-not-invoices.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0023](./0023-bottom-navigation-on-phones.md) ·
  [operating constraints §3, §4, §6](../explanation/constraints.md)

## Context

Nothing in Bilikha tells anyone that anything happened. The Messages page says
so out loud — "There are no email or SMS alerts — check here" — which was the
honest thing to write and is a real cost, not a missing nicety.

The engagement lifecycle in [0029](./0029-work-agreements-not-invoices.md) makes
it sharper. That design has a creative mark work delivered and then wait for the
client to confirm. A client who already has what they wanted has no reason to
open Bilikha again, so the engagement stalls at *Awaiting confirmation* and the
record never closes. Nothing in the product can nudge them.

Two things already exist and shape what to build.

**The bell is decorative.** `SiteHeader` renders a `Bell` inside a `<span>` with
`aria-hidden="true"`, on phones only. It is not a button, carries no count and
links nowhere. It advertises a capability that does not exist, which is worse
than showing nothing.

**Messages already have a badge.** The bottom bar shows an unread count on the
Messages tab, fed by `useUnreadCount`. Anything that also notifies per message
would report the same fact twice.

## Decision

**A notification is a stored record of something that happened to you, and the
bell becomes real.** A button, with an unread count, opening a centre that lists
them newest first.

**It covers only what has no home of its own.** Messages keep their badge and
generate no notifications — the tab already says there is something there.
Notifications are for events with nowhere else to surface:

| Event | Who is told |
|---|---|
| Agreement received | the client |
| Changes requested on an agreement | the creative |
| Agreement accepted | the creative |
| Work marked delivered | the client |
| Completion confirmed | the creative |
| Engagement cancelled | the other party |
| Creative profile approved, rejected, or edit acknowledged | its owner |
| A creative replied to your posting | the client who posted |

That is the whole list, and it should stay close to this size. Constraint 6 —
everyone knows everyone — means a product that pesters people gets its
notifications switched off, and then the channel is dead for the messages that
mattered.

**Nobody is notified of their own action.**

**A notification stores what happened and points at the thing. It never copies
the thing's contents.** The row carries a type and the target's id. The title
and detail are resolved when the centre is read. This is the same rule as
[0028](./0028-suspension-is-enforced-per-request.md): a copied title is a second
source of truth, and it keeps showing a suspended account's words after that
account has been taken off every other surface. A target that no longer resolves
renders as a tombstone rather than as stale text.

**Why it is stored at all**, when this project prefers deriving: a notification
is not a projection of current state, it is the fact that something happened at
a time — and read state is per-notification and belongs nowhere else. Deriving
the list would mean re-scanning several tables on every poll, which
[constraint 3](../explanation/constraints.md) rules out on its own.

**Polling, gated on visibility.** No websockets, no SSE. A persistent connection
per user costs battery and metered data continuously, for a registry people open
a few times a week, and it would be held open by a single small instance. The
unread count is a cheap indexed query on its own endpoint, polled only while the
tab is visible and refetched on focus — the shape `useUnreadCount` already uses.

**Web push is a second delivery surface over the same records, not a second
system.** The centre is the truth; push is best-effort. If a push fails, is
blocked, or the browser never supported it, nothing is lost — the notification
is already stored and will be there when they open the app.

Push is chosen over email and SMS on the constraints. [Constraint 4](../explanation/constraints.md)
says people arrive from Facebook and Messenger, which is not a population that
reads email. SMS is the channel that genuinely reaches Biliranons and it is
ruled out for now by cost and by a dependency: Bilikha does not verify phone
numbers, so it has none it can trust. Push is free, unlimited, needs no phone
number, and works on the budget Android Chrome that
[constraint 3](../explanation/constraints.md) describes as the user base.

**A push payload carries a title and a pointer, never content.** It passes
through Google's push service. What is at stake is what the notification is
about, not what it said.

**Permission is asked in context, after an action that earns it, and never on
load.** A prompt on first visit gets denied, and a denial is sticky — the
browser will not ask again, and the user has no obvious way back. Asking once,
at the moment someone accepts an agreement or sends one, is the only shot
available.

**The copy that promised no alerts has to change.** The Messages page says there
are none. Shipping this without finding that line leaves the product
contradicting itself.

## Alternatives considered

**Notify on every message too.** Rejected: the Messages tab already badges
unread. Two counts for one fact, and the bell fills with the most frequent event
until it means nothing.

**One notification per message rather than per conversation.** Rejected for the
same reason at a smaller scale — twenty messages is one thing to look at.

**WebSockets or server-sent events.** Genuinely better latency. Rejected on
[constraint 3](../explanation/constraints.md): a held-open connection is a
continuous drain on metered data and battery for a product opened a few times a
week, and it changes what the server has to be.

**Copy the title into the notification row.** One query instead of a join, and
the row stays readable after its target is deleted. Rejected: that second copy
is exactly how a suspended account's words survive on a surface that is supposed
to have removed them.

**Email.** Rejected for now on constraint 4, not on cost. It is the obvious
addition if evidence appears that people read it.

**SMS.** The channel that actually works here. Rejected for now: it needs phone
verification built first, a provider account, and a per-message cost that
somebody funds forever. Worth revisiting when there is a reason to spend money.

**Ask for push permission on first load.** Maximum reach in theory. Rejected:
it is the single most reliable way to get permanently denied.

## Consequences

**Good.** The bell stops lying. Events that currently vanish — a profile being
approved, an agreement arriving — become visible without hunting for them.

**Good.** One record, two delivery paths. Push can fail silently and the product
still works, because the centre was never dependent on it.

**Good.** Because notifications resolve their target at read time, suspension
and deletion need no special handling here at all.

**Bad.** A polled endpoint on every signed-in page, forever. It is one indexed
count, gated on visibility, and it is still a request that a metered connection
pays for.

**Bad.** A table that grows without bound. Read notifications need pruning, and
that is a script somebody has to remember to run — `media:prune` already sets
that precedent, and already shows how easy it is to forget.

**Bad.** Web push adds a service worker and a manifest to a codebase that has
neither, and a service worker is a cache that can serve a stale application to
someone who cannot work out why. It gets its own plan for that reason.

**Watch for.** The list growing. Every new notification type makes the existing
ones less likely to be read, and the pressure to add them is constant.

**Watch for.** iPhone users. Web push on iOS requires the site be installed to
the home screen first. They will silently get nothing, and the centre is all
they have.
