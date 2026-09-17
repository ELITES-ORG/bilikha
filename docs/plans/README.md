# Implementation plans

Step-by-step build plans with live checklists. Each plan tracks what is done and
what remains.

These differ from the other documentation categories:

| | Purpose | Lifespan |
|---|---|---|
| [Guides](../guides/) | How to do a *recurring* task | Permanent |
| [Decisions](../decisions/) | Why we chose something | Permanent |
| **Plans** | How to build *one specific thing, once* | Until shipped |

A plan is written to be executed, including by someone — or something — with no
prior context on this codebase. When a plan is fully shipped, mark it
**Complete** and leave it. It becomes the record of how that feature was built.

---

## Writing a plan

Copy `_template.md`. Number sequentially; never renumber.

**Commits made while executing a plan carry no AI attribution** — no
`Co-Authored-By` trailer, no "generated with" footer. See
[`CLAUDE.md`](../../CLAUDE.md).

**A plan must be executable without asking questions.** That means:

- **Exact file paths.** `backend/src/modules/auth/auth.service.ts`, not "the auth
  service".
- **Complete file contents**, not fragments, wherever a file is created.
- **Exact commands**, with the directory to run them from.
- **Expected output** after each step, so the executor can tell success from
  failure without judgement.
- **One action per step.** If a step contains "and", it is probably two steps.
- **A checkbox on every step.**

Write the verification *before* the implementation where you can. A step whose
success cannot be checked is a step that will be reported done when it is not.

**State assumptions explicitly.** If a step depends on data or a decision that
does not exist yet, say so and mark the plan blocked rather than inventing it.

---

## Status values

| Status | Means |
|---|---|
| **Draft** | Being written. Do not execute |
| **Ready** | Executable now |
| **Blocked** | Cannot proceed. The blocker is named at the top |
| **In progress** | Partially executed. Checkboxes are current |
| **Complete** | Shipped and verified |

---

## Plans

| # | Plan | Status |
|---|---|---|
| [0002](./0002-deployment.md) | Deployment — Vercel, Render, Supabase | Complete |
| [0001](./0001-registration-and-auth.md) | Registration and authentication | Complete |
| [0003](./0003-admin-moderation.md) | Admin panel — registration moderation | Complete |
| [0004](./0004-client-accounts-and-inquiries.md) | Client accounts and inquiries | Complete |
| [0005](./0005-profile-editing-and-account.md) | Profile editing and the account area | Complete |
| [0007](./0007-one-account-and-creative-role.md) | One account, creative as an added role | Complete |
| [0006](./0006-conversations-and-login-gated-messaging.md) | Conversations and login-gated messaging | Complete |
| [0008](./0008-location-at-registration-and-nearby-first.md) | Location at registration, nearby-first ordering | Complete |
| [0009](./0009-bio-avatars-and-portfolio-images.md) | Bio on cards, avatars, and portfolio images | Complete |
| [0010](./0010-offers-and-an-offer-directory.md) | Offers, and a directory that indexes them | Complete |
| [0011](./0011-bottom-navigation-and-history.md) | Bottom navigation, and a history of what you inquired about | Complete |
| [0012](./0012-inquire-from-an-offer-and-saved-offers.md) | Inquire from an offer, and saved offers | Complete |
| [0013](./0013-client-postings-and-mode-mirrored-surfaces.md) | Client postings, and mode-mirrored surfaces | Complete |
| [0014](./0014-dark-mode.md) | Dark mode | Ready |
| [0015](./0015-account-hub.md) | The account hub | Complete |
| [0016](./0016-work-agreements.md) | Work agreements in the thread | Ready |

Listed in execution order, which is not numeric order — 0002 ran first, and
0007 before 0006.
