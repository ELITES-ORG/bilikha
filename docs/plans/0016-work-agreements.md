# 0016. Work agreements in the thread

- **Status:** Ready
- **Related:** [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) ·
  [ADR 0024](../decisions/0024-offers-attach-to-messages.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [plan 0017](./0017-notification-centre.md), which runs first

---

## Goal

A creative fills in a package — services with prices, start date, duration — and
sends it into the thread. The client reviews it and either requests changes or
accepts it by re-entering their password. An accepted agreement is frozen and
carries a record of who accepted it and when.

From there the engagement has a lifecycle both sides can follow — Agreed, In
progress, Awaiting confirmation, Completed, or Cancelled — where every move is
made by a person, not by the calendar.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Ten specific to this plan:

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
8. **No status changes without a person.** Every lifecycle transition is an
   explicit act by a named user, stored as an event with their id and a
   timestamp. Nothing moves because a date passed — a date arriving is not an
   event. If you write code that sets a status from `now()`, you have broken the
   feature's only claim to being trustworthy.
9. **The current state is derived from the newest event, never stored.** No
   `current_status` column on `agreements`. Rule 3 and rule 4 are the same rule
   as this one.
10. **The document freeze and the lifecycle are separate.** An accepted
    agreement's row never changes again. Everything that happens afterwards is a
    new event row. If you find yourself needing to update an accepted agreement
    to record progress, you have merged two things that ADR 0029 separates.

---

## Scope

**In scope**
- `agreements` and `agreement_line_items` tables; `messages.agreement_id`
- Creative composes and sends an agreement into a thread
- Client requests changes (a note back) or accepts (step-up re-auth)
- Versioning: a revision supersedes its predecessor
- Content hash, computed on read and checked on accept
- An agreement card in the thread, in three states: pending, accepted, superseded
- The engagement lifecycle — Agreed, In progress, Awaiting confirmation,
  Completed, Cancelled — as append-only events
- A permalink at `/agreements/:id` — the record, with its full timeline
- An index as a third History segment, mirrored by mode

**Out of scope** — do not build these
- Anything called an invoice, receipt, or official receipt. Rule 1
- Payments, deposits, escrow, payment status. Rule 7
- A stored current-status column. It is derived from events. Rule 9
- A fifth bottom-nav item. The index is a History segment
- PDF export or a shareable public link
- Admin visibility beyond the existing report flow
- Clients drafting or editing agreements
- Declining outright — requesting changes covers it
- Email or SMS of any kind. [ADR 0030](../decisions/0030-notifications.md)
- The notification plumbing itself — [plan 0017](./0017-notification-centre.md)
  runs first and owns it. This plan only emits through its `notify()`

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 3 / 3 | Not started |
| 2. Service | 6 / 6 | Not started |
| 3. API | 2 / 2 | Not started |
| 4. Compose | 3 / 3 | Not started |
| 5. Review and accept | 4 / 4 | Not started |
| 6. The record and the index | 5 / 5 | Not started |
| 7. Verification | 10 / 10 | Not started |

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

  `agreementEventTypeEnum`: `started`, `delivery_marked`, `completion_confirmed`,
  `cancelled`.

  `agreementEvents` — append-only, never updated, never deleted:
  - `id` uuid pk
  - `agreementId` → `agreements.id`, cascade
  - `actorUserId` → `users.id`, restrict — who did it
  - `type` enum
  - `note` text nullable — required by the service for `cancelled`
  - `createdAt` timestamptz not null default now

  Indexes: `agreements(conversation_id, created_at)`,
  `agreement_line_items(agreement_id, sort_order)`,
  `agreement_events(agreement_id, created_at)`.

- [ ] **Why.** Acceptance is a separate table because it is a different kind of
  fact: the agreement is what was proposed, the acceptance is an event that
  happened to it. A unique index on `agreement_id` makes double acceptance
  impossible at the storage layer.
- [ ] **Why.** The events table exists because an accepted agreement is frozen
  (rule 6) and its engagement keeps moving (rule 10). Those cannot be the same
  row. It carries `actor_user_id` on every row because rule 8 means no state ever
  arrives without a person attached to it.
- [ ] **Note.** There is no `current_status` column anywhere. Rule 9.

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
- [ ] **Action.** Every read also returns the derived lifecycle state from
  Step 2.6, with the timestamp and actor of the event that set it.

### Step 2.6 — The lifecycle

- [ ] **Action.** `deriveState(agreement, events)` — a pure function, no database
  access, so it can be reasoned about and reused by the list and the record:

  | Condition | State shown |
  |---|---|
  | `status = 'sent'` | Awaiting response |
  | `status = 'superseded'` or `'withdrawn'` | that word |
  | accepted, no events | Agreed |
  | newest event `started` | In progress |
  | newest event `delivery_marked` | Awaiting confirmation |
  | newest event `completion_confirmed` | Completed |
  | newest event `cancelled` | Cancelled |

- [ ] **Action.** `recordEvent({ userId, agreementId, type, note })` validates
  the transition before inserting. The rules, all enforced server-side:
  - Nothing may be recorded unless the agreement is `accepted`.
  - `started` — creative only, from Agreed.
  - `delivery_marked` — creative only, from In progress.
  - `completion_confirmed` — **client only**, from Awaiting confirmation. The
    creative cannot complete their own work. ADR 0029.
  - `cancelled` — either party, from any non-terminal state, `note` required.
  - Completed and Cancelled are terminal: nothing may follow them.
- [ ] **Action.** Insert the event and post a message into the thread in one
  transaction, so the conversation shows the move.
- [ ] **Action.** Emit a notification to the *other* party through `notify()`
  from [plan 0017](./0017-notification-centre.md), adding the agreement types to
  its enum. It never throws and never fails the transition.
- [ ] **Action.** Take `pg_advisory_xact_lock(hashtext(agreementId))` before
  reading the newest event and inserting. Without it two taps race, both read the
  same newest event, and both insert — the same count-then-insert problem offers
  already solve this way.
- [ ] **Verify.** No code path anywhere sets a state from `now()` or from
  `startDate`. Rule 8. Grep the module for `new Date()` and check every hit is a
  timestamp being written, never a state being decided.

### Step 3.1 — Routes

- [ ] **Action.** Mount `agreementsRouter` at `/api/v1/agreements` in
  `backend/src/routes/index.ts`, behind `requireAuth`:
  - `POST /conversations/:id/agreements` — issue
  - `GET /agreements/:id` — read
  - `POST /agreements/:id/revision` — request changes
  - `POST /agreements/:id/accept` — accept
  - `POST /agreements/:id/events` — a lifecycle transition, body `{ type, note? }`
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

### Step 5.2 — Opening the record

- [ ] **Action.** The card links to `/agreements/:id`, built in Phase 6. There is
  no second full-agreement view inside the thread — one record, one address.
- [ ] **Why.** Two renderings of the same document drift, and the one people
  screenshot is whichever they happened to open.

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

# Phase 6 — The record and the index

### Step 6.1 — The record page

- [ ] **Action.** `/agreements/:id`, guarded, participants only — a non-party
  gets the 404 that `getAgreement` already returns, not a 403.
- [ ] **Action.** It renders the document: package title, line items with
  prices, the computed total, start date, computed end date, duration, notes,
  and which version it is.
- [ ] **Action.** A link back to the conversation it belongs to.

### Step 6.2 — The timeline

- [ ] **Action.** Below the document, every event in order, each with its
  timestamp:
  - Issued by <creative>, version N
  - Changes requested by <client> — with the note
  - Superseded by version N+1 — linking to it
  - Accepted by <client>
- [ ] **Action.** On an accepted agreement, show the acceptance: who, the exact
  timestamp, and the first 12 characters of the content hash, labelled as a
  fingerprint of the accepted terms.
- [ ] **Why.** This is the whole point of the feature. "Who agreed to what, and
  when" has to be answerable on one screen without reading the thread.
- [ ] **Action.** Every earlier version stays reachable through the chain. A
  superseded version renders with a banner saying so and a link forward.
- [ ] **Action.** Lifecycle events appear in the same timeline as the document
  events, in one list ordered by time — started, delivery marked, completion
  confirmed, cancelled with its reason. Each names its actor.

### Step 6.3 — The lifecycle actions

- [ ] **Action.** On the record page, show only the action the current state and
  the viewer's side allow:
  - Agreed, creative → **Mark as started**
  - In progress, creative → **Mark work delivered**
  - Awaiting confirmation, client → **Confirm completion**
  - Any non-terminal state, either → **Cancel**, with a required reason
- [ ] **Action.** Awaiting confirmation shows the creative a plain line: waiting
  for the client to confirm. Not a button they can press. ADR 0029.
- [ ] **Action.** No password on any of these. Only acceptance takes one.
- [ ] **Action.** Every state on screen carries when it was set and by whom —
  "In progress · marked by Ana, 3 Oct". A four-month-old state must read as old,
  not as current.
- [ ] **Action.** Everything goes through `toast.run`.

### Step 6.4 — The index

- [ ] **Action.** Add `agreements` as a third segment in `HistoryPage`, beside
  `inquired` and `saved`, following the existing `HistorySegment` type, the
  `?segment=` param and the `role="tablist"` markup already there.
- [ ] **Action.** Mirror by mode, as that page already does: in *I'm for hire* it
  lists agreements the creative issued; in *I'm hiring* it lists agreements the
  client received. Write the empty states in the same voice as the ones there,
  including the "you are viewing…" hint that points at the other mode.
- [ ] **Action.** Each row: the other party, package title, total, status chip,
  and a schedule line derived from the dates only — "Starts 3 Oct", "Ended
  14 Nov". Rule 8.
- [ ] **Action.** Sort awaiting-response first, then by start date.

### Step 6.5 — The backend for it

- [ ] **Action.** `listAgreements(userId, mode)` in the agreements service,
  returning rows for whichever side the mode names. It filters on the caller
  being a participant, not on a slug or a profile.
- [ ] **Action.** `GET /api/v1/agreements?mode=` behind `requireAuth`.
- [ ] **Verify.** The list query joins `users` and filters `status = 'active'`
  where it reads the *other* party, per
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) — a
  suspended counterparty's name must not surface here. The agreement itself
  stays; it is a record of something that happened.

---

# Phase 7 — Verification

Run every check against a database that is actually up. Plan 0013 was marked
verified with Docker stopped, and shipped a broken feed.

### Step 7.1 — The happy path

- [ ] Creative issues an agreement with three line items; client opens it, sees
  the total as the sum and the end date as start plus duration; accepts with the
  correct password; card shows Accepted with their name and timestamp.

### Step 7.2 — The wrong password

- [ ] Accept with a wrong password: refused, agreement still `sent`, no
  acceptance row, and the response says nothing about the agreement.

### Step 7.3 — The changed document

- [ ] Open the accept screen, issue a superseding version from another session,
  then accept: refused on the hash check, and the client is told to review again.

### Step 7.4 — Immutability

- [ ] After acceptance, attempt to update the agreement and its line items
  directly in SQL. The database must refuse both. Then confirm the service
  refuses a second acceptance and a revision request.

### Step 7.5 — Wrong party, wrong thread

- [ ] A creative cannot accept their own agreement. A client cannot issue one. A
  third account gets 404 on every route for that agreement, not 403.

### Step 7.6 — The lifecycle, in order

- [ ] Accept an agreement, then walk it: creative marks started, creative marks
  delivered, client confirms completion. Each state shows the actor and the
  timestamp of the event that set it, and each posts a message into the thread.

### Step 7.7 — The lifecycle, against the rules

- [ ] The creative cannot confirm completion of their own work — refused
  server-side, not merely hidden in the UI.
- [ ] The client cannot mark started or delivered.
- [ ] Nothing can be recorded against an agreement that is still `sent`.
- [ ] Nothing can follow Completed or Cancelled.
- [ ] Cancelling without a reason is refused.
- [ ] Fire two transitions concurrently against one agreement; exactly one
  lands. Without the advisory lock both do.
- [ ] Wind a local agreement's `start_date` into the past and confirm the state
  does not move on its own. Rule 8 — this is the check that the feature means
  what it says.

### Step 7.8 — The record page

- [ ] Open `/agreements/:id` as each party: the document, the timeline and the
  acceptance fingerprint all render. Open it as a third account: 404. Follow the
  chain from a superseded version to its replacement and back.

### Step 7.9 — The index, both modes

- [ ] With one account holding agreements on both sides, switch modes: *I'm for
  hire* lists what it issued, *I'm hiring* lists what it received, and neither
  shows the other's rows. Check both empty states.
- [ ] Suspend a counterparty and confirm their name no longer surfaces in the
  other party's index, while the agreement itself remains. Reinstate and confirm
  it comes back. ADR 0028.

### Step 7.10 — Full pass

- [ ] `npm run typecheck`, `lint`, `build`, `docs:check` all exit 0. Grep the
  whole diff for `invoice`, for any log or response carrying `password`, and for
  any place a state is decided from a date rather than an event. Delete every
  test row created during this phase.

---

## Acceptance

- A creative can issue a priced, dated agreement into a thread they belong to.
- A client can request changes, and the creative can supersede with version 2.
- A client can accept with their password; the acceptance records who, when, and
  a hash of exactly what they saw.
- An accepted agreement cannot be changed, by the service or by SQL.
- Either party can open `/agreements/:id` and answer "who agreed to what, and
  when" from one screen, without reading the thread.
- Both parties have an index of their agreements in History, mirrored by mode.
- An engagement moves Agreed → In progress → Awaiting confirmation → Completed,
  or Cancelled from anywhere, and every move names who made it and when.
- The creative cannot confirm completion of their own work.
- No column stores a total, an end date, or a current status.
- No password material is stored, and no state changes without a person.
- The word "invoice" appears nowhere in the diff.

---

## Follow-ups

Not in this plan:

- A cap on open versions per conversation, if version ping-pong appears.
- PDF or print export. Wanted eventually; needs a decision about what a document
  outside Bilikha claims.
- Real invoicing, which starts with collecting a TIN and is a separate ADR.
