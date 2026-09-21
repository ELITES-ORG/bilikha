# 0025. Client postings, and Home shows the other side of the market

- **Status:** Accepted
- **Date:** 2026-09-17
- **Related:** [0004](./0004-unified-account-model.md) ·
  [0019](./0019-one-account-creative-as-attachable-role.md) ·
  [0022](./0022-offers-replace-portfolio.md) ·
  [0023](./0023-bottom-navigation-on-phones.md) ·
  [0024](./0024-offers-attach-to-messages.md)

## Context

A client opens Bilikha and browses offers. A creative opens Bilikha and browses
— offers. Their own side of the market. There is nothing for them to *do* except
wait for an inquiry that, with two published profiles and forty accounts, mostly
does not come.

Every ADR since [0004](./0004-unified-account-model.md) has said supply is the
bottleneck, and each has treated that as a reason to reduce friction on the way
in: shorten registration, drop the subject field, one account instead of two.
That is all worth doing and none of it gives a creative a reason to come back
tomorrow.

A directory asks a creative to show up and wait. A board of paid work asks them
to show up because there is money on it. It also changes what happens when a
client finds nothing: today they browse two profiles, leave, and nothing remains.
A posting persists and is waiting for whoever registers next.

The mode switch that would make this possible already exists in name only.
`viewMode` is read in two components, changes the font weight of two links, and
is stored in `localStorage`. It controls no content, no routing and no data, and
it does not follow a person between devices.

## Decision

**Clients can publish postings.** A posting is work someone wants done: a title,
a description, one sub-domain, an optional budget range, a municipality, and an
expiry.

**Home shows the other side of the market.** In hiring mode it is offers and
creatives, exactly as now. In creative mode it is postings. **Nobody browses
their own side.**

**Messages and History mirror too.** In creative mode: clients who contacted you,
and postings you replied to. In hiring mode: creatives you contacted, and offers
you asked about or saved. Profile is shared.

**The mode control appears at the top of every mirrored surface**, not only Home.
If a list can be emptied by being in the wrong mode, the way out has to be on
that list.

> **Amended 2026-09-21 by [0038](./0038-mode-is-a-role-you-are-in-not-a-filter.md).**
> Creatives in a user test found the toggle confusing, and the reason is where
> it sits: repeated at the top of three list pages, directly above controls that
> really are filters, it reads as one. Mode moves to the account hub and each
> surface only *names* the mode it is showing.
>
> The concern in the paragraph above is untouched and still binding. The way out
> of a list emptied by the wrong mode is still on that list — it lives in
> `ModeAwareEmptyState`, which is exactly where it is needed and nowhere it can
> be mistaken for a filter. Do not restore the header toggle on the strength of
> this paragraph alone; read 0038 first.

**Mode moves onto the account.** If it decides what Home shows, it cannot be a
per-device preference — the product would be a different product on a phone than
on a laptop.

**Replying to a posting attaches it to a message**, exactly as
[0024](./0024-offers-attach-to-messages.md) settled for offers. Same grain,
mirrored, and most of the messaging work is already done.

**Postings expire.** A board of stale postings is worse than an empty one,
because it teaches creatives that nothing there is real.

**Postings are live on publish and reviewed after**, following
[0008](./0008-publish-immediately-with-tiers.md), with the same contact-details
flag plan 0012 added for offer descriptions.

**A creative's feed is ordered by their own sub-domains first**, then by
municipality, then recency — the same shape as the nearby-first ordering in
[0020](./0020-location-required-biliran-only.md).

## Alternatives considered

**Postings replace offers as the primary direction**, with offers demoted to
credibility a client reads when choosing who to reply to. This is how Upwork
works and is arguably the better fit for a thin market. Declined by the product
owner: the two sit beside each other.

**Mirror Home only, and label rows in a combined inbox** using the `role` field
the API already returns. Less that can be hidden by being in the wrong mode.
Rejected: a mixed inbox was the original complaint, and half-mirroring means
Home follows one rule and everything else another.

**Keep mode in `localStorage`.** Rejected above.

**A separate route tree for creatives.** Rejected: it invites dead ends where a
feature exists in one tree and not the other, which is what
[0023](./0023-bottom-navigation-on-phones.md) was written to fix.

## Consequences

**Good.** A creative has a reason to open the app that does not depend on
somebody else acting first. Demand persists instead of evaporating. The RA 11904
taxonomy now indexes both sides of the market rather than one. Messaging,
moderation flagging and money formatting are all reused rather than rebuilt.

**Bad, and this is the main risk: mode becomes load-bearing.** Today it is
decorative, so getting it wrong costs nothing. After this, a person in the wrong
mode sees an empty Home, an empty inbox and an empty history, and has no reason
to think a switch exists. The control on every mirrored surface is the
mitigation, and every empty state must name the mode and offer the way out —
"You are viewing your creative work. Switch to Hiring to see creatives." If that
copy is skipped, this decision produces an app that looks broken.

**Bad.** [0019](./0019-one-account-creative-as-attachable-role.md) says a
creative can also hire, "no special-casing". This is special-casing — by view,
not by account. The account model is unchanged and a creative can still hire;
they change mode to do it. That is a real cost in a province where the same
person is often both in the same week.

**Bad.** Moderation roughly doubles, against one administrator. Client free text
is where "pay in exposure", recruitment scams and bare phone numbers appear, and
a posting is seen by every matching creative rather than by one person.

**Watch for.** Accounts with a creative profile whose Home is never visited
twice. That is the signal that they landed in a mode with an empty feed and did
not find the switch.
