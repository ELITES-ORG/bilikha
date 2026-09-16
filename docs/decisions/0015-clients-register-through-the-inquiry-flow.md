# 0015. Clients register through the inquiry flow

- **Status:** Accepted
- **Date:** 2026-09-16
- **Refines:** [0004](./0004-unified-account-model.md)

> **Partly superseded by
> [0017](./0017-sign-in-before-contacting.md).** Anonymous browsing below is
> unchanged and still correct. Registration no longer happens inside the inquiry
> flow — contacting a creative now requires an existing session.

## Context

[0004](./0004-unified-account-model.md) established one account model with a
creative profile as an optional attachable role, and proposed **two front doors**
in the UI: "Register as a Creative" and "Find a Creative".

Building the creative door revealed that the second one is not a door. Finding a
creative requires no account — browsing a public directory is exactly the thing
that should work for an anonymous visitor arriving from a shared link. A
"register as a client" page would lead somewhere that offers nothing a signed-out
visitor could not already do.

Worse, it lands the friction in the wrong place. Someone who has just found a
muralist they want to hire is highly motivated; someone idly browsing is not.
Asking for an account before the first group exists, from the second group, is
how you lose both.

Demand is also thinner than it looks. The registry's value depends on inquiries
actually being sent, and every field between "I want to contact this person" and
"message sent" costs some of them.

## Decision

**Browsing is fully anonymous.** The directory and public profile pages require
no account.

**An account is required only to send an inquiry**, and registration happens
*inside* that flow rather than at a separate destination. The composed message
survives the registration step.

**Client accounts are deliberately lighter than creative accounts:**

| | Creative | Client |
|---|---|---|
| Public profile page | Yes | No — [0005](./0005-organization-pages.md) |
| Moderation | Enters `pending_review` | Active immediately |
| Sub-domains | 1–5, one primary | None |
| Municipality / barangay | Required | Optional |
| Date of birth | Required | **Required** — see below |
| Fields | ~15 | ~7 |

**Date of birth applies to both.** An earlier draft of this record excluded it
from client accounts to keep the form as short as possible. That was wrong on
two counts. `users.birth_date` is `NOT NULL`, so exempting clients would need a
migration making it nullable — and it would drop the age gate for exactly the
accounts that contract and pay for work. RA 10173 treats a minor's data
differently regardless of which side of the market they are on, so the check
belongs on every account. One date field is a cheap way to keep it.

**Municipality is optional for clients because a client need not be in Biliran.**
A Manila producer looking for Waray folk musicians, or a Cebu resort
commissioning a muralist, is demand the registry wants. The supply side is
geographically scoped; the demand side must not be.

**"Creative" is derived, not declared.** A user with a `creative_profile` is a
creative; one without is a client. No column records this. `account_type`
remains a separate axis — individual versus organisation — which is orthogonal.

## Alternatives considered

**A separate client registration page**, as 0004 implied. Rejected: it creates
accounts with nothing to do. A client who registers before having someone to
contact logs in, sees a directory they could already browse, and leaves.

**Guest inquiry with no account** — name and contact on the inquiry form.
Lowest possible friction, and genuinely tempting. Rejected because
[0013](./0013-username-password-auth-sprint-1.md) removed phone verification,
so there is nothing to stop one person sending an inquiry to every creative in
the registry. Revisit when phone verification lands — at that point an OTP-
verified guest inquiry becomes the best option available.

**Require an account to browse.** Rejected outright: discovery is the product,
and a login wall in front of it also destroys the SEO and link-sharing that
[0002](./0002-pern-with-client-rendered-spa.md) identifies as the main
distribution path.

**A dedicated client entity** rather than a plain user. Rejected: it duplicates
auth, sessions, and contact handling for a role distinguished only by the
absence of a profile.

## Consequences

**Good.** Friction sits at the point of maximum motivation. No dead-end
accounts. Anonymous browsing keeps discovery and sharing intact. **No schema
change is required** — `creative_profiles` is already an optional one-to-one
with `users`, and `PublicUser` already tolerates a null profile. Client accounts
skip moderation entirely, so the review queue stays purely creative.

**Bad.** A client cannot register ahead of time even if they want to, which is
mildly surprising behaviour for anyone who looks for a signup link. First-time
inquirers face a longer combined step — compose, then register, then send — and
the message must be preserved across it or the flow is worse than a plain form.

Two registration shapes also means two sets of validation and copy sharing one
endpoint. Kept manageable by discriminating on a `kind` field rather than
forking the endpoint.

**This partly supersedes the "two front doors" framing in
[0004](./0004-unified-account-model.md).** The unified account model there is
unchanged and correct; only the UI narrative is revised. The landing page still
offers two paths, but the second leads to the directory rather than to a
registration form.

**Revisit** when phone verification exists. OTP-verified guest inquiry would
remove the account requirement entirely for first contact, which is strictly
better than what this record decides.
