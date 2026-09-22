# 0034. The privacy notice and terms do not exist

- **Status:** Complete — pages live, text written from the code, **legal review outstanding**
- **Owner:** done 2026-09-22
- **Related:** [constraint 7](../explanation/constraints.md) ·
  [plan 0001](./0001-registration-and-auth.md) (where the consent checkboxes were
  built) · [plan 0033](./0033-layout-and-grouping-review.md) (where this was
  found, and which it must not wait for)

## What is wrong

Registration requires two ticks before an account can be created:

- *I have read and accept the **privacy notice***, linking to `/privacy`
- *I accept the **terms of use***

**Neither page exists.** Verified against production on 2026-09-22:
`https://bilikha.vercel.app/privacy` and `/terms` both render the 404 page.
There is no route in `App.tsx`, no page component, and no document anywhere in
the repository.

Every account on the platform was created by someone confirming they had read
two documents that cannot be read.

## Why this is not a copy fix

[Constraint 7](../explanation/constraints.md) is explicit, and it is the reason
this is filed separately rather than inside a layout review:

> **RA 10173 (Data Privacy Act) applies squarely** — explicit consent separate
> from terms, a plain-language privacy notice, per-field visibility, export and
> deletion rights, an age gate, and likely NPC registration as a personal
> information controller. **This is law**, and it does not depend on having a
> government partner.

The product already does the hard half: consent is collected separately from
terms, and it is explicit. What is missing is the document that consent refers
to. A privacy notice that does not exist cannot be read, so the consent
currently records agreement to nothing.

Related gaps found while looking, all named in the same constraint and all
absent from the codebase: **no account deletion**, **no data export**. Checked
across `backend/src/modules` — there is no endpoint for either.

## Scope

**In scope**
- A `/privacy` page and a `/terms` page that exist and render.
- Making the registration links reach them.

**Out of scope, and each needs its own decision**
- **Writing the legal content.** That is the registrant's, and likely needs
  advice. This plan puts the pages and routes in place; what they say is not an
  implementer's call.
- **Account deletion and data export.** Both are named obligations and both are
  absent. They are larger than a page each — deletion has to decide what happens
  to agreements, conversations and ratings that other people are party to.
- The age gate and NPC registration, also named in constraint 7.

## Rules for whoever executes this

1. **Do not invent legal text.** Placeholder content that reads like a privacy
   notice is worse than an obvious placeholder: it looks settled and nobody
   revisits it. If the content is not supplied, the page should say plainly that
   it is being prepared, with a date.
2. **The route must exist before the link is trusted.** The checkbox has linked
   to `/privacy` since registration was built; the defect is the missing page,
   not the link.
3. **Both pages are public and must work signed out** — someone reads them
   before they have an account, which is the entire point.
4. **They need to be reachable without registering.** A footer or a link from
   the landing page, not only from the checkbox.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The pages exist | 2 / 2 | Done |
| 2. Reachable | 2 / 2 | Done |

---

# Phase 1 — The pages exist

### Step 1.1 — Routes and components

- [x] **Action.** `/privacy` and `/terms`, public, rendering whatever content
  the registrant supplies. If none is supplied yet, a plainly-marked holding page
  naming who to contact and when it is expected — never prose that impersonates a
  finished notice (rule 1).
- [x] **Verify.** Both load signed out, and the registration checkbox link
  reaches the privacy page rather than the 404.

### Step 1.2 — Say what is collected

- [x] **Action.** Whatever the final text, the privacy page has to cover what
  [constraint 7](../explanation/constraints.md) names: what is collected, what is
  published, and how to get it deleted or exported. The second of those is
  already answerable — plan 0033's profile review established exactly which
  fields are public, and that list belongs here rather than being rediscovered.

---

# Phase 2 — Reachable

### Step 2.1 — Not only from a checkbox

- [x] **Action.** Reachable from the landing page and from the account area, not
  only mid-registration.

### Step 2.2 — Full pass

- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green. Both routes load signed out at 375px and desktop.

---

## What was actually written, and what is still owed

Rule 1 says not to invent legal text. The registrant asked for the words to be
written from what the project already does, which is a different thing, and that
is what these pages are: **every factual claim was read off the code, not
adapted from a template.**

- The collected fields are `registerSchema` in
  `backend/src/modules/auth/auth.schema.ts`, field for field.
- The published fields are the `PublicProfile` contract, and the claim that all
  four name parts appear is `formatFullName` in `profiles.service.ts`.
- The sentences saying a thing is *not* published are true because no endpoint
  returns it — checked against every `publicUrl` and profile call site.
- The cookie paragraph is the `express-session` config in `app.ts`: one cookie,
  `sameSite: 'lax'`, `httpOnly`, 30 days from `SESSION_TTL_DAYS`.
- "No analytics, no tracker" is a grep for the usual suspects across the
  frontend, which finds nothing.
- The rights section says plainly that export and deletion are **handled by
  request** rather than implying a button that does not exist.

**What is still owed, and it is not cosmetic:**

1. **A contact address.** `LEGAL_CONTACT` in `frontend/src/lib/legal.ts` is
   `null`, and both pages say the channel is being set up rather than printing
   an address that bounces. RA 10173 expects a data subject to have somewhere to
   write. Setting that constant completes both pages.
2. **Review by someone qualified.** These are accurate about the system. Whether
   they are sufficient under RA 10173 — and whether NPC registration as a
   personal information controller is required — is not an engineering question.

`CONSENT_VERSION` was deliberately **not** bumped. These documents describe what
the service has done since 2026-09-15 rather than introducing new terms, so
re-stamping every stored consent record would misstate what happened. If a
lawyer changes the substance, that is the moment to bump it and re-prompt.

## Acceptance

- `/privacy` and `/terms` render for a signed-out visitor.
- The registration consent links reach them.
- Neither page contains invented legal text presented as final.

## Follow-ups

| Item | Why deferred |
|---|---|
| Account deletion | An RA 10173 right and absent entirely. Needs a decision about agreements, conversations and ratings that other people are party to — deleting one side of a two-party record is not a delete |
| Data export | The other named right, also absent |
| Age gate, NPC registration | Named in constraint 7, neither started |
