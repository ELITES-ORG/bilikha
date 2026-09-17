# 0016. Work agreements in the thread

- **Status:** Ready
- **Related:** [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) ·
  [ADR 0024](../decisions/0024-offers-attach-to-messages.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)

---

## Goal

A creative fills in a package — services with prices, start date, duration — and
sends it into the thread. The client reviews it and either requests changes or
accepts it by re-entering their password. An accepted agreement is frozen and
carries a record of who accepted it and when.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Seven specific to this plan:

1. **Never write the word "invoice" in code, copy, a route, a column or a type.**
   [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) explains why —
   it is a BIR-regulated document and this is not one. If you catch yourself
   typing it, you have drifted from the plan.
2. **Never store, log or return any password material.** The accept endpoint
   receives a password, passes it to `verifyPassword`, and lets it fall out of
   scope. It does not go in the agreement row, the acceptance row, an audit
   field, an error message or a log line.
3. **The total is never a column.** It is `sum(line_items.price_centavos)`,
   computed on read. If you find yourself adding `total_centavos`, re-read
   ADR 0029.
4. **The end date is never a column.** It is `start_date + duration_days`.
5. **Money is integer centavos**, everywhere, as with offers and postings. No
   floats, no `numeric`, no pesos in the database.
6. **An accepted agreement is immutable.** Enforce it in the service *and* with
   a database constraint. Application code alone is one forgotten branch away
   from a client's accepted terms changing under them.
7. **No payment tracking.** No deposit, no balance, no paid flag, no reminders.
   Out of scope and it stays out.

---

## Scope

**In scope**
- `agreements` and `agreement_line_items` tables; `messages.agreement_id`
- Creative composes and sends an agreement into a thread
- Client requests changes (a note back) or accepts (step-up re-auth)
- Versioning: a revision supersedes its predecessor
- Content hash, computed on read and checked on accept
- An agreement card in the thread, in three states: pending, accepted, superseded
- A full agreement view for both parties

**Out of scope** — do not build these
- Anything called an invoice, receipt, or official receipt. Rule 1
- Payments, deposits, escrow, payment status. Rule 7
- PDF export or a shareable public link
- Admin visibility beyond the existing report flow
- Clients drafting or editing agreements
- Declining outright — requesting changes covers it
- Notifications or email. Bilikha has none ([constraints](../explanation/constraints.md))

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 3 / 3 | Not started |
| 2. Service | 5 / 5 | Not started |
| 3. API | 2 / 2 | Not started |
| 4. Compose | 3 / 3 | Not started |
| 5. Review and accept | 4 / 4 | Not started |
| 6. Verification | 6 / 6 | Not started |

---

# Phase 1 — Schema

### Step 1.1 — Tables

- [ ] **Action.** Add to `backend/src/db/schema/agreements.ts`:

  `agreementStatusEnum`: `sent`, `accepted`, `superseded`, `withdrawn`.

  `agreements`:
  - `id` uuid pk
  - `conversationId` → `conversations.id`, cascade
  - `issuedByUserId` → `users.id`, restrict — always the creative
  - `version` integer, from 1
  - `supersedesId` → `agreements.id`, nullable, set null
  - `packageTitle` text not null
  - `notes` text nullable
  - `startDate` date not null
  - `durationDays` integer not null, positive
  - `status` enum, default `sent`
  - `revisionNote` text nullable — the client's words when asking for changes
  - `revisionRequestedAt` timestamptz nullable
  - `createdAt` timestamptz

  `agreementLineItems`:
  - `id` uuid pk
  - `agreementId` → `agreements.id`, cascade
  - `description` text not null
  - `priceCentavos` integer not null, non-negative
  - `sortOrder` integer not null default 0

  `agreementAcceptances`:
  - `id` uuid pk
  - `agreementId` → `agreements.id`, cascade, **unique** — one acceptance per
    agreement, enforced by the index, not by a service check
  - `acceptedByUserId` → `users.id`, restrict
  - `contentHash` text not null — SHA-256 hex of the canonical content
  - `acceptedAt` timestamptz not null default now

  Indexes: `agreements(conversation_id, created_at)`,
  `agreement_line_items(agreement_id, sort_order)`.

- [ ] **Why.** Acceptance is a separate table because it is a different kind of
  fact: the agreement is what was proposed, the acceptance is an event that
  happened to it. A unique index on `agreement_id` makes double acceptance
  impossible at the storage layer.

### Step 1.2 — The attachment column

- [ ] **Action.** Add `agreementId` to `messages` in
  `backend/src/db/schema/conversations.ts`, nullable, `references(() =>
  agreements.id, { onDelete: 'set null' })`, with an index — exactly matching
  `offerId` and `postingId`.
- [ ] **Note.** ADR 0029 fixes the line at three attachment columns. Do not add
  a fourth in this plan or any other without revisiting that decision.

### Step 1.3 — Constraints and migration

- [ ] **Action.** Add check constraints: `duration_days > 0`,
  `price_centavos >= 0`, `version > 0`.
- [ ] **Action.** Add a trigger, or a `BEFORE UPDATE` rule, that raises when a
  row whose `status` is `accepted` is updated or its line items are changed.
  Rule 6 — the service will also refuse, and this is the backstop.
- [ ] **Action.** `npm run db:generate`, then read the generated SQL before
  running it. Commit the snapshot Drizzle generates alongside the migration —
  a hand-written migration with no snapshot caused a deploy break in plan 0012.
- [ ] **Verify.** `npm run db:migrate` against a local database, then
  `npm run db:generate` again: it must produce nothing. A second migration means
  the snapshot and the schema disagree.

---

# Phase 2 — Service

New module: `backend/src/modules/agreements/`.

### Step 2.1 — Canonical content and hash

- [ ] **Action.** `canonicalContent(agreement, lineItems)` returns a
  deterministic JSON string: package title, notes, start date, duration, and the
  line items as `[description, priceCentavos]` in `sortOrder`. Keys in a fixed
  order, no whitespace, no derived values.
- [ ] **Action.** `contentHash(...)` — SHA-256 hex of that string, via `node:crypto`.
- [ ] **Why.** The hash must be reproducible from the stored rows alone. Anything
  derived — the total, the end date, a formatted price — must stay out of it, or
  a change to a formatting helper silently invalidates every acceptance.

### Step 2.2 — Issue

- [ ] **Action.** `issueAgreement(userId, conversationId, input)`. Refuses unless
  the caller is the conversation's creative. Inserts the agreement and its line
  items in one transaction, then the message carrying it.
- [ ] **Action.** `input` requires at least one line item and a package title;
  `startDate` is a date, `durationDays` a positive integer.
- [ ] **Verify.** A client calling this gets 403. A stranger gets 404, matching
  `requireParticipant`.

### Step 2.3 — Revise

- [ ] **Action.** `requestRevision(userId, agreementId, note)`. Client only.
  Valid only on a `sent` agreement. Records `revisionNote` and
  `revisionRequestedAt`; the status stays `sent`. Posts a message into the
  thread carrying the note.
- [ ] **Action.** `issueAgreement` accepts an optional `supersedesId`. When
  given, it checks the predecessor is in the same conversation and is `sent`,
  sets `version = predecessor.version + 1`, and marks the predecessor
  `superseded` in the same transaction.
- [ ] **Why.** Marking the predecessor inside the transaction is what stops two
  live versions existing. Doing it in a second statement leaves a window where
  the client can accept the one being replaced.

### Step 2.4 — Accept

- [ ] **Action.** `acceptAgreement({ userId, agreementId, password, seenHash })`:
  1. Resolve the agreement; the caller must be the conversation's client.
  2. Refuse unless `status` is `sent`.
  3. Recompute the content hash. If it differs from `seenHash`, refuse with a
     message telling the client the agreement changed and to review it again.
  4. `verifyPassword(user.passwordHash, password)`. On failure, a 401 that says
     the password was wrong and nothing about the agreement.
  5. In one transaction: insert the acceptance row with the recomputed hash, set
     `status = 'accepted'`, post a message into the thread.
- [ ] **Action.** Do the hash check *before* the password check. A client whose
  document changed should be told that, not asked for a password first.
- [ ] **Verify.** `password` appears in no log line, no error body, and no
  returned object. Grep the module for it before moving on.

### Step 2.5 — Read

- [ ] **Action.** `getAgreement(userId, agreementId)` for either participant, and
  a card loader `loadAgreementCards(ids)` matching `loadOfferCards`.
- [ ] **Action.** Both compute `totalCentavos` as the sum of line items and
  `endDate` as `startDate + durationDays`. Neither is read from a column.
- [ ] **Action.** Extend `messageAttachmentFields` to branch three ways, adding
  `agreement` and `agreementRemoved`.

---

# Phase 3 — API

### Step 3.1 — Routes

- [ ] **Action.** Mount `agreementsRouter` at `/api/v1/agreements` in
  `backend/src/routes/index.ts`, behind `requireAuth`:
  - `POST /conversations/:id/agreements` — issue
  - `GET /agreements/:id` — read
  - `POST /agreements/:id/revision` — request changes
  - `POST /agreements/:id/accept` — accept
- [ ] **Action.** Validate every id with `z.string().uuid()`. Validate line items
  with a max count — 30 is generous — and a max description length.

### Step 3.2 — Rate limiting

- [ ] **Action.** Add `agreementAcceptLimiter` to
  `backend/src/middleware/rate-limit.ts`, modelled on `passwordChangeLimiter`:
  keyed on `req.session.userId`, `skipSuccessfulRequests: true`, a handful of
  attempts per hour.
- [ ] **Why.** This endpoint takes a password. Without a limiter it is a
  password oracle that bypasses `loginLimiter` entirely.

---

# Phase 4 — Compose

### Step 4.1 — The form

- [ ] **Action.** `frontend/src/features/agreements/AgreementComposer.tsx`:
  package title, repeatable line items (description + peso input), notes, start
  date, duration in days.
- [ ] **Action.** Peso inputs use `groupPesoDigits` and `pesoInputToCentavos`
  from `@/lib/money`, as offers and postings do.
- [ ] **Action.** Show the running total and the computed end date live, both
  derived in the component. Never send either to the server.

### Step 4.2 — Where it opens

- [ ] **Action.** The creative's thread gets an action to draft an agreement. It
  is not a nested form — the composer is a sibling of the reply form, not inside
  it. A nested `<form>` silently broke Save in plan 0010.
- [ ] **Action.** On a `sent` agreement showing a revision request, the same
  composer opens prefilled from that version, and sends with `supersedesId`.

### Step 4.3 — Feedback

- [ ] **Action.** Every submit goes through `toast.run`, as all actions do.

---

# Phase 5 — Review and accept

### Step 5.1 — The card

- [ ] **Action.** An agreement card in the thread, alongside the offer and
  posting cards: package title, total, dates, and a status chip — Awaiting
  response / Accepted / Superseded. Tapping it opens the full agreement.

### Step 5.2 — The full view

- [ ] **Action.** Line items with prices, the total, start and end dates,
  duration, notes, version, and — when accepted — who accepted it and when.
- [ ] **Action.** Show the version history: "Version 2, replaces version 1."

### Step 5.3 — Accept

- [ ] **Action.** The client sees two actions: **Request changes** (a note) and
  **Accept**. Accept opens a confirmation asking for their password, carrying the
  content hash the view rendered.
- [ ] **Action.** The confirmation states plainly: this records that you agreed
  to these terms. It is not a legal signature, and Bilikha does not handle
  payment. ADR 0029.
- [ ] **Action.** Add a line of help text: Bilikha will never ask for this
  password from a link or a message. The prompt is reachable only from inside
  the thread, and saying so is what makes a phishing attempt look wrong.

### Step 5.4 — After acceptance

- [ ] **Action.** The card becomes Accepted and both action buttons disappear for
  both parties. The creative sees no edit affordance on an accepted agreement.

---

# Phase 6 — Verification

Run every check against a database that is actually up. Plan 0013 was marked
verified with Docker stopped, and shipped a broken feed.

### Step 6.1 — The happy path

- [ ] Creative issues an agreement with three line items; client opens it, sees
  the total as the sum and the end date as start plus duration; accepts with the
  correct password; card shows Accepted with their name and timestamp.

### Step 6.2 — The wrong password

- [ ] Accept with a wrong password: refused, agreement still `sent`, no
  acceptance row, and the response says nothing about the agreement.

### Step 6.3 — The changed document

- [ ] Open the accept screen, issue a superseding version from another session,
  then accept: refused on the hash check, and the client is told to review again.

### Step 6.4 — Immutability

- [ ] After acceptance, attempt to update the agreement and its line items
  directly in SQL. The database must refuse both. Then confirm the service
  refuses a second acceptance and a revision request.

### Step 6.5 — Wrong party, wrong thread

- [ ] A creative cannot accept their own agreement. A client cannot issue one. A
  third account gets 404 on every route for that agreement, not 403.

### Step 6.6 — Full pass

- [ ] `npm run typecheck`, `lint`, `build`, `docs:check` all exit 0. Grep the
  whole diff for `invoice` and for any log or response carrying `password`.
  Delete every test row created during this phase.

---

## Acceptance

- A creative can issue a priced, dated agreement into a thread they belong to.
- A client can request changes, and the creative can supersede with version 2.
- A client can accept with their password; the acceptance records who, when, and
  a hash of exactly what they saw.
- An accepted agreement cannot be changed, by the service or by SQL.
- No column stores a total or an end date. No password material is stored.
- The word "invoice" appears nowhere in the diff.

---

## Follow-ups

Not in this plan:

- A cap on open versions per conversation, if version ping-pong appears.
- PDF or print export. Wanted eventually; needs a decision about what a document
  outside Bilikha claims.
- Real invoicing, which starts with collecting a TIN and is a separate ADR.
