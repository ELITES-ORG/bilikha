# 0018. Conversations replace one-shot inquiries, in-app only

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** the one-message-one-response model in
  [plan 0004](../plans/0004-client-accounts-and-inquiries.md)
- **Related:** [0013](./0013-username-password-auth-sprint-1.md) ·
  [0017](./0017-sign-in-before-contacting.md)

## Context

[Plan 0004](../plans/0004-client-accounts-and-inquiries.md) built messaging as a
handoff: one inquiry, one response, then the creative's contact detail is
revealed and the parties continue on Messenger. The reasoning was that
[operating constraints](../explanation/constraints.md) records deals closing on
Messenger and GCash regardless, so competing with Messenger is a fight we lose.

The product owner has asked for a real conversation instead — back-and-forth
messaging between the client and the creative.

That is a reasonable request. Negotiating a commission genuinely needs several
exchanges: scope, dates, price, revisions. A single reply cannot carry that, so
in practice the handoff pushes every real negotiation off the platform
immediately, taking with it any ability to measure, moderate, or eventually
transact.

One fact constrains this heavily: **there are no notifications.** No email, no
SMS — [0013](./0013-username-password-auth-sprint-1.md) scoped external services
out and that has not changed. The product owner has confirmed in-app only is
acceptable for now.

## Decision

**Messaging is a two-party conversation.** `conversations` between one client
and one creative profile, with append-only `messages`. The existing `inquiries`
rows migrate: each becomes a conversation, its `message` the first entry, its
`response` the second where present.

**Delivery is in-app only.** Unread state is shown as a badge in the header and
a count per conversation. Nothing is emailed or texted.

**Polling, not sockets.** A conversation open in the browser polls for new
messages. WebSockets fight Render's free-tier spin-down and are not justified at
this volume.

**Report and block ship with it, not after.** Private messaging between
strangers is a harassment surface, and there is currently no report mechanism
anywhere in the product. Shipping unmoderated private messaging first and adding
safety later is the wrong order.

**Contact reveal survives.** A creative can still surface their phone or email
inside a conversation, governed by `contactPreference`. Moving off-platform
stays a deliberate, available act rather than the only option.

## Alternatives considered

**Keep the handoff.** Cheaper, already built, honest about where deals actually
close. Rejected: the product owner wants conversations, and the argument for the
handoff was partly self-fulfilling — of course people leave for Messenger when
the alternative is a single reply box.

**Build chat only after notifications exist.** This was the recommendation, and
it was declined on priority. Recorded below as the main risk rather than
re-argued.

**WebSockets for real-time delivery.** Better experience, and wrong for a free
instance that sleeps after fifteen minutes idle. Polling degrades gracefully;
a dropped socket does not.

**Threaded replies or attachments.** Out of scope. A flat two-party thread of
text is what a commission negotiation needs.

## Consequences

**Good.** Negotiation can happen in one place. Conversation history is
attributable and moderatable, which a Messenger thread never is. Response-rate
data gets richer, feeding the client trust card in
[0005](./0005-organization-pages.md). Report and block finally exist, closing a
gap [0016](./0016-edits-never-unpublish.md) has been carrying.

**Bad, and this is the significant one.** *Without notifications, neither party
learns a message has arrived unless they visit the site.* A creative who checks
weekly replies weekly. The predictable outcome is that the first exchange
happens here and everything after it happens on Messenger — which is what the
handoff did deliberately, now happening by accident and more slowly.

Mitigations available without notifications, all of which this decision requires:

- An unread badge visible in the header on every page, not only in the inbox
- Honest copy at send time — tell the client the creative will see it next time
  they sign in, rather than implying delivery
- Surface a response-rate signal on profiles once there is data, so expectations
  are set before the message is written

None of these substitute for a notification. They make the gap visible instead
of letting it look like the product is broken.

**Also bad.** Message content is personal data under RA 10173 with no retention
policy, export path, or deletion route yet. Conversations make that obligation
larger and more urgent.

**Revisit when notifications exist.** Email is the cheap first step and is
sufficient for the client side, where institutional buyers all have addresses.
The exclusion in [0013](./0013-username-password-auth-sprint-1.md) was about
rural creatives not checking email, which is an argument against email as an
*identity anchor*, not against it as a notification channel.
