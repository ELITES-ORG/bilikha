# 0007. Phone number as primary identity

- **Status:** Superseded by [0013](./0013-username-password-auth-sprint-1.md)
- **Date:** 2026-09-15

> **Superseded.** Sprint 1 scoped out external services entirely; login is
> username and password. The reasoning below still stands as the intended
> destination once an SMS gateway is approved — see
> [0013](./0013-username-password-auth-sprint-1.md) for what changed and what it
> cost.

## Context

Registration needs an identity anchor that is verifiable, reachable, and
realistic for the actual registrant population.

That population includes traditional craftsmen, folk musicians, and artisans in
rural barangays. Many do not have an email address they check, or any email
address. Nearly all have a mobile number, and mobile-plus-OTP is already the
familiar pattern from GCash and every government service they have used.

Phone verification also does double duty: it is the spam floor for a registry
that publishes immediately, and it is the mechanism by which someone claims a
profile imported from a DTI spreadsheet.

## Decision

**Mobile number is the primary identity.** Verified by 6-digit SMS OTP —
5-minute expiry, 3 attempts, resend after 60 seconds.

Email is optional and secondary. Facebook may be linked after the fact, never as
the sole identity.

Sessions are long-lived (30+ days) so login OTPs stay rare.

## Alternatives considered

**Email and password.** The web default. Rejected: it excludes a meaningful
share of the intended registrants, and password reset over email is exactly the
flow those users cannot complete.

**Facebook login.** Genuinely high penetration in the Philippines and a tempting
shortcut. Rejected as primary: it yields no verified phone number, so it does
not give the spam floor or the claim mechanism; it depends on a third party's
policy for account access; and a creative who loses their Facebook account loses
their registry profile. Good as an optional link.

**Email or phone, user's choice.** Maximum flexibility, and rejected for it — two
verification paths, two recovery flows, two claim mechanisms, and an ambiguous
uniqueness constraint. One anchor is worth the rigidity.

## Consequences

**Good.** Matches how the audience already authenticates. Verified phone gives
spam resistance, profile claiming, and a reachable channel for inquiry
notifications in one field. Number collision cleanly detects a duplicate
registration and can offer login instead of an error.

**Bad.** SMS costs money — roughly PHP 0.50 per message via a local gateway.
Trivial at registration volume, but it means auth has a per-use cost and needs
rate limiting per number to prevent abuse. It adds a third-party dependency
(the SMS gateway) on the critical path of registration, so gateway downtime
blocks signups entirely.

Number changes are a real support case: someone who loses a SIM loses access,
and recovery needs a human process. Number reassignment by telcos means a
recycled number could theoretically reach someone else's account — long sessions
reduce but do not eliminate the exposure.

**Open.** Which gateway, and what the fallback is when it fails. An offline
assisted-registration path with signed consent is likely needed for registration
drives in areas with poor signal.
