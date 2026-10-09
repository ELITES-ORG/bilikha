# 0051. Organisations as teams of creatives

- **Status:** Blocked
- **Owner:** userMarcPaul
- **Related:** [ADR 0054](../decisions/0054-organisations-are-teams-of-creatives.md) ·
  [ADR 0005](../decisions/0005-organization-pages.md) ·
  [ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md) ·
  [ADR 0016](../decisions/0016-edits-never-unpublish.md) ·
  [ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #25](https://github.com/ELITES-ORG/bilikha/issues/25)

## Goal

A creative with a published profile can found an organisation, invite other
creatives into it, and have the team appear as one reviewed, public page in the
directory. Nobody signs in as an organisation; nobody is listed without
accepting.

## Blockers

**[ADR 0054](../decisions/0054-organisations-are-teams-of-creatives.md) is
`Proposed`, not `Accepted`.** It is merged, and it answers all three questions
issue #25 left open, but in this repository merging an ADR and accepting it are
separate acts: ADR 0005 sat merged as Proposed from 2026-09-15 until PR #58
accepted it on 2026-10-08, and that pull request changed nothing but the status
line. Only reyxdz accepts
([ADR 0043](../decisions/0043-only-reyxdz-merges-and-releases.md)).

Phase 1 writes tables. A migration against real personal data is the single
most expensive thing here to get wrong, so no step below runs until the status
line reads Accepted.

**Verify:**

```bash
grep -m1 'Status' docs/decisions/0054-organisations-are-teams-of-creatives.md
```

Three details in ADR 0054 are worth confirming at the same time, because each
one changes a column rather than a screen:

1. **Is the seven-day invitation expiry a decision or a placeholder?** It sets
   `expires_at` semantics and whether expiry is a stored state or computed.
2. **Does the five-organisation cap per person count invitations, or only
   accepted memberships?** The difference is whether a pending invitation
   consumes a slot.
3. **Does a rejected organisation page block the founder from founding
   another?** Nothing says, and the review queue will meet this on day one.

## Rules for whoever executes this

- **Read [ADR 0054](../decisions/0054-organisations-are-teams-of-creatives.md)
  first.** Especially the roles section: three roles, exactly one founder, and
  a founder who cannot leave without handing over.
- **An organisation is not an account type.** `users.account_type` is not used
  for it and becomes dead; do not reach for it.
- Model the page on `creative_profiles` — slug, status, review, the
  `editedSinceReviewAt` pattern from [ADR 0016](../decisions/0016-edits-never-unpublish.md).
  The admin queue already knows that shape.
- **Backend relative imports end in `.js`.** Tokens only in the UI.
- Four pull requests, one per phase. Each leaves the app working.

## Prerequisites

- [x] Branch cut fresh from `origin/main` ([ADR 0052](../decisions/0052-pull-requests-merge-by-squash-only.md)).
- [ ] ADR 0054 Accepted, and the three questions above answered.
- [ ] Database running and current: `npm run db:up && npm --prefix backend run db:migrate && npm --prefix backend run db:seed`.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Data model | 0 / 5 | Blocked |
| 2. Founding and review | 0 / 4 | Blocked |
| 3. Membership and invitations | 0 / 5 | Blocked |
| 4. The public page | 0 / 4 | Blocked |
| 5. Documentation | 0 / 3 | Blocked |

---

## Phase 1 — Data model

**PR 1.** Tables and migration only; nothing reads them yet.

### Step 1.1 — `organizations`

- [ ] **Action.** Create `backend/src/db/schema/organizations.ts`. Mirror
      `creative_profiles`: `id`, `slug` (unique, permanent — it is a public URL,
      the rule [ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)
      sets for the taxonomy applies for the same reason), `name`, `bio`,
      `logoKey`, `municipalityId`, `status` reusing `profileStatusEnum`,
      `rejectionReason`, `reviewedAt`, `reviewedBy`, `editedSinceReviewAt`,
      timestamps. No `userId` — the founder is a membership row, not a column,
      so the handover rule has one place to write.
- [ ] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.2 — `organization_members`

- [ ] **Action.** In the same file: `organizationId`, `userId`, a
      `organizationRoleEnum` of `founder | co_founder | member`, free-text
      `title`, `joinedAt`. Unique on `(organizationId, userId)`. A **partial
      unique index** on `organizationId` where `role = 'founder'` — exactly one
      founder is an invariant the database should hold, not a service rule
      somebody can forget.
- [ ] **Verify.** The generated SQL contains that partial unique index.

### Step 1.3 — `organization_invitations`

- [ ] **Action.** `organizationId`, `invitedUserId`, `invitedBy`, `role` (the
      role they are invited into), `title`, `createdAt`, `expiresAt`,
      `acceptedAt`, `declinedAt`. Unique on `(organizationId, invitedUserId)`
      where unanswered, so one pending invitation per person per organisation.
- [ ] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.4 — `organization_subdomains`

- [ ] **Action.** Join table to `creative_subdomains`, `onDelete: 'restrict'`
      as the profile one is, with `isPrimary`. The caps — one or two domains,
      five sub-domains — are service rules, not constraints; record that in a
      comment so nobody adds a check constraint that fights an admin fixing
      data.
- [ ] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.5 — Generate, read and apply the migration

- [ ] **Action.** `npm --prefix backend run db:generate`, read the SQL line by
      line, then `npm --prefix backend run db:migrate`.
- [ ] **Verify.** Four `CREATE TABLE`, two `CREATE TYPE`, the partial unique
      indexes. **No `DROP`** — `users.account_type` is dead but is not dropped
      here; that is its own change, after nothing references it.

---

## Phase 2 — Founding and review

**PR 2.** A creative can found one; an admin reviews it.

### Step 2.1 — The service

- [ ] **Action.** `backend/src/modules/organizations/organizations.service.ts`.
      `foundOrganization` refuses an account with no **published** creative
      profile, refuses a sixth organisation, creates the row at
      `pending_review`, and writes the founder membership **in the same
      transaction** — an organisation without a founder must never exist, not
      even briefly.
- [ ] **Verify.** Tests in step 2.4.

### Step 2.2 — Routes and contracts

- [ ] **Action.** `POST /api/v1/organizations`, `GET /api/v1/organizations/:slug`,
      `PATCH /api/v1/organizations/:slug`. Shapes in
      `backend/src/contracts/organizations.ts` ([ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)).
      An edit to a published page sets `editedSinceReviewAt` rather than
      unpublishing ([ADR 0016](../decisions/0016-edits-never-unpublish.md)).
- [ ] **Verify.** Signed out, `POST` returns 401.

### Step 2.3 — The admin queue

- [ ] **Action.** Organisations join the existing review queue rather than
      getting a second one. Extend `moderationActionEnum` with the
      organisation actions and `moderation_actions` with a nullable
      `organization_id`.
- [ ] **Verify.** Approving publishes the page and writes an audit row.

### Step 2.4 — Test it

- [ ] **Action.** `organizations.test.ts`: founding without a published profile
      is refused; the founder row is created atomically; a sixth is refused;
      the slug is unique; an edit after publication flags rather than
      unpublishes.
- [ ] **Verify.** `npm --prefix backend run test` passes.

---

## Phase 3 — Membership and invitations

**PR 3.** The part with the consent rule in it.

### Step 3.1 — Invite

- [ ] **Action.** `POST /api/v1/organizations/:slug/invitations` — founder or
      co-founder, by username. Only a founder may invite a co-founder. The
      invitee must have a published profile. Expires seven days out.
- [ ] **Verify.** A co-founder inviting a co-founder is refused.

### Step 3.2 — Accept and decline

- [ ] **Action.** `POST .../invitations/:id/accept` and `/decline`, invitee
      only. **Acceptance is what creates the membership row** — nobody is
      listed on a public page without it (RA 10173, constraint 7).
- [ ] **Verify.** An expired invitation cannot be accepted, and the person
      stays off the page.

### Step 3.3 — Leave and remove

- [ ] **Action.** A member leaves; a founder or co-founder removes a member; a
      founder removes a co-founder. Removal deletes the membership, so the
      person simply stops being listed.
- [ ] **Verify.** Tests.

### Step 3.4 — Handover, and the deletion precondition

- [ ] **Action.** `POST .../founder` hands the role to an existing member in
      one transaction. Account deletion refuses a founder whose organisation
      has anyone else in it, **with a message naming the organisations and
      what to do** — ADR 0054 is explicit that the flow must explain rather
      than refuse.
- [ ] **Verify.** A lone founder deleting their account closes the
      organisation; a founder with one member is stopped and told why.

### Step 3.5 — Notifications

- [ ] **Action.** An invitation and its acceptance both notify, through the
      existing notification centre.
- [ ] **Verify.** `npm --prefix backend run test` passes.

---

## Phase 4 — The public page

**PR 4.** Needs screenshots; `pr-audit` requires them for a `.tsx` change.

### Step 4.1 — The page

- [ ] **Action.** `/organizations/:slug` — name, logo, bio, domains,
      municipality, members with titles linking to their profiles. Built from
      existing primitives, tokens only.
- [ ] **Verify.** 320, 375 and 1280 wide, light and dark, no sideways scroll.

### Step 4.2 — Found and manage

- [ ] **Action.** Founding form, and a manage screen for the founder and
      co-founders: edit, invite, remove, hand over.
- [ ] **Verify.** A member sees neither.

### Step 4.3 — Invitations in the account hub

- [ ] **Action.** Pending invitations with accept and decline, and the
      organisations a person belongs to.
- [ ] **Verify.** The empty state says something useful (constraint 1).

### Step 4.4 — The directory

- [ ] **Action.** Organisations appear alongside creatives, labelled so the
      difference is visible.
- [ ] **Verify.** `npm run check:bundle` — the budget does not move.

---

## Phase 5 — Documentation

### Step 5.1 — Data model and API

- [ ] **Action.** The four tables in `docs/reference/data-model.md`; the
      endpoints in `docs/reference/api.md`.
- [ ] **Verify.** `npm run docs:check` passes.

### Step 5.2 — The README

- [ ] **Action.** Organisation accounts move out of "Not built".
- [ ] **Verify.** `grep -n "organisation" README.md` reads true.

### Step 5.3 — Close the loop on `account_type`

- [ ] **Action.** ADR 0054 says `users.account_type` becomes dead. Confirm
      nothing reads it and open a follow-up to drop it; do **not** drop it in
      this plan.
- [ ] **Verify.** `grep -rn "accountType" backend/src frontend/src` returns
      only the schema definition.

---

## Acceptance

- [ ] A creative with a published profile founds an organisation; it enters
      review and is not public until approved.
- [ ] An invited creative appears on the page only after accepting.
- [ ] An invitation expires after seven days and can be sent again.
- [ ] An organisation always has exactly one founder, enforced by the database.
- [ ] A founder cannot delete their account while anyone else is in the team,
      and is told which organisations and what to do.
- [ ] A client contacting the organisation reaches the founder in an ordinary
      conversation.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check` and
      `npm run check:bundle` pass, budget unchanged.

## Follow-ups

- **Acting as an organisation** — messaging, posting offers, signing
  agreements. ADR 0054 defers these and says they get their own decision. The
  founder is a bottleneck until then, which is the known cost.
- **Client organisations** — LGUs and schools, the original framing of issue
  #25 and of ADR 0005. Deferred by ADR 0054 on the grounds that impersonating
  "Municipality of Naval" needs a higher verification bar than impersonating a
  studio. **Issue #25's title still describes this**, so the issue is only
  partly closed by this plan.
- **Dropping `users.account_type`** once nothing reads it.
- **Sharing a client's message with co-founders**, which ADR 0054 calls the
  likely next step.
