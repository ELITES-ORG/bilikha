# 0005. Public pages for organisations, private trust signals for individuals

- **Status:** Proposed
- **Date:** 2026-09-15

## Context

If creatives get public profile pages, the symmetric instinct is to give clients
them too. Two things argue against symmetry.

First, the client side is not homogeneous. Demand here is largely institutional
— LGUs, government programmes, schools, festival committees, resorts — not
individuals hiring a logo designer. Those two kinds of client have opposite
needs.

Second, a creative deciding whether to spend an hour scoping a job needs to know
the inquirer is real. That is a trust question, not a browsing question — nobody
needs to browse "clients in Biliran".

There is also a taxonomy fact: roughly a fifth of the RA 11904 sub-domains are
organisations, not people — Film Production Companies, Broadcasting Stations,
Crafts Cooperatives, Theater Companies, Gaming Studios, Art Galleries.

## Decision

Three entity shapes, not two:

- `users` — account, auth, private contact
- `creative_profiles` — optional 1:1 with a user; public
- `organizations` — public, with `organization_members` for multiple staff

**Individual clients get no public page.** They get a **private trust card**,
visible only to a creative who has received their inquiry: verification status,
member since, inquiries sent, hires completed, response rate.

**Organisations get full public pages** — verified identity, past commissioned
work, multiple members under one account.

Registration branches early on "registering yourself, or a group/business?"

## Alternatives considered

**Symmetric public profiles for everyone.** Conventional and simple. Rejected: a
public page for a private individual who hired a photographer once is a privacy
liability with no upside, and under RA 10173 it is personal data published
without a purpose that justifies it.

**No client entity at all** — inquiries carry a name and number only. Rejected:
creatives cannot tell a serious inquiry from a time-waster, and institutional
buyers cannot share an account across a team.

**Organisations as a flag on `users`.** Tempting, and wrong: an organisation has
many members, and a person may belong to several organisations. Neither fits a
boolean.

## Consequences

**Good.** Individual privacy is protected by construction. Institutional buyers
get the multi-member account they actually need. A verified "Municipality of
Caibiran" page is a legitimacy signal that makes creatives take an inquiry
seriously. A public record of LGU creative spending emerges as a civic side
effect.

**Bad.** Three entities instead of two: more schema, more authorisation paths,
and a registration flow that forks. Inquiries must be sent *as* a user or *as*
an organisation, which is an extra choice at send time. The trust card needs its
own visibility rules — visible to a recipient creative, to nobody else.

**Open.** What evidence verifies an organisation — a DTI, SEC, or CDA business
registration number, or an LGU endorsement? Verification is performed by our own
administrators; see [plan 0003](../plans/0003-admin-moderation.md).
