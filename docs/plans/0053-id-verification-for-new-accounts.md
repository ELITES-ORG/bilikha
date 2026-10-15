# 0053. Verify new accounts with a photo of a Biliran ID

- **Status:** In progress
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
- Recognising a repeated ID: a keyed hash of its number, typed by the
  administrator from the photo, kept after the images are deleted.
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
- **Never store, log or return an ID number.** Only its keyed hash is stored
  (Step 1.7); the raw number exists only inside the request that carries it.
  The hash is never returned to anyone either: an administrator sees which
  accounts match, not the hash.
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

- [x] ADR 0057 Accepted by reyxdz (2026-10-11).
- [x] Open questions 1–4 answered by reyxdz (2026-10-10) and written into this
      plan — see Decided.
- [x] Open question 5 answered by reyxdz (2026-10-11): recognise a repeated ID
      by a keyed hash of its number (Decided 5). This plan set to Ready.
- [x] Database running and current:
      `npm run db:up && npm --prefix backend run db:migrate && npm --prefix backend run db:seed`.
- [x] A local private bucket `ids`: Public **off**, file size limit **10 MB**,
      allowed MIME types `image/webp, image/jpeg`. Created through the storage
      API (the command in [local setup](../getting-started/local-setup.md) §6),
      which works whether or not Supabase Studio is running.
- [x] **Before Phase 5 merges:** the same private bucket on staging and
      production, created by reyxdz in each Supabase dashboard (Decided 1).
      Done 2026-10-10 on `bilikha-staging` and `bilikha-production`: private,
      no policies, 10 MB, `image/webp, image/jpeg`.
- [ ] **Before Phase 5 merges:** `bilikha-production` on an always-on Render
      instance (Starter), so the hourly sweep deletes images on time. On the
      free tier it runs only when traffic wakes the server.
- [x] **Before Phase 5 merges:** `ID_HASH_SECRET` generated with
      `openssl rand -hex 32` and set on both Render services, `bilikha` and
      `bilikha-production`, a different value on each. **Never rotate it:** a
      new secret makes every stored hash unmatchable. Locally, any value of 32
      or more characters in `backend/.env`.
      Done by reyxdz, checked 2026-10-15. Staging's 2026-10-13 deploy booted
      without the "ID_HASH_SECRET is not set" warning. Production has not
      deployed since 2026-10-08, so its value was checked in the dashboard
      instead: long enough, not the placeholder, and not staging's. Its first
      boot with the secret is the next release.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Data and private storage | 7 / 7 | Done |
| 2. Account side | 9 / 9 | Done |
| 3. Admin review and retention | 7 / 7 | Done |
| 4. Reversal and appeals | 5 / 5 | Done |
| 5. Switch on | 3 / 5 | In progress — Steps 5.4 (the pull request's rollout notes) and 5.5 (staging, a real phone) outstanding |

---

## Phase 1 — Data and private storage

Branch `feat/id-verification-data`. Dormant: nothing writes a row yet.

### Step 1.1 — Add the table and the enum values

- [x] **Action.** Create `backend/src/db/schema/verification.ts` and export it
      from `backend/src/db/schema/index.ts`:
      - `idVerificationStatusEnum = pgEnum('id_verification_status', ['pending', 'verified', 'declined_retry', 'declined_final', 'appealed'])`
        — `appealed` is a *not from Biliran* decline whose appeal is open
      - `id_verifications`: `id` uuid pk `defaultRandom()`; `user_id` uuid not
        null → `users.id` **on delete cascade**; `status` default `'pending'`;
        `id_type` text; `front_key` text; `back_key` text; `id_consent_at`,
        `submitted_at`, `decided_at`, `images_deleted_at` timestamptz;
        `reviewed_by` uuid → `users.id` **on delete set null**;
        `decision_reason` text; `id_number_hash` text; `id_number_absent`
        boolean not null default false; `appeal_message` text; `appealed_at`,
        `appeal_decided_at` timestamptz; `created_at`, `updated_at` timestamptz
        not null default now. Every nullable column is null until its moment.
        `decided_at` always holds the **latest** decision — first decision,
        reversal or appeal outcome — and the 7 days run from it.
      - Indexes: `(user_id, created_at)`; `id_verifications_queue_idx` on
        `submitted_at` where `status in ('pending', 'appealed') and submitted_at is not null`;
        `id_verifications_sweep_idx` on `decided_at` where
        `images_deleted_at is null`; **unique**
        `id_verifications_one_open_idx` on `user_id` where `status = 'pending'`;
        `id_verifications_id_number_hash_idx` on `id_number_hash` where
        `id_number_hash is not null`.
      In `backend/src/db/schema/profiles.ts` add `'id_viewed'`, `'id_verified'`,
      `'id_declined_retry'`, `'id_declined_final'`, `'id_decision_reversed'`,
      `'id_appeal_granted'` and `'id_appeal_upheld'` to `moderationActionEnum`,
      and a nullable `id_verification_id` uuid column on `moderation_actions` →
      `id_verifications.id` **on delete set null**, so "which IDs did this
      administrator view" is a join, not a search of `reason`. In
      `backend/src/db/schema/notifications.ts` add `'id_verified'` to
      `notificationTypeEnum`, each with a comment.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.2 — Generate and read the migration

- [x] **Action.** `npm --prefix backend run db:generate`, then read the new
      `backend/drizzle/0035_*.sql` (`0035_wide_emma_frost.sql`: main had
      reached `0034` by the time this was built).
- [x] **Verify.** It contains only `CREATE TYPE`, `CREATE TABLE`,
      `CREATE INDEX`, foreign keys, `ALTER TYPE … ADD VALUE` and one nullable
      `ALTER TABLE "moderation_actions" ADD COLUMN "id_verification_id"` —
      **no `UPDATE`, no `INSERT`, nothing touching existing users or rows**.
      `npm --prefix backend run db:migrate` succeeds.

### Step 1.3 — Contracts and the new notification type

- [x] **Action.** Create `backend/src/contracts/verification.ts` (types only,
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
- [x] **Verify.** `npm run typecheck` passes for backend and frontend.

### Step 1.4 — Storage: a bucket argument, metadata, signed downloads

- [x] **Action.** First record the REST contract with `curl` against local
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

      Hardened after review (2026-10-11), because the bucket defaults to the
      public media bucket:
      - every helper that takes a key, `publicUrl` included, refuses an `ids/`
        key outside the ID bucket and any other key inside it — a forgotten
        bucket argument is a 500, never an ID in the public bucket;
      - `createSignedDownload` refuses a lifetime outside 1 to 300 seconds and an
        unsafe key itself, rather than trusting each caller;
      - storage's error body is logged with an ID key cut out, raw and
        URL-encoded, since Supabase can quote the key it refused;
      - `moderation_actions.id_verification_id` is indexed, as #78 indexed
        `organization_id`.
- [x] **Verify.** Unit tests in `backend/src/lib/storage.test.ts`, which stub
      `globalThis.fetch` (no route tests in that file): the bucket reaches the
      recursive call; the signed-download request has `expiresIn` 300; an ID key
      never appears in a logged error. `npm run media:prune` still lists only the
      media bucket.

**Recorded 2026-10-11** against local Supabase (storage-api v1.79.28), with a
throwaway object uploaded, signed, fetched and deleted:

```
POST /storage/v1/object/sign/ids/<key>   {"expiresIn":300}
→ 200 {"signedURL":"/object/sign/ids/<key>?token=<jwt>"}
GET /storage/v1 + signedURL              → 200 image/webp
POST /storage/v1/object/sign/ids/<missing key>
→ HTTP 400 {"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
POST /storage/v1/object/list/ids         an object: metadata {"size":12,"mimetype":"image/webp",…}
                                         a folder: id, updated_at and metadata null
GET /storage/v1/bucket/nope
→ HTTP 400 {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
```

### Step 1.5 — The ID bucket setting and readiness

- [x] **Action.** `SUPABASE_ID_BUCKET` (default `ids`) in
      `backend/src/config/env.ts`, refused if equal to
      `SUPABASE_STORAGE_BUCKET`; add it to `backend/.env.example`,
      `docs/reference/environment.md` and the environment table in
      `docs/reference/deployments.md`, with the bucket's settings. Add
      `idStorageReady()` in `backend/src/lib/storage.ts`: reads
      `GET /storage/v1/bucket/<id>`, ready only if it exists, `public === false`,
      and both `file_size_limit` and `allowed_mime_types` are set; cached one
      minute either way, so a bucket made public stops ID uploads within a
      minute and a transient failure clears as fast; overridable in tests. The
      name must be a plain bucket name, and is refused if it matches the media
      bucket in any letter case. Log a
      warning at boot in `backend/src/index.ts` when not ready. Add the local
      bucket steps to `docs/getting-started/local-setup.md`.
- [x] **Verify.** Tests: a public bucket, a missing one, and one without limits
      are each not ready. Booting locally with the private `ids` bucket logs no
      warning.

### Step 1.6 — Test factory and the data-model reference

- [x] **Action.** `makeIdVerification(userId, overrides)` in
      `backend/src/test/factories.ts`. A `## \`id_verifications\`` section in
      `docs/reference/data-model.md`.
- [x] **Verify.** A test: users made with `makeUser` have no row.
      `npm test` and `npm run docs:check` pass.

### Step 1.7 — The ID-number secret and hash

- [x] **Action.** `ID_HASH_SECRET` in `backend/src/config/env.ts`: optional at
      boot, but at least 32 characters when set, and never a value containing
      `replace-me`. Add it to `backend/.env.example` **blank** — a placeholder
      long enough to pass would key real hashes with a public secret — `docs/reference/environment.md` and the environment
      table in `docs/reference/deployments.md`, each saying it must never be
      rotated. New `backend/src/modules/verification/id-number.ts`:
      - `normalizeIdNumber(raw)`: Unicode NFKC, uppercase, and every character
        that is not a letter or a digit removed
      - `hashIdNumber(idType, raw)`: HMAC-SHA256 (Node's `crypto.createHmac`)
        keyed with `ID_HASH_SECRET`, over `` `${idType}:${normalizeIdNumber(raw)}` ``,
        as hex. It throws when the secret is unset, refuses a normalised
        number shorter than 4 characters, and refuses anything but A–Z and 0–9
        after normalising: a Cyrillic "О" or an Arabic-Indic digit would
        otherwise hash differently from the printed number
      - `idHashReady()`: true only when the secret is set. Log a warning at boot
        in `backend/src/index.ts` when it is not

      A plain hash is not enough: ID numbers are short, so an unkeyed hash can
      be brute-forced back into the number.
- [x] **Verify.** Unit tests: `'1234-5678 9012'` and `'123456789012'` hash the
      same; the same number under two ID types hashes differently; a different
      secret gives a different hash; no secret throws; `'A-1'` is refused; the
      hash never contains the number.

## Phase 2 — Account side

Branch `feat/id-verification-account`. Dormant: only factory-made rows exercise
it.

**Built as (2026-10-11).** Differences from the steps below, found in the code:

- `POST /verification/upload-url` takes `{ side, contentType }`: the browser
  falls back to JPEG where it cannot encode WebP, and the key's extension must
  match what is uploaded.
- The ID types live in a dependency-free `modules/verification/id-types.ts`,
  which the frontend parity test imports directly; the schema imports it.
- `authKeys` did not move: the `401 ID_DECLINED` interceptor does a full page
  load to `/login`, so it never touches the query cache.
- The ID step's copy is a catalogue section of its own (`catalogs/verification/`,
  a lazy route, ADR 0055 as amended); the banner, sign-in notices and the
  browse-only sentence are in core `en.ts`. ID names are data in
  `features/verification/id-types.ts`.
- Browse-only in the interface covers what a new account can reach: messaging,
  saving, posting work, creating a profile, the avatar. Agreements, ratings and
  organisations need a profile or a conversation first; the server refuses them
  and the error displays show the catalogue sentence.
- The photo controls on the ID step stay disabled until the consent is ticked.
- The *try again* banner names the decline and links to the ID step, which
  shows the reason in full; the sign-in screen shows it too. Pinned on every
  page, a long reason took half a 320px screen.
- `requireAuth` waits for the session to be deleted before answering a decline,
  so the reason is told once even to a request racing it.
- The gate's tests include `organizations`, which arrived after this plan.

### Step 2.1 — The verification routes

- [x] **Action.** New module `backend/src/modules/verification/`
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
- [x] **Verify.** Tests (storage mocked): another account's prefix → 403; an old
      row's key → 400; a card without a back → 400; an object not uploaded →
      400; oversized or wrong type → 400; storage not ready → 503; a double
      submit → 409; a suspended account → 401.

### Step 2.2 — The gate in `requireAuth`

- [x] **Action.** In `backend/src/middleware/require-auth.ts`, in this order:
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
         `/api/v1/me/view-mode`, `/api/v1/notifications/read-all`, and
         `/api/v1/notifications/:id/read`, matched exactly like
         `ALLOWED_WHILE_LOCKED`) → `403 VERIFICATION_PENDING`. Built as: the
         view mode and marking notifications read were added on review — both
         are private to the account, and refusing them only produced errors.
      Read `req.method`/`req.originalUrl` only when a gating row exists. Add
      `declineNotice?` to `backend/src/types/session.d.ts`.
- [x] **Verify.** Tests: one write per router (me, media, offers, postings,
      conversations, agreements, ratings, notifications) → 403 for `pending`
      and for `declined_retry`; their GETs → 200; the allowlist with `?x=1`, a
      trailing slash and near misses; no row → untouched; a `declineNotice`
      session → 401 with details, then a plain 401. `guards.test.ts` still
      passes.

### Step 2.3 — Sign-in and the current user

- [x] **Action.** `authenticate()` in `backend/src/modules/auth/auth.service.ts`:
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
- [x] **Verify.** Tests: a wrong password on a declined account is the normal
      401, the right one the reason; `lastLoginAt` unchanged; ten attempts never
      turn into "rate limited"; `/auth/me` shows the status and never a key.

### Step 2.4 — Errors that keep their code

- [x] **Action.** In `frontend/src/lib/api-client.ts`, `toApiError` returns
      `ApiError extends Error` — same message, plus `status`, `code`,
      `details`. Add a response interceptor for **only** `401 ID_DECLINED`: save
      the notice in `sessionStorage` and `window.location.assign('/login')`.
      Move `authKeys` to a leaf module so the client does not import
      `features/auth/api.ts`. `isReportable` in `frontend/src/lib/error-reporting.ts`
      skips `ApiError`; add `id` to `ROUTE_WORDS`. Bump `VERSION` in
      `frontend/src/features/auth/session-cache.ts`.
- [x] **Verify.** Existing frontend tests pass; a new test covers `ApiError`.

### Step 2.5 — The ID step page

- [x] **Action.** `frontend/src/pages/onboarding/IdStepPage.tsx` at
      `/welcome/id` inside `RequireAuth`; it is also the resubmit page, showing
      the decline reason. It redirects onward when there is no row, the ID is
      already submitted, or the account is verified. Contents, in order: the
      accepted IDs; the ID consent sentence, **before** any photo — *"Your ID is
      seen only by Bilikha's administrators, to confirm you are from Biliran. It
      is kept until they review it and for 7 days after you get their decision
      (longer only while an appeal you make is being reviewed), then deleted.
      We keep only a one-way code made from your ID number, so the same ID
      cannot be used to register again after it is declined."* (corrected in
      Phase 5: a repeated ID warns the administrator rather than blocking, so
      the sentence now ends "…an administrator is told") — the issue's
      sentence plus two clauses, because an open appeal keeps the ID past the
      7 days and the code outlives the photos; guidance (all four corners, no glare,
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
- [x] **Verify.** At 320px and 1280px, light and dark: the consent sentence
      shows before either photo button; a card asks for both sides, a
      certificate for one.

### Step 2.6 — The pinned banners

- [x] **Action.** A `PinnedBanners` wrapper rendered once in `App.tsx` before
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
- [x] **Verify.** Each state on every page at phone and desktop widths, light
      and dark, with and without the staging banner; sticky headers and toasts
      sit below it.

> **Added after Phase 4 (#99): a fourth state, *ID verified*.** "Your ID is
> verified. You can now message creatives, save offers and post work." It shows
> on every page for 7 days after the latest decision that verified the ID, until
> the person closes it — the only state that can be closed. A closed notice is
> remembered on the device for that decision, so a later verification (a changed
> decision, or a granted appeal) shows it again. The account's `idVerification`
> carries `decidedAt` for it; the rules are in
> `frontend/src/features/verification/status.ts`, with tests.

### Step 2.7 — Routing to the ID step

- [x] **Action.** `frontend/src/features/auth/RequireAuth.tsx`: when
      `!user.mustChangePassword`, the data is not the remembered placeholder,
      and the row is unsubmitted or `declined_retry`, redirect to `/welcome/id`.
      `frontend/src/pages/LoginPage.tsx`: after sign-in, go to `/welcome/id`
      when the user needs it.
- [x] **Verify.** A test that the password-change and ID redirects cannot loop.

### Step 2.8 — Browse-only in the interface

- [x] **Action.** `frontend/src/features/verification/useVerificationGate.ts`
      (status, `canAct`, `explain()`). Disable or explain: message and inquire,
      save an offer, post work, create a profile or offer, agreement and rating
      actions. `VERIFICATION_PENDING` reaches the existing error displays as
      catalogue copy. While pending, refetch the current user every 60 seconds
      and on focus, so a verification takes effect without signing in again.
      `LoginPage` shows a stored decline notice, or the sign-in refusal's
      reason, in its existing alert.
- [x] **Verify.** Every one of those actions explains itself instead of failing
      on a 403.

### Step 2.9 — Document the account side

- [x] **Action.** `docs/reference/api.md`: the two verification routes,
      `VERIFICATION_PENDING`, `ID_DECLINED`, `ID_STORAGE_UNAVAILABLE`,
      `PublicUser.idVerification`.
- [x] **Verify.** `npm run docs:check` passes. A test: no non-admin response
      contains `ids/` or `token=`.

## Phase 3 — Admin review and retention

Branch `feat/id-verification-admin`. Dormant until Phase 5.

**Built as (2026-10-12).** Differences from the steps below, found in the code:

- The orphan pass is guarded in the API process too, not only in the script:
  a local database against a hosted `SUPABASE_URL` would see every real ID as
  unreferenced. The check, `storageBelongsToDatabase()`, moved to
  `backend/src/lib/storage-safety.ts` and is shared with `media:prune`. The
  timer skips the orphan pass with one warning; the decided-images pass only
  touches keys from the database's own rows and always runs.
- A signed URL lives `min(300 seconds, the time left in the 7 days)`, so it
  never outlives the window; under a second left, none is issued.
- Each side is signed on its own. A side that cannot be signed comes back
  null and the page says so; if neither can, there is no `id_viewed` row,
  because nothing was shown. Before this, one missing object made the whole
  review a 502 and the decision panel unreachable.
- **An ID is settled only by someone who saw it.** *Verify* and *not from
  Biliran* are refused (409) unless the deciding administrator has an
  `id_viewed` row on that row, which is written only when a photo was signed;
  the page also keeps both disabled until every side the ID type has is on
  screen. *Try again* stays open, as the way out when photos will not load.
  The first local run verified an account whose photos did not exist, which is
  how this was found.
- Changing the ID number after a match warning withdraws the acknowledgement
  and clears the warning, so a different number is checked against its own
  matches (`withNumberChange` in `id-review-logic.ts`).
- ID audit rows set `subject_user_id` and `id_verification_id` and leave
  `profile_id` null: a row per view would flood a profile's history.
- Each view is limited per administrator by `adminIdViewLimiter`, 60 an hour,
  failures not counted. The detail is sent `Cache-Control: no-store`.
- The body is already kept out of logs and Sentry: `pino-http` logs only
  `{ id, method, url }` (now `requestLogFields` in `app.ts`, which the test
  calls), and Sentry is an allowlist with request bodies off, so there was no
  redaction list to add `idNumber` to. The test inspects every logger call.
- A pending row is always a fresh submission (a resubmission inserts a new
  row), so it never already holds a hash; "unless the row already has a hash"
  in Step 3.7 applies to the reversal and appeal paths in Phase 4.
- Tests set `ID_HASH_SECRET` and storage themselves and restore them: CI has
  no `.env`, and the test setup turns storage off whatever `.env` holds.
- ID checks live under **People**, as [ADR 0059](../decisions/0059-the-admin-area-is-organised-by-subject.md)
  (merged while this phase was built) decides, rather than as a section of
  their own: the queue is a section of the People page (`IdCheckQueue`), a
  review is at `/admin/people/ids/:id`, and People's badge counts submitted
  IDs through `people.ids` in `GET /admin/summary`.
- The pending view is `pending` and submitted. `appealed` rows are already
  treated as open by the URL rule and the sweep; their queue is Phase 4.

### Step 3.1 — The queue and the review

- [x] **Action.** In the admin module (all routes behind `requireAdmin`):
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
- [x] **Verify.** Tests: a non-admin and a signed-out caller get 404; each view
      writes one `id_viewed` row; the signed-download call asks for 300 seconds;
      a row decided 7 days and one minute ago whose images still exist gets no
      URLs and no storage call.

### Step 3.2 — The decision

- [x] **Action.** `POST /admin/id-verifications/:id/decision`
      `{ decision: 'verify' | 'retry' | 'final', reason, idNumber?, noIdNumber?,
      acknowledgeMatch? }` (the last three: Step 3.7) — reason required to
      decline, at most 500 characters. Refused (409) for your own submission, a
      suspended account, or a row that is not submitted and pending. One
      transaction: status, `reviewed_by`, `decided_at`, `decision_reason`, the
      audit row (`id_verification_id` set), and for a decline the session rewrite — each of the account's
      session rows (by `user_id`, and the legacy `LIKE` on `data`) set to
      `data = ((data::jsonb - 'userId') || jsonb_build_object('declineNotice', …))::text`,
      `user_id = null`, cookie kept. The helper is shared with
      `resetAccountPassword` in `backend/src/modules/admin/admin.service.ts`,
      which keeps deleting. After commit, `notify` the account `id_verified`.
- [x] **Verify.** Tests: each decision writes its audit row; a decline rewrites
      every session including a legacy one, and the next request gets
      `ID_DECLINED` with the reason; after *verify*, a write on the same session
      succeeds; self, suspended and double decisions are refused.

### Step 3.3 — Deleting the images

- [x] **Action.** `backend/src/modules/verification/retention.ts`:
      `purgeDecidedIdImages(now)` deletes the images of rows decided at least 7
      days before `now` and **not `appealed`** (an open appeal keeps its ID),
      then nulls the keys and sets `images_deleted_at` (conditional on it being
      null); `purgeOrphanIdObjects(now)` deletes ID
      objects older than 24 hours that no row references. Both catch and log
      every error. Start an hourly timer, plus one run a minute after start, in
      `backend/src/index.ts` (never in `createApp`), `unref`'d. Add
      `npm run ids:purge` (`backend/src/scripts/purge-id-images.ts`).
- [x] **Verify.** Tests: a row decided 8 days ago loses its images and keeps its
      record; one decided 6 days ago keeps both; an `appealed` row decided 8
      days ago keeps both; a fresh orphan and a referenced key are kept; a
      storage error is logged, not thrown.

### Step 3.4 — The admin pages

- [x] **Action.** Section **ID checks** at `/admin/ids` in
      `frontend/src/pages/admin/admin-sections.ts` (and its test) and lazy
      routes in `frontend/src/App.tsx`: `AdminIdQueuePage` (Pending and Decided
      tabs) and `AdminIdReviewPage` — front and back side by side, the
      registered facts with `AdminFact`, and a decision panel like
      `AdminProfilePage`'s: **Verify**, **Decline — try again**, **Decline — not
      from Biliran**, the reason labelled as what the person sees. Above the
      buttons, an **ID number** field typed by the administrator from the photo,
      and a **This document has no ID number** checkbox; a `409 ID_NUMBER_MATCH`
      (Step 3.7) shows as a warning listing each matching account, its status
      and decision date, and *Verify* then asks for a reason. Its query uses
      `staleTime: 0` and `gcTime: 0`, is never prefetched, and refetches when an
      image fails to load. New `AdminStatus` entries in
      `frontend/src/pages/admin/admin-ui.tsx`; hooks in
      `frontend/src/features/admin/api.ts`.
- [x] **Verify.** At 1280px and 375px, light and dark.

### Step 3.5 — Document the admin side

- [x] **Action.** `docs/reference/api.md` for the three admin routes.
- [x] **Verify.** `npm run docs:check` passes.

### Step 3.6 — Check signed-URL expiry by hand

- [x] **Action.** Open a review, copy a signed URL, and `curl` it after 5
      minutes.
- [x] **Verify.** It is refused. The object's
      `/storage/v1/object/public/ids/…` URL is refused at any time.
      *Done 2026-10-12 against the local stack:* the signed URL answered 200 at
      75 seconds and `400 InvalidJWT` ("exp" claim timestamp check failed) at
      310; the public URL answered 400 from the start.

### Step 3.7 — Recognise a repeated ID

- [x] **Action.** In the decision service. This covers Step 3.2 and also the
      reversal and appeal paths in Steps 4.1 and 4.3.
      - A decision that ends in `verified` or `declined_final` needs either
        `idNumber` or `noIdNumber: true`, unless the row already has a hash or
        `id_number_absent`. *Try again* needs neither, because the photo may be
        unreadable.
      - Answer `503 ID_HASH_UNAVAILABLE` when `idHashReady()` is false.
      - Hash with `hashIdNumber(row.idType, idNumber)` and store only the hash
        (`id_number_hash`), or `id_number_absent = true`.
      - Before writing, look up every **other account's** row with the same
        hash. The person's own earlier rows never count. If there are matches
        and `acknowledgeMatch` is not `true`, answer `409 ID_NUMBER_MATCH` with
        `details.matches`: for each match, the account's username, the row's
        status and its `decided_at`. Never the hash, never the number.
      - With `acknowledgeMatch: true`, a *verify* also requires `reason`, and its
        audit row records "Verified despite N matching account(s): <reason>". A
        *not from Biliran* decline needs no extra reason.
      - The request body is never logged. Confirm that `pino-http` and Sentry's
        request capture (ADR 0053) leave the body out, and add `idNumber` to any
        redaction list that exists.
- [x] **Verify.** Tests: *verify* without a number or `noIdNumber` gets 400;
      *try again* without one gets 200; the stored row holds a 64-character hex
      hash and the number appears nowhere in it; a second account's ID with the
      same number written differently (`1234 5678` and `12345678`) gets 409
      listing the first account; the same with `acknowledgeMatch` and a reason is
      verified, and the audit row says so; the person's own earlier row never
      matches; with the secret unset the answer is 503; no response or log line
      contains the number.

## Phase 4 — Reversal and appeals

Branch `feat/id-verification-appeals`. Dormant until Phase 5. It comes before
switch-on so that no *not from Biliran* decline is ever made without a way to
challenge it.

**Built as (2026-10-13).** Differences from the steps below, found in the code:

- **Changing a decision, or answering an appeal, needs a fresh look at the
  photos** (found in Phase 3): an `id_viewed` row by that administrator since
  the decision being changed, or since the appeal. *Try again* needs none.
- **The 7-day edge is race-free.** The purge used to delete a row's objects
  before stamping it, so an appeal landing in between would be left with no
  photos. It now claims the row first (`claimForDeletion`: keys cleared,
  `images_deleted_at` set, guarded on not being appealed and the decision still
  being 7 days old) and deletes the objects after. The appeal's own write is
  guarded on `images_deleted_at` being null. Whichever writes first wins. An
  object that fails to delete after the claim is no longer referenced, so the
  unreferenced-object pass removes it.
- **A change applies only to the account's latest row.** Once the person has
  sent a new ID, the old decision no longer governs the account.
- **`appealUntil` is filled in** by one helper, `appealDeadline` in
  `modules/verification/window.ts` (with the 7-day constant, shared by review,
  appeal and retention). It is in sign-in's 403 and in the notice a decline
  writes into sessions, so an open tab lands on a sign-in screen that already
  offers the appeal.
- **The appeal is made on the sign-in screen,** with the username and password
  fields already there, and gives `ID_APPEAL_CLOSED` (409) when there is
  nothing to appeal. That answer follows the right password, so the shared
  sign-in limiter does not count it, as it does not count `ID_DECLINED`. The
  credential check is `checkCredentials` in `auth.service.ts`, shared by
  sign-in and the appeal.
- **The reason is required for a change and for both appeal answers.** A
  change's audit row reads "Changed from <old> to <new>: <reason>".
- **The Appeals tab is part of People's ID checks** (ADR 0059), and People's
  badge counts open appeals as `people.appeals`. `appeals`, `appealedAt` and
  `changeableUntil` are optional in the contracts for deployment skew (ADR
  0040), like `people.ids`.
- **Who made the original decision is shown** on an appeal, with a note when it
  was the administrator now answering; it is not enforced.
- **A not-from-Biliran decline whose appeal was answered can still be
  changed** within its 7 days, but never appealed again.

### Step 4.1 — An administrator reverses a decision

- [x] **Action.** `POST /admin/id-verifications/:id/decision` also accepts a
      **decided** row whose `decided_at` is under 7 days ago (while its ID can
      still be looked at): any decision may be changed to any other, with a
      reason (required, at most 500 characters). Same transaction as Step 3.2:
      `status`, `reviewed_by`, `decided_at` (now — the 7 days start again),
      `decision_reason`, an `id_decision_reversed` audit row with
      `id_verification_id`, and the session rewrite when the new decision is a
      decline. Reversed to *verify*: `notify` `id_verified`. Refused (409) after
      the 7 days, for your own submission, or for an `appealed` row (decided
      through Step 4.3 instead).
- [x] **Verify.** Tests: a mistaken *not from Biliran* reversed to *verify*
      within the window lets the account sign in and write; a *verify* reversed
      to a decline revokes its sessions with the reason; 7 days and one minute
      after the decision → 409; each reversal writes its audit row.

### Step 4.2 — The person appeals

- [x] **Action.** `POST /api/v1/auth/id-appeal`
      `{ username, password, message }`, **not** behind `requireAuth` — a
      declined account cannot sign in. It authenticates exactly as sign-in does
      (same checks, behind `loginLimiter`, a wrong password is the normal 401),
      then requires the latest row to be `declined_final`, decided under 7 days
      ago, with no earlier appeal (`appealed_at` null). `message` 20–1000
      characters. Sets `status = 'appealed'`, `appeal_message`, `appealed_at`;
      creates no session. A *try again* decline cannot appeal — it resubmits.
      `details.appealUntil` (Step 2.3) is `decided_at` + 7 days while these
      conditions hold.
- [x] **Verify.** Tests: wrong password → 401 and the row unchanged; right
      password → 200, row `appealed`, no session cookie; a second appeal → 409;
      after 7 days → 409; a `declined_retry` account → 409; sign-in while
      `appealed` → `403 ID_DECLINED` saying it is under review.

### Step 4.3 — An administrator decides the appeal

- [x] **Action.** An **Appeals** view in the queue (`view=appeals`, oldest
      `appealed_at` first) and `POST /admin/id-verifications/:id/appeal`
      `{ outcome: 'grant' | 'uphold', reason }`. The review shows the ID, the
      original decision, who made it and why, and the appeal message; it
      suggests, but does not require, that someone other than the original
      decider answers — the team is small. *Grant*: status `verified`,
      `notify` `id_verified`, `id_appeal_granted` audit row. *Uphold*: status
      `declined_final` with `appeal_decided_at` set (so no second appeal), the
      reason shown at sign-in, `id_appeal_upheld` audit row. Either way
      `decided_at` = now and the 7 days start again.
- [x] **Verify.** Tests: grant lets the account sign in and write; uphold makes
      sign-in show the new reason and refuses another appeal; the images are
      kept while `appealed`, then follow the 7 days from the outcome; both
      write their audit rows; a non-admin gets 404.

### Step 4.4 — The appeal and reversal screens

- [x] **Action.** `frontend/src/pages/LoginPage.tsx`: on `ID_DECLINED` with
      `appealUntil`, show the reason and **Appeal this decision** (until that
      date), opening a short form for the message; on success, "Your appeal is
      being reviewed. Try signing in after you hear from us." Upheld: the reason,
      and no appeal. Admin: the Appeals tab on `AdminIdQueuePage`, and a
      **Change decision** action on a decided review within its 7 days. All
      copy in `frontend/src/i18n/catalogs/en.ts`, empty keys in `fil`/`war`.
- [x] **Verify.** At 320px and 1280px, light and dark: the appeal form, the
      under-review message, an upheld decline; the admin Appeals tab and
      Change decision.
      *Done 2026-10-13 against the local stack:* decline → appeal from the open
      tab → under review → uphold (new reason, no appeal); appeal → grant (signs
      in, notified); verify → change to try again (tab signed out with the
      reason); and the 7-day edge both ways round against `ids:purge`.

### Step 4.5 — Document reversal and appeals

- [x] **Action.** `docs/reference/api.md`: `POST /auth/id-appeal`,
      `POST /admin/id-verifications/:id/appeal`, the `appeals` view, reversal
      on the decision route; `docs/reference/data-model.md`: the `appealed`
      status and the appeal columns.
- [x] **Verify.** `npm run docs:check` passes.

## Phase 5 — Switch on

Branch `feat/id-verification-signup`. **Merge only after the private bucket
exists, with its limits, on staging and production, and production is on an
always-on Render instance** (Prerequisites).

**Built as (2026-10-15).** Differences from the steps below, found in the code:

- **The privacy keys live in `frontend/src/i18n/catalogs/legal/en.ts`**, not
  `catalogs/en.ts` as Step 5.3 says (they moved after this plan was written).
- **Registration always writes the row,** even where ID storage is not ready:
  skipping it would silently switch verification off on a misconfigured
  server. Without the bucket the ID step says it is unavailable and the person
  can still browse.
- **Registration goes to `/welcome/id?next=/welcome?next=<where they were>`**
  (`afterRegistrationPath`). The ID step needed no notion of registration: it
  leaves for its `next`, which is the intent question here, and the original
  destination after a *try again*. "Step 1 of 3" shows only on that way to the
  intent question (`inRegistrationFlow`), never on a resubmission.
- **Every new account is still waiting when it reaches the intent question,**
  so the creative choice cannot lead to a form that cannot be sent. It says the
  profile can be set up once the ID is verified, and continues like the hire
  choice. The "ID verified" banner gains **Set up your creative profile** for
  an account without one. Profile setup shows its browse-only note above the
  form, not under it.
- **The intent and profile counters stay hard-coded English,** like the rest
  of those two pages, which have never been in the catalogue; only the ID
  step's counter is a key (`idStep.step`). `register.intro` is blank in `fil`
  and `war`: both promised the creative step next (ADR 0055, no machine
  translation).
- **The privacy notice also changed where it had become wrong:** what is
  collected, what is never published, what administrators see, and how long
  things are kept. Its new section says an administrator *is told* when the
  same ID number is on another account, which is what the code does. The ID
  step's consent sentence (Step 2.5) said such an ID "cannot be used to
  register again", which overstated it; reyxdz approved the correction
  (2026-10-15), and it now ends "…so that if the same ID is used for another
  account, an administrator is told." It changes inside the same
  `CONSENT_VERSION`, 2026-10-15, before any account agreed to it. The terms
  gained `terms.who.id`: Bilikha is for people from Biliran.
- **The first administrator on a fresh local database cannot verify their own
  ID** (nobody decides their own); the admin area is not behind the ID gate,
  so they can review everyone else's. `local-setup.md` says how to verify them
  locally.
- **The sign-in screen keeps `next`** when it sends an account to the ID step.
- **The privacy notice's ID section is a labelled list** in plain words — no
  company or technical names (a test keeps them out); who stores data is named
  once, under "Who else can see your data". Both legal pages gained an "On this
  page" list in the margin on wide screens (`LegalLayout`), read off the page's
  own sections; the text keeps its reading width at every size.

### Step 5.1 — Registration writes the first row

- [x] **Action.** `registerUser` in `backend/src/modules/auth/auth.service.ts`
      inserts the user and its `pending` row in one `db.transaction`, and builds
      the returned `PublicUser` **after** the commit (inside it, `toPublicUser`
      reads through `db` and would not see the row).
- [x] **Verify.** Route tests: registering creates exactly one pending,
      unsubmitted row and the response shows it; a duplicate username creates
      no row.

### Step 5.2 — Onboarding goes through the ID step

- [x] **Action.** `frontend/src/pages/RegisterPage.tsx` navigates to
      `/welcome/id`, carrying `?next`; its intro copy no longer promises the
      creative step next. Step counters: ID 1 of 3 (`IdStepPage`), intent 2 of 3
      (`IntentPage.tsx`), profile 3 of 3 (`ProfileSetupPage.tsx`). The intent
      page's creative path explains it unlocks after verification.
- [x] **Verify.** A new registration at 375px lands on the ID step, then intent.

### Step 5.3 — The privacy notice

- [x] **Action.** Add an ID section to the privacy notice. Its words are
      catalogue keys in the `privacy.*` block of
      `frontend/src/i18n/catalogs/en.ts`, with empty `fil`/`war` entries, read
      through `LegalSection` and `LegalText` in
      `frontend/src/pages/legal/PrivacyPage.tsx` like the other sections (plan
      0050 phase 6, and the warning at the top of that block). The section
      says: the ID photo collected at registration is sensitive personal
      information under RA 10173; what it is for; that only administrators see it; that it is deleted
      7 days after the decision, or after an appeal's outcome while one is
      open; that a *not from Biliran* decline can be appealed within 7 days;
      that a one-way code made from the ID number (a keyed hash, which cannot be
      read back as the number) is kept for as long as the verification record
      exists, so an administrator is told if the same ID is used for another
      account; the
      controller is `LEGAL_OPERATOR`. Bump `LEGAL_LAST_UPDATED` in
      `frontend/src/lib/legal.ts`, and bump `CONSENT_VERSION` in both
      `frontend/src/lib/legal.ts` and `backend/src/modules/auth/auth.service.ts`
      to the release date (Decided 4).
- [x] **Verify.** The retention sentence reads the same on the ID step and in
      the notice; a new registration stores the new `CONSENT_VERSION`.

### Step 5.4 — Rollout notes

- [ ] **Action.** The pull request's Rollout section names
      `SUPABASE_ID_BUCKET` (default `ids`) for both Render services, confirms
      both buckets exist, names `ID_HASH_SECRET` as set on both services (a
      different value on each, never rotated), and confirms
      `bilikha-production` is on an always-on instance.
- [ ] **Verify.** `npm run check:pr` passes on the description.

### Step 5.5 — Verify end to end on staging

- [ ] **Action.** On a real Android phone, including Facebook's in-app browser:
      register, photograph both sides, see the banner; verify as an
      administrator, and see the person told so by the *ID verified* notice;
      decline (try again) and resubmit; decline (not from
      Biliran), appeal, and both grant and uphold an appeal; reverse a decision;
      register a second account with the same ID and see it flagged; sign in
      with an account made before the release.
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
- [ ] A repeated ID, meaning the same number on another account, is recognised
      and shown to the administrator. No ID number is stored, logged or returned
      anywhere, only its keyed hash.
- [ ] Accounts from before the release behave exactly as before.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run docs:check` pass on every phase.

## Decided (reyxdz, 2026-10-10)

1. **The private `ids` bucket:** reyxdz creates it on staging and production
   before Phase 5 merges, with a **10 MB** limit and **WebP and JPEG** only.
2. **The 7 days start when the decision is made** — the moment the person is
   told, by notification or decline notice. There is **no deadline for the
   review itself**: a pending submission waits as long as it takes.
3. **Decisions can be reversed by an administrator, and a *not from Biliran*
   decline can be appealed by the person**, within the 7 days (Phase 4).
4. **`CONSENT_VERSION` is bumped** with the privacy notice's ID section, so a
   new registration records which notice it agreed to.
5. **A repeated ID is recognised by a keyed hash of its number** (2026-10-11).
   A *not from Biliran* decline belongs to an account, so someone declined
   could otherwise register again with other details and the same ID.
   - The administrator types the number from the photo. A number the person
     typed could be invented.
   - It is hashed with HMAC-SHA256 and a server secret, never stored, and the
     hash outlives the photos (Steps 1.7 and 3.7).
   - A match warns the administrator rather than blocking. Verifying despite a
     match needs a reason on the record.
   - It is disclosed in the consent sentence and the privacy notice.

## Follow-ups

- Translations of the new copy into Filipino and Waray (ADR 0055).
- When account deletion is built (ADR 0032), decide whether a *not from
  Biliran* decline's ID hash outlives the deleted account. Today it cascades
  with the account, and the recognition goes with it.
