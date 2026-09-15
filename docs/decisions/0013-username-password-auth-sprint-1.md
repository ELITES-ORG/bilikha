# 0013. Username and password authentication for sprint 1

- **Status:** Accepted
- **Date:** 2026-09-15
- **Supersedes:** [0007](./0007-phone-as-primary-identity.md)

## Context

[0007](./0007-phone-as-primary-identity.md) proposed a verified mobile number as
the primary identity, with SMS OTP doing three jobs at once: authentication, the
spam floor for a registry that publishes immediately, and the mechanism for
claiming an imported profile.

That decision was never built. For sprint 1 the team has scoped external
services out entirely — no SMS gateway, no email delivery. Login is username and
password only.

This is a reasonable scoping call. An SMS gateway is a vendor relationship, a
budget line, a credential to manage, and a new dependency on the critical path
of registration. Deferring it lets registration ship without any of that.

It does, however, remove capabilities other decisions were relying on.

## Decision

**Sprint 1 authentication is username plus password.**

- `username` is the sole login identifier. Unique, case-insensitively.
- Email and phone are collected and stored but **unverified**. They are contact
  details in this sprint, not identity or recovery channels.
- Passwords hashed with argon2id.
- Sessions are server-side, stored in Postgres, carried by an httpOnly cookie.

Because the spam floor from 0007 is gone, two compensating changes apply:

1. **Creative profiles do not publish automatically.** They are created in
   `pending_review` and made public by an administrator. This narrows
   [0008](./0008-publish-immediately-with-tiers.md) for sprint 1 — see below.
2. **Auth endpoints are rate limited** per IP and per username, since there is
   no per-number cost ceiling on account creation.

## Alternatives considered

**Keep phone OTP and add the gateway now.** The stronger long-term design and
still the intended destination. Rejected for this sprint on scope: it is a
vendor integration on the critical path of the one flow being built.

**Email verification instead of SMS.** Cheaper and easier to integrate than SMS.
Rejected because it excludes a meaningful share of the intended registrants —
traditional craftsmen, folk musicians, and artisans in rural barangays often do
not have an email address they check. It would also still require a mail vendor,
which is the thing being scoped out.

**Username and password permanently, with no verified channel ever.** Rejected:
it leaves password recovery unsolvable without an administrator, and leaves the
registry with no defence against bulk fake registrations beyond rate limiting.

## Consequences

**Good.** Registration ships with no external vendor, no per-message cost, and
no third-party dependency that can block signups. The flow is fully testable
offline. Nothing here blocks adding phone verification later — `phone` is
already collected, so verification becomes a backfill plus a new flow rather
than a schema change.

**Bad, and these are real.**

- **Password recovery has no self-service path.** A user who forgets their
  password cannot recover it. Sprint 1 needs an administrator reset tool and a
  documented identity-proofing policy. This will generate support load.
- **No spam floor.** Anyone can create unlimited accounts. Rate limiting slows
  this; it does not stop a determined actor. This is why profiles no longer
  auto-publish.
- **Unverified email and phone are not trustworthy.** They must not be used for
  anything security-relevant — not password reset, not account recovery, not
  identity matching for profile claiming — until verified.
- **Profile claiming from imported lists does not work in this sprint.** It
  depended on matching a verified phone number. Import remains possible; claiming
  needs the verification flow.

**Knock-on to [0008](./0008-publish-immediately-with-tiers.md).** That record
argued for publishing immediately, and phone verification was what made it safe.
For sprint 1 the tier model still holds, but the entry tier is
`pending_review` rather than public. Revert to publish-on-registration when
phone verification lands.

**Revisit** when an SMS gateway is approved and budgeted. At that point: add
verification, enable self-service recovery, restore publish-on-registration, and
supersede this record.
