# 0053. Verify new accounts with a photo of a Biliran ID

- **Status:** Draft
- **Owner:** emanuel
- **Related:** [ADR 0057](../decisions/0057-new-accounts-are-verified-with-a-biliran-id.md) ·
  [ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [ADR 0021](../decisions/0021-image-storage-and-upload-path.md) ·
  [ADR 0020](../decisions/0020-location-required-biliran-only.md) ·
  [ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #51](https://github.com/ELITES-ORG/bilikha/issues/51)

## Goal

Every account registered after this ships uploads a photo of an accepted Biliran
ID — front and back for a card, the front only for a single-page document — and
can only browse until an administrator verifies it. A decline signs the account
out and shows why: *try again* lets it resubmit the ID, *not from Biliran* ends
it unless an appeal succeeds. Within 7 days of a decision an administrator may
reverse it, and a person declined as *not from Biliran* may appeal once. The
images sit in a private bucket, are seen only by administrators through
short-lived signed URLs, every look is audited, and they are deleted 7 days
after the latest decision. Accounts that already exist are not touched.

**There is no deadline for the review.** The 7 days start only once an
administrator decides; a pending submission waits in the queue, oldest first,
as long as it takes, and its images are kept while it waits.

## Scope

**In scope**
- `id_verifications` table, a private storage bucket, and the storage helpers it
  needs.
- The ID step (also the resubmit page), the browse-only gate, the banner, and
  the decline notices on sign-in.
- The admin ID queue and review, with audit rows.
- Reversal by an administrator, and one appeal by the person, within 7 days of
  a decision.
- Automatic deletion 7 days after the latest decision, and no ID readable
  after that point even if deletion is late.
- The privacy notice section on IDs.

**Out of scope**
- Existing accounts — no row, no banner, nothing asked (the issue's decision).
- Account deletion itself, which does not exist yet (ADR 0032); its ID rows
  cascade and its images are swept as orphans when it arrives.
- Translating the new copy: it goes into the English catalogue with empty
  `fil`/`war` entries (ADR 0055); the admin pages stay English like the rest of
  the admin area.

## Rules for whoever executes this

- **Read [ADR 0057](../decisions/0057-new-accounts-are-verified-with-a-biliran-id.md)
  and [ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md)
  first.** 0057 is the design; 0051 is the pattern it copies for the gate and the
  session revocation.
- **Never log an ID object key or a signed URL**, and never return either from
  any non-admin endpoint. A test asserts this.
- **Nothing ships live before Phase 5.** Phases 1–4 are dormant: no row exists
  until registration writes one, so `main` stays releasable after every merge.
  Appeals (Phase 4) come before switch-on so that no final decline is ever made
  without a way to challenge it.
- **Read the generated migration SQL** before applying it. Generate migrations
  after rebasing; never renumber one by hand.
- **Backend relative imports end in `.js`.**
- **Route tests never stub the global `fetch`** — they call the app with it.
  They mock `backend/src/lib/storage.js` with `vi.mock` instead. Only the unit
  tests of `storage.ts` itself stub `fetch`, in a file with no route tests.
- **Five build pull requests, one per phase**, each from a fresh branch off
  `origin/main` (ADR 0052). No AI attribution in commits or pull requests.

## Prerequisites

- [ ] ADR 0057 Accepted by reyxdz.
- [x] Open questions 1–4 answered by reyxdz (2026-10-10) and written into this
      plan — see Decided.
- [ ] Open question 5 answered; this plan set to Ready.
- [ ] Database running and current:
      `npm run db:up && npm --prefix backend run db:migrate && npm --prefix backend run db:seed`.
- [ ] A local private bucket `ids` in Supabase Studio (`http://127.0.0.1:54323`):
      Public **off**, file size limit **3 MB**, allowed MIME types
      `image/webp, image/jpeg`.
- [ ] **Before Phase 5 merges:** the same private bucket on staging and
      production, created by reyxdz in each Supabase dashboard (Decided 1).
- [ ] **Before Phase 5 merges:** `bilikha-production` on an always-on Render
      instance (Starter), so the hourly sweep deletes images on time. On the
      free tier it runs only when traffic wakes the server.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Data and private storage | 0 / 6 | Not started |
| 2. Account side | 0 / 9 | Not started |
| 3. Admin review and retention | 0 / 6 | Not started |
| 4. Reversal and appeals | 0 / 5 | Not started |
| 5. Switch on | 0 / 5 | Not started |

---

## Phase 1 — Data and private storage

Branch `feat/id-verification-data`. Dormant: nothing writes a row yet.

### Step 1.1 — Add the table and the enum values

- [ ] **Action.** Create `backend/src/db/schema/verification.ts` and export it
      from `backend/src/db/schema/index.ts`:
      - `idVerificationStatusEnum = pgEnum('id_verification_status', ['pending', 'verified', 'declined_retry', 'declined_final', 'appealed'])`
        — `appealed` is a *not from Biliran* decline whose appeal is open
      - `id_verifications`: `id` uuid pk `defaultRandom()`; `user_id` uuid not
        null → `users.id` **on delete cascade**; `status` default `'pending'`;
        `id_type` text; `front_key` text; `back_key` text; `id_consent_at`,
        `submitted_at`, `decided_at`, `images_deleted_at` timestamptz;
        `reviewed_by` uuid → `users.id` **on delete set null**;
        `decision_reason` text; `appeal_message` text; `appealed_at`,
        `appeal_decided_at` timestamptz; `created_at`, `updated_at` timestamptz
        not null default now. Every nullable column is null until its moment.
        `decided_at` always holds the **latest** decision — first decision,
        reversal or appeal outcome — and the 7 days run from it.
      - Indexes: `(user_id, created_at)`; `id_verifications_queue_idx` on
        `submitted_at` where `status in ('pending', 'appealed') and submitted_at is not null`;
        `id_verifications_sweep_idx` on `decided_at` where
        `images_deleted_at is null`; **unique**
        `id_verifications_one_open_idx` on `user_id` where `status = 'pending'`.
      In `backend/src/db/schema/profiles.ts` add `'id_viewed'`, `'id_verified'`,
      `'id_declined_retry'`, `'id_declined_final'`, `'id_decision_reversed'`,
      `'id_appeal_granted'` and `'id_appeal_upheld'` to `moderationActionEnum`,
      and a nullable `id_verification_id` uuid column on `moderation_actions` →
      `id_verifications.id` **on delete set null**, so "which IDs did this
      administrator view" is a join, not a search of `reason`. In
      `backend/src/db/schema/notifications.ts` add `'id_verified'` to
      `notificationTypeEnum`, each with a comment.
- [ ] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.2 — Generate and read the migration

- [ ] **Action.** `npm --prefix backend run db:generate`, then read the new
      `backend/drizzle/0031_*.sql`.
- [ ] **Verify.** It contains only `CREATE TYPE`, `CREATE TABLE`,
      `CREATE INDEX`, foreign keys, `ALTER TYPE … ADD VALUE` and one nullable
      `ALTER TABLE "moderation_actions" ADD COLUMN "id_verification_id"` —
      **no `UPDATE`, no `INSERT`, nothing touching existing users or rows**.
      `npm --prefix backend run db:migrate` succeeds.

### Step 1.3 — Contracts and the new notification type

- [ ] **Action.** Create `backend/src/contracts/verification.ts` (types only,
      per its README): `IdVerificationStatus`, `IdType`, `OwnIdVerification`
      (`status`, `submitted: boolean`, `reason: string | null` only when
      declined — **no keys, no URLs**), `AdminIdVerificationRow`,
      `AdminIdVerificationDetail` (registered name, birth date, municipality,
      barangay, ID type, `frontUrl | null`, `backUrl | null`, `urlsExpireAt`,
      and for a decided row the decision, who made it, its reason, when the
      7 days end, and any appeal message). Extend
      `ModerationActionType` (`contracts/admin.ts`) and `NotificationType`
      (`contracts/notifications.ts`). In
      `backend/src/modules/notifications/notifications.service.ts` add
      `TITLES.id_verified` and its case in the target switch, linking to
      `/directory`. `PublicUser` is **not** changed in this phase.
- [ ] **Verify.** `npm run typecheck` passes for backend and frontend.

### Step 1.4 — Storage: a bucket argument, metadata, signed downloads

- [ ] **Action.** First record the REST contract with `curl` against local
      Supabase, as plan 0009 did: `POST /storage/v1/object/sign/ids/<key>` with
      `{"expiresIn": 300}` → `{ "signedURL": "/object/sign/…?token=…" }`; paste
      the request and response into this step. Then in
      `backend/src/lib/storage.ts`:
      - an optional `bucket` argument on `createSignedUpload`, `deleteObject`
        and `listObjects`, defaulting to `env.SUPABASE_STORAGE_BUCKET`, and
        **passed through `listObjects`' recursion** (line 232 today drops it);
      - `listObjects` returns each object's size and MIME type from
        `metadata`;
      - `createSignedDownload(bucket, key, expiresIn)`;
      - `idObjectKey(userId, side, ext)` → `ids/<userId>/<uuid>-<side>.<ext>`;
      - error logs redact the key when the bucket is the ID bucket.
- [ ] **Verify.** Unit tests in `backend/src/lib/storage.test.ts`, which stub
      `globalThis.fetch` (no route tests in that file): the bucket reaches the
      recursive call; the signed-download request has `expiresIn` 300; an ID key
      never appears in a logged error. `npm run media:prune` still lists only the
      media bucket.

### Step 1.5 — The ID bucket setting and readiness

- [ ] **Action.** `SUPABASE_ID_BUCKET` (default `ids`) in
      `backend/src/config/env.ts`, refused if equal to
      `SUPABASE_STORAGE_BUCKET`; add it to `backend/.env.example`,
      `docs/reference/environment.md` and the environment table in
      `docs/reference/deployments.md`, with the bucket's settings. Add
      `idStorageReady()` in `backend/src/lib/storage.ts`: reads
      `GET /storage/v1/bucket/<id>`, ready only if it exists, `public === false`,
      and both `file_size_limit` and `allowed_mime_types` are set; cached 10
      minutes so a transient failure recovers; overridable in tests. Log a
      warning at boot in `backend/src/index.ts` when not ready. Add the local
      bucket steps to `docs/getting-started/local-setup.md`.
- [ ] **Verify.** Tests: a public bucket, a missing one, and one without limits
      are each not ready. Booting locally with the private `ids` bucket logs no
      warning.

### Step 1.6 — Test factory and the data-model reference

- [ ] **Action.** `makeIdVerification(userId, overrides)` in
      `backend/src/test/factories.ts`. A `## \`id_verifications\`` section in
      `docs/reference/data-model.md`.
- [ ] **Verify.** A test: users made with `makeUser` have no row.
      `npm test` and `npm run docs:check` pass.

## Phase 2 — Account side

Branch `feat/id-verification-account`. Dormant: only factory-made rows exercise
it.

### Step 2.1 — The verification routes

- [ ] **Action.** New module `backend/src/modules/verification/`
      (`verification.routes.ts`, `.service.ts`, `.schema.ts`), mounted at
      `/api/v1/verification` behind `requireAuth`:
      - `POST /upload-url` `{ side: 'front' | 'back' }` → a signed upload URL
        under the caller's own `ids/<userId>/`; `uploadLimiter`; `503
        ID_STORAGE_UNAVAILABLE` unless `idStorageReady()`; `409` unless the
        latest row is `pending` and unsubmitted, or `declined_retry`.
      - `POST /submission` `{ idType, frontKey, backKey?, idConsent: true }`:
        keys pass `assertSafeObjectKey`, sit under the caller's prefix, front ≠
        back with matching `-front`/`-back` suffixes, and are referenced by no
        other row; `backKey` required exactly when the type has a back; each
        object exists in the ID bucket within its limits. Fills the open
        `pending` row, or after `declined_retry` inserts a new one; stamps
        `id_consent_at` and `submitted_at`. A `23505` answers `409`.
      The ID types and `hasBack` live in `verification.schema.ts`.
- [ ] **Verify.** Tests (storage mocked): another account's prefix → 403; an old
      row's key → 400; a card without a back → 400; an object not uploaded →
      400; oversized or wrong type → 400; storage not ready → 503; a double
      submit → 409; a suspended account → 401.

### Step 2.2 — The gate in `requireAuth`

- [ ] **Action.** In `backend/src/middleware/require-auth.ts`, in this order:
      1. `req.session.declineNotice` → destroy the session, `401 ID_DECLINED`
         with the notice in `details` — **before** the `!userId` check, which
         would otherwise answer first;
      2. `!userId` → 401 (unchanged);
      3. read the user **and its latest `id_verifications` row** in one query;
      4. suspended → unchanged;
      5. latest `declined_final` or `appealed` → destroy, `401 ID_DECLINED`
         with the reason;
      6. `mustChangePassword` → unchanged;
      7. latest `pending` or `declined_retry`, method not GET/HEAD/OPTIONS, path
         not in `ALLOWED_WHILE_UNVERIFIED` (`/api/v1/me/password`,
         `/api/v1/verification/upload-url`, `/api/v1/verification/submission`,
         matched exactly like `ALLOWED_WHILE_LOCKED`) → `403
         VERIFICATION_PENDING`.
      Read `req.method`/`req.originalUrl` only when a gating row exists. Add
      `declineNotice?` to `backend/src/types/session.d.ts`.
- [ ] **Verify.** Tests: one write per router (me, media, offers, postings,
      conversations, agreements, ratings, notifications) → 403 for `pending`
      and for `declined_retry`; their GETs → 200; the allowlist with `?x=1`, a
      trailing slash and near misses; no row → untouched; a `declineNotice`
      session → 401 with details, then a plain 401. `guards.test.ts` still
      passes.

### Step 2.3 — Sign-in and the current user

- [ ] **Action.** `authenticate()` in `backend/src/modules/auth/auth.service.ts`:
      after the password and suspension checks and **before** `lastLoginAt` is
      written, a latest `declined_final` → `403 ID_DECLINED` with
      `details.reason`, and `details.appealUntil` while an appeal is still
      possible (Phase 4 fills it; until then it is absent); a latest `appealed`
      → `403 ID_DECLINED` saying the appeal is being reviewed. That 403 must not
      count as a failure in `loginLimiter`, which today skips only responses
      under 400 — give it a `requestWasSuccessful` that also accepts
      `ID_DECLINED`.
      `PublicUser` (`contracts/auth.ts`) gains `idVerification:
      OwnIdVerification | null`, filled by `toPublicUser`/`getUserById`.
- [ ] **Verify.** Tests: a wrong password on a declined account is the normal
      401, the right one the reason; `lastLoginAt` unchanged; ten attempts never
      turn into "rate limited"; `/auth/me` shows the status and never a key.

### Step 2.4 — Errors that keep their code

- [ ] **Action.** In `frontend/src/lib/api-client.ts`, `toApiError` returns
      `ApiError extends Error` — same message, plus `status`, `code`,
      `details`. Add a response interceptor for **only** `401 ID_DECLINED`: save
      the notice in `sessionStorage` and `window.location.assign('/login')`.
      Move `authKeys` to a leaf module so the client does not import
      `features/auth/api.ts`. `isReportable` in `frontend/src/lib/error-reporting.ts`
      skips `ApiError`; add `id` to `ROUTE_WORDS`. Bump `VERSION` in
      `frontend/src/features/auth/session-cache.ts`.
- [ ] **Verify.** Existing frontend tests pass; a new test covers `ApiError`.

### Step 2.5 — The ID step page

- [ ] **Action.** `frontend/src/pages/onboarding/IdStepPage.tsx` at
      `/welcome/id` inside `RequireAuth`; it is also the resubmit page, showing
      the decline reason. It redirects onward when there is no row, the ID is
      already submitted, or the account is verified. Contents, in order: the
      accepted IDs; the ID consent sentence, **before** any photo — *"Your ID is
      seen only by Bilikha's administrators, to confirm you are from Biliran. It
      is kept until they review it and for 7 days after you get their decision
      (longer only while an appeal you make is being reviewed), then deleted."*
      — the issue's sentence plus the appeal clause, because an open appeal
      keeps the ID past the 7 days; guidance (all four corners, no glare,
      readable); the ID
      type; the front, and the back when the type has one, each with **Take
      photo** (`accept="image/*" capture="environment"`) and **Choose photo**
      (no `capture`, which on Android would hide the gallery). Images through
      `resizeImage(file, ID_EDGE)` with `ID_EDGE = 2000` exported from
      `frontend/src/lib/image.ts`; the key's extension from the blob type.
      Plain, retryable errors (storage unavailable, an upload that expired).
      Submit only when every required side is uploaded and consent is ticked;
      then `setQueryData` and `writeLastSession` the user before navigating.
      ID labels in `frontend/src/features/verification/id-types.ts`, kept in
      step with the backend list by a parity test. All copy in
      `frontend/src/i18n/catalogs/en.ts`, empty keys in `fil.ts`/`war.ts`.
- [ ] **Verify.** At 320px and 1280px, light and dark: the consent sentence
      shows before either photo button; a card asks for both sides, a
      certificate for one.

### Step 2.6 — The pinned banners

- [ ] **Action.** A `PinnedBanners` wrapper rendered once in `App.tsx` before
      `<Routes>`, **always**, holding `StagingBanner` and a new
      `VerificationBanner`; it alone is `sticky top-0` and publishes
      `--staging-banner-h` for both through one `ResizeObserver`.
      `StagingBanner` keeps its production-host check and loses its own sticky
      and measuring. `VerificationBanner` has three states — not submitted (with
      a link to the step), under review (the issue's sentence), try again (the
      reason and a resubmit link) — and cannot be dismissed.
      `RegistrationStatusBanner` returns null while verification is pending or
      declined. Rewrite `frontend/src/components/staging-banner.test.ts` to
      assert the same three things about the wrapper.
- [ ] **Verify.** Each state on every page at phone and desktop widths, light
      and dark, with and without the staging banner; sticky headers and toasts
      sit below it.

### Step 2.7 — Routing to the ID step

- [ ] **Action.** `frontend/src/features/auth/RequireAuth.tsx`: when
      `!user.mustChangePassword`, the data is not the remembered placeholder,
      and the row is unsubmitted or `declined_retry`, redirect to `/welcome/id`.
      `frontend/src/pages/LoginPage.tsx`: after sign-in, go to `/welcome/id`
      when the user needs it.
- [ ] **Verify.** A test that the password-change and ID redirects cannot loop.

### Step 2.8 — Browse-only in the interface

- [ ] **Action.** `frontend/src/features/verification/useVerificationGate.ts`
      (status, `canAct`, `explain()`). Disable or explain: message and inquire,
      save an offer, post work, create a profile or offer, agreement and rating
      actions. `VERIFICATION_PENDING` reaches the existing error displays as
      catalogue copy. While pending, refetch the current user every 60 seconds
      and on focus, so a verification takes effect without signing in again.
      `LoginPage` shows a stored decline notice, or the sign-in refusal's
      reason, in its existing alert.
- [ ] **Verify.** Every one of those actions explains itself instead of failing
      on a 403.

### Step 2.9 — Document the account side

- [ ] **Action.** `docs/reference/api.md`: the two verification routes,
      `VERIFICATION_PENDING`, `ID_DECLINED`, `ID_STORAGE_UNAVAILABLE`,
      `PublicUser.idVerification`.
- [ ] **Verify.** `npm run docs:check` passes. A test: no non-admin response
      contains `ids/` or `token=`.

## Phase 3 — Admin review and retention

Branch `feat/id-verification-admin`. Dormant until Phase 5.

### Step 3.1 — The queue and the review

- [ ] **Action.** In the admin module (all routes behind `requireAdmin`):
      - `GET /admin/id-verifications?view=pending|decided` — `pending`:
        submitted, oldest first, suspended accounts flagged; `decided`: rows
        whose latest decision is under 7 days old. `Paginated`, no URLs.
      - `GET /admin/id-verifications/:id` — registered name, birth date and age,
        municipality, barangay, ID type, two signed URLs valid **300 seconds**;
        writes an `id_viewed` row with `id_verification_id` set each call; a
        per-admin limiter like `adminPasswordResetLimiter`; 503 when storage is
        not ready.
      - **The 7 days are enforced here, not only by the sweep.** URLs are signed
        only while the row is `pending` or `appealed`, or its `decided_at` is
        under 7 days ago, and a signed URL never outlives that moment. Past it
        the detail still returns the record, with `frontUrl` and `backUrl`
        null and no `id_viewed` row, even if the sweep has not yet deleted the
        images.
- [ ] **Verify.** Tests: a non-admin and a signed-out caller get 404; each view
      writes one `id_viewed` row; the signed-download call asks for 300 seconds;
      a row decided 7 days and one minute ago whose images still exist gets no
      URLs and no storage call.

### Step 3.2 — The decision

- [ ] **Action.** `POST /admin/id-verifications/:id/decision`
      `{ decision: 'verify' | 'retry' | 'final', reason }` — reason required to
      decline, at most 500 characters. Refused (409) for your own submission, a
      suspended account, or a row that is not submitted and pending. One
      transaction: status, `reviewed_by`, `decided_at`, `decision_reason`, the
      audit row (`id_verification_id` set), and for a decline the session rewrite — each of the account's
      session rows (by `user_id`, and the legacy `LIKE` on `data`) set to
      `data = ((data::jsonb - 'userId') || jsonb_build_object('declineNotice', …))::text`,
      `user_id = null`, cookie kept. The helper is shared with
      `resetAccountPassword` in `backend/src/modules/admin/admin.service.ts`,
      which keeps deleting. After commit, `notify` the account `id_verified`.
- [ ] **Verify.** Tests: each decision writes its audit row; a decline rewrites
      every session including a legacy one, and the next request gets
      `ID_DECLINED` with the reason; after *verify*, a write on the same session
      succeeds; self, suspended and double decisions are refused.

### Step 3.3 — Deleting the images

- [ ] **Action.** `backend/src/modules/verification/retention.ts`:
      `purgeDecidedIdImages(now)` deletes the images of rows decided at least 7
      days before `now` and **not `appealed`** (an open appeal keeps its ID),
      then nulls the keys and sets `images_deleted_at` (conditional on it being
      null); `purgeOrphanIdObjects(now)` deletes ID
      objects older than 24 hours that no row references. Both catch and log
      every error. Start an hourly timer, plus one run a minute after start, in
      `backend/src/index.ts` (never in `createApp`), `unref`'d. Add
      `npm run ids:purge` (`backend/src/scripts/purge-id-images.ts`).
- [ ] **Verify.** Tests: a row decided 8 days ago loses its images and keeps its
      record; one decided 6 days ago keeps both; an `appealed` row decided 8
      days ago keeps both; a fresh orphan and a referenced key are kept; a
      storage error is logged, not thrown.

### Step 3.4 — The admin pages

- [ ] **Action.** Section **ID checks** at `/admin/ids` in
      `frontend/src/pages/admin/admin-sections.ts` (and its test) and lazy
      routes in `frontend/src/App.tsx`: `AdminIdQueuePage` (Pending and Decided
      tabs) and `AdminIdReviewPage` — front and back side by side, the
      registered facts with `AdminFact`, and a decision panel like
      `AdminProfilePage`'s: **Verify**, **Decline — try again**, **Decline — not
      from Biliran**, the reason labelled as what the person sees. Its query uses
      `staleTime: 0` and `gcTime: 0`, is never prefetched, and refetches when an
      image fails to load. New `AdminStatus` entries in
      `frontend/src/pages/admin/admin-ui.tsx`; hooks in
      `frontend/src/features/admin/api.ts`.
- [ ] **Verify.** At 1280px and 375px, light and dark.

### Step 3.5 — Document the admin side

- [ ] **Action.** `docs/reference/api.md` for the three admin routes.
- [ ] **Verify.** `npm run docs:check` passes.

### Step 3.6 — Check signed-URL expiry by hand

- [ ] **Action.** Open a review, copy a signed URL, and `curl` it after 5
      minutes.
- [ ] **Verify.** It is refused. The object's
      `/storage/v1/object/public/ids/…` URL is refused at any time.

## Phase 4 — Reversal and appeals

Branch `feat/id-verification-appeals`. Dormant until Phase 5. It comes before
switch-on so that no *not from Biliran* decline is ever made without a way to
challenge it.

### Step 4.1 — An administrator reverses a decision

- [ ] **Action.** `POST /admin/id-verifications/:id/decision` also accepts a
      **decided** row whose `decided_at` is under 7 days ago (while its ID can
      still be looked at): any decision may be changed to any other, with a
      reason (required, at most 500 characters). Same transaction as Step 3.2:
      `status`, `reviewed_by`, `decided_at` (now — the 7 days start again),
      `decision_reason`, an `id_decision_reversed` audit row with
      `id_verification_id`, and the session rewrite when the new decision is a
      decline. Reversed to *verify*: `notify` `id_verified`. Refused (409) after
      the 7 days, for your own submission, or for an `appealed` row (decided
      through Step 4.3 instead).
- [ ] **Verify.** Tests: a mistaken *not from Biliran* reversed to *verify*
      within the window lets the account sign in and write; a *verify* reversed
      to a decline revokes its sessions with the reason; 7 days and one minute
      after the decision → 409; each reversal writes its audit row.

### Step 4.2 — The person appeals

- [ ] **Action.** `POST /api/v1/auth/id-appeal`
      `{ username, password, message }`, **not** behind `requireAuth` — a
      declined account cannot sign in. It authenticates exactly as sign-in does
      (same checks, behind `loginLimiter`, a wrong password is the normal 401),
      then requires the latest row to be `declined_final`, decided under 7 days
      ago, with no earlier appeal (`appealed_at` null). `message` 20–1000
      characters. Sets `status = 'appealed'`, `appeal_message`, `appealed_at`;
      creates no session. A *try again* decline cannot appeal — it resubmits.
      `details.appealUntil` (Step 2.3) is `decided_at` + 7 days while these
      conditions hold.
- [ ] **Verify.** Tests: wrong password → 401 and the row unchanged; right
      password → 200, row `appealed`, no session cookie; a second appeal → 409;
      after 7 days → 409; a `declined_retry` account → 409; sign-in while
      `appealed` → `403 ID_DECLINED` saying it is under review.

### Step 4.3 — An administrator decides the appeal

- [ ] **Action.** An **Appeals** view in the queue (`view=appeals`, oldest
      `appealed_at` first) and `POST /admin/id-verifications/:id/appeal`
      `{ outcome: 'grant' | 'uphold', reason }`. The review shows the ID, the
      original decision, who made it and why, and the appeal message; it
      suggests, but does not require, that someone other than the original
      decider answers — the team is small. *Grant*: status `verified`,
      `notify` `id_verified`, `id_appeal_granted` audit row. *Uphold*: status
      `declined_final` with `appeal_decided_at` set (so no second appeal), the
      reason shown at sign-in, `id_appeal_upheld` audit row. Either way
      `decided_at` = now and the 7 days start again.
- [ ] **Verify.** Tests: grant lets the account sign in and write; uphold makes
      sign-in show the new reason and refuses another appeal; the images are
      kept while `appealed`, then follow the 7 days from the outcome; both
      write their audit rows; a non-admin gets 404.

### Step 4.4 — The appeal and reversal screens

- [ ] **Action.** `frontend/src/pages/LoginPage.tsx`: on `ID_DECLINED` with
      `appealUntil`, show the reason and **Appeal this decision** (until that
      date), opening a short form for the message; on success, "Your appeal is
      being reviewed. Try signing in after you hear from us." Upheld: the reason,
      and no appeal. Admin: the Appeals tab on `AdminIdQueuePage`, and a
      **Change decision** action on a decided review within its 7 days. All
      copy in `frontend/src/i18n/catalogs/en.ts`, empty keys in `fil`/`war`.
- [ ] **Verify.** At 320px and 1280px, light and dark: the appeal form, the
      under-review message, an upheld decline; the admin Appeals tab and
      Change decision.

### Step 4.5 — Document reversal and appeals

- [ ] **Action.** `docs/reference/api.md`: `POST /auth/id-appeal`,
      `POST /admin/id-verifications/:id/appeal`, the `appeals` view, reversal
      on the decision route; `docs/reference/data-model.md`: the `appealed`
      status and the appeal columns.
- [ ] **Verify.** `npm run docs:check` passes.

## Phase 5 — Switch on

Branch `feat/id-verification-signup`. **Merge only after the private bucket
exists, with its limits, on staging and production, and production is on an
always-on Render instance** (Prerequisites).

### Step 5.1 — Registration writes the first row

- [ ] **Action.** `registerUser` in `backend/src/modules/auth/auth.service.ts`
      inserts the user and its `pending` row in one `db.transaction`, and builds
      the returned `PublicUser` **after** the commit (inside it, `toPublicUser`
      reads through `db` and would not see the row).
- [ ] **Verify.** Route tests: registering creates exactly one pending,
      unsubmitted row and the response shows it; a duplicate username creates
      no row.

### Step 5.2 — Onboarding goes through the ID step

- [ ] **Action.** `frontend/src/pages/RegisterPage.tsx` navigates to
      `/welcome/id`, carrying `?next`; its intro copy no longer promises the
      creative step next. Step counters: ID 1 of 3 (`IdStepPage`), intent 2 of 3
      (`IntentPage.tsx`), profile 3 of 3 (`ProfileSetupPage.tsx`). The intent
      page's creative path explains it unlocks after verification.
- [ ] **Verify.** A new registration at 375px lands on the ID step, then intent.

### Step 5.3 — The privacy notice

- [ ] **Action.** In `frontend/src/pages/legal/PrivacyPage.tsx`: the ID photo
      collected at registration is sensitive personal information under RA
      10173; what it is for; that only administrators see it; that it is deleted
      7 days after the decision, or after an appeal's outcome while one is
      open; that a *not from Biliran* decline can be appealed within 7 days;
      the controller is `LEGAL_OPERATOR`. Bump `LEGAL_LAST_UPDATED` in
      `frontend/src/lib/legal.ts`, and bump `CONSENT_VERSION` in both
      `frontend/src/lib/legal.ts` and `backend/src/modules/auth/auth.service.ts`
      to the release date (Decided 4).
- [ ] **Verify.** The retention sentence reads the same on the ID step and in
      the notice; a new registration stores the new `CONSENT_VERSION`.

### Step 5.4 — Rollout notes

- [ ] **Action.** The pull request's Rollout section names
      `SUPABASE_ID_BUCKET` (default `ids`) for both Render services, confirms
      both buckets exist, and confirms `bilikha-production` is on an always-on
      instance.
- [ ] **Verify.** `npm run check:pr` passes on the description.

### Step 5.5 — Verify end to end on staging

- [ ] **Action.** On a real Android phone, including Facebook's in-app browser:
      register, photograph both sides, see the banner; verify as an
      administrator; decline (try again) and resubmit; decline (not from
      Biliran), appeal, and both grant and uphold an appeal; reverse a decision;
      sign in with an account made before the release.
- [ ] **Verify.** The issue's Verify list, every box, plus the appeal and
      reversal paths.

---

## Acceptance

- [ ] An account registered after Phase 5 cannot write anything until verified,
      and every write route answers `403 VERIFICATION_PENDING` to `curl`.
- [ ] No ID image is reachable without an administrator's session, and none is
      readable more than 7 days after its latest decision unless an appeal is
      open — whether or not the sweep has run.
- [ ] Every view, decision, reversal and appeal outcome is in
      `moderation_actions`.
- [ ] Images are deleted within the hour after their 7 days end; the record
      remains.
- [ ] A *not from Biliran* decline can be appealed once within 7 days, and any
      decision can be reversed by an administrator in that window.
- [ ] Accounts from before the release behave exactly as before.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run docs:check` pass on every phase.

## Decided (reyxdz, 2026-10-10)

1. **The private `ids` bucket:** reyxdz creates it on staging and production
   before Phase 5 merges, with a **3 MB** limit and **WebP and JPEG** only.
2. **The 7 days start when the decision is made** — the moment the person is
   told, by notification or decline notice. There is **no deadline for the
   review itself**: a pending submission waits as long as it takes.
3. **Decisions can be reversed by an administrator, and a *not from Biliran*
   decline can be appealed by the person**, within the 7 days (Phase 4).
4. **`CONSENT_VERSION` is bumped** with the privacy notice's ID section, so a
   new registration records which notice it agreed to.

## Open question (reyxdz)

5. A *not from Biliran* decline belongs to an account, not a person. Someone
   declined can register again with a different username, email and phone and
   submit the same ID, and once the images are deleted nothing recognises it.
   Accept that each submission is judged on its own, or keep something that
   recognises a repeated ID — a hash of the ID number would, but it is itself
   personal data to protect and to mention in the privacy notice?

## Follow-ups

- Translations of the new copy into Filipino and Waray (ADR 0055).
