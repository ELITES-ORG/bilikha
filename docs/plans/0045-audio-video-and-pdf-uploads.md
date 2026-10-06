# 0045. Audio, video and PDF uploads, with limits per media type

- **Status:** Draft
- **Owner:** reyxdz
- **Related:** [ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md) ·
  [ADR 0021](../decisions/0021-image-storage-and-upload-path.md) ·
  [ADR 0022](../decisions/0022-offers-replace-portfolio.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #34](https://github.com/ELITES-ORG/bilikha/issues/34)

## Goal

A creative can add images, audio, video and PDFs to each offer and to a
portfolio on their profile. Every kind has its own per-file size, duration and
count limits, enforced by the API, by its storage bucket, and by a check of the
stored object before it is recorded. Audio, video and PDF upload resumably, with
progress, cancel and a warning before leaving the page. Visitors see players
that download nothing until tapped, and badges on cards. Administrators review
and remove single items. An environment switch keeps the new kinds off in
production until Supabase Pro is active there.

## Scope

**In scope**
- The limits, quota and rate limit in [ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md).
- Images raised from 4 to 10 per offer.
- A profile-level portfolio with the same per-kind caps as one offer.
- Checking stored objects before they are recorded, for images too. This closes
  the existing gap where the confirm step trusts the client.
- Per-item review, so media added to an already-reviewed offer reaches the
  admin queue.
- Orphan cleanup across every bucket, plus expired upload reservations.
- A terms-of-use line about rights.

**Out of scope** — and where it is handled instead
- Renaming the SQL table `offer_images` to `media_items`. It takes two releases.
  Listed under Follow-ups.
- Making `offer_images.profile_id` required. It needs a release after this one.
  Listed under Follow-ups.
- Server-side transcoding, probing duration on the server, MOV and HEVC. ADR 0046
  rejects them.
- Reordering media within an offer. Items append in upload order, as images do
  today.
- Avatars. Their upload path and review are unchanged, apart from the shared
  rate limit and the stored-object check.

## Rules for whoever executes this

1. **Each phase is one pull request into `main`,** in order, with the PR
   template filled in and `pr-audit` passing. Phase 2 (a probe) and Phase 9
   (the rollout) have no pull request.
2. **Migrations are additive.** Render migrates while the previous instance is
   still serving. Never rename or drop a column or table that the running code
   reads. Every new column is nullable or has a default.
3. **Contracts change additively.** The frontend can go live before the backend
   ([ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md)). A
   field the frontend reads from a new backend is optional in its contract, and
   the UI copes with it missing.
4. **Old endpoints keep working until the follow-up.** That means
   `POST /api/v1/media/upload-url` with `kind: "offer"`,
   `POST /api/v1/offers/:id/images` and `DELETE /api/v1/offers/images/:imageId`.
   An open tab running the old frontend calls them.
5. **No commit carries AI attribution** ([`CLAUDE.md`](../../CLAUDE.md)).
6. **Before each pull request:** `npm run typecheck`, `npm run lint`,
   `npm run docs:check`, `npm test`, and, for frontend phases,
   `npm --prefix frontend run build && npm run check:bundle`.

## Prerequisites

- `main` is clean and up to date: `git status` and `git fetch && git status`.
- The local database is migrated: `npm --prefix backend run db:migrate` reports
  nothing pending.
- Backend tests pass against a real Postgres, with `DATABASE_URL` exported from
  `backend/.env`: `npm --prefix backend test`.
- For Phase 2 only: the staging Supabase project's service role key is in
  `backend/.env`, never in a commit.

## Blockers

- **Phase 9 needs Supabase Pro on both projects.** reyxdz moves the Bilikha
  organisation to Pro. Phases 1–8 can merge before then, because the new kinds
  stay off until `MEDIA_UPLOAD_KINDS` is set.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Decide and record | 0 / 3 | Not started |
| 2. Prove the transport | 0 / 2 | Not started |
| 3. Schema and the one read path | 0 / 5 | Not started |
| 4. The upload pipeline | 0 / 10 | Not started |
| 5. The offer editor | 0 / 7 | Not started |
| 6. The portfolio | 0 / 3 | Not started |
| 7. What visitors see | 0 / 4 | Not started |
| 8. Moderation, cleanup and terms | 0 / 4 | Not started |
| 9. Rollout | 0 / 6 | Not started |

---

## Reference — the numbers

These numbers live in `backend/src/modules/media/media.limits.ts` and nowhere
else. The frontend reads them from `GET /api/v1/media/limits`.

| Kind | Bucket | Stored MIME types | Per file | Duration | Per offer / portfolio | Reserved per ticket |
|---|---|---|---|---|---|---|
| `image` | `{SUPABASE_STORAGE_BUCKET}` | `image/webp`, `image/jpeg` | 2 MB (20 MB picked) | | 10 | 4 MB (display + thumb) |
| `audio` | `{SUPABASE_STORAGE_BUCKET}-audio` | `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg` | 15 MB | 600 s | 5 | 15 MB |
| `video` | `{SUPABASE_STORAGE_BUCKET}-video` | `video/mp4`, `video/webm` | 300 MB | 300 s | 2 | 302 MB (file + poster) |
| `document` | `{SUPABASE_STORAGE_BUCKET}-documents` | `application/pdf` | 10 MB | | 3 | 10 MB |

- **Quota:** 1 GiB (1,073,741,824 bytes) per creative profile. It counts the
  `size_bytes` of recorded items plus the `reserved_bytes` of unexpired
  reservations. Legacy images have no recorded size and count as 0.
- **Rate limit:** `uploadLimiter`, 30 tickets per hour per user, shared by every
  kind and by avatars.
- **Reservations:** 24 hours, which matches how long a Supabase TUS upload URL
  stays valid.
- **MB means 1,000,000 bytes, matching Supabase's limits.** The browser messages
  use the same unit, so "15 MB" means the same thing everywhere.

Normalising types the browser reports:

- `audio/x-m4a` becomes `audio/mp4`.
- `audio/mp3` becomes `audio/mpeg`.
- `audio/opus` becomes `audio/ogg`.

Anything else not in the table is refused before a ticket is requested.

File signatures, checked on the first 64 bytes:

| Type | Signature |
|---|---|
| `image/webp` | `RIFF` at 0, `WEBP` at 8 |
| `image/jpeg` | `FF D8 FF` at 0 |
| `audio/mpeg` | `ID3` at 0, or a frame sync (`FF`, then a byte with the top three bits set) |
| `audio/aac` | ADTS sync `FF F1` or `FF F9` at 0 |
| `audio/mp4`, `video/mp4` | `ftyp` at 4 |
| `audio/ogg` | `OggS` at 0 |
| `video/webm` | `1A 45 DF A3` at 0 |
| `application/pdf` | `%PDF-` at 0 |

---

## Phase 1 — Decide and record

Pull request: `docs: plan and ADR for audio, video and PDF uploads`.

### Step 1.1 — Write ADR 0046

- [ ] **Action.** Create `docs/decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md`
  with status Proposed. Add a row to `docs/decisions/README.md`. Mark
  `0021-image-storage-and-upload-path.md` and `0022-offers-replace-portfolio.md`
  as partly superseded and amended by it, both in their headers and in the log.
- [ ] **Verify.** `npm run docs:check` passes.

### Step 1.2 — Write this plan

- [ ] **Action.** This file, with a row in `docs/plans/README.md`.
- [ ] **Verify.** `npm run docs:check` passes. reyxdz has reviewed the plan, and
  its status is changed from Draft to Ready in both places.

### Step 1.3 — Open the pull request

- [ ] **Action.** Branch `docs/media-uploads-plan`. Open a pull request into
  `main` using the template. reyxdz commits, pushes and opens it from his own
  terminal, because the agent shell adds a co-author trailer that the
  `commit-msg` hook rejects.
- [ ] **Verify.** `pr-audit` is green.

---

## Phase 2 — Prove the transport

There's no pull request; the results are written into this step. If any check
fails, **stop**: mark the plan Blocked and take the result to reyxdz. The TUS
design depends on these assumptions.

### Step 2.1 — A signed upload token authorises a TUS upload

- [ ] **Action.** On staging, create a throwaway private bucket `tus-probe` with
  `file_size_limit` 1 MB. Issue a signed upload URL for `probe/a.bin` with
  `POST {SUPABASE_URL}/storage/v1/object/upload/sign/tus-probe/probe/a.bin`,
  using the service key, and keep its `token`.
  Then, from a browser page served at `http://localhost:5173`, run `tus-js-client`
  against `https://{ref}.storage.supabase.co/storage/v1/upload/resumable` with:
  - `headers: { 'x-signature': token }`
  - `metadata: { bucketName, objectName, contentType }`
  - `chunkSize: 6 * 1024 * 1024`

  Upload a 500 KB file, then a 2 MB file.
- [ ] **Verify.** The 500 KB upload succeeds with no CORS error, and
  `GET /object/info/tus-probe/probe/a.bin` reports its size. The 2 MB upload is
  refused, ideally at creation (`Upload-Length` over the limit) rather than after
  the bytes are sent. Write down which. Then delete the bucket.

### Step 2.2 — An interrupted TUS upload resumes

- [ ] **Action.** Repeat the 500 KB upload with a 200 KB chunk size and the
  network throttled. Turn the network off in DevTools partway through, then back
  on.
- [ ] **Verify.** The upload completes, and the request log shows a `HEAD` and
  `PATCH` continuing from an offset above zero, not a new `POST`. Record the
  result here, including whether a resumed `PATCH` still sends `x-signature`.

---

## Phase 3 — Schema and the one read path

Pull request: `refactor(media): generalise offer_images in place, behind one read module`.
Visible behaviour doesn't change.

### Step 3.1 — Generalise the table in the Drizzle schema

- [ ] **Action.** In `backend/src/db/schema/profiles.ts`:
  - Add `export const mediaKindEnum = pgEnum('media_kind', ['image', 'audio', 'video', 'document'])`.
  - Rename the export `offerImages` to `mediaItems`, still on table
    `'offer_images'`, with a comment saying the SQL name is kept until the rename
    follow-up.
  - Make `offerId` and `thumbKey` nullable.
  - Add:
    - `profileId: uuid('profile_id').references(() => creativeProfiles.id, { onDelete: 'cascade' })`, nullable for now.
    - `kind: mediaKindEnum('kind').notNull().default('image')`.
    - `mimeType: text('mime_type')`.
    - `sizeBytes: bigint('size_bytes', { mode: 'number' })`.
    - `durationSeconds: integer('duration_seconds')`.
    - `title: text('title')`.
    - `reviewedAt: timestamp('reviewed_at', { withTimezone: true })`.
  - Add indexes `offer_images_profile_kind_idx` on `(profile_id, kind)` and
    `offer_images_unreviewed_idx` on `(created_at)` where `reviewed_at is null`.
  - Add a check `offer_images_image_has_thumb`:
    `kind <> 'image' OR thumb_key IS NOT NULL`.

  Add the table `mediaUploads` (`media_uploads`):
  - `id` uuid primary key.
  - `profile_id` uuid, required, cascades with the profile.
  - `offer_id` uuid, nullable, cascades with the offer. Null means the portfolio.
  - `kind` media_kind, required.
  - `object_key` text, required, unique.
  - `thumb_key` text, nullable.
  - `mime_type` text, required.
  - `size_bytes` bigint, required.
  - `thumb_size_bytes` integer, nullable.
  - `duration_seconds` integer, nullable.
  - `reserved_bytes` bigint, required.
  - `expires_at` timestamptz, required.
  - `created_at` timestamptz, defaulting to `now()`.
  - Index `media_uploads_profile_expiry_idx` on `(profile_id, expires_at)`.
- [ ] **Verify.** `npm --prefix backend run typecheck` lists only the
  `offerImages` imports Step 3.4 replaces.

### Step 3.2 — Generate the migration and add the backfill

- [ ] **Action.** `npm --prefix backend run db:generate`. Append this to the
  generated SQL, after its `ALTER TABLE` statements:

  ```sql
  UPDATE "offer_images" AS oi
  SET "profile_id" = o."profile_id",
      "reviewed_at" = CASE
        WHEN o."reviewed_at" IS NOT NULL AND oi."created_at" <= o."reviewed_at"
        THEN o."reviewed_at"
      END
  FROM "offers" AS o
  WHERE o."id" = oi."offer_id";
  ```

  An image added after its offer was reviewed was never reviewed, so it is left
  unreviewed and enters the queue.
- [ ] **Verify.**
  - The generated file contains no `DROP`, no `RENAME`, and no `SET NOT NULL`.
  - `npm --prefix backend run db:migrate` succeeds locally.
  - `select count(*) from offer_images where profile_id is null` returns 0.

### Step 3.3 — Write the read module

- [ ] **Action.** Create `backend/src/modules/media/media.items.ts`. This is the
  only module, apart from `media.service.ts`, the scripts and `db/`, that touches
  `mediaItems`. It exports:
  - `imagesForOffers(offerIds)`, returning `Map<offerId, OfferImage[]>`. It
    filters `kind = 'image'` and orders by `sort_order`.
  - `mediaForOffers(offerIds)`, returning `Map<offerId, MediaItem[]>` for the
    kinds other than image.
  - `portfolioFor(profileId)`, returning `{ images, media }`, where `offer_id is null`.
  - `coverImageForOffers(offerIds)`: the first image for each offer, or else the
    first video's poster.
  - `mediaBadgeForOffers(offerIds)`: the first non-image kind with its count and
    first duration, or null.
  - `objectsForOffer(offerId)` and `objectsForProfile(profileId)`: every key with
    its bucket, for deletion.

  The URL shapes are built here, using `publicUrl(bucket, key)`.
- [ ] **Verify.** `npm --prefix backend run typecheck` passes for this file.

### Step 3.4 — Move every reader to the module

- [ ] **Action.** Replace direct `offerImages` reads with the module's functions in:
  - `backend/src/modules/offers/offers.service.ts`
  - `backend/src/modules/profiles/profiles.service.ts`
  - `backend/src/modules/me/me.service.ts`
  - `backend/src/modules/conversations/conversations.service.ts`
  - `backend/src/modules/admin/admin.service.ts`

  Writes (`addOfferImage`, `deleteOfferImage`, `deleteOffer`) move into
  `media.service.ts` as functions the offers service calls.
  `backend/src/scripts/prune-orphan-media.ts` and
  `backend/src/scripts/migrate-portfolio-to-offers.ts` import `mediaItems`
  directly; scripts are allowed to.
- [ ] **Verify.** `rg "offerImages" backend/src` finds nothing. `npm test` passes.
  `backend/src/modules/profiles/offer-shape.test.ts` and
  `offer-detail-rating.test.ts` pass unchanged, which shows the shapes didn't move.

### Step 3.5 — Forbid reading the table directly

- [ ] **Action.** Create `backend/src/modules/media/media-reads.test.ts`. It
  walks `backend/src` and fails if any file imports `mediaItems` or
  `mediaUploads`, other than files under `modules/media/`, `db/` and `scripts/`.
  The message names the file and says to use `media.items.ts`.
- [ ] **Verify.** The test passes. Adding a temporary
  `import { mediaItems } from '../../db/schema/index.js'` to
  `offers.service.ts` makes it fail with that file named.

---

## Phase 4 — The upload pipeline

Pull request: `feat(media): checked uploads for every kind, with limits, quota and an off switch`.
The new kinds stay off, because `MEDIA_UPLOAD_KINDS` defaults to empty. Images
change in two ways: they are checked before being recorded, and the limit is 10
per offer.

### Step 4.1 — Write the tests that define the behaviour

- [ ] **Action.** Create `backend/src/modules/media/media.test.ts`. It uses the
  real database harness from `backend/src/test/`, with `lib/storage.ts` mocked by
  `vi.mock` so there's no network. Write one test for each of these, before
  implementing them:
  - **Ticket refused, with the right code:**
    - over the per-file size;
    - a disallowed type;
    - over the duration;
    - audio or video without a duration;
    - over the per-offer count, with reservations for the same offer and kind counting;
    - over the portfolio count;
    - over the quota, with reservations counting at their reserved size;
    - a kind that is switched off;
    - another creative's offer;
    - not a creative.
  - **Confirm refused, deleting the objects and the reservation:**
    - the stored size differs from the declared size;
    - the stored type differs;
    - the signature is wrong;
    - the reservation has expired;
    - someone else's reservation;
    - the count or quota was reached between ticket and confirm.
  - **Confirm succeeds:**
    - the item is recorded with `reviewed_at` null and the reservation is gone;
    - the offer's text review (`offers.reviewed_at`) is untouched.
  - **The legacy path:**
    - `POST /offers/:id/images` with keys from a `kind: "offer"` ticket is checked
      the same way;
    - a forged object is refused and deleted.
  - **The rate limit:** the 31st ticket in an hour is refused with 429.
- [ ] **Verify.** `npm --prefix backend test -- media` runs and every new test fails.

### Step 4.2 — Limits and signatures, as pure code

- [ ] **Action.**
  - `backend/src/modules/media/media.limits.ts`: the reference table as a typed
    constant, `normaliseMimeType`, `bucketFor(kind)` (derived from
    `env.SUPABASE_STORAGE_BUCKET`), and `QUOTA_BYTES`.
  - `backend/src/modules/media/media.sniff.ts`:
    `matchesSignature(mimeType, firstBytes: Uint8Array): boolean`, following the
    reference table.
  - `media.limits.test.ts` and `media.sniff.test.ts`, with one positive and one
    negative byte sample per type, written inline as hex.
- [ ] **Verify.** Those unit tests pass.

### Step 4.3 — The off switch

- [ ] **Action.** In `backend/src/config/env.ts`, add `MEDIA_UPLOAD_KINDS`, an
  optional string that defaults to `''`. It is parsed as a comma-separated list
  that must contain only `audio`, `video` or `document`. Anything else fails at
  startup with the field named. Images are always enabled. Add it to
  `backend/.env.example` (empty) and to `docs/reference/environment.md`.
- [ ] **Verify.** `MEDIA_UPLOAD_KINDS=audio,gif npm --prefix backend run dev`
  exits, naming `MEDIA_UPLOAD_KINDS`. `MEDIA_UPLOAD_KINDS=audio,video` starts.

### Step 4.4 — Storage: buckets, object info, the first bytes, TUS tickets

- [ ] **Action.** In `backend/src/lib/storage.ts`:
  - Every function takes a `bucket` argument. `publicUrl(bucket, key)` and
    `deleteObject(bucket, key)` replace the single-bucket versions, and the
    existing callers pass `bucketFor('image')`.
  - Add `objectInfo(bucket, key)`, which calls `GET /object/info/{bucket}/{key}`
    and returns `{ size, contentType }`, or `null` on NoSuchKey.
  - Add `readFirstBytes(bucket, key, 64)`, a `GET` of the public URL with
    `Range: bytes=0-63`.
  - Add `tusEndpoint()`: `https://{ref}.storage.supabase.co/storage/v1/upload/resumable`
    when `SUPABASE_URL` is `https://{ref}.supabase.co`, otherwise
    `{SUPABASE_URL}/storage/v1/upload/resumable`.
  - Add key builders that return keys within the kind's bucket:
    - `mediaKey(profileId, ext)` returns `media/{profileId}/{uuid}.{ext}`.
    - `posterKey(profileId)` returns `posters/{profileId}/{uuid}.webp`.
- [ ] **Verify.** `npm --prefix backend run typecheck` passes. The existing
  avatar flow still works locally, uploading and replacing an avatar.

### Step 4.5 — The bucket script

- [ ] **Action.** `backend/src/scripts/configure-media-buckets.ts`, run as
  `npm --prefix backend run media:buckets`. For each kind, it creates or updates
  the bucket through `POST /storage/v1/bucket` or `PUT /storage/v1/bucket/{id}`:
  `public: true`, `file_size_limit` set to the per-file cap (the image bucket
  gets 2 MB), and `allowed_mime_types` from the table. `--check` changes nothing
  and exits 1 on any difference, printing it. Add the command to
  `backend/package.json` and `docs/reference/commands.md`.
- [ ] **Verify.** On staging, the first run creates three buckets and updates
  `media`. A second run reports no changes. `--check` exits 0. Then, against the
  real staging bucket, a signed `PUT` of a 3 MB WebP to `media` is refused by
  storage, and so is a `PUT` with `Content-Type: image/svg+xml`.

### Step 4.6 — Issuing tickets

- [ ] **Action.** In `backend/src/modules/media/media.service.ts`, extend
  `uploadUrlBodySchema` to a discriminated union. The existing `avatar` and
  `offer` variants are unchanged. The new variant is:

  ```ts
  {
    kind: 'item',
    mediaKind,
    offerId?: uuid,          // omitted for the portfolio
    mimeType,
    sizeBytes,
    thumbSizeBytes?,         // images and video posters
    durationSeconds?,
  }
  ```

  `issueItemTicket(userId, input)`:
  1. Resolve the creative profile and check the offer belongs to it.
  2. Take `pg_advisory_xact_lock` on the profile.
  3. Delete this profile's expired reservations, along with their objects.
  4. Check, in order: kind enabled, type, size, duration, count (items plus
     reservations for the same target and kind), and quota.
  5. Insert the reservation.
  6. Return a ticket that depends on the kind:
     - **Image:** `{ reservationId, full: { uploadUrl, objectKey }, thumb: { uploadUrl, objectKey } }`.
     - **Audio or PDF:** `{ reservationId, tus: { endpoint, token, bucket, objectKey } }`.
     - **Video:** the same as audio or PDF, plus
       `poster: { uploadUrl, objectKey }` when `thumbSizeBytes` is given.

  The legacy `kind: "offer"` ticket also writes a reservation, with no offer and
  kind image, so the legacy confirm can check it.

  Error codes, all through `AppError`:

  | Code | Status | When |
  |---|---|---|
  | `MEDIA_KIND_DISABLED` | 403 | The kind isn't in `MEDIA_UPLOAD_KINDS` |
  | `MEDIA_TYPE_NOT_ALLOWED` | 422 | The type isn't on the kind's allowlist |
  | `MEDIA_TOO_LARGE` | 422 | Over the per-file size |
  | `MEDIA_TOO_LONG` | 422 | Over the duration, or a duration is missing |
  | `MEDIA_LIMIT_REACHED` | 409 | Over the count for the offer or portfolio |
  | `MEDIA_QUOTA_EXCEEDED` | 409 | Over the quota |
  | `MEDIA_UPLOAD_EXPIRED` | 410 | The reservation is gone or past its expiry |
  | `MEDIA_VERIFICATION_FAILED` | 422 | The stored object doesn't match what was declared |

  `details` carries the limit, so the UI can say what it was.
- [ ] **Verify.** The ticket tests from Step 4.1 pass.

### Step 4.7 — Confirming, deleting, cancelling

- [ ] **Action.** Add these routes in `backend/src/modules/media/media.routes.ts`,
  all requiring a signed-in user:
  - `POST /api/v1/media/items` with `{ reservationId, title? }`:
    1. Take the advisory lock.
    2. Load the reservation, checking it belongs to the caller and hasn't expired.
    3. For each object: `objectInfo`, then compare the size with the declared
       size, then check the type, then `readFirstBytes` with `matchesSignature`.
    4. Re-check the count and the quota.
    5. Insert the item with `size_bytes` set to the object plus its thumb,
       `reviewed_at` null and `sort_order` set to the next value.
    6. Delete the reservation and return `MediaItem`.

    If a check fails, it deletes the objects and the reservation and throws
    `MEDIA_VERIFICATION_FAILED`.
  - `DELETE /api/v1/media/items/:id`: owner only. It deletes the row, then the
    objects in their buckets.
  - `POST /api/v1/media/abandon` also accepts `{ reservationId }`. That deletes
    the reservation's objects and the reservation, and is what Cancel calls.

  `POST /api/v1/offers/:id/images` now calls the same check, using the
  reservation written by its `kind: "offer"` ticket.
- [ ] **Verify.** Every test in `media.test.ts` passes.

### Step 4.8 — Limits, usage and the image cap

- [ ] **Action.**
  - `GET /api/v1/media/limits` is public. It returns the per-kind limits,
    `enabled` for each kind, and `quotaBytes`.
  - `GET /api/v1/media/usage` requires sign-in and returns
    `{ usedBytes, reservedBytes, quotaBytes }`.
  - Change `OFFER_IMAGE_LIMIT` in `backend/src/db/schema/profiles.ts` to 10,
    taking it from `media.limits.ts`.
  - Lower `uploadLimiter` in `backend/src/middleware/rate-limit.ts` to 30 per hour.
- [ ] **Verify.** `curl localhost:4000/api/v1/media/limits` shows image 10, and
  `enabled: false` for the other kinds when the switch is empty.

### Step 4.9 — Contracts

- [ ] **Action.**
  - Create `backend/src/contracts/media.ts` with `MediaKind`, `MediaItem`
    (`id, kind, url, posterUrl, title, mimeType, sizeBytes, durationSeconds, sortOrder`),
    `MediaBadge`, `MediaLimits`, `MediaUsage`, and the ticket shapes.
  - Add `media?: MediaItem[]` to `ProfileOffer` and `PublishedOfferDetail`.
  - Add `mediaBadge?: MediaBadge | null` to `PublishedOfferCard`.
  - Add `portfolio?: { images: OfferImage[]; media: MediaItem[] }` to the public
    profile contract.
  - Add the per-item queue entries to the admin contract (see Phase 8).

  Fill them all in the services through `media.items.ts`.
- [ ] **Verify.** `npm run typecheck` passes at the root, which covers both
  sides. The existing shape tests pass.

### Step 4.10 — The reference docs

- [ ] **Action.**
  - `docs/reference/api.md`: the new routes, the ticket variants, the error codes,
    and a note that the legacy routes are kept until the follow-up.
  - `docs/reference/data-model.md`: the new columns, `media_uploads`, the bucket
    for each kind, and the rule that `thumb_key` always lives in the image bucket.
- [ ] **Verify.** `npm run docs:check` passes.

---

## Phase 5 — The offer editor

Pull request: `feat(offers): add audio, video and PDF to an offer, with resumable uploads`.
Read `frontend/DESIGN.md` first. Use tokens only, and never an interpolated
class name.

### Step 5.1 — Pure checks, tests first

- [ ] **Action.** Create `frontend/src/features/media/checks.ts` and
  `checks.test.ts`:
  - `classifyFile(file)` returns a kind or `null`.
  - `normaliseMimeType`.
  - `checkBeforeUpload(file, kind, limits, probe)` returns `ok` or a plain message
    naming the limit. For example: "This video is 312 MB. Videos can be up to
    300 MB. Trim it or export at a lower quality, then try again."
  - `formatBytes` and `formatDuration`, which share the MB unit with the backend.

  The tests cover each limit, each refused type (SVG, WAV, MOV, HEVC), and the
  boundaries: 300 s is accepted and 301 s is refused.
- [ ] **Verify.** `npm --prefix frontend test -- checks` passes.

### Step 5.2 — Probing the file in the browser

- [ ] **Action.** Create `frontend/src/features/media/probe.ts`:
  - `readDuration(file)`, using an `<audio>` or `<video>` element on an object
    URL, waiting for `loadedmetadata`, with a 10-second timeout that reports
    "couldn't read".
  - `videoCodec(file)`, which walks the MP4 boxes using `File.slice` (`moov`,
    `trak`, `mdia`, `minf`, `stbl`, `stsd`) and returns `avc1`, `avc3`, `hvc1`,
    `hev1` or `unknown`. WebM returns `webm`. Only `avc1`, `avc3` and `webm`
    pass.
  - `capturePoster(file)`: seek to `min(1, duration / 2)`, draw to a canvas, and
    encode a 960px-edge WebP using the helpers in `frontend/src/lib/image.ts`.
    On failure it returns `null`, and the item gets the neutral placeholder.
- [ ] **Verify.** A unit test on a hand-built minimal `ftyp` and `moov` buffer
  returns the right codec for `avc1` and for `hvc1`.

### Step 5.3 — The resumable upload, loaded on demand

- [ ] **Action.** `npm --prefix frontend install tus-js-client`. Create
  `frontend/src/features/media/tus-upload.ts`, which does
  `await import('tus-js-client')` inside the function. It uploads with the
  ticket's endpoint, `x-signature`, metadata and a 6 MB chunk size, and resumes
  from earlier uploads. It exposes progress (bytes sent and total) and `abort()`.
- [ ] **Verify.** `npm --prefix frontend run build` creates a separate chunk for
  `tus-js-client`. `npm run check:bundle` is within budget.

### Step 5.4 — The upload state

- [ ] **Action.** Create `frontend/src/features/media/use-media-upload.ts`. Its
  states are checking, then uploading (with progress), then confirming, then
  done. It can also end in failed (with a message) or cancelled.
  - Cancel aborts the transfer and calls `abandon` with the reservation.
  - While anything is uploading, a `beforeunload` listener warns, and so does a
    React Router `useBlocker` for navigation inside the app.
  - Images keep the existing resize and `PUT` flow, now through the item ticket
    and confirm.
- [ ] **Verify.** `use-media-upload.test.ts` covers the state transitions with a
  fake transport, including that cancelling calls `abandon`.

### Step 5.5 — Limits, with a fallback

- [ ] **Action.** Add `useMediaLimits()` and `useMediaUsage()` to
  `frontend/src/features/media/api.ts`. If `GET /media/limits` returns 404,
  the editor uses images only, with 4 per offer, which matches the backend still
  serving. Remove `OFFER_IMAGE_LIMIT` from `frontend/src/features/offers/limits.ts`
  and read it from the limits instead.
- [ ] **Verify.** With the backend from Phase 3 (no limits endpoint), the editor
  offers images, capped at 4.

### Step 5.6 — The editor UI

- [ ] **Action.** In `frontend/src/features/offers/OfferFormDialog.tsx` and a new
  `frontend/src/features/media/MediaUploader.tsx`:
  - One "Add media" control, which accepts the enabled kinds.
  - The limits for each kind shown before picking.
  - The used / total quota.
  - A row per upload with percent, MB sent and Cancel.
  - A list of existing items with delete.
  - A one-line rights reminder, linking to the terms.

  Video shows its poster. Every progress readout has `aria-live="polite"`.
- [ ] **Verify.** On staging with `MEDIA_UPLOAD_KINDS=audio,video,document`, at
  phone width in light and dark:
  - Each kind uploads and survives a reload.
  - A 301 MB or 5:01 video, and a MOV file, are each refused before any network
    request (the DevTools Network panel shows nothing).
  - Leaving mid-upload warns.
  - Cancel removes the object, and `npm --prefix backend run media:prune` finds
    no orphan for it after the next ticket.

### Step 5.7 — Resuming on a throttled connection

- [ ] **Action.** Upload a video of roughly 290 MB and 4:50 on staging, with the
  "Slow 4G" network profile. Turn the network off at around 40% for 30 seconds,
  then back on.
- [ ] **Verify.** Progress resumes from roughly where it stopped, not from 0, and
  the item is recorded.

---

## Phase 6 — The portfolio

Pull request: `feat(profiles): a portfolio of media on the creative profile`.

### Step 6.1 — Edit the portfolio

- [ ] **Action.** Add a "Portfolio" section on the creative's profile editing
  page, which is the account page that edits the public profile. It reuses
  `MediaUploader` with no `offerId`. The caps are the same as one offer's, and
  the quota is shared.
- [ ] **Verify.** Upload one of each kind to the portfolio. It survives a reload,
  and the quota readout includes it.

### Step 6.2 — Show the portfolio on the profile page

- [ ] **Action.** In `frontend/src/pages/CreativeProfilePage.tsx`, add a
  Portfolio section that is hidden when empty. Images use the existing gallery
  and lightbox. The other kinds use the players from Phase 7.
- [ ] **Verify.** On a signed-out visit at phone width, nothing in the media
  downloads until it is tapped (checked in the DevTools Network panel).

### Step 6.3 — Delete everything with the profile

- [ ] **Action.** The existing creative profile deletion path, and any account
  deletion that removes the profile, delete `objectsForProfile` after the rows
  are gone.
- [ ] **Verify.** A backend test confirms that deleting a profile with portfolio
  items deletes its objects in every bucket, using the mocked storage.

---

## Phase 7 — What visitors see

Pull request: `feat(offers): players and badges for audio, video and PDF`.

### Step 7.1 — Players

- [ ] **Action.** Create `frontend/src/features/media/MediaPlayer.tsx`:
  - `AudioItem` is `<audio controls preload="none">`, with the title, duration
    and size shown before play.
  - `VideoItem` is `<video controls preload="none" playsInline poster>`, with the
    duration and size, and the neutral placeholder token surface when there's no
    poster.
  - `DocumentLink` is a link that opens in a new tab, with the PDF's title and
    size.

  Nothing autoplays.
- [ ] **Verify.** `frontend/src/features/media/players.test.ts` is a source check:
  every `<audio` and `<video` in `frontend/src` has `preload="none"`, and none has
  `autoPlay`.

### Step 7.2 — The offer page

- [ ] **Action.** In `frontend/src/pages/OfferDetailPage.tsx`, add Listen, Watch
  and Read sections under the gallery, each hidden when empty. If that pushes the
  first-load bundle over budget, lazy-load the sections, since they're below the
  fold.
- [ ] **Verify.** `npm run check:bundle` passes. On the throttled phone profile,
  opening an offer with a video transfers only the poster.

### Step 7.3 — Badges on cards

- [ ] **Action.** `frontend/src/features/offers/OfferCard.tsx` shows the
  `mediaBadge` with the existing `Badge` primitive, for example "Audio · 3:42" or
  "2 videos". Its image falls back to the video poster. Never a player.
- [ ] **Verify.** The directory at 360 and 1440px, light and dark, shows the
  badge, with no horizontal page scroll.

### Step 7.4 — Message and dashboard previews

- [ ] **Action.** `frontend/src/features/conversations/OfferCard.tsx` and the
  `me` views that show an offer's image use the cover image (first image, or else
  the poster) from the API, with no new UI.
- [ ] **Verify.** An offer with only a video shows its poster in a message.

---

## Phase 8 — Moderation, cleanup and terms

Pull request: `feat(admin): review and remove single media items; prune every bucket`.

### Step 8.1 — Review queue per item

- [ ] **Action.**
  - `listUnreviewedMedia` in `backend/src/modules/admin/admin.service.ts` adds
    `items`: unreviewed media of every kind, with the owner, the offer (if any),
    a preview URL, size and duration.
  - `POST /api/v1/admin/media/item/:id/review` with `approve` sets `reviewed_at`.
    With `remove`, it deletes the row, then the objects, and writes a
    `media_removed` moderation action with `subject_user_id` set.
  - The existing `avatar` and `offer` review is unchanged.
- [ ] **Verify.** Tests in `backend/src/modules/admin/moderation.test.ts`:
  - removing an item leaves its offer and the offer's other items alone;
  - approving an item doesn't approve its offer's text;
  - a non-admin gets 403.

### Step 8.2 — Admin page

- [ ] **Action.** `frontend/src/pages/admin/AdminMediaPage.tsx` lists items with
  previews: an image thumbnail, `preload="none"` audio and video, and a link for
  PDFs. Each has Approve and Remove, and Remove asks for confirmation.
- [ ] **Verify.** On staging as an admin, remove one audio item from an offer
  with two. The other stays, and the removed URL returns an error after the
  Smart CDN purge.

### Step 8.3 — The orphan cleanup

- [ ] **Action.** `backend/src/scripts/prune-orphan-media.ts`:
  - lists all four buckets;
  - counts as referenced: avatar keys; item `object_key`s in their kind's bucket;
    `thumb_key`s in the image bucket; and the keys of *unexpired* reservations;
  - with `--delete`, also deletes expired reservations and their objects.

  The existing guard against a local database with hosted storage stays.
- [ ] **Verify.** On staging, run a dry run after creating an abandoned ticket
  that was never confirmed. Once it expires (tested by setting `expires_at` in
  the past), it lists that object, and `--delete` removes it and the reservation.

### Step 8.4 — Terms of use

- [ ] **Action.** In `frontend/src/pages/legal/TermsPage.tsx`, add: "You may
  upload only work you made or have the rights to share, including music, video
  and writing. We remove uploads reported as infringing." Update the terms' "last
  updated" date.
- [ ] **Verify.** The page renders, and the editor's rights reminder links to it.

---

## Phase 9 — Rollout

There's no pull request. reyxdz does each step, following the
[release guide](../guides/release-to-production.md) for anything that reaches
production.

### Step 9.1 — Supabase Pro

- [ ] **Action.** Move the Bilikha organisation to Pro.
- [ ] **Verify.** The billing page shows Pro, and both projects list Pro limits.

### Step 9.2 — Raise the global upload limit

- [ ] **Action.** In each project, go to Storage, then Settings, and set the
  upload file size limit to 350 MB.
- [ ] **Verify.** The setting reads 350 MB on both projects.

### Step 9.3 — Buckets on staging, then on production

- [ ] **Action.** Run `npm --prefix backend run media:buckets` against staging,
  then against production, each with its own credentials in a local `.env` that
  is never committed.
- [ ] **Verify.** `--check` exits 0 for both.

### Step 9.4 — Turn on staging

- [ ] **Action.** On Render staging, set `MEDIA_UPLOAD_KINDS=audio,video,document`.
- [ ] **Verify.** `GET /api/v1/media/limits` on staging shows all four kinds
  enabled. Steps 5.6 and 5.7 pass on staging.

### Step 9.5 — Release

- [ ] **Action.** When reyxdz asks, release `main` to production by the guide,
  with the switch still empty.
- [ ] **Verify.** Production's `GET /api/v1/media/limits` shows images at 10 and
  the other kinds disabled. An existing offer's images still display.

### Step 9.6 — Turn on production

- [ ] **Action.** On Render production, set `MEDIA_UPLOAD_KINDS=audio,video,document`.
- [ ] **Verify.** One small audio file uploads and plays on production, then is
  deleted.

---

## Acceptance

The plan is complete when every box below is checked.

- [ ] Each kind uploads, plays or opens, and survives a reload, on staging and on
  production.
- [ ] Uploads that are over-size, wrong-type, over-count, over-quota or
  rate-limited are each refused by the API, and each has a test.
- [ ] An object uploaded around the API with a forged type or size is refused by
  storage, or deleted at confirm.
- [ ] Players download nothing until tapped, on a throttled phone profile.
- [ ] A near-300 MB, 5-minute video resumes after the network drops, and a 301 MB
  or 5:01 video is refused before upload.
- [ ] Phone width, light and dark, on the editor, the offer page, the profile and
  the admin queue.
- [ ] An admin can remove one item without removing its offer.
- [ ] `npm run media:prune` covers every bucket and expired reservations.
- [ ] ADR 0046 is marked Accepted.

## Follow-ups

- **Make `offer_images.profile_id` required.** Once this has been in production
  for one release, add a migration that backfills any nulls and sets it to
  `NOT NULL`.
- **Rename `offer_images` to `media_items`.** It takes two releases: first add a
  view or synonym and move every reader to the new name, then rename the table.
- **Retire the legacy routes:** `kind: "offer"` tickets,
  `POST /offers/:id/images` and `DELETE /offers/images/:imageId`. Remove them one
  release after Phase 5 ships, once no open tab can still call them.
- **Reorder media within an offer or the portfolio.**
- **A report button on offers and profiles.** ADR 0021 noted that discovery of
  abuse depends on an administrator looking. More kinds make that gap bigger.
