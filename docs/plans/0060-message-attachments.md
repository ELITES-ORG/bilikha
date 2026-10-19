# 0060. Attachments in messages

- **Status:** Ready
- **Owner:** userMarcPaul
- **Related:** [ADR 0060](../decisions/0060-message-files-are-private-and-photos-audio-video-expire.md) ·
  [ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md) ·
  [plan 0057](./0057-upload-pipeline-and-offer-media.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #66](https://github.com/ELITES-ORG/bilikha/issues/66)

## Goal

Either person in a conversation can attach up to five photos, audio clips,
videos or PDFs to a message. Files live in private buckets and are read only by
the two participants through short-lived URLs. Photos, audio and video stop
opening at exactly 30 days, with notice to both people three days before; PDFs
are kept. Nothing larger than a thumbnail downloads until someone taps it.

## Scope

**In scope** — everything in #66's "What to build" and "Verify".

**Out of scope** — and where it is handled instead
- Supabase Pro and the production switch — rollout, phase 6, reyxdz.
- Deleting a single message — there is no such feature; files go with their
  conversation (`ON DELETE CASCADE`) and `media:prune` finds the objects.
- Account deletion — there is no such feature either.
- Message files in the admin report view — nowhere: no administrator opens a
  message file, not even through a report (ADR 0060, amended 2026-10-19).

## Rules for whoever executes this

1. **Do not build on ADR 0060 until reyxdz has accepted it.** This plan is a
   Draft until then.
2. **Each phase is one pull request into `main`,** in order, each merged
   before the next branch is cut from `main` (ADR 0052).
3. **Reuse the pipeline.** `media.limits.ts`, `issueUploadTicket`,
   `verifyReservation`, `consumeReservation`, the browser's `checks`, `probe`,
   PUT and TUS transports. Generalise them for a second destination; do not
   copy them.
4. **Migrations are additive.** New enum values, new tables, nullable columns.
5. **No URL in the thread response.** Ever (ADR 0060).
6. **No AI attribution** in any commit or pull request.

## Prerequisites

- ADR 0060 Accepted.
- `main` current; `npm --prefix backend run db:migrate` reports nothing pending.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Decide and record | 1 / 1 | Done |
| 2. Data and the `message` destination | 4 / 4 | Done |
| 3. Sending and reading | 3 / 3 | Done — 3.4 dropped |
| 4. Composer and thread | 0 / 3 | Not started |
| 5. Expiry | 0 / 3 | Not started |
| 6. Rollout (reyxdz) | 0 / 4 | Not started |

---

## Phase 1 — Decide and record (pull request 1)

### Step 1.1 — ADR 0060 and this plan

- [x] **Action.** ADR 0060 (Proposed) and this plan, with their index rows.
- [x] **Verify.** `npm run docs:check` passes; reyxdz accepts ADR 0060 and moves
  this plan to Ready.

## Phase 2 — Data and the `message` destination (pull request 2)

### Step 2.1 — Schema
- [x] **Action.** `message_attachments` (ADR 0060's columns, unique
  `object_key`, index on `message_id` and on `expires_at` where
  `file_deleted_at is null`); `upload_destination` gains `message`;
  `media_uploads` gains `conversation_id` (`ON DELETE CASCADE`) with a check that
  a `message` reservation has one; `notification_type` gains
  `attachment_expiring`. One generated migration. **Write that check as
  `destination::text <> 'message' OR conversation_id IS NOT NULL`.** Drizzle
  runs every pending migration in one transaction, and Postgres refuses a new
  enum value in the transaction that added it ("unsafe use of new value"), so
  comparing the enum itself would stop the deploy.
- [x] **Verify.** It migrates; a second `db:generate` has nothing to do; the
  generated SQL's check casts `destination` to text.

### Step 2.2 — The limits row and the switch
- [x] **Action.** `UPLOAD_LIMITS.message` with #66's caps and private bucket
  suffixes; `FILES_PER_MESSAGE = 5`; `MESSAGE_ATTACHMENTS` in `env.ts` and
  `.env.example`; `GET /media/limits` serves `destinations.message` and
  `filesPerMessage`.
- [x] **Verify.** `media.limits.test.ts` pins every cap.

### Step 2.3 — Tickets for a conversation
- [x] **Action.** `issueUploadTicket` accepts `{ destination: 'message',
  conversationId }`: participant, not blocked, switch on, at most five unsent
  reservations by the caller in that conversation, keys under
  `messages/{conversationId}/`.
  `verifyReservation` reads private buckets as it reads public ones.
- [x] **Verify.** `media.test.ts`: a non-participant, a blocked pair, a sixth
  file, each over-limit case and the switch off are refused.

### Step 2.4 — Buckets and prune
- [x] **Action.** `media:buckets` configures the four private buckets;
  `media:prune` covers them.
- [x] **Verify.** `media:buckets -- --check` exits 0 locally against a
  configured project, or the step records why it could not run.
  *Not run: the local `.env` has no Supabase project (`STORAGE_UNCONFIGURED`).
  `media:prune` read every reference, `message_attachments` included, before
  stopping at the first listing for the same reason. Phase 6 runs `--check` on
  staging and production.*

## Phase 3 — Sending and reading (pull request 3)

### Step 3.1 — Send with files
- [x] **Action.** `POST /conversations/:id/messages` takes `attachments:
  reservationId[]` (0–5); `body` is optional when there is at least one.
  Verify and consume each ticket in the message's transaction; write
  `message_attachments` with `expires_at`.
- [x] **Verify.** Tests: files only; a ticket from another conversation or user
  is refused; a forged size or type is deleted on verify.

### Step 3.2 — What the thread says
- [x] **Action.** Each message carries `attachments: { id, kind, mimeType,
  sizeBytes, durationSeconds, hasThumb, expiresAt, expired }`. The conversation
  list and notifications say "Sent a photo" (and the rest) when a message has no
  text. Contracts in `contracts/conversations.ts`.
  *As built: the list's last message carries `attachmentKinds`, and the words
  ("Sent a photo") are the browser's, in the catalogue (ADR 0055) — phase 4.3.
  Notifications have nothing to change: messages never notify (ADR 0030).*
- [x] **Verify.** Tests; no URL anywhere in the response.

### Step 3.3 — Signed reads
- [x] **Action.** `GET /conversations/:id/attachments/:attachmentId/url?variant=file|thumb`
  → `{ url, expiresAt }`, participants only, at most 300 seconds and never past
  `expires_at`; `410` once expired.
- [x] **Verify.** Tests: a non-participant gets 404; an expired file gets 410
  even before the sweep; a PDF never expires.

### Step 3.4 — Reports (dropped)

*Dropped 2026-10-19 by reyxdz.* This step would have listed a reported
conversation's files in the admin report view. Message files go straight to
the recipient with no administrator involved, so no admin path to them is
built, through a report or otherwise (ADR 0060, as amended).

## Phase 4 — Composer and thread (pull request 4)

### Step 4.1 — Attach
- [ ] **Action.** An attach button in the composer: limits shown before
  picking, an oversized or wrong file refused before a byte is sent, progress in
  percent and MB, cancel, resumable audio and video. The note that photos, audio
  and video are kept 30 days. Copy in the catalogue (ADR 0055).
- [ ] **Verify.** 375px, light and dark; a dropped connection resumes.

### Step 4.2 — In the thread
- [ ] **Action.** Thumbnails that open full size; players with
  `preload="none"`, size and duration before play; PDFs as a link with their
  size; "Available until …" with a download button; the placeholder once
  expired.
- [ ] **Verify.** Opening a thread downloads thumbnails only (DevTools, throttled).

### Step 4.3 — The list
- [ ] **Action.** "Sent a photo" and the rest in the conversation list.
- [ ] **Verify.** Screenshots.

## Phase 5 — Expiry (pull request 5)

### Step 5.1 — The sweep
- [ ] **Action.** On the API's hourly timer, beside the ID retention pass:
  delete expired objects and stamp `file_deleted_at`. `messages:sweep` runs it
  by hand.
- [ ] **Verify.** Tests: idempotent; a late run changes nothing a reader sees.

### Step 5.2 — The three-day notice
- [ ] **Action.** `attachment_expiring` to both participants, at most one per
  conversation per day.
- [ ] **Verify.** Tests.

### Step 5.3 — Records
- [ ] **Action.** `api.md`, `data-model.md`, `environment.md`, `commands.md`,
  the privacy notice's line on message files, README.
- [ ] **Verify.** `npm run docs:check` passes.

## Phase 6 — Rollout (reyxdz)

### Step 6.1 — Buckets
- [ ] **Action.** `media:buckets` on staging, then production.
- [ ] **Verify.** `--check` exits 0 on both.

### Step 6.2 — Staging on
- [ ] **Action.** `MESSAGE_ATTACHMENTS=true` on Render `bilikha`.
- [ ] **Verify.** #66's "Verify" list on staging, both roles, a phone.

### Step 6.3 — Release
- [ ] **Action.** Release with production's switch off.
- [ ] **Verify.** The release checks pass.

### Step 6.4 — Production on
- [ ] **Action.** The switch on `bilikha-production`, after Supabase Pro.
  Accept-and-close: #66.
- [ ] **Verify.** Each kind sends and opens on production.

---

## Acceptance

- [ ] #66's "Verify" list, every item.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check` and
      `npm run check:bundle` pass, budget unchanged.

## Follow-ups

- A storage quota for messages, if PDFs grow (ADR 0060).
- Deleting a single message, if it is ever built, removes its files.
