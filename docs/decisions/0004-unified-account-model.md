# 0004. Unified account, creative profile as an attachable role

- **Status:** Proposed
- **Date:** 2026-09-15

## Context

Bilikha has two sides: creatives who list themselves, and clients who look for
them. The conventional marketplace pattern asks which one you are at signup and
gives each a separate account type.

In a province of 180,000 that pattern breaks down immediately. The same people
appear on both sides constantly: a graphic designer hires a photographer for
their own shoot; a festival organiser is also a folk musician; a wedding
videographer subcontracts a drone operator. Upwork's original separate-account
model is a known source of friction for exactly this reason.

There is a competing pressure. Supply is the bottleneck — the registry is
worthless without creatives in it. Any step added before a creative can register
costs registrations, and a registration drive where people must sign up, land on
an empty dashboard, then hunt for "become a creative" will bleed users at every
seam.

## Decision

One `users` table. A creative profile is an **optional attachable role**
(`creative_profiles`, 1:1 with `users`), not a separate account type.

Underneath: one account model. In the UI: **two distinct front doors** —
"Register as a Creative" and "Find a Creative". The creative door runs account
creation and profile setup as one continuous flow with no dashboard detour. The
upgrade path stays available for anyone who arrived as a browser and later wants
to list.

Sub-domains attach many-to-many via `creative_profile_subdomains`, capped at
**five** per profile with exactly **one** marked primary.

## Alternatives considered

**Separate account types.** Simpler permissions and a clearer signup question.
Rejected: produces duplicate accounts, a permanent "I signed up wrong" support
burden, and fights how this market actually behaves.

**Everyone is a creative.** Simplest model, but forces a purely institutional
buyer — an LGU information officer — into an identity that does not fit, and
pollutes the directory with non-creative profiles.

**Single-category profiles.** Cleaner search ranking. Rejected: a Biliran
videographer is genuinely also the photographer and the editor. Forcing one
category makes an already-thin directory look thinner.

## Consequences

**Good.** No account-type mistakes. Role fluidity is native. One auth path, one
session model. A browser can become a creative without migrating anything.

**Bad.** Permission checks become capability checks — "does this user have a
creative profile?" rather than "is this user a creative?" — which is slightly
more code at every authorisation point. The UI must carry two entry narratives
over one data model, so onboarding copy is written twice.

The five-sub-domain cap is a judgement call. Uncapped tagging destroys search
relevance; too low a cap misrepresents genuinely multi-skilled creatives. Five
is a starting point to revisit against real data.

**Related.** [0005](./0005-organization-pages.md) covers the third entity,
organisations, which are not a role on `users`.
