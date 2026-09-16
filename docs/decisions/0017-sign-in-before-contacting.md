# 0017. Sign in before contacting a creative

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** the registration-in-flow half of
  [0015](./0015-clients-register-through-the-inquiry-flow.md)

## Context

[0015](./0015-clients-register-through-the-inquiry-flow.md) put registration
*inside* the inquiry flow: an anonymous visitor composed a message, pressed
Send, and registered in place. The reasoning was that friction belongs at the
point of motivation, and that a client account created before there is anyone to
contact is a dead end.

The product owner has asked for the opposite: contacting a creative requires an
existing account.

The implemented flow also produced a concrete defect. Registration and sending
happened in one handler, and a failure after a successful registration bounced
the user back to the account form using a stale `user` value — so they tried to
register a second time and hit `409 username already taken`. Three steps in one
transaction, each able to fail, with no clear state to return to.

## Decision

**Browsing stays fully anonymous.** The directory and public profile pages need
no account. That half of
[0015](./0015-clients-register-through-the-inquiry-flow.md) is unchanged and
still correct.

**Contacting requires a session.** A signed-out visitor pressing Contact is sent
to sign in or register, with a return path back to the profile they came from.

**The composed draft survives the detour.** They may write before signing in;
the draft is restored when they return. Losing it would make this strictly worse
than the flow it replaces.

Client registration keeps the short form and the `kind: 'client'` discriminator
— only *where* it happens changes, not *what* it collects.

## Alternatives considered

**Keep registration inline, fix the bug.** The defect is a stale closure, not an
architectural flaw, and could be fixed in a line. Rejected because the product
owner asked for the login wall; the bug fix is a side benefit, not the reason.

**Require an account to browse as well.** Rejected, emphatically. Discovery is
the product, and a login wall in front of the directory also destroys the
link-sharing and SEO that [0002](./0002-pern-with-client-rendered-spa.md)
identifies as the main distribution path.

**Let people compose, then force sign-in, then auto-send.** This is what the old
flow did, and where the bug lived. Composing before authenticating is retained;
*automatically* sending afterwards is not. The user presses Send once they are
back, so there is always one clear action and one clear failure point.

## Consequences

**Good.** One responsibility per step. A failure during sign-in returns the user
to sign-in, not to a half-finished registration. The compose–register–send
handler disappears, and the stale-state bug with it. Every message now comes
from an account that existed before the conversation started, which matters more
once messaging is a conversation rather than a single send
([0018](./0018-conversations-replace-one-shot-inquiries.md)).

**Bad, and [0015](./0015-clients-register-through-the-inquiry-flow.md) predicted
it.** Friction moves earlier, to before the person is invested. Some visitors
will not create an account to send one message, and in a market this thin every
lost inquiry is material. There is no way to measure what this costs, because
the people it deters leave no record.

**Watch for.** If inquiry volume stays near zero, this decision is one of the
few plausible causes and is cheap to reverse — the client registration form and
the `kind` discriminator both survive intact.
