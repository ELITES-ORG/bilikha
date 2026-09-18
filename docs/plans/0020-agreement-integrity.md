# 0020. Precise agreement notifications, and a deletion guard

- **Status:** Built and gated; step 3.3 awaits a browser
- **Related:** [ADR 0032](../decisions/0032-an-accepted-agreement-is-not-deleted.md) ·
  [ADR 0030](../decisions/0030-notifications.md) ·
  [ADR 0029](../decisions/0029-work-agreements-not-invoices.md)

---

## Goal

Two defects found auditing [plan 0016](./0016-work-agreements.md), neither
large, both about the agreement feature meaning what it says.

A client cannot tell from the bell whether work was delivered and needs their
confirmation, or whether the engagement was cancelled — every lifecycle move
sends the same notification. And an accepted agreement, immutable in every other
respect, can still be deleted outright.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Six specific to this plan:

1. **Do not remove `agreement_event` from the enum.** Postgres cannot drop an
   enum value without rebuilding the type, and rows written before this plan
   still carry it. It stops being emitted and keeps its title so old rows still
   render.
2. **Notifications are for what someone must act on**
   ([ADR 0030](../decisions/0030-notifications.md)). This plan adds three types
   and *removes* one notification. Read step 1.3 before arguing with that.
3. **Tests ship in the same commit**, against a real database, using
   `backend/src/test/factories.ts`. Rule 11 of
   [plan 0016](./0016-work-agreements.md) applies here too.
4. **The deletion trigger is conditional on `accepted`.** A draft is nobody's
   evidence; do not block deleting one.
5. **Prove the trigger by attacking it in SQL**, not by trusting the migration.
   The plan 0016 audit found the gap exactly that way.
6. **Do not tick a verification step you did not run.**

---

## Scope

**In scope**
- Three precise notification types for delivery, completion and cancellation
- Removing the notification on `started`
- A database trigger refusing `DELETE` on an accepted agreement
- Tests for all of it

**Out of scope** — do not build these
- Account deletion or erasure. [ADR 0032](../decisions/0032-an-accepted-agreement-is-not-deleted.md)
  states the intended shape; building it is a separate decision with its own
  requirements
- Soft deletes, or a `deleted_at` column anywhere
- Per-user notification preferences
- Changing anything about the agreement document, its hash, or its lifecycle
  rules
- Web push. [Plan 0018](./0018-web-push.md) is deferred

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Precise notifications | 4 / 4 | Complete |
| 2. The deletion guard | 2 / 2 | Complete |
| 3. Verification | 3 / 4 | 3.3 needs a browser |

---

# Phase 1 — Precise notifications

### Step 1.1 — The enum

- [x] **Action.** Add to `notificationTypeEnum` in
  `backend/src/db/schema/notifications.ts`: `agreement_delivered`,
  `agreement_completed`, `agreement_cancelled`.
- [x] **Action.** Migration with `ALTER TYPE ... ADD VALUE`, one per statement.
  Commit the Drizzle snapshot alongside it, then `db:generate` again and confirm
  it emits nothing.
- [x] **Note.** `agreement_event` stays in the enum. Rule 1.

### Step 1.2 — Titles and recipients

- [x] **Action.** In `notifications.service.ts`, add to `TITLES`:

  | Type | Title | Told |
  |---|---|---|
  | `agreement_delivered` | Work was marked delivered — confirm to close it | the client |
  | `agreement_completed` | Your work was confirmed complete | the creative |
  | `agreement_cancelled` | A work agreement was cancelled | the other party |

- [x] **Action.** Leave `agreement_event`'s title in place for rows already
  written.
- [x] **Action.** Add the three to the agreement branch of `resolveTargets`, so
  they link to `/agreements/:id` like the rest.
- [x] **Action.** Mirror all three in
  `frontend/src/features/notifications/types.ts`.

### Step 1.3 — Emitting, and not emitting

- [x] **Action.** In `recordEvent`, replace the single `agreement_event` emit
  with a map from event type to notification type:
  `delivery_marked → agreement_delivered`,
  `completion_confirmed → agreement_completed`,
  `cancelled → agreement_cancelled`.
- [x] **Action.** `started` sends **nothing**.
- [x] **Why.** [ADR 0030](../decisions/0030-notifications.md) lists the whole
  sanctioned set and "work started" is not in it — the catch-all added a
  notification nobody decided to send. It also fails that ADR's own test:
  notifications are for what a person must act on, and a client whose work has
  started is required to do nothing. The state is on the record and in the
  History index for anyone who wants it.
- [x] **Note.** If you disagree, say so rather than quietly keeping it. This is
  a judgement about noise, and the registrant may overrule it — but it should be
  a decision, which is what the catch-all avoided being.

### Step 1.4 — Tests

- [x] **Test.** Each of the three transitions notifies the right party, with the
  right type, and not the actor.
- [x] **Test.** `started` produces no notification at all.
- [x] **Test.** A row still carrying `agreement_event` renders with its title and
  a working link. Insert one directly; this is the regression guard for rule 1.

---

# Phase 2 — The deletion guard

### Step 2.1 — The trigger

- [x] **Action.** A migration adding `prevent_accepted_agreement_deletion`, a
  `BEFORE DELETE` trigger on `agreements` that raises when `OLD.status =
  'accepted'`. Model it on `prevent_accepted_agreement_mutation` in
  `0021_agreement_freeze_triggers.sql`, including the comment block.
- [x] **Action.** The comment says what it is for and names
  [ADR 0032](../decisions/0032-an-accepted-agreement-is-not-deleted.md). Rule 5
  of that ADR's consequences: the error message alone invites deleting the
  obstacle.
- [x] **Verify.** `db:generate` after migrating produces nothing.

### Step 2.2 — What it breaks, on purpose

- [x] **Action.** Check every existing test and factory that deletes a user or a
  conversation. Any that now fail are the intended warning, not breakage to work
  around — fix the test to use a non-accepted agreement, or to expect the
  refusal.
- [x] **Note.** `backend/src/test/setup.ts` truncates rather than deleting, and
  `TRUNCATE` does not fire row triggers, so the suite's reset is unaffected.
  Confirm that rather than assuming it.

---

# Phase 3 — Verification

### Step 3.1 — The guard holds, in SQL

- [x] **Test.** Build an accepted agreement, then `DELETE` it directly. Refused.
- [x] **Test.** A `sent` agreement deletes cleanly.
- [x] **Test.** Deleting the conversation under an accepted agreement is refused
  by the cascade hitting the trigger; deleting one under a draft is not.

### Step 3.2 — The cascade path

- [x] **Test.** Deleting the *client* user of an accepted agreement is refused.
  This is the path ADR 0032 exists for — the one that reaches the agreement
  without any code mentioning agreements.

### Step 3.3 — Notifications read correctly

- [ ] **Verify.** Walk an engagement end to end and read the bell at each step.
  Delivery and cancellation must be distinguishable at a glance, which is the
  entire point of Phase 1.

### Step 3.4 — Full pass

- [x] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0, and
  CI green on the pushed commit.

---

## Acceptance

- Delivery, completion and cancellation each send their own notification, to the
  right party, and read differently in the bell.
- `started` sends nothing.
- Rows written before this plan still render.
- An accepted agreement cannot be deleted — directly, through its conversation,
  or through either party's account.
- A draft still can.
- Every one of those is a test, not a claim.

---

## Follow-ups

Not in this plan:

- **Account deletion and erasure.** ADR 0032 states the intended shape —
  retain the agreement, detach the departing party's identity — and this plan
  makes the naive version fail loudly. Building it needs its own requirements.
- Sharing types across the API boundary, which
  [ADR 0031](../decisions/0031-testing-strategy.md) names as the real answer to
  the `avatarUrl` class of bug.
- The style-guide specimen duplication and the non-monotonic dark `palayok`
  ramp, both from the plan 0014 audit.
