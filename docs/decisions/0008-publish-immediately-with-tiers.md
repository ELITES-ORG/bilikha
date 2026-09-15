# 0008. Publish immediately, with verification tiers

- **Status:** Proposed
- **Date:** 2026-09-15

> **Narrowed for sprint 1.** This record assumed phone verification as the spam
> floor. [0013](./0013-username-password-auth-sprint-1.md) removed it, so sprint
> 1 profiles enter at `pending_review` and are published by an administrator
> rather than on registration. The tier model below is otherwise unchanged and
> resumes when verification lands.

## Context

A registry that publishes profiles of named individuals carries reputational
risk for whoever runs it. The instinct is therefore to queue every registration
for approval before it goes live.

Against that: the registry launches empty, and its central problem is thinness.
If a registration drive produces 500 profiles that all sit invisible behind a
moderation backlog, the drive produces nothing anyone can see, momentum dies,
and the people who registered conclude it did not work.

An unverified listing still has real directory value. "There is a woodcarver in
Culaba and here is how to reach her" is useful before anyone confirms her
business registration.

## Decision

Publish immediately. Verification is a **tier**, not a gate.

| Tier | Means | How |
|---|---|---|
| Unclaimed | Imported from an existing list, not yet confirmed | CSV import |
| Registered | Phone verified | Automatic |
| Verified | Identity or business confirmed by a reviewer | Manual, through the admin panel |

Verified profiles rank above Registered in search and browse, so the incentive
to verify is structural rather than enforced.

Risk is managed at the edges rather than by a queue:

- Phone verification as the spam floor ([0007](./0007-phone-as-primary-identity.md))
- Rate limits per number
- A report button on every profile
- **Uploaded images reviewed by a human within 24h**, with fast takedown

That last point matters: images are the real risk surface, not text.

## Alternatives considered

**Review everything before publishing.** Safest, and the fallback position. Rejected as the default: it creates a backlog that
scales with success, needs staffing that may not exist, and makes a registration
drive feel like it failed.

**Publish text immediately, hold images for review.** A genuine middle ground,
and the compromise to fall back to. Rejected as default because a profile with a
pending-review placeholder where the portfolio should be looks broken, and
portfolio is most of what makes a profile useful.

**No verification at all.** Simplest. Rejected: verification is much of what a
government-backed registry offers over a Facebook group.

## Consequences

**Good.** A registration drive produces visible results the same day. The
registry looks populated at launch, especially combined with imported claimable
profiles. Moderation load scales with reports rather than with registrations.

**Bad, and it is a real risk.** Unreviewed content is publicly visible for some
window. Impersonation is possible — someone could register
as a well-known local artist — and is only caught by reports. The 24h image
review needs an actual person; unstaffed, it is a policy that exists on paper
only.

The tiers are meaningless if nobody performs verification. A registry where
every profile is stuck at "Registered" forever has a tier system that signals
nothing.

**Decided in favour of review for sprint 1.** Without phone verification there
is no spam floor, so profiles enter at `pending_review` and are published through
the admin panel — see [plan 0003](../plans/0003-admin-moderation.md). Restore
publish-on-registration when phone verification lands.

**Open.** What evidence justifies the Verified tier, and how a rejected
verification is appealed. Rejection reasons are shown to the registrant — see
[plan 0003](../plans/0003-admin-moderation.md).
