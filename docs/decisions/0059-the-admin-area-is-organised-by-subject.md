# 0059. The admin area is organised by what is being decided

- **Status:** Accepted
- **Date:** 2026-10-12
- **Amends:** [0035](./0035-the-admin-area-is-a-layout.md) — which sections
  there are, and how the navigation groups them
- **Related:** [0058](./0058-content-waits-for-approval-beside-what-is-public.md) ·
  [0057](./0057-new-accounts-are-verified-with-a-biliran-id.md) ·
  [plan 0056](../plans/0056-admin-by-subject.md)

## Context

The admin sections grew one at a time, each named after whatever had just been
built:

| Section | What it actually held |
|---|---|
| Review queue | Creative profiles, new and edited |
| Organisations | Organisation pages |
| Media, then "Offers & photos" | New offers, offer changes, profile photos **and** organisation logos |
| Accounts | A lookup tool, plus suspend, reinstate, reset password |
| Ratings | Reported ratings |
| Taxonomy | Domains and sub-domains |

"Media" was organised by how things are stored (they are images) rather than by
what an administrator decides about. An organisation's logo was reviewed in a
different section from the organisation. A creative's photo was in a different
section from the creative. "Review queue" didn't say what it reviewed. To find
anything, an administrator had to learn the system first. The product owner
asked for an admin area that is hard to use wrongly.

## Decision

**Each section is one subject, and every decision about that subject is made
there.**

| Group | Section | Holds |
|---|---|---|
| Needs your decision | **Creatives** | New profiles, edits to published ones |
| | **Offers** | New offers; changes to published ones (two tabs) |
| | **Organisations** | Pages by state, and a **Logos** tab |
| | **People** | New profile photos — clients' and creatives' alike. ID checks join it in plan 0053 Phase 3 |
| | **Reports** | Reported ratings |
| Manage | **Find an account** | Lookup; suspend, reinstate, reset a password |
| | **Taxonomy** | Domains and sub-domains |

**The navigation separates work from tools.** The first group is what waits for
a decision; the second is the tools an administrator reaches for on purpose.

**Every section of work carries a count of what waits in it**, from one
endpoint, `GET /admin/summary`. A section with nothing waiting shows no badge,
so the sidebar alone answers "is there anything to do?". The counts refresh
after any admin decision, so they stay true without each page having to report
back.

**A decision is worded the same wherever it is made: Approve, and Reject with
a reason the owner sees.** Offers, profile photos and logos share one card. A
creative profile and an organisation page use the same two words. An edit to a
published profile or page is approved with **Approve edit**, and a page that was
rejected sits under a **Rejected** tab. "Ask for changes", "Acknowledge" and
"Changes asked" are gone. Each section shows its own part of the queue
(`GET /admin/media?kind=…`).

**Old addresses keep working.** `/admin` opens Creatives, `/admin/media` leads
to Offers, and `/admin/ratings` leads to Reports.

## Alternatives considered

**Profile photos under Creatives**, beside the profile they appear on. Rejected
by the product owner: clients have photos too and no creative profile, and the
photo is a question about the person — the same question an ID check asks.

**One combined inbox of everything waiting.** Simple to build, and it shows the
total work. Rejected as the main view: it mixes unlike decisions, so every item
has to say what it is before it can be judged. The sidebar counts give the total
at a glance instead.

**Keep the sections and rename them.** Rejected: the confusion was where things
lived, not what the sections were called.

## Consequences

**A new kind of review has an obvious home.** It goes under the subject it
decides about. ID checks go under People.

**Reports covers only ratings for now.** It is named for what it will hold;
another kind of report joins it rather than getting a section of its own.

**A report is the exception to Approve and Reject.** It asks whether a rating
stands, so its answers stay "Dismiss, leave the rating" and "Remove the rating".

**A creative profile shows only the approve its state allows.** An edited,
published profile shows **Approve edit**. Approving it again would have left it
in the Edited queue, which was a trap. A published profile with nothing waiting
shows no approve at all.
