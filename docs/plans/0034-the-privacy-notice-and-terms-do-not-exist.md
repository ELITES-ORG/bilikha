# 0034. The privacy notice and terms do not exist

- **Status:** Ready — **live defect, not gated on the layout review**
- **Owner:** unassigned
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
| 1. The pages exist | 0 / 2 | Not started |
| 2. Reachable | 0 / 2 | Not started |

---

# Phase 1 — The pages exist

### Step 1.1 — Routes and components

- [ ] **Action.** `/privacy` and `/terms`, public, rendering whatever content
  the registrant supplies. If none is supplied yet, a plainly-marked holding page
  naming who to contact and when it is expected — never prose that impersonates a
  finished notice (rule 1).
- [ ] **Verify.** Both load signed out, and the registration checkbox link
  reaches the privacy page rather than the 404.

### Step 1.2 — Say what is collected

- [ ] **Action.** Whatever the final text, the privacy page has to cover what
  [constraint 7](../explanation/constraints.md) names: what is collected, what is
  published, and how to get it deleted or exported. The second of those is
  already answerable — plan 0033's profile review established exactly which
  fields are public, and that list belongs here rather than being rediscovered.

---

# Phase 2 — Reachable

### Step 2.1 — Not only from a checkbox

- [ ] **Action.** Reachable from the landing page and from the account area, not
  only mid-registration.

### Step 2.2 — Full pass

- [ ] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green. Both routes load signed out at 375px and desktop.

---

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
