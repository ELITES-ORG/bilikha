# 0023. Bottom navigation on phones

- **Status:** Accepted
- **Date:** 2026-09-17
- **Related:** [0018](./0018-conversations-replace-one-shot-inquiries.md) ·
  [0022](./0022-offers-replace-portfolio.md) ·
  [operating constraints §3](../explanation/constraints.md)

## Context

The header solved every space problem by hiding things. `Directory` carried
`hidden sm:inline-block`, so on a phone the registry's main browse page could
only be reached by typing the URL — on the one device class
[constraints §3](../explanation/constraints.md) says the audience actually uses.
That link is fixed, but the Hiring / My creative work switch is still
desktop-only, so a creative on a phone cannot reach their own creative view at
all.

The pattern is the problem, not the individual links. A horizontal bar of text
links has no room to grow, and the growth is not finished:
[0022](./0022-offers-replace-portfolio.md) has already added a creative listing
beside the offer directory.

## Decision

**A bottom tab bar on small screens, four tabs: Home, Messages, History,
Profile.** Bottom because that is where a thumb rests on a phone held one-handed.

**Small screens only.** Desktop keeps the existing header and gets no bottom
bar; the bar is `sm:hidden`.

**Signed in only.** A signed-out visitor has nothing to navigate between yet.

**Home is the Directory.** For a signed-in user the landing page — hero, search
box, counts — is a detour past the content they came for.

**The landing page stays for signed-out visitors.** It is the only page that
explains what Bilikha is, which matters most while the registry is thin and many
filters return nothing.

**History is the offers you inquired about**, with whether the creative replied.
This requires a nullable `offer_id` on `conversations`, deferred as a follow-up
in [plan 0010](../plans/0010-offers-and-an-offer-directory.md).

**The top bar on phones reduces to the logo and a bell.** The bell is
**decorative and not interactive** until push notifications exist. It is
rendered as a muted icon rather than a button, and hidden from assistive
technology, so it is not a control that silently does nothing.

**The Hiring / My creative work switch moves into the Profile tab**, which is
the first time it is reachable on a phone.

## Alternatives considered

**A hamburger menu.** Conventional and holds any number of links. Rejected: it
hides navigation behind a tap, and a hidden Directory link is the exact failure
being fixed. A tab bar keeps the destinations visible.

**More links in the top bar, or a scrolling row of them.** Rejected: it does not
scale, and the top of the screen is the hardest place to reach one-handed.

**A bottom bar at every width.** Fewer variants to maintain. Rejected: desktop
has room in the header, and a bottom bar there reads as a phone app rendered on
a monitor.

**Retire the landing page and send everyone to the Directory.** One front door
and less to maintain. Rejected for the reason above — with two published
profiles, a visitor who lands on an empty filter and no explanation has nothing
to go on.

**A working notifications bell now.** Rejected as its own feature:
[0018](./0018-conversations-replace-one-shot-inquiries.md) chose in-app only,
and there is no notifications table to feed one. The product owner has asked for
the icon to be present for presentation, with push notifications to follow.

## Consequences

**Good.** The main destinations are one thumb-tap away. The mode switch becomes
reachable on a phone for the first time. The top bar stops being the place where
features go to be hidden.

**Bad: four tabs is now a hard budget.** A fifth destination has to displace one
of these or live a level down. **Admin has no tab** — administrators work at a
desk, and the link stays in the desktop header, but an administrator on a phone
has no route to the queue.

**Bad: the bar covers content.** Every scrollable page needs bottom padding on
small screens, and anything fixed to the bottom — the toast stack from
`ToastProvider` — has to sit above it. Forgetting either hides the last row of a
list behind the bar.

**Bad, and accepted deliberately: the bell does nothing.** People will tap it.
Rendering it as a non-interactive, muted, `aria-hidden` icon is the mitigation,
not a fix. It is a promise of a feature that does not exist, and it should
either gain a feed or be removed rather than sit there indefinitely.

**History is empty for everything that came before.** `offer_id` is null on
every existing conversation, and stays null for anyone who contacts a creative
from their profile rather than from an offer. Those appear as a conversation
with a creative and no offer, which is honest but makes the tab thinner than it
looks.
