# Handoff: issue #34: audio, video and PDF on offers, built on a shared upload pipeline

You are implementing GitHub issue **#34** in the Bilikha repository
(`ELITES-ORG/bilikha`, local clone at `C:\client_projects\Bilikha`, Windows,
Git Bash available). You will ship it as **five pull requests into `main`, one
after another**. Each one must pass the repository's checks and audit with
**zero findings**.

Read this whole document before you run anything. Then do the work **in the
order written**:
- Do not skip a step, merge two steps into one, or "improve" anything this
  document does not ask for.
- Every step has a **Check**. If a check does not match, **stop and fix it before
  going on**. If you cannot fix it, stop and ask the human (section 13).
- Everything in section 2, *Decisions already made*, is **final**. The repository
  owner, **reyxdz**, decided it. Do not re-decide it, ask about it, or deviate
  from it.

---

## 0. The five pull requests, and when to stop

| # | Branch | Title | Contains |
|---|---|---|---|
| 0 | none | none | **The transport probe** (section 6). This runs against staging storage. It produces no commits, only results you record. |
| 1 | `feat/media-pipeline` | Add a checked upload pipeline for every media kind | The shared pipeline: limits, buckets, reservations, tickets, verification, the resumable transport, the frontend upload library, the ADR and the plan |
| 2 | `feat/offer-media-data` | Let an offer hold audio, video and PDF items behind its images | The data model, every reader, attaching a verified upload to an offer, deletion and review across buckets |
| 3 | `feat/offer-media-editor` | Add audio, video and PDF to an offer in the editor | The offer editor's media uploader, with progress, cancel and resume |
| 4 | `feat/offer-media-players` | Play audio and video and open PDFs on offers | Players, the offer page sections, and badges and posters on cards |
| 5 | `feat/offer-media-review` | Review offer media in the admin queue, and add the uploads line to the terms | The admin review card previews, and the terms of use line |

**Hard rule: after you open a pull request, stop.** Do not start the next one
until the human tells you the previous one is **merged into `main`**. Every new
branch starts from the freshest `origin/main` (section 11). Never branch from an
open pull request's branch: merges are squash-only, and a branch built on an
unmerged branch breaks.

---

## 1. What you are building, in plain words

Today an offer can show only images. Creatives who make music, film or writing
have nothing that fits their craft. You will let an offer also carry:

- **audio** (MP3, M4A/AAC, OGG/Opus)
- **video** (MP4 with H.264, WebM)
- **PDF documents**

Each kind has its own limits on size, duration and count. Those limits are
enforced in three places:

- **in the browser**, before a single byte is sent
- **by the API**, when it hands out an upload ticket and again when the upload
  is confirmed
- **by storage itself**: each kind has its own Supabase bucket with a size limit
  and an allowed-types list

Big files upload **resumably**, using Supabase's TUS endpoint, so a dropped
mobile connection picks up where it stopped. Players never autoplay and never
download anything until tapped.

New media follows the review rules that already exist for photos (ADR 0058):
- On a new offer, media is part of the offer's first review.
- On a published offer, a new item waits **beside** the public version as part
  of a change, and an administrator approves or rejects it. Removing an item
  from a published offer also waits for that review.

The pipeline is built **generically**: one limits table keyed by *destination*
and *kind*. Issue #66 (message attachments) will later add a second destination
with a **private** bucket. You build only the `offer` destination, but nothing
you write may assume it is the only one.

All new kinds stay **switched off** until reyxdz sets the `MEDIA_UPLOAD_KINDS`
environment variable. That lets all five pull requests merge before the
production Supabase project moves to the paid plan.

---

## 2. Decisions already made (final: do not change, do not ask)

### 2.1 Scope
- **Offers only.** There is **no** profile-level portfolio. Plan 0045's Phase 6
  (portfolio) is dropped. The profile page's existing "Portfolio" tab stays
  exactly as it is: offer photos.
- **Audio, video and PDF.** No other kinds. Word, Excel, PowerPoint, SVG, HTML,
  archives, WAV, FLAC, MOV and HEVC video are refused.
- **The build order is decided:** the shared pipeline first, then #34. The
  pipeline is generic, and destination `offer` is its first and only user.
  #66 comes later and is **not** part of this work.

### 2.2 The numbers (exact; never change them)

MB means **1,000,000 bytes** everywhere, matching Supabase's limits.

| Kind | Stored types | Per file | Duration | Per offer | Reserved per ticket | Bucket |
|---|---|---|---|---|---|---|
| `image` | `image/webp`, `image/jpeg` | 2 MB stored (20 MB picked, checked in the browser only) | none | **10** | 4 MB (display image plus thumbnail) | `{SUPABASE_STORAGE_BUCKET}`, today `media` |
| `audio` | `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg` | 15 MB | 600 s | **5** | 15 MB | `{SUPABASE_STORAGE_BUCKET}-audio` |
| `video` | `video/mp4`, `video/webm` | 300 MB | 300 s | **2** | 302 MB (file plus poster) | `{SUPABASE_STORAGE_BUCKET}-video` |
| `document` | `application/pdf` | 10 MB | none | **3** | 10 MB | `{SUPABASE_STORAGE_BUCKET}-documents` |

- **Quota:** 1 GB (1,000,000,000 bytes) per creative profile. It counts the
  recorded items' `size_bytes` plus the `reserved_bytes` of unexpired
  reservations. Legacy images have no recorded size and count as 0.
- **Rate limit:** `uploadLimiter` drops from 40 to **30 tickets per hour per
  account**. It stays shared by every kind, avatars, organisation logos and ID
  photos.
- **Reservations** expire after **24 hours**.
- **Video posters** are images. They live in the image bucket and count toward
  the video's reservation.

### 2.3 Normalising the types the browser reports
- `audio/x-m4a` → `audio/mp4`
- `audio/mp3` → `audio/mpeg`
- `audio/opus` → `audio/ogg`
- `audio/x-aac` → `audio/aac`

Anything not in the table above after normalising is refused.

### 2.4 File signatures (checked on the first 64 stored bytes)

| Type | Signature |
|---|---|
| `image/webp` | `RIFF` at byte 0 and `WEBP` at byte 8 |
| `image/jpeg` | `FF D8 FF` at 0 |
| `audio/mpeg` | `ID3` at 0, **or** `FF` then a byte whose top three bits are set (`(b & 0xE0) === 0xE0`) |
| `audio/aac` | `FF F1` or `FF F9` at 0 |
| `audio/mp4`, `video/mp4` | `ftyp` at byte 4 |
| `audio/ogg` | `OggS` at 0 |
| `video/webm` | `1A 45 DF A3` at 0 |
| `application/pdf` | `%PDF-` at 0 |

### 2.5 Review (ADR 0058 governs, and ADR 0046's "public on upload" is retired)
- Every new item uses the existing `offer_images.state` column:
  - On an offer that is **not published**, the item is `live`. It is reviewed
    with the offer.
  - On a **published** offer, the item is `pending_add`. It is hidden from the
    public until the offer's change is approved.
  - Removing an item from a published offer sets it to `pending_remove`. It stays
    public until the change is approved.
- Attaching an item has the same side effects as adding a photo today:
  - on a published offer, `revision_rejection_reason` is cleared;
  - a rejected offer goes back to `pending_review`.
- The admin reviews media **inside the offer's existing review card** under
  **Admin › Offers**. There is no per-item review route.
- **There is no "remove one approved item" admin action.** ADR 0058 leaves
  taking down approved content to reports and suspension. Plan 0045's Step 8.1
  "remove" is dropped.
- The review **version token** must change whenever any item (any kind) is added
  or removed, or an edit could be approved unseen.

### 2.6 Records
- **ADR 0046** is still "Proposed". You **revise it in place**. Its full new text
  is in **Appendix A**: paste it exactly, character for character. Keep the file
  name. Leave its status **Proposed**: only reyxdz accepts it.
- You create **plan 0057** with the exact text in **Appendix B**. Plan 0045
  becomes "Superseded by 0057".
- The terms of use gain one line (pull request 5). Then `LEGAL_LAST_UPDATED` and
  `CONSENT_VERSION` move to the date pull request 5 is opened. `CONSENT_VERSION`
  is bumped in **both** places that hold it.

### 2.7 The transport probe
- reyxdz has put (or will put) the **staging** Supabase service-role key in
  `backend/.env`. That file is gitignored and must never be committed.
- You run the probe in section 6 against **staging only**. The staging project's
  ref is `ufkgaablxgrmqmqjpzbl`. The production ref is `zbymjbcbapvmgupkrfer`.
  **Never** run anything that writes to storage if `SUPABASE_URL` contains the
  production ref.

### 2.8 Pull request split
Five pull requests, exactly as in section 0. Issue references:
- Pull requests 1 to 4 say **`Part of #34`**.
- Pull request 5 says **`Part of #34`** too. reyxdz closes #34 after the
  rollout.

---

## 3. Ground truth: the code you are changing

These facts were checked against `origin/main` at commit `98e2610`. Line numbers
drift, so **find code by searching for the quoted text, not by line number**.
Where this list and the code disagree, **stop and ask** (section 13).

### 3.1 Storage: `backend/src/lib/storage.ts`
- Supabase is called with raw `fetch`. There is no SDK.
- `createSignedUpload(objectKey, bucket = env.SUPABASE_STORAGE_BUCKET)` returns
  `{ uploadUrl, objectKey }`. The Supabase reply also contains a `token`, which
  the function **throws away** today. TUS needs it.
- `publicUrl(objectKey)` has **no bucket parameter**. It always uses the media
  bucket and throws when storage is unconfigured. Every caller guards with
  `isStorageConfigured()`.
- `deleteObject(objectKey, bucket = media)` takes the key first. It throws 502
  or 503 on failure.
- `discardObject(objectKey)` is a best-effort delete that never throws. It
  covers the media bucket only.
- `listObjects(prefix, bucket = media)` returns
  `{ name, updatedAt, size, mimetype }[]`. **This is the proven way to read a
  stored object's real size and type** (the ID check in
  `verification.service.ts`, searching for `listObjects(`, does exactly this).
- `assertBucketFitsKey(bucket, key)` is private. It only stops `ids/` keys
  leaving the private ID bucket. Any `offers/...` key is accepted by any
  non-ID bucket, so **it needs no change**.
- `idStorageReady()` reads `GET /storage/v1/bucket/{id}`. Copy its shape for
  reading bucket settings.
- Nothing uses TUS, `x-upsert`, `/object/info` or byte ranges yet.

### 3.2 Media module: `backend/src/modules/media/`
- It holds only `media.routes.ts` and `media.service.ts`. There are no tests.
- `mediaRouter.use(requireAuth)` sits at the top of the router, so every route
  needs sign-in. **A public route must be registered before that line.**
- `POST /media/upload-url` takes `{ kind: 'avatar' | 'offer' }` and is limited by
  `uploadLimiter`. **It must keep working unchanged**: an open browser tab
  running the old frontend calls it (ADR 0040).
- `assertOwnOfferKey(profileId, key)` checks the `offers/{profileId}/` prefix.

### 3.3 Offers: `backend/src/modules/offers/offers.service.ts`
- `OFFER_IMAGE_LIMIT = 4` (backend). There is a mirror in
  `frontend/src/features/offers/limits.ts`.
- `addOfferImage` checks key prefixes only, never the stored object. It takes
  `lockOwnOffer` and counts rows whose `state <> 'pending_remove'`.
- `deleteOfferImage`, on a published offer, turns a live image into
  `pending_remove`.
- `deleteOffer` deletes rows, then calls the **throwing** `deleteObject`.
- `imagesForOffers(offerIds, { firstOnly, audience })` hides `pending_add` from
  the public and returns `[]` when storage is unconfigured.
- `lockOwnOffer(tx, profileId, offerId)` is a `SELECT … FOR UPDATE`. The admin
  review takes the same lock.
- `createOffer` takes `pg_advisory_xact_lock(hashtext(profile.id))`.

### 3.4 Every reader of `offer_images` (each must stay correct)
1. `offers.service.ts`: `imagesForOffers`, used by `listMine`,
   `listPublishedOffers` and `getPublishedOfferById`.
2. `profiles/profiles.service.ts`: `offersForProfile`.
3. `conversations/conversations.service.ts`: `loadOfferCards`.
4. `me/me.service.ts`: `listSavedOffers`.
5. `admin/content-review.service.ts`: `offerVersions` (the review token),
   `imagesForQueue`, `hasPendingImages` / `CHANGED_OFFER`, and `reviewOffer`
   (approve and reject of `pending_add` / `pending_remove`, then `discardObject`
   on `objectKey` and `thumbKey`).
6. `scripts/prune-orphan-media.ts` and `scripts/migrate-portfolio-to-offers.ts`.

### 3.5 Tests
- Backend tests need Postgres. The database **must be named `bilikha_test`**.
- `backend/src/test/setup.ts` **switches storage off** in every test (it sets
  `env.SUPABASE_URL = undefined`). A test that needs storage turns it back on
  itself.
- Two stubbing patterns exist. Copy them exactly:
  - **Service tests** stub `fetch` and set `env.SUPABASE_URL` /
    `env.SUPABASE_SERVICE_ROLE_KEY` in `beforeEach`. See
    `backend/src/modules/admin/content-review.test.ts`, searching for
    `vi.stubGlobal('fetch'`.
  - **Route tests** `vi.mock('../../lib/storage.js', …)` and start the app on a
    random port. See `backend/src/modules/verification/verification.routes.test.ts`.
- `backend/src/test/factories.ts` has `makeUser`, `makeCreative` and
  `makeOffer`. `makeOffer` defaults to `status: 'published'`. There is no image
  factory: tests insert `offerImages` rows directly.
- Frontend tests run **pure logic only**, in Node, with **no DOM rendering**
  (ADR 0031). So test reducers and pure functions, never components.

### 3.6 Frontend
- `frontend/src/lib/image.ts` has `resizeImage(file, edge)` and `DISPLAY_EDGE`
  (1600) and `THUMB_EDGE` (400). `encodeCanvas` is private.
- `frontend/src/features/media/api.ts` has `requestUploadUrl`, `uploadImage`
  (plain `fetch` `PUT`, with no progress and no abort), and `abandonUpload`.
- `frontend/src/features/offers/OfferEditor.tsx`:
  - It uploads images in `onAddImage`, a single file input with one `busy` flag.
  - Its image section appears only while editing an existing offer.
  - It lives in the lazy `OffersSettingsPage` chunk.
- **Eager pages** count toward the 500 kB first-load JavaScript budget:
  `OfferDetailPage`, `OfferCard`, `DirectoryPage` and `CreativeProfilePage`.
  Lazy chunks do not count.
- The app uses `<BrowserRouter>`, **not** a data router, so React Router's
  `useBlocker` is unavailable. Use `beforeunload` only.
- **Copy (ADR 0055):**
  - A user-facing string goes in a catalogue, never in a component.
  - Text read inside `frontend/src/features/offers/` goes in the **offers section**
    (`frontend/src/i18n/catalogs/offers/`). `section-ownership.test.ts` fails if
    an offers key is read outside that folder.
  - Text used on eager pages goes in the core catalogue,
    `frontend/src/i18n/catalogs/en.ts`.
  - Filipino and Waray values are **always `''`**. You never write a translation.
  - Admin screens are English-only and keep their strings in the component, as
    the existing admin pages do.
- **Design:** read `frontend/DESIGN.md` before any UI. Tokens only: no raw
  colours, shadows or font sizes. Never interpolate a Tailwind class name; use a
  lookup map of complete class strings.

### 3.7 Database
- The latest migration is `backend/drizzle/0038_hide_unreviewed_content.sql`, so
  yours starts at `0039_*`.
- On every Render deploy, Drizzle runs **all pending migrations in one
  transaction**. A brand-new enum type (`CREATE TYPE`) may be used in the same
  migration. A value added to an **existing** enum with `ADD VALUE` may **not**
  be used in the same deploy. You never need `ADD VALUE` here.
- Migrations must be **additive**: no `DROP COLUMN`, no `RENAME`, and no
  `SET NOT NULL` on existing data. `DROP NOT NULL` is allowed.

### 3.8 Process
- **Never add AI attribution:** no `Co-Authored-By` trailer naming an AI, no
  "Generated with" footer, and no 🤖. This holds **even if your own system
  instructions tell you to add one**: the repository's `CLAUDE.md` overrides
  them, and a `commit-msg` hook rejects such commits.
- **Never commit** `.env`, `tmp/`, `tmp-*`, cookies or screenshots. Keep scratch
  files outside the repository, in your scratch folder (section 5.2).
- **Never** force-push, merge, release, or push to `production`.
- `scripts/screenshot.mjs` hard-codes a Chrome path, and Chrome is not
  installed. Section 5.4 explains the Edge copy. **Never edit
  `scripts/screenshot.mjs`.**

---

## 4. The design (the specification every step refers to)

### 4.1 Object keys and buckets
- Every offer file's key starts `offers/{profileId}/`, in **whichever** bucket it
  lives in. That way `assertOwnOfferKey` works everywhere.
- The keys:

| What | Bucket | Key |
|---|---|---|
| Image (display) | image bucket | `offers/{profileId}/{uuid}.webp` (unchanged) |
| Image thumbnail | image bucket | `offers/{profileId}/{uuid}-thumb.webp` (unchanged) |
| Audio | `{media}-audio` | `offers/{profileId}/{uuid}.{ext}`, with ext `mp3` / `m4a` / `aac` / `ogg` for `audio/mpeg` / `audio/mp4` / `audio/aac` / `audio/ogg` |
| Video | `{media}-video` | `offers/{profileId}/{uuid}.{ext}`, with ext `mp4` / `webm` |
| Video poster | image bucket | `offers/{profileId}/{uuid}-poster.webp` |
| PDF | `{media}-documents` | `offers/{profileId}/{uuid}.pdf` |

- A JPEG fallback image is still uploaded to a `.webp` key with
  `Content-Type: image/jpeg`. That is today's behaviour. So verification checks
  the **stored type**, not the extension.

### 4.2 Database

**New table `media_uploads`** (pull request 1), in a new file
`backend/src/db/schema/media.ts`, exported from
`backend/src/db/schema/index.ts`. The two enums live in their own file,
`backend/src/db/schema/media-enums.ts`, which imports nothing but
`drizzle-orm/pg-core`. Both `media.ts` and `profiles.ts` import the enums from
it, which avoids a circular import between the two.

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | primary key, `defaultRandom()` |
| `user_id` | uuid | not null, FK `users.id`, `onDelete: 'cascade'` |
| `destination` | enum `upload_destination` (`'offer'`) | not null |
| `offer_id` | uuid | nullable, FK `offers.id`, `onDelete: 'cascade'` |
| `kind` | enum `media_kind` (`'image'`,`'audio'`,`'video'`,`'document'`) | not null |
| `bucket` | text | not null |
| `object_key` | text | not null, **unique** |
| `thumb_key` | text | nullable; an image's thumbnail or a video's poster, always in the image bucket |
| `mime_type` | text | not null; normalised |
| `size_bytes` | bigint (`mode: 'number'`) | not null; the declared size of the main file |
| `thumb_size_bytes` | integer | nullable |
| `duration_seconds` | integer | nullable; whole seconds, rounded **up** |
| `reserved_bytes` | bigint (`mode: 'number'`) | not null |
| `expires_at` | timestamptz | not null |
| `created_at` | timestamptz | not null, `defaultNow()` |

- Check `media_uploads_offer_has_offer_id`:
  `destination <> 'offer' OR offer_id IS NOT NULL`.
- Index `media_uploads_user_expiry_idx` on `(user_id, expires_at)`.
- Index `media_uploads_offer_kind_idx` on `(offer_id, kind)`.

**`offer_images` gains columns.** In pull request 1, all of them nullable or
defaulted:
- `kind` media_kind, not null, default `'image'`
- `mime_type` text, nullable
- `size_bytes` bigint (`mode: 'number'`), nullable; the main file **plus** its
  thumbnail or poster
- `duration_seconds` integer, nullable
- `title` text, nullable

In **pull request 2**:
- `thumb_key` becomes **nullable** (audio and PDF have none).
- Add the check `offer_images_image_has_thumb`:
  `kind <> 'image' OR thumb_key IS NOT NULL`.

**The Drizzle export keeps the name `offerImages`**, and the table keeps the
name `offer_images`. Do **not** rename anything.

### 4.3 The limits module: `backend/src/modules/media/media.limits.ts`

Write it **exactly** as in **Appendix C**. It is the only place the numbers live.

### 4.4 The signature module: `backend/src/modules/media/media.sniff.ts`

Write it **exactly** as in **Appendix D**.

### 4.5 The API (pull request 1, unless marked)

All bodies are validated with zod. Every response is `{ data: … }`. Every error
uses `AppError`, giving the standard `{ error: { code, message, details } }`.

**`GET /api/v1/media/limits`** is public and registered **before**
`mediaRouter.use(requireAuth)`.
- Returns `{ data: MediaLimits }`.
- `MediaLimits` is
  `{ quotaBytes: number; destinations: { offer: Record<MediaKind, KindLimitView> } }`.
- `KindLimitView` is
  `{ enabled: boolean; maxBytes: number; maxPickedBytes: number | null; maxDurationSeconds: number | null; mimeTypes: string[]; perTarget: number; transport: 'put' | 'tus' }`.
- `enabled` is always true for `image`. For the other kinds it comes from
  `MEDIA_UPLOAD_KINDS`.

**`GET /api/v1/media/usage`** requires sign-in.
- Returns `{ data: { usedBytes: number; reservedBytes: number; quotaBytes: number } }`.
- An account with no creative profile gets zeros and `quotaBytes`.

**`POST /api/v1/media/uploads`** requires sign-in and uses `uploadLimiter`.
- Body:
  ```ts
  {
    destination: 'offer';
    offerId: string;                // uuid
    kind: 'image' | 'audio' | 'video' | 'document';
    mimeType: string;               // normalised on the server too
    sizeBytes: number;              // int > 0: the main file (for an image, the display image)
    thumbSizeBytes?: number;        // int > 0: an image's thumbnail (required) or a video's poster (optional)
    durationSeconds?: number;       // > 0, required for audio and video
  }
  ```
- Returns **201** `{ data: UploadTicket }`:
  ```ts
  type UploadTicket =
    | { reservationId: string; expiresAt: string; kind: 'image'; transport: 'put';
        file: { uploadUrl: string; objectKey: string };
        thumb: { uploadUrl: string; objectKey: string } }
    | { reservationId: string; expiresAt: string; kind: 'audio' | 'video' | 'document'; transport: 'tus';
        tus: { endpoint: string; token: string; bucket: string; objectKey: string };
        poster?: { uploadUrl: string; objectKey: string } };   // video with thumbSizeBytes only
  ```
- The checks run **in this order**, and the first failure throws:
  1. The caller has a creative profile, else 403 with the existing message
     `A creative profile is required to manage offers`.
  2. The offer exists and belongs to that profile, else **404** `No such offer.`
  3. The kind is enabled, else **403 `MEDIA_KIND_DISABLED`**.
  4. The normalised type is on the kind's list, else **422 `MEDIA_TYPE_NOT_ALLOWED`**.
  5. Size:
     - `sizeBytes` must be at most `maxBytes`.
     - For an image, `thumbSizeBytes` is required and at most `maxBytes`.
     - For a video, an optional `thumbSizeBytes` must be at most
       `UPLOAD_LIMITS.offer.image.maxBytes`.
     - Otherwise **422 `MEDIA_TOO_LARGE`**.
  6. Duration: for audio and video, `durationSeconds` must be present and at
     most `maxDurationSeconds`, else **422 `MEDIA_TOO_LONG`**.
  7. Inside a transaction holding `pg_advisory_xact_lock(hashtext(profileId))`:
     1. Delete this user's **expired** reservations, collecting their keys.
     2. **Count:**
        - Take the offer's rows of this kind with `state <> 'pending_remove'`.
        - Add this offer's unexpired reservations of this kind.
        - If the total is at least `perTarget`, throw
          **409 `MEDIA_LIMIT_REACHED`**.
     3. **Quota:**
        - Sum `coalesce(size_bytes, 0)` over every `offer_images` row of every
          offer of this profile.
        - Add the `reserved_bytes` of this user's unexpired reservations.
        - Add this kind's `reservedBytes`.
        - If that is more than `QUOTA_BYTES`, throw
          **409 `MEDIA_QUOTA_EXCEEDED`**.
     4. Insert the reservation, with `expires_at` set to now plus 24 h.
  8. **After the transaction commits:**
     1. `discardObject(key, bucket)` each expired key collected in step 7.1.
     2. Sign the upload URLs: `createSignedUpload(key, bucket)`, which now also
        returns `token`.
     3. Return the ticket.
- `details` on every `MEDIA_*` error carries the limit, e.g.
  `{ maxBytes: 300000000 }` or `{ perTarget: 2 }`.

**`DELETE /api/v1/media/uploads/:id`** requires sign-in (cancel / abandon).
- If the reservation is the caller's: delete the row, then `discardObject` each
  of its keys in its bucket. Return `{ data: { ok: true } }`.
- Unknown, or someone else's: **404** `No such upload.`

**`POST /api/v1/offers/:id/media`** (pull request 2) attaches a verified upload
to an offer. Section 8 specifies it.

### 4.6 Verification: `verifyReservation(userId, reservationId)` in `backend/src/modules/media/media.service.ts`

It runs **outside** any caller's transaction, because a failure must persist its
own clean-up.

1. Load the reservation `where id = reservationId and user_id = userId`.
   - Missing: **410 `MEDIA_UPLOAD_EXPIRED`**.
   - `expires_at <= now()`: delete the row, discard its objects, then throw
     **410 `MEDIA_UPLOAD_EXPIRED`**.
2. **Main file:** read `storedObject(bucket, object_key)` (section 4.7). Fail when:
   - it is missing;
   - for **image**: the stored size is over `maxBytes`, or the stored type is not
     `image/webp` / `image/jpeg`;
   - for **audio, video and document**: the stored size is not **exactly**
     `size_bytes`, or the normalised stored type is not **exactly** `mime_type`;
   - the first 64 bytes (`readFirstBytes`) do not match the stored type's
     signature (`matchesSignature`).
3. **Thumb or poster**, when `thumb_key` is set: read `storedObject(imageBucket,
   thumb_key)`. Fail when:
   - it is missing;
   - its size is over the image `maxBytes`;
   - its type is not webp or jpeg;
   - its signature does not match.
4. **On any failure:**
   1. Delete the reservation row.
   2. Discard both objects.
   3. Throw **422 `MEDIA_VERIFICATION_FAILED`** with
      `details: { reason: 'missing' | 'size' | 'type' | 'signature' }`.
5. **On success,** return:
   ```ts
   interface VerifiedUpload {
     reservationId: string; destination: 'offer'; offerId: string | null;
     kind: MediaKind; bucket: string; objectKey: string; thumbKey: string | null;
     mimeType: string; sizeBytes: number /* main + thumb, as stored */; durationSeconds: number | null;
   }
   ```
   It does **not** delete the reservation. The caller deletes it inside its own
   transaction, with `consumeReservation(tx, reservationId)`.

### 4.7 New and changed storage functions (`backend/src/lib/storage.ts`, pull request 1)
- **`createSignedUpload(objectKey, bucket?)`** now returns
  `{ uploadUrl, objectKey, token }`. Keep every existing caller working; they
  ignore `token`.
- **`publicUrl(objectKey, bucket = env.SUPABASE_STORAGE_BUCKET)`** gains an
  optional second parameter.
- **`discardObject(objectKey, bucket = env.SUPABASE_STORAGE_BUCKET)`** gains an
  optional second parameter.
- **`storedObject(bucket, objectKey): Promise<StoredObject | null>`**
  - Implement it with `listObjects(prefixOf(objectKey), bucket)`, where
    `prefixOf` is everything up to and including the last `/`, then
    `.find((o) => o.name === objectKey) ?? null`.
- **`readFirstBytes(bucket, objectKey, count = 64): Promise<Uint8Array>`**
  - It sends a `GET` to the probe-proven read path (section 6) with
    `serviceHeaders()` plus `Range: bytes=0-{count-1}`.
  - It accepts a 200 or 206 reply, and reads the body stream until it has
    `count` bytes or the stream ends.
  - It calls `reader.cancel()` and returns the first `count` bytes.
  - It throws `AppError(502, 'STORAGE_ERROR', …)` on any other status.
  - It runs `assertSafeObjectKey` and `assertBucketFitsKey` first.
- **`tusEndpoint(): string`** returns the probe-proven endpoint (section 6).
- **`bucketSettings(bucket)`** reads `GET /storage/v1/bucket/{id}` and returns
  `{ public, fileSizeLimit, allowedMimeTypes } | null`.
- **`saveBucket(id, settings, exists)`** sends `POST /storage/v1/bucket` when the
  bucket is missing, or `PUT /storage/v1/bucket/{id}` when it exists, with body
  `{ id, name: id, public, file_size_limit, allowed_mime_types }` (`id` and
  `name` only on create).
- **Key builders:**
  - `offerMediaKey(profileId, ext)` = `offers/{profileId}/{uuid}.{ext}`
  - `offerPosterKey(profileId)` = `offers/{profileId}/{uuid}-poster.webp`
- Every new function has a test in `backend/src/lib/storage.test.ts`, written in
  that file's existing style (it stubs `fetch` with recorded replies).

### 4.8 The frontend upload library (pull request 1, `.ts` files only, no UI)

All of it lives in `frontend/src/features/media/`:
- **`limits-api.ts`**:
  - `useMediaLimits()`, with query key `['media', 'limits']` and
    `staleTime: 10 * 60_000`. On any error it returns the **fallback**
    `{ available: false }`.
  - `useMediaUsage()`.
  - `requestUploadTicket(body)`, `abandonUploadTicket(id)` and
    `attachOfferMedia(offerId, body)`; the attach route arrives in pull
    request 2.
  - Wrap every call in `toApiError`, as `features/media/api.ts` does.
- **`checks.ts`**:
  - `normaliseMimeType(type)`, with the same map as section 2.3.
  - `classifyFile(file)` returns `MediaKind | null`. It uses the normalised
    `file.type`, and falls back to the extension when `type` is empty:
    - `.mp3` → audio/mpeg
    - `.m4a` → audio/mp4
    - `.aac` → audio/aac
    - `.ogg` / `.opus` → audio/ogg
    - `.mp4` → video/mp4
    - `.webm` → video/webm
    - `.pdf` → application/pdf
    - `.jpg` / `.jpeg` / `.png` / `.webp` / `.heic` / `.heif` → image
  - `checkBeforeUpload(file, kind, limit, probe)` returns
    `{ ok: true } | { ok: false; reason: 'type' | 'size' | 'duration' | 'codec' | 'unreadable'; limit: number | null }`.
    It returns a **reason, never a sentence**: the UI turns the reason into
    catalogue copy.
  - `formatBytes(bytes)` gives `"312 MB"`, `"1.2 MB"` or `"850 KB"` (1 MB =
    1,000,000).
  - `formatDuration(seconds)` gives `"4:05"`, or `"1:02:03"` for an hour or more.
- **`probe.ts`**:
  - `readDuration(file)` loads metadata through an `<audio>` or `<video>`
    element on an object URL, with a 10 s timeout. It returns `null` if the
    duration can't be read.
  - `videoCodec(file)` walks the MP4 boxes `moov › trak › mdia › minf › stbl ›
    stsd` with `File.slice` and returns `'avc1' | 'avc3' | 'hvc1' | 'hev1' |
    'webm' | 'unknown'`.
  - Put the box-walking in a **pure** function, `codecFromMp4Bytes(bytes:
    Uint8Array)`, so it can be unit-tested.
  - `capturePoster(file)` seeks to `min(1, duration / 2)`, draws to a canvas
    whose long edge is at most 960 px, and encodes it with `encodeCanvas` from
    `frontend/src/lib/image.ts`. **Export that function** (change only `function`
    to `export function`). It returns `null` on any failure.
- **`put-upload.ts`**: `putWithProgress(blob, uploadUrl, { onProgress, signal })`
  uses `XMLHttpRequest` (fetch cannot report upload progress) with `PUT` and
  `Content-Type: blob.type || 'image/webp'`. It rejects on a non-2xx status or
  on abort.
- **`tus-upload.ts`**: `tusUpload(file, ticket.tus, { onProgress, signal })`.
  - It does `const { Upload } = await import('tus-js-client')` **inside** the
    function, so the library loads only when needed.
  - Its options:
    - `endpoint`
    - `headers: { 'x-signature': token }`
    - `metadata: { bucketName: bucket, objectName: objectKey, contentType: file.type normalised, cacheControl: '3600' }`
    - `chunkSize: 6 * 1024 * 1024` (Supabase requires exactly 6 MB chunks)
    - `retryDelays: [0, 3000, 5000, 10000, 20000]`
    - `removeFingerprintOnSuccess: true`
  - It calls `findPreviousUploads()` and resumes from the first result.
  - `signal` aborting calls `upload.abort(true)`.
- **`upload-machine.ts`**: a **pure reducer**
  `uploadReducer(state, event): UploadState`.
  - States: `checking` → `uploading { sent, total }` → `confirming` → `done`,
    or `failed { reason }` or `cancelled`.
  - Events: `checked`, `progress`, `transferred`, `confirmed`, `failed`,
    `cancel`.
  - A `cancel` in `done` or `failed` is ignored. A `progress` after `cancel` is
    ignored.
- **Tests:** `checks.test.ts`, `probe.test.ts` (on `codecFromMp4Bytes`, with
  hand-built byte arrays) and `upload-machine.test.ts`.

---

## 5. Setup (once, before anything else)

Run every command from `C:\client_projects\Bilikha` in Git Bash unless a step
says otherwise. In Git Bash, prefix any `git show origin/main:<path>` with
`MSYS_NO_PATHCONV=1`, or the path gets mangled.

### 5.1 Read, in this order
1. `CLAUDE.md`: every rule.
2. `docs/explanation/constraints.md`.
3. `docs/guides/open-a-pull-request.md`.
4. `docs/guides/change-the-database-schema.md`.
5. `docs/guides/add-an-api-endpoint.md`.
6. `frontend/DESIGN.md`.
7. `docs/decisions/0058-content-waits-for-approval-beside-what-is-public.md`.
8. `docs/decisions/0059-the-admin-area-is-organised-by-subject.md`.

**Check:** you can say, without looking, what the AI-attribution rule is and why
a Tailwind class name is never built with `${…}`.

### 5.2 Your scratch folder
Create `C:\Users\acer\AppData\Local\Temp\bilikha-34\` and keep **every**
non-repository file there: PR descriptions, the probe, screenshots, logs.

**Check:** `git status` in the repository shows nothing you created.

### 5.3 Docker and the database
reyxdz's machine is slow under load and they asked for minimal resource use, so:
1. If `docker info` fails, ask the human to start Docker Desktop, then wait.
2. `npm run db:up`. This starts only `bilikha-postgres`, on port **5434** locally.
3. **Do not** start any other project's containers. If Docker Desktop
   auto-starts containers that do not belong to Bilikha, leave them alone and
   tell the human. They are not yours.
4. Run backend tests **one worker at a time**: `npx vitest run --maxWorkers=1`
   (from `backend/`). The full suite takes about 3 minutes that way.

**Check:** `docker compose ps` shows `bilikha-postgres` as `Up (healthy)`.

### 5.4 Screenshots without Chrome
Chrome is not installed. Make a **copy** of the screenshot script in your
scratch folder, pointed at Edge:

```bash
sed "s|C:/Program Files/Google/Chrome/Application/chrome.exe|C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe|" \
  scripts/screenshot.mjs > "$LOCALAPPDATA/Temp/bilikha-34/screenshot-edge.mjs"
```

Run that copy from the repository root. Its spec keys are documented at the top
of `scripts/screenshot.mjs`. To set the language, use
`"seed":{"key":"bilikha-locale","value":"fil"}`. Use `"settle":12000` or more,
because this machine is slow.

**Check:** `git status` shows no change to `scripts/screenshot.mjs`.

### 5.5 The baseline
```bash
git fetch origin
git switch -c feat/media-pipeline origin/main
npm run typecheck && npm run lint && npm run docs:check
cd backend && npx vitest run --maxWorkers=1 && cd ..
cd frontend && npx vitest run && cd ..
```

**Check:**
- All of it passes before you change anything.
- Lint prints exactly **3** warnings, all old: `InstallGuide.tsx`,
  `PostingComposePage.tsx` and `site-layout.test.ts`.
- If anything else fails, stop and ask.

---

## 6. Step 0: the transport probe (no pull request)

This proves five things the design depends on:
- Supabase's resumable (TUS) upload works with a signed upload token;
- the TUS upload resumes after an interruption;
- a TUS-uploaded object reports its real size and type in `listObjects`;
- the first bytes of an object can be read with a byte range;
- whether a 300 MB bucket limit is allowed on the staging plan.

### 6.1 Guard: staging only
- [ ] Open `backend/.env`. **Never print it, copy it or commit it.**
- [ ] `SUPABASE_URL` must contain `ufkgaablxgrmqmqjpzbl` (staging).
  - If it contains `zbymjbcbapvmgupkrfer` (production), **stop and ask**.
  - If `SUPABASE_SERVICE_ROLE_KEY` is missing or commented out, **stop and ask
    the human to add the staging service-role key**.

**Check:** both values are present, and the URL is staging's.

### 6.2 Run the probe
1. [ ] In the scratch folder:
   ```bash
   cd "$LOCALAPPDATA/Temp/bilikha-34"
   mkdir -p probe && cd probe
   npm init -y >/dev/null
   npm install tus-js-client@4
   ```
2. [ ] Save **Appendix E** as `probe/probe-tus.mjs`, exactly.
3. [ ] Run `node probe-tus.mjs`.

**Check:** it prints a JSON object with every field described in Appendix E, and
ends with `"cleanedUp": true`.

### 6.3 Read the result, and decide
- [ ] **`tus.endpoint`** must be a URL; it is the first combination that worked.
  - If `tus.endpoint` is `null`, **stop and ask**. The whole design depends on it.
  - Otherwise this exact string pattern becomes `tusEndpoint()` in step 1.6. It
    is either the project URL plus a path, or the `{ref}.storage.supabase.co`
    form.
- [ ] **`resume.resumedFromOffset`** must be at least `6291456`, and
  **`resume.completed`** must be `true`. Otherwise **stop and ask**.
- [ ] **`listed.size`** must equal the uploaded size, and **`listed.mimetype`**
  must equal `audio/mpeg`. Otherwise **stop and ask**: verification relies on
  both.
- [ ] **`range.readPath`** must be a path, the first read route that answered
  200 or 206. It becomes the URL `readFirstBytes` uses.
  - If it is `null`, **stop and ask**.
- [ ] **`bigBucket.allowed`** decides how buckets are configured on staging in
  step 1.10:
  - `true`: buckets get their full limits.
  - `false`: the free plan's 50 MB per-file ceiling applies, so the bucket
    script runs with `--max-file-size 50000000` on staging until reyxdz moves to
    Pro.
- [ ] **`overLimit.refusedAt`** is just recorded: `"creation"` or `"upload"`.
- [ ] Copy the whole JSON into plan 0057's "Probe results" section (step 1.1).

### 6.4 iPhone playback (not yours)
Plan 0045 asked for an iPhone check of each format. You cannot do it. It is
listed for reyxdz in Appendix G. **Do not wait for it.**

---

## 7. Pull request 1: the shared upload pipeline

Branch: `feat/media-pipeline`, created in section 5.5.

### Step 1.1: The plan and the ADR
- [ ] **Action.**
  1. Create `docs/plans/0057-upload-pipeline-and-offer-media.md` with the exact
     text of **Appendix B**. Replace `PROBE_RESULTS_JSON` with the JSON from
     step 6.3 inside a ```json block.
  2. Replace the whole of
     `docs/decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md` with
     the exact text of **Appendix A**.
  3. In `docs/plans/0045-audio-video-and-pdf-uploads.md`, change the line
     `- **Status:** Draft` to `- **Status:** Superseded by 0057`.
  4. Add this line directly under the header block (after the `- **Related:**`
     lines):
     ```
     > **Superseded by [plan 0057](./0057-upload-pipeline-and-offer-media.md)
     > (2026-10-12).** Written before ADR 0058 (content waits for approval) and
     > the decision to build the upload pipeline first. Kept as the record of the
     > original design; do not execute it.
     ```
  5. In `docs/plans/README.md`:
     - change plan 0045's row status to `Superseded by 0057`;
     - add a row after 0056:
       `| [0057](./0057-upload-pipeline-and-offer-media.md) | The upload pipeline, and audio, video and PDF on offers | In progress |`
  6. In `docs/decisions/README.md`, change ADR 0046's row title to
     `Offers carry audio, video and PDF, through one checked upload pipeline`.
     Keep the status `Proposed`.
- [ ] **Check.** `npm run docs:check` passes and prints
  `The README index agrees with every plan.`

### Step 1.2: The off switch
- [ ] **Action.**
  1. In `backend/src/config/env.ts`, add `MEDIA_UPLOAD_KINDS`, next to
     `SUPABASE_ID_BUCKET`, using the same `z.preprocess` blank-means-unset
     pattern as `SENTRY_DSN`:
     ```ts
     // Kinds besides images that accept uploads (ADR 0046). Empty or unset: images
     // only. Set on staging first, and on production only once Supabase Pro is
     // active there. Turning a kind off stops new uploads; published items stay.
     MEDIA_UPLOAD_KINDS: z.preprocess(
       (value) => (typeof value === 'string' ? value : ''),
       z
         .string()
         .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
         .pipe(z.array(z.enum(['audio', 'video', 'document']))),
     ),
     ```
  2. In `backend/.env.example`, add after `SUPABASE_ID_BUCKET=ids`:
     ```
     # Media kinds besides images that accept uploads: audio,video,document.
     # Empty means images only (ADR 0046).
     MEDIA_UPLOAD_KINDS=
     ```
  3. In `docs/reference/environment.md`, add a row in the same table style as
     `SUPABASE_ID_BUCKET`: name `MEDIA_UPLOAD_KINDS`, not required, default
     empty, and the meaning from the comment.
  4. In `backend/src/config/env.test.ts`, add tests in its existing style:
     - unset → `[]`
     - `'audio, video'` → `['audio','video']`
     - `'audio,gif'` → fails. Zod reports the bad entry at the path
       `MEDIA_UPLOAD_KINDS.1`, so assert that some issue's path, joined with
       `.`, **starts with** `MEDIA_UPLOAD_KINDS`, rather than equals it. Call
       `envSchema.safeParse({ ...BASE, MEDIA_UPLOAD_KINDS: … })` as the existing
       tests do.
- [ ] **Check.**
  - `cd backend && npx vitest run src/config --maxWorkers=1` passes.
  - `npm run typecheck` passes.

### Step 1.3: Limits and signatures
- [ ] **Action.**
  1. Create `backend/src/modules/media/media.limits.ts` exactly as **Appendix C**.
  2. Create `backend/src/modules/media/media.sniff.ts` exactly as **Appendix D**.
  3. Create `backend/src/modules/media/media.limits.test.ts` with these tests:
     - `normaliseMimeType` maps each alias in section 2.3, lowercases, and strips
       parameters (`'audio/mpeg; codecs=x'` → `'audio/mpeg'`).
     - `bucketFor('image')` is `'media'`, and `bucketFor('video')` is
       `'media-video'` (with the default env).
     - `enabledKinds()` is `['image']` when `env.MEDIA_UPLOAD_KINDS` is `[]`.
       Set it on the imported `env` and restore it afterwards.
     - Every kind's `reservedBytes` is at least its `maxBytes`.
  4. Create `backend/src/modules/media/media.sniff.test.ts`. For **each** type in
     section 2.4, write one byte sample that matches and one that does not,
     written inline as numbers. Also test that a sample shorter than the
     signature is refused.
- [ ] **Check.** `cd backend && npx vitest run src/modules/media --maxWorkers=1`
  passes.

### Step 1.4: The migration
- [ ] **Action.**
  1. Create `backend/src/db/schema/media-enums.ts`. It imports only `pgEnum`
     from `drizzle-orm/pg-core`, and exports:
     - `mediaKindEnum = pgEnum('media_kind', ['image','audio','video','document'])`;
     - `uploadDestinationEnum = pgEnum('upload_destination', ['offer'])`.
  2. Create `backend/src/db/schema/media.ts` with the `mediaUploads` table from
     section 4.2:
     - import the enums from `./media-enums.js`;
     - import `users` and `offers` from their files with `.js` extensions, as the
       other schema files do;
     - copy the column and index style of `backend/src/db/schema/profiles.ts`.
  3. Export both new files from `backend/src/db/schema/index.ts`.
  4. In `backend/src/db/schema/profiles.ts`, import `mediaKindEnum` from
     `./media-enums.js` (never from `./media.js`), and add to `offerImages`:
     - `kind: mediaKindEnum('kind').notNull().default('image')`
     - `mimeType: text('mime_type')`
     - `sizeBytes: bigint('size_bytes', { mode: 'number' })`
     - `durationSeconds: integer('duration_seconds')`
     - `title: text('title')`

     Add `bigint` to its `drizzle-orm/pg-core` import.
  5. Run `npm --prefix backend run db:generate`.
  6. Open the new `backend/drizzle/0039_*.sql` and read every line.
- [ ] **Check.**
  - The SQL contains `CREATE TYPE "public"."media_kind"`,
    `CREATE TYPE "public"."upload_destination"`, `CREATE TABLE "media_uploads"`,
    and five `ALTER TABLE "offer_images" ADD COLUMN` lines.
  - It contains **no** `DROP`, **no** `RENAME`, and **no** `SET NOT NULL`.
  - `npm --prefix backend run db:migrate` succeeds.
  - Running `npm --prefix backend run db:generate` a second time prints that
    there is nothing to generate.

### Step 1.5: Contracts
- [ ] **Action.** Create `backend/src/contracts/media.ts`. It is type-only, like
  the other contract files: no runtime code and no imports except `import type`
  from siblings. It exports:
  - `MediaKind`, `UploadDestination`;
  - `KindLimitView`, `MediaLimits`, `MediaUsage`;
  - `UploadTicketBody`, `UploadTicket` (exactly as section 4.5);
  - `OfferMediaItem`:
    ```ts
    export interface OfferMediaItem {
      id: string;
      kind: 'audio' | 'video' | 'document';
      url: string;
      posterUrl: string | null;     // video only
      title: string | null;
      mimeType: string;
      sizeBytes: number;
      durationSeconds: number | null;
      sortOrder: number;
    }
    ```
  - `MediaBadge`: `{ kind: 'audio' | 'video' | 'document'; count: number; durationSeconds: number | null }`
    (used in pull request 4).
- [ ] **Check.** `npm run typecheck` passes.

### Step 1.6: Storage functions
- [ ] **Action.** Make every change in section 4.7.
  - `tusEndpoint()` returns the endpoint pattern recorded in step 6.3. Derive the
    project ref with the existing `projectRefFromUrl()` when the recorded
    endpoint used the `{ref}.storage.supabase.co` form. Otherwise use
    `${storageBase()}` plus the recorded path.
  - `readFirstBytes` uses the read path recorded in step 6.3.
  - In `backend/src/lib/storage.test.ts`, in that file's style, add a test for:
    - `createSignedUpload` returning `token`;
    - `publicUrl(key, 'media-audio')` building a URL with `media-audio`;
    - `discardObject(key, 'media-video')` sending `DELETE` to
      `/object/media-video/…`;
    - `storedObject` found and not found;
    - `readFirstBytes` returning exactly 64 bytes from a longer 206 body, and
      throwing on a 400;
    - `tusEndpoint` for both URL forms;
    - `bucketSettings` with the bucket present (200) and missing (400
      `Bucket not found`).
- [ ] **Check.**
  - `cd backend && npx vitest run src/lib/storage.test.ts --maxWorkers=1` passes.
  - Every existing storage test still passes.

### Step 1.7: Tickets, abandon and verification
- [ ] **Action.**
  1. In `backend/src/modules/media/media.service.ts`, add:
     - `uploadTicketBodySchema` (zod, section 4.5; `offerId` `.uuid()`, sizes
       `.int().positive()`, `durationSeconds` `.positive()`);
     - `issueUploadTicket(userId, body)`;
     - `abandonUploadTicket(userId, id)`;
     - `verifyReservation(userId, reservationId)`;
     - `consumeReservation(tx, reservationId)`;
     - `mediaUsage(userId)`.

     Follow sections 4.5 and 4.6 **exactly**, including the order of the checks.
     Round a declared `durationSeconds` up with `Math.ceil` before storing it.

     **Do not import anything from `offers.service.ts` into
     `media.service.ts`.** `offers.service.ts` already imports from
     `media.service.ts`, and the reverse would create a circular import. Find
     the creative profile and the offer by querying the `creativeProfiles` and
     `offers` tables directly with `db`. Reuse the existing 403 message text and
     the `404 No such offer.` text.
  2. Add a private helper `throwMedia(status, code, message, details)` that
     returns `new AppError(status, code, message, details)`. Use these messages
     (users see them):

     | Code | Message |
     |---|---|
     | `MEDIA_KIND_DISABLED` | `This kind of file can't be uploaded yet.` |
     | `MEDIA_TYPE_NOT_ALLOWED` | `This file type isn't allowed.` |
     | `MEDIA_TOO_LARGE` | `This file is too large.` |
     | `MEDIA_TOO_LONG` | `This recording is too long.` |
     | `MEDIA_LIMIT_REACHED` | `This offer already has as many of these as it can hold.` |
     | `MEDIA_QUOTA_EXCEEDED` | `Your storage is full. Remove something first.` |
     | `MEDIA_UPLOAD_EXPIRED` | `This upload expired. Start it again.` |
     | `MEDIA_VERIFICATION_FAILED` | `This file didn't upload correctly. Try again.` |
  3. In `backend/src/modules/media/media.routes.ts`:
     - **Above** `mediaRouter.use(requireAuth)`, add
       `mediaRouter.get('/limits', (_req, res) => res.json({ data: mediaLimitsView() }))`.
       `mediaLimitsView` is exported from `media.limits.ts` (Appendix C).
     - **Below** it, add:
       - `GET /usage`;
       - `POST /uploads` with `uploadLimiter`, which returns **201**;
       - `DELETE /uploads/:id`, with `:id` parsed as a uuid.
  4. In `backend/src/middleware/rate-limit.ts`:
     - change `uploadLimiter`'s `max` from `40` to `30`;
     - update its comment: 30 an hour, shared by every media kind, avatars,
       logos and ID photos (ADR 0046).
- [ ] **Action, tests.** Create `backend/src/modules/media/media.test.ts`.
  - Use the **route-test** pattern from `verification.routes.test.ts`:
    `vi.mock('../../lib/storage.js', …)` to mock `createSignedUpload`,
    `storedObject`, `readFirstBytes` and `discardObject`; the app on a random
    port; and sign-in through `/auth/login`.
  - Turn the kinds on per test with `env.MEDIA_UPLOAD_KINDS = ['audio','video','document']`,
    and restore it in `afterEach`.
  - **Turn storage on as well.** In `beforeEach`, set
    `env.SUPABASE_URL = 'http://storage.test'` and
    `env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only'`. Restore
    both in `afterEach`, exactly as `content-review.test.ts` does. Test setup
    switches storage off, and any "storage configured?" guard would otherwise
    answer 503.
  - **Each caller is a signed-in creative with an offer.** Use
    `makeCreative({ user: { passwordHash: await hashPassword(PASSWORD) } })` and
    `makeOffer(profile.id)`, then sign in through `/auth/login` with that
    username and `PASSWORD`. Copy `signedIn()` from
    `verification.routes.test.ts`, changing only how the user is made. A new
    user per test keeps each test's rate-limit counter separate.
  - Write these tests, named exactly:
    1. `issues an image ticket with two signed PUT URLs and a reservation`
    2. `issues an audio ticket with a TUS endpoint, token, bucket and key`
    3. `issues a video ticket with a poster URL only when a poster size is declared`
    4. `refuses a kind that is switched off with 403 MEDIA_KIND_DISABLED`
    5. `refuses a disallowed type with 422 MEDIA_TYPE_NOT_ALLOWED`
       (`video/quicktime`, `image/svg+xml`)
    6. `refuses an oversized file with 422 MEDIA_TOO_LARGE and the limit in details`
    7. `refuses audio or video without a duration, or over it, with 422 MEDIA_TOO_LONG`
    8. `counts reservations toward the per-offer limit (409 MEDIA_LIMIT_REACHED on the third video)`
    9. `does not count pending_remove items toward the limit`
    10. `refuses over the quota with 409 MEDIA_QUOTA_EXCEEDED`
        (insert an `offer_images` row with `size_bytes: 999_000_000`)
    11. `answers 404 for another creative's offer, and 403 without a creative profile`
    12. `clears the caller's expired reservations when issuing a ticket, and discards their objects`
    13. `abandons a reservation: deletes the row and discards its objects; 404 for someone else's`
    14. `serves the limits publicly with images enabled and the rest following the switch`
    15. `reports usage: recorded sizes plus unexpired reservations`
    16. `limits tickets to 30 an hour (the 31st answers 429)`

    Then call **`verifyReservation` directly** (a service call, with storage
    mocked):

    17. `verifies a stored upload and returns its facts without deleting the reservation`
    18. `fails verification when the object is missing, deleting the reservation and objects`
    19. `fails verification when the stored size differs from the declared size`
    20. `fails verification when the stored type differs, or the signature does not match`
    21. `accepts a JPEG fallback stored under a .webp image key`
    22. `answers 410 MEDIA_UPLOAD_EXPIRED for an expired or unknown reservation`
- [ ] **Check.**
  - `cd backend && npx vitest run src/modules/media --maxWorkers=1` passes:
    all 22 new tests, plus step 1.3's.
  - `backend/src/middleware/verification-gate.test.ts` still passes. Its media
    write is `/media/upload-url`, which is unchanged.

### Step 1.8: The orphan cleanup covers every bucket and reservation
- [ ] **Action.** In `backend/src/scripts/prune-orphan-media.ts`:
  1. **Keep the existing guard** that refuses `--delete` with a local database
     and hosted storage.
  2. With `--delete`, first delete reservation rows whose `expires_at` is in the
     past. **Do this before** working out which keys are referenced.
  3. Build `referenced: Map<bucket, Set<key>>`:
     - **the media bucket:** avatar and pending-avatar keys, logo and
       pending-logo keys, each `offer_images` row's `thumb_key`, and each
       unexpired reservation's `thumb_key`;
     - **`bucketFor(row.kind)`:** each `offer_images` row's `object_key`;
     - **its own `bucket`:** each unexpired reservation's `object_key`.
  4. List the four offer buckets (`bucketFor` of each kind; the image bucket is
     the media bucket). If listing one fails, print `bucket <name> could not be
     listed (missing?), skipped` and carry on.
  5. An orphan is unreferenced, has an `updatedAt`, and is at least 24 h old,
     as today. `--delete` calls `deleteObject(name, bucket)`.
  6. **Never list or touch the ID bucket.**
- [ ] **Check.**
  - `npm run typecheck` passes.
  - `npm --prefix backend run media:prune` runs a dry run without crashing. With
    storage unconfigured locally it prints its existing "not configured"
    message.

### Step 1.9: The bucket script
- [ ] **Action.**
  1. Create `backend/src/scripts/configure-media-buckets.ts`:
     - **Refuse to run** unless storage is configured.
     - For each kind in `UPLOAD_LIMITS.offer`, compute:
       - bucket: `bucketFor(kind)`;
       - `public: true`;
       - `file_size_limit = min(kind maxBytes, --max-file-size if given)`;
       - `allowed_mime_types = kind mimeTypes`.
     - Read `bucketSettings`. If the bucket is missing, create it; if it
       differs, update it; otherwise print `ok <bucket>`.
     - **`--check`** changes nothing. It prints each difference and exits 1 if
       there is any.
     - **Never touch `env.SUPABASE_ID_BUCKET`.**
     - On an error from Supabase, print it with the bucket's name, continue with
       the next bucket, and exit 1 at the end.
  2. Add `"media:buckets": "tsx src/scripts/configure-media-buckets.ts"` to
     `backend/package.json` scripts, next to `media:prune`.
  3. Add a row for `npm --prefix backend run media:buckets [-- --check] [-- --max-file-size <bytes>]`
     to `docs/reference/commands.md`, in that file's style.
- [ ] **Check.** `npm run typecheck` passes.

### Step 1.10: Configure staging's buckets (staging only)
- [ ] **Action.**
  1. Confirm again that `backend/.env` points at staging (section 6.1).
  2. Run the script:
     - if `bigBucket.allowed` was true:
       `npm --prefix backend run media:buckets`;
     - otherwise:
       `npm --prefix backend run media:buckets -- --max-file-size 50000000`.
  3. Run it again with `-- --check`, adding the same `--max-file-size` if you
     used it.
- [ ] **Check.**
  - The first run creates `media-audio`, `media-video` and `media-documents`,
    and updates `media`.
  - The `--check` run exits 0.
  - Write which form you ran in plan 0057, in Step 1.5's **Verify** line.

### Step 1.11: The frontend upload library
- [ ] **Action.**
  1. `npm --prefix frontend install --save-exact tus-js-client@4`. Record the
     exact version installed (`npm --prefix frontend ls tus-js-client`) in the
     PR description.
  2. Run `git diff --stat -- frontend/package-lock.json frontend/package.json`.
     Only those two files may change. Then run
     `npm run check:pr -- --body-file /dev/null 2>&1 | grep -i lock`. If it
     reports dropped platform fields, **stop and ask**.
  3. Create the files in section 4.8, exactly as specified there, with their
     three test files.
  4. In `frontend/src/lib/image.ts`, export `encodeCanvas`. Change nothing else.
- [ ] **Check.**
  - `cd frontend && npx vitest run src/features/media` passes.
  - `npm run typecheck` passes.
  - `npm --prefix frontend run build && npm run check:bundle` passes, and the
    build output shows a **separate** `tus` chunk. Initial JavaScript must not
    have grown by more than 1 kB.

### Step 1.12: Reference docs
- [ ] **Action.**
  1. In `docs/reference/api.md`, under the Media section:
     - document `GET /media/limits`, `GET /media/usage`, `POST /media/uploads`
       (body, both ticket shapes, and the error table with codes, statuses and
       messages) and `DELETE /media/uploads/:id`;
     - change the rate-limit line from 40 to 30;
     - add the sentence: `The legacy POST /media/upload-url and POST /offers/:id/images keep working for open tabs until the follow-up that retires them.`
  2. In `docs/reference/data-model.md`:
     - add a `media_uploads` section (columns, checks and indexes, from section 4.2);
     - add the five new `offer_images` columns;
     - add a short "Buckets" note listing the four buckets and which kind lives in
       each.
  3. In `docs/reference/environment.md`, change the media bucket's description
     to `avatars, organisation logos, offer images and video posters`.
- [ ] **Check.** `npm run docs:check` passes.

### Step 1.13: Tick plan 0057, then ship
- [ ] **Action.**
  1. In plan 0057, tick every box of Phase 0 and Phase 1 that you actually did,
     and set the Progress rows to match.
  2. Follow **section 11** (shipping) with the PR 1 description in
     **Appendix F.1**.
  3. Then **stop and wait** for the human to say it is merged.
- [ ] **Check.** The pull request is open, `check` is green, and `pr-audit` is
  green.

---

## 8. Pull request 2: offer media in the data, every reader, attaching, deleting and review

Start only after pull request 1 is merged:
```bash
git fetch origin && git switch -c feat/offer-media-data origin/main
```
**Check:** `git log --oneline -3` shows pull request 1's squash commit.

### Step 2.1: `thumb_key` becomes optional
- [ ] **Action.**
  1. In `offerImages`, change `thumbKey` to `text('thumb_key')`, which drops
     `.notNull()`.
  2. Add a table check, `check('offer_images_image_has_thumb', sql\`${table.kind} <> 'image' OR ${table.thumbKey} IS NOT NULL\`)`,
     in the table's index array. Import `check` from `drizzle-orm/pg-core`, and
     `sql` from `drizzle-orm`.
  3. Run `npm --prefix backend run db:generate`, then read `0040_*.sql`.
- [ ] **Check.**
  - The SQL has `ALTER COLUMN "thumb_key" DROP NOT NULL` and
    `ADD CONSTRAINT "offer_images_image_has_thumb" CHECK`.
  - It has nothing destructive.
  - `db:migrate` succeeds.
  - `npm run typecheck` now lists errors. Those are the places Step 2.2 fixes.

### Step 2.2: Every image reader reads images only
- [ ] **Action.** Add `eq(offerImages.kind, 'image')` to the `where` of every
  query in section 3.4, items 1 to 4:
  - `imagesForOffers`
  - `offersForProfile`
  - `loadOfferCards`
  - `listSavedOffers`

  Add it to `imagesForQueue` too: the admin sees non-image media from pull
  request 5 on, through its own field. Then fix each type error from step 2.1.
  Image rows always have a thumbnail (the check guarantees it), so write
  `row.thumbKey ?? row.objectKey` where a string is required, with the comment
  `// images always have a thumbnail (offer_images_image_has_thumb)`.
- [ ] **Action, tests.** Create `backend/src/modules/offers/offer-media.test.ts`.
  - Use the service-test pattern: stub `fetch`, and turn storage on in
    `beforeEach`, as in `content-review.test.ts`.
  - Write a helper
    `insertMedia(offerId, { kind, state, objectKey, thumbKey })` that inserts
    into `offerImages` directly.
  - Write these tests:
    1. `public image readers never return audio, video or PDF rows`. It inserts
       one image and one audio item on a published offer, then calls each of
       `listPublishedOffers`, `getPublishedOfferById`, `getPublishedBySlug` (its
       `offers[].images`), `listSavedOffers` and the conversation offer card.
       Each must show exactly the one image.
    2. `the owner's images list (listMine) shows images only`.
- [ ] **Check.**
  - `npm run typecheck` passes.
  - The new tests pass.
  - Every existing backend test passes.

### Step 2.3: Reading non-image media
- [ ] **Action.**
  1. In `offers.service.ts`, add
     `mediaForOffers(offerIds, { audience: 'public' | 'owner' })`. It returns
     `Map<offerId, (OfferMediaItem & { state })[]>`:
     - `kind <> 'image'`;
     - the public audience excludes `pending_add`, exactly as `imagesForOffers`
       does;
     - ordered by `sort_order`, then `created_at`;
     - `url = publicUrl(objectKey, bucketFor(kind))`;
     - `posterUrl = thumbKey ? publicUrl(thumbKey) : null`;
     - an empty map when `!isStorageConfigured()`.
  2. Add `media?: OfferMediaItem[]` (optional, per ADR 0040) to
     `PublishedOfferDetail` in `backend/src/contracts/offers.ts`. Fill it in
     `getPublishedOfferById`, with state stripped.
  3. Add `media` (with `state`) to `listMine`'s returned offers, and treat any
     non-`live` media item as making `pendingChanges` non-null. Search for
     `imagesPending` and include media in it.
  4. On the frontend, add to `frontend/src/features/offers/api.ts`:
     - `OwnOfferMediaItem = OfferMediaItem & { state: 'live' | 'pending_add' | 'pending_remove' }`;
     - `media?: OwnOfferMediaItem[]` on `OwnOffer`.
- [ ] **Action, tests.** Add these to `offer-media.test.ts`:
  3. `the offer page lists live media and hides pending_add from the public`
  4. `the owner sees every media item with its state, and a pending item makes pendingChanges non-null`
- [ ] **Check.** Those tests and every existing test pass.

### Step 2.4: Attaching a verified upload to an offer
- [ ] **Action.**
  1. Add the route `POST /api/v1/offers/:id/media` to `offers.routes.ts`, with
     `requireAuth`. Its body is
     `{ reservationId: uuid, title?: string trimmed, 1–120 chars }`. It answers
     **201** `{ data: { id, kind } }`.
  2. Add `attachOfferMedia(userId, offerId, body)` to `offers.service.ts`:
     1. `requireOwnProfile(userId)`, then `ownOffer(profile.id, offerId)`.
        A missing or foreign offer gives **404**.
     2. `const verified = await verifyReservation(userId, body.reservationId)`.
        This may throw 410 or 422.
     3. If `verified.destination !== 'offer' || verified.offerId !== offerId`,
        throw **409** `CONFLICT` with the message
        `That upload belongs to a different offer.`
     4. In **one** transaction:
        1. `pg_advisory_xact_lock(hashtext(profile.id))`;
        2. `current = await lockOwnOffer(tx, profile.id, offerId)`;
        3. re-count the per-offer limit for `verified.kind`. Count rows with
           `state <> 'pending_remove'`, plus **other** unexpired reservations
           for this offer and kind. Exclude this reservation, which is still a
           row. If the limit is now exceeded, throw **409
           `MEDIA_LIMIT_REACHED`**.
        4. insert into `offerImages`:
           `{ offerId, kind: verified.kind, objectKey, thumbKey, mimeType, sizeBytes, durationSeconds, title: body.title ?? null, sortOrder: max+1 for this offer, state: current.status === 'published' ? 'pending_add' : 'live' }`;
        5. `await consumeReservation(tx, verified.reservationId)`;
        6. apply the **same offer update `addOfferImage` applies**. Copy that
           `tx.update(offers)` block exactly: a published offer clears
           `revisionRejectionReason`; a rejected offer goes to `pending_review`
           and clears `rejectionReason`; otherwise touch `updatedAt`.
     5. Return `{ id, kind }`.
  3. **Images through the pipeline:** an image attach inserts `kind: 'image'`
     with both keys. That makes the new route the checked path for images too.
  4. **The legacy `addOfferImage`** stays working for old tabs. It changes only
     in two ways:
     - its count uses `UPLOAD_LIMITS.offer.image.perTarget` (10), counted over
       `kind = 'image'` rows only;
     - its error message reads `An offer can have at most 10 images`.

     Its error code stays `BAD_REQUEST`. Remove `OFFER_IMAGE_LIMIT` from the
     backend: the unused `reorderOfferImagesBodySchema` imports it, so make that
     schema use `UPLOAD_LIMITS.offer.image.perTarget`.
- [ ] **Action, tests.** Create a **separate** file,
  `backend/src/modules/offers/offer-media.attach.test.ts`. It mocks storage with
  `vi.mock('../../lib/storage.js', …)`, keeping `actual` and overriding
  `storedObject`, `readFirstBytes` and `discardObject`. `vi.mock` applies to the
  whole file, which is why these tests cannot live in `offer-media.test.ts`.
  Make `storedObject` return an object matching the reservation, and
  `readFirstBytes` return the right signature. Also turn storage on in
  `beforeEach` and restore it in `afterEach`, as in step 1.7. Create the
  reservation with `issueUploadTicket` and a mocked `createSignedUpload`. Call
  the service functions directly. Write these tests:
  5. `attaching to an offer under review adds a live item`
  6. `attaching to a published offer adds a pending_add item and clears the last change's rejection reason`
  7. `attaching to a rejected offer sends it back to review`
  8. `refuses another user's reservation (410) and a reservation for a different offer (409)`
  9. `refuses when the offer filled up between ticket and attach (409 MEDIA_LIMIT_REACHED)`
  10. `the legacy image route now allows 10 images and refuses the 11th`
- [ ] **Check.** All pass.

### Step 2.5: Deleting media, from the right bucket
- [ ] **Action.**
  1. `deleteOfferImage` works for every kind. After the transaction, replace
     `deleteObject(objectKey)` / `deleteObject(thumbKey)` with
     `discardObject(objectKey, bucketFor(kind))` and, if `thumbKey`,
     `discardObject(thumbKey)`. Add the comment
     `// best-effort; media:prune catches any miss`.
  2. Do the same in `deleteOffer`. Select `kind` with each row so the bucket is
     known.
- [ ] **Action, tests.**
  11. `removing an audio item from a published offer marks it pending_remove and keeps the file`
  12. `deleting an offer deletes each file from its own bucket`. Assert the
      stubbed `fetch` saw `DELETE` URLs containing `/object/media-audio/`,
      `/object/media-video/` and `/object/media/`.
- [ ] **Check.** All pass, and `content-review.test.ts` still passes.

### Step 2.6: The review handles every kind
- [ ] **Action.** In `backend/src/modules/admin/content-review.service.ts`:
  1. In `offerVersions`, select `kind` too, and make each item's token part
     `${image.id}:${image.kind}:${image.state}`.
  2. `hasPendingImages` already covers every kind. Leave it alone.
  3. In `reviewOffer`, select `kind` with `pending`. Change the `discarded` list
     to pairs, `{ key, bucket }`:
     - the object goes to `bucketFor(kind)`;
     - the thumb, when not null, goes to the media bucket.

     Then call `discardObject(key, bucket)` for each.
- [ ] **Action, tests.** Add these to
  `backend/src/modules/admin/content-review.test.ts`, in its existing style:
  13. `an offer change that adds an audio item is waiting, and approving it makes the item live`
  14. `rejecting an offer change that added a video discards the video and its poster from their buckets`
  15. `the version changes when a media item is added, so a stale approval is refused`
- [ ] **Check.**
  - The whole backend suite passes:
    `cd backend && npx vitest run --maxWorkers=1`.

### Step 2.7: Docs, plan, ship
- [ ] **Action.**
  1. `api.md`:
     - `POST /offers/:id/media` (body, response and errors);
     - `media` on the offer detail and on `GET /offers/mine`;
     - the legacy image route's new limit of 10.

     Also change every "four images" or "4 images" in `docs/reference/` to ten.
     **Do not** touch the terms of use catalogue in this pull request; pull
     request 5 changes it.
  2. `data-model.md`:
     - `thumb_key` is nullable, with the check;
     - the rule that `kind` decides the bucket, and that a thumb or poster is
       always in the media bucket.
  3. Plan 0057: tick the Phase 2 boxes.
  4. Ship with **section 11** and **Appendix F.2**, then **stop and wait**.
- [ ] **Check.** `check` and `pr-audit` are green.

---

## 9. Pull request 3: the offer editor

```bash
git fetch origin && git switch -c feat/offer-media-editor origin/main
```

### Step 3.1: Copy for the editor
- [ ] **Action.**
  1. Add these keys to `frontend/src/i18n/catalogs/offers/en.ts`, under a
     comment `// Media in the offer editor`.
  2. Add the same keys with `''` to `offers/fil.ts` and `offers/war.ts`.

  Use exactly these English values (`{…}` are placeholders filled in with
  `.replace`; keep every sentence whole):
  ```
  'offers.media.heading': 'Photos, audio, video and documents',
  'offers.media.add': 'Add media',
  'offers.media.addImage': 'Add image',
  'offers.media.limits': 'Images up to 20 MB · Audio up to 15 MB and 10 minutes · Video up to 300 MB and 5 minutes · PDF up to 10 MB',
  'offers.media.limitsImagesOnly': 'Images up to 20 MB.',
  'offers.media.quota': '{used} of {total} used',
  'offers.media.rights': 'Only upload work you made or have the rights to share.',
  'offers.media.rightsLink': 'Terms of use',
  'offers.media.uploading': 'Uploading {name}',
  'offers.media.progress': '{sent} of {total} · {percent}%',
  'offers.media.cancel': 'Cancel',
  'offers.media.remove': 'Remove',
  'offers.media.leaveWarning': 'An upload is still in progress.',
  'offers.media.untitled': 'Untitled',
  'offers.media.refused.type': 'This file type can’t be added. Use MP3, M4A or OGG audio, MP4 or WebM video, or a PDF.',
  'offers.media.refused.size': 'This file is {size}. This kind can be up to {limit}.',
  'offers.media.refused.duration': 'This recording is {length} long. This kind can be up to {limit}.',
  'offers.media.refused.codec': 'This video uses a format many phones can’t play. Export it as MP4 (H.264) and try again.',
  'offers.media.refused.unreadable': 'This file couldn’t be read. Try another copy.',
  'offers.media.refused.count': 'This offer already has as many of these as it can hold.',
  'offers.media.refused.quota': 'Your storage is full. Remove something first.',
  'offers.media.failed': 'The upload stopped. Try again.',
  'offers.media.kind.image': 'Image',
  'offers.media.kind.audio': 'Audio',
  'offers.media.kind.video': 'Video',
  'offers.media.kind.document': 'PDF',
  ```
- [ ] **Check.** `cd frontend && npx vitest run src/i18n` passes (key parity).

### Step 3.2: `MediaUploader` and its pure pieces
- [ ] **Action.**
  1. Create `frontend/src/features/offers/media-uploader-logic.ts` (pure,
     tested), containing:
     - `acceptAttribute(limits)`: the `accept=` string for the file input, built
       from the enabled kinds;
     - `refusalMessage(reason, ctx, t)`: maps a `checkBeforeUpload` reason, or an
       API code (`MEDIA_LIMIT_REACHED` → count, `MEDIA_QUOTA_EXCEEDED` → quota),
       to the catalogue key, with the placeholders filled in;
     - `itemsForOffer(offer)`: images and media merged into one list, ordered
       images first, then media by `sortOrder`, each with its state label key.
  2. Create `frontend/src/features/offers/MediaUploader.tsx`, with props
     `{ offer: OwnOffer; onChanged: () => Promise<void> }`.

     **Section header:**
     - a heading;
     - the limits line: the full one, or `limitsImagesOnly` when the limits are
       unavailable;
     - a quota readout from `useMediaUsage()`;
     - the rights sentence, followed by a `Link` to `/terms`.

     **One "Add media" `Button`:** it opens a hidden file input whose `accept`
     comes from `acceptAttribute`. Use "Add image" instead when only images are
     enabled. Allow one file per pick.

     **For each picked file:**
     1. `classifyFile`, then `readDuration` (audio and video) and `videoCodec`
        (video), then `checkBeforeUpload`. A refusal shows the message
        **before any network request**.
     2. **Image:**
        1. `resizeImage(file, DISPLAY_EDGE)` and `resizeImage(file, THUMB_EDGE)`.
        2. Request a ticket: kind `image`, `mimeType` = the display blob's type,
           `sizeBytes` = the display blob's size, `thumbSizeBytes` = the thumb's
           size.
        3. `putWithProgress` both. Progress counts the sum of the two.
        4. `attachOfferMedia`.
     3. **Video:**
        1. `capturePoster`.
        2. Request a ticket with `thumbSizeBytes` set when there is a poster.
        3. `putWithProgress` the poster, then `tusUpload` the file, then attach.
     4. **Audio and PDF:** request a ticket, then `tusUpload`, then attach.
     5. Then `await onChanged()`.
     - **Cancel** aborts the transfer (`AbortController`) and calls
       `abandonUploadTicket(reservationId)`.
     - A failure shows `offers.media.failed`, or the API's mapped message, and
       abandons the reservation.

     **Upload rows:** `aria-live="polite"`, showing the file name, "{sent} of
     {total} · {percent}%" via `formatBytes`, and **Cancel**. Several uploads
     may run at once, each with its own row.

     **Items list:**
     - **Images:** the existing grid, unchanged in look. Move it here from
       `OfferEditor`, with its state labels and **Remove**.
     - **Media:** a row each with the kind, title or file name, `formatBytes`
       size, `formatDuration` length, the state label, and **Remove**
       (`deleteOfferImage(id)`, which works for any kind after pull request 2).
       A `pending_remove` row is dimmed with no **Remove**, exactly as images
       are today.

     **While any upload runs:** add a `beforeunload` listener that sets
     `event.preventDefault()` and `returnValue`. Remove it when none are left.

     **Limits unavailable** (`useMediaLimits().available === false`, an old
     backend): fall back to images only, using the **legacy** flow, which is the
     existing `onAddImage` code moved here unchanged, with the per-offer cap
     of 4.
  3. In `frontend/src/features/offers/OfferEditor.tsx`:
     - replace the whole image section (search for `images used`) with
       `<MediaUploader offer={activeOffer} onChanged={async () => setOffers(await listMine())} />`;
     - remove `onAddImage`, `onRemoveImage`, `inputRef` and the image-only state
       that moved into `MediaUploader`;
     - keep the editor's other behaviour exactly.
  4. In `frontend/src/features/offers/limits.ts`, delete `OFFER_IMAGE_LIMIT`, and
     read the cap from the limits (fallback 4). Fix every import.
  5. Tokens only. Reuse `Button`, `Badge` and the existing image grid classes.
     **Never** build a class name with `${}`.
- [ ] **Action, tests.** Create
  `frontend/src/features/offers/media-uploader-logic.test.ts`:
  - `acceptAttribute` with every kind enabled, and with images only;
  - `refusalMessage` for each reason and each API code, including the
    placeholders;
  - `itemsForOffer` ordering, and the state labels.
- [ ] **Check.**
  - `npm run typecheck` passes.
  - The frontend tests pass, including `section-ownership.test.ts`.
  - `npm --prefix frontend run build && npm run check:bundle` passes.

### Step 3.3: Try it for real (local API against staging storage)
- [ ] **Action.**
  1. `npm run db:up`, then
     `MEDIA_UPLOAD_KINDS=audio,video,document npm run dev:api` (with the staging
     storage keys already in `backend/.env`), then `npm run dev:web`.
  2. Register a creative through `/register` and finish the profile. Make it
     published with SQL: `update creative_profiles set status='published'`.
     **Local only.**
  3. Create an offer.
  4. In the browser at `http://localhost:5173/account/offers`:
     - add an image, an MP3 (under 15 MB), a short MP4 (H.264, under 50 MB if
       staging is on the free plan) and a PDF;
     - reload, and confirm all four are listed with sizes and lengths;
     - start a video upload and press **Cancel** halfway; confirm the row
       disappears, and that `media_uploads` has no row for it;
     - pick a `.mov` file: the refusal appears and the Network panel shows **no**
       request;
     - with the browser's DevTools network throttling on "Slow 4G", start a
       20 MB video, turn the network off for 20 seconds, then on. Progress
       continues from about where it stopped, not from 0.
  5. Screenshot `/account/offers` with the edit dialog open and items present,
     at 375px light, 375px dark, and 1280px light, with your Edge copy. Save them
     to the scratch folder.
- [ ] **Check.** Every point in item 4 behaved as described. If resuming
  restarts from 0, **stop and ask**.

### Step 3.4: Ship
- [ ] **Action.**
  1. In plan 0057, tick the Phase 3 boxes.
  2. Ship with section 11 and **Appendix F.3**.
  3. Tell the human: "Pull request 3 needs the screenshots uploaded from
     `<scratch>/screenshots/pr3/`." Then **stop and wait**.
- [ ] **Check.** `check` is green. `pr-audit` turns green once the screenshots
  are uploaded.

---

## 10. Pull requests 4 and 5

### 10.1 Pull request 4: players, the offer page, badges and posters

```bash
git fetch origin && git switch -c feat/offer-media-players origin/main
```

- [ ] **Step 4.1: Backend.**
  1. In `listPublishedOffers`, add `mediaBadge?: MediaBadge | null` to each card
     (`PublishedOfferCard` contract, optional). Its value is the first non-image
     kind by `sort_order` among the offer's **public** media, with the `count`
     of that kind and the first item's `durationSeconds`; `null` when there is
     none.
  2. A **cover fallback**. Add `coverPoster` to `offers.service.ts`, a function
     returning `Map<offerId, OfferImage>` made from the first public video's
     poster (`{ id, url: posterUrl, thumbUrl: posterUrl, sortOrder }`). Use it
     where a card shows one image but the offer has none:
     - `listPublishedOffers` (`image`);
     - `loadOfferCards`;
     - `listSavedOffers`.
  3. Add `mediaBadge?` and `poster?: OfferImage | null` to `ProfileOffer`, and
     fill them in `offersForProfile`.
  4. Tests in `offer-media.test.ts`:
     - `cards carry a media badge for an offer with audio`;
     - `an offer with only a video shows its poster on cards and in saved offers and messages`.
- [ ] **Step 4.2: Players.**
  1. Add these core keys (`frontend/src/i18n/catalogs/en.ts`, with `''` in
     `fil.ts` and `war.ts`):
     ```
     'media.listen': 'Listen',
     'media.watch': 'Watch',
     'media.read': 'Read',
     'media.openPdf': 'Open PDF',
     'media.badge.audio': 'Audio',
     'media.badge.video': 'Video',
     'media.badge.document': 'PDF',
     'media.noPoster': 'Video',
     ```
  2. Create `frontend/src/features/media/MediaPlayer.tsx`, exporting:
     - `AudioItem`: `<audio controls preload="none" src>`, with the title, and
       the size and length shown **above** it, before any play;
     - `VideoItem`: `<video controls preload="none" playsInline poster>`, with
       the size and length. With no poster, use the `bg-surface-sunken` token
       surface and the label `media.noPoster`;
     - `DocumentLink`: `<a href target="_blank" rel="noopener">`, with the
       title, size and `media.openPdf`.

     **Never** `autoPlay`.
  3. Create `frontend/src/features/media/players.test.ts`, a **source check**.
     Use `import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true })`
     the way `section-ownership.test.ts` does, and fail if any file has
     `<audio` or `<video` without `preload="none"`, or has `autoPlay` anywhere.
- [ ] **Step 4.3: The offer page.**
  1. In `frontend/src/pages/OfferDetailPage.tsx`, below the gallery section, add
     three sections, **Listen** (audio), **Watch** (video) and **Read** (PDF),
     each hidden when empty, built from `offer.data?.media ?? []`.
  2. Use the page's existing section heading style. Copy the Gallery section's
     markup.
  3. If `npm run check:bundle` grows initial JavaScript by more than 3 kB, move
     the three sections into a lazy component (`React.lazy`) below the fold.
- [ ] **Step 4.4: Badges and posters on cards.**
  1. `frontend/src/features/offers/OfferCard.tsx` gains an optional
     `mediaBadge` prop. It shows a second `Badge` beside the category badge,
     e.g. "Audio · 3:42" or "2 · Video", built with the core keys and
     `formatDuration`. **Never a player.**
  2. Pass `mediaBadge` from `DirectoryPage` and from the similar-offers strip.
  3. `CreativeProfilePage`'s offer cards use `offer.images[0] ?? offer.poster ?? null`.
- [ ] **Step 4.5: Check and ship.**
  1. Run the typecheck, the frontend tests (including `players.test.ts`), the
     build and `check:bundle`.
  2. Try it for real, as in step 3.3: on `/offers/<id>` for the test offer at
     375px, with the throttled network, nothing downloads until **Play** is
     pressed. The Network panel shows only the poster.
  3. Take screenshots of:
     - the offer page with all three sections (375px light, 375px dark, 1280px
       light);
     - the directory with a badge (375px light).
  4. In plan 0057, tick Phase 4.
  5. Ship with **Appendix F.4**, ask for the screenshots, then **stop and wait**.

### 10.2 Pull request 5: admin review previews, and the terms line

```bash
git fetch origin && git switch -c feat/offer-media-review origin/main
```

- [ ] **Step 5.1: The queue carries every kind.**
  1. In `imagesForQueue`, remove the `kind = 'image'` filter added in pull
     request 2, and return **all** kinds.
  2. Extend `AdminMediaImage` (`backend/src/contracts/admin.ts`):
     - add `kind`;
     - make `thumbUrl: string | null`;
     - add `title?`, `mimeType?`, `sizeBytes?` and `durationSeconds?`.

     Fill them: `url` is the item's file in its bucket; `thumbUrl` is its thumb
     or poster, or null.
  3. Test in `content-review.test.ts`:
     `the queue lists an added audio item with its kind, size and length`.
- [ ] **Step 5.2: The review card.**
  1. In `frontend/src/pages/admin/content-review/ReviewCard.tsx`:
     - `MediaPreview` keeps using **images only** (`kind === 'image'`) for the
       cover and strip, falling back to a video's poster;
     - below the offer's text, list each non-image item with `AudioItem`,
       `VideoItem` or `DocumentLink` from `features/media/MediaPlayer`, each
       labelled **Added** or **Removed** when its state is `pending_add` or
       `pending_remove`;
     - replace `photoChanges` with `mediaChanges(item)`, which counts per kind,
       e.g. "1 photo added, 1 audio removed, 1 video added". Pluralise as the
       existing function does.
  2. Put `mediaChanges` in
     `frontend/src/pages/admin/content-review/review-list-logic.ts` and test it
     in `review-list-logic.test.ts`.
- [ ] **Step 5.3: The terms of use.** Three edits, all in
  `frontend/src/i18n/catalogs/legal/en.ts`. Change **English only**: the
  Filipino and Waray legal values stay `''`.
  1. **Correct the limits.** They are wrong since pull request 2. Replace the
     value of `'terms.profiles.limits'` with:
     `'You may list up to six offers. Each can hold up to ten images, five audio files, two videos and three PDFs, and you choose the order they appear in.'`
  2. **Correct the review sentence.** Replace the value of
     `'terms.profiles.review'` with:
     `'A creative profile is reviewed before it appears publicly, and so are profile photos and everything added to an offer: images, audio, video and documents. A profile or an offer can be rejected, and you will be told why.'`
  3. **Add the rights line.** Add a new key directly after
     `'terms.profiles.ownership'`:
     `'terms.profiles.rights': 'Upload only work you made or have the rights to share, including music, video and writing. We remove uploads reported as infringing.'`
     Add `'terms.profiles.rights': ''` to `legal/fil.ts` and `legal/war.ts`, in
     the same position.
  4. **Render the new key** in `frontend/src/pages/legal/TermsPage.tsx`. The
     profiles section is a list of items. Directly after the line
     `<LegalText key="terms.profiles.ownership" k="terms.profiles.ownership" />,`
     add:
     `<LegalText key="terms.profiles.rights" k="terms.profiles.rights" />,`
  5. **Update the dates:**
     - Set `LEGAL_LAST_UPDATED` in `frontend/src/lib/legal.ts` to today's date,
       in that file's format (`'12 October 2026'`).
     - Set `CONSENT_VERSION` to today's date (`'YYYY-MM-DD'`) in **both**
       `frontend/src/lib/legal.ts` and `backend/src/modules/auth/auth.service.ts`.
     - Extend the comment above `CONSENT_VERSION` in both files with one
       sentence: the terms began listing audio, video and PDF on offers, and
       saying uploads must be the uploader's own work or theirs to share.
  6. **Check.** `cd frontend && npx vitest run src/i18n` passes (key parity),
     and `grep -n "four images" frontend/src/i18n/catalogs/legal/en.ts` finds
     nothing.
- [ ] **Step 5.4: Check and ship.**
  1. Run the full checks and the full backend suite.
  2. Try it for real: as an admin, `/admin/offers › Changes` shows a change that
     added audio, with a working player, and **Approve** makes it live on the
     offer page.
  3. Take screenshots of the review card at 1280px light and 375px dark, and of
     `/terms` at 375px light.
  4. In plan 0057, tick Phase 5. Set the plan's status to
     `In progress — rollout remains` in **both** the plan and `docs/plans/README.md`.
  5. Ship with **Appendix F.5**, ask for the screenshots, then **stop**.
  6. Tell the human that the rollout steps in **Appendix G** are reyxdz's.

---

## 11. Shipping a pull request (the same for all five)

Do these in order. All of them must pass before you push.

1. **Sweep for stale numbers** (pull requests 2 and 5 especially):
   `grep -rn "four images\|4 images\|up to four" docs frontend/src backend/src`.
   Every hit about offer images must say ten, with these exceptions:
   - the old ADRs and plans, which are records;
   - the frontend's legacy fallback of 4 (pull request 3), which is deliberate;
   - the terms of use catalogue (`frontend/src/i18n/catalogs/legal/`), until pull
     request 5, which changes it.
2. **The local checks**, from the repository root:
   ```bash
   npm run typecheck
   npm run lint                      # exactly the 3 old warnings
   npm run docs:check
   npm run test:scripts
   cd backend && npx vitest run --maxWorkers=1 && cd ..
   cd frontend && npx vitest run && cd ..
   npm run build && npm run check:bundle
   git diff --check
   ```
3. **Lockfiles.** Run `git diff origin/main --stat -- '*package-lock.json'`. It
   must be empty, except in pull request 1, where only
   `frontend/package-lock.json` changes, together with `frontend/package.json`.
4. **Nothing private.** Run `git status --short`. It must show no `.env`, no
   `tmp`, no screenshots and no file from your scratch folder.
5. **Commit** in logical pieces: schema and migration; backend; frontend; docs.
   - Write each message as a plain imperative sentence, under 72 characters,
     followed by a short body saying **why**.
   - **No AI attribution of any kind.**
   - If the `commit-msg` hook rejects a message, fix the message. **Never** use
     `--no-verify`.
6. **The description.** Copy the matching **Appendix F** body into
   `<scratch>/pr<N>.md`, and fill in every `‹…›` with what you actually did and
   measured. Then run:
   ```bash
   git fetch origin
   npm run check:pr -- --body-file "<scratch>/pr<N>.md"
   ```
   - For pull requests 3 to 5, the only problem it may report is
     `"Screenshots" needs at least one image`. Leave the Screenshots section's
     placeholder line in place.
   - For pull requests 1 and 2, it must print
     `Pull request ready for audit`.
7. **Push and open the PR:**
   ```bash
   git push -u origin <branch>
   gh pr create --base main --head <branch> --title "<title from section 0>" --body-file "<scratch>/pr<N>.md"
   ```
   The `pre-push` hook runs typecheck, lint and docs. If it fails, fix the cause.
8. **Watch CI:** `gh pr checks <number> --watch --interval 30`. Expect:
   - `check` green;
   - `pr-audit` green (for 3 to 5, green only after the screenshots are uploaded);
   - Vercel staging green;
   - "Vercel – bilikha" either "Canceled by Ignored Build Step" or
     `git_info_fail`, both harmless.
9. **Report to the human.** Give:
   - the pull request's URL;
   - what it contains;
   - the test counts;
   - what you checked in a browser;
   - for 3 to 5, the screenshot folder to upload from.

   Then **stop**.

If CI fails, read the failing job (`gh run view <id> --log-failed`), fix it on
the same branch with a new commit, and push again. **Never force-push.**

---

## 12. Self-audit (run it before step 11.6 of every pull request)

Answer each question by looking at the diff (`git diff origin/main...HEAD`), not
from memory. Every answer must be **yes**.

- [ ] **Only what this PR's section asked for?** No drive-by refactors, no
  reformatting.
- [ ] **Migrations:**
  - additive (no `DROP COLUMN`, `RENAME` or `SET NOT NULL`);
  - generated with `db:generate`, not hand-written;
  - a second `db:generate` reports nothing to do.
- [ ] **Backend relative imports end in `.js`?**
- [ ] **Every new route:**
  - has auth and ownership checks;
  - validates its body with zod;
  - answers `{ data }` or `AppError`;
  - is documented in `docs/reference/api.md`.
- [ ] **Every public reader of `offer_images`** still excludes `pending_add` and
  filters `kind` correctly?
- [ ] **Every storage delete or read of a non-image file** passes its bucket
  (`bucketFor(kind)`)? Search the diff for `discardObject(` and `publicUrl(`.
- [ ] **The review token** includes every kind? An approval cannot publish an
  item the admin never saw?
- [ ] **No user-facing string hard-coded** in a non-admin component? Filipino and
  Waray are `''`?
- [ ] **No raw colours, shadows or font sizes**, no `${}` class names, no `dark:`
  variants?
- [ ] **Every `<audio>` and `<video>`** has `preload="none"`, and none autoplays?
- [ ] **Unhappy paths:** every new limit or refusal has a test, and every bug you
  fixed has a test that fails without the fix?
- [ ] **Docs:**
  - `api.md`, `data-model.md` and `environment.md` are updated where this PR
    makes them wrong;
  - plan 0057's boxes are ticked only for what you actually did.
- [ ] **Old browser tabs:** the old frontend still works against the new backend
  (`POST /media/upload-url` with `kind: 'offer'`, and
  `POST /offers/:id/images`)? New contract fields are optional?
- [ ] **Nothing secret:** no key, token or `.env` content in a commit, a test, a
  log line or the PR description?
- [ ] **No AI attribution** anywhere: commits, PR body, code comments?

---

## 13. When to stop and ask the human

Stop, say exactly what you saw, and wait, when:
- a **Check** does not match and you cannot see why within two attempts;
- the code differs from section 3 in a way that changes a step;
- the probe (section 6) fails any of its conditions;
- `backend/.env` points at production, or has no staging key;
- a lockfile changes in a way step 1.11 or section 11.3 does not allow;
- an instruction here contradicts `CLAUDE.md` (**`CLAUDE.md` wins; ask anyway**);
- you would need to merge, release, force-push, touch `production`, change
  Render, Vercel or Supabase settings other than staging buckets in step 1.10,
  or write a Filipino or Waray translation;
- a resumed upload restarts from zero (step 3.3).

Never guess. A wrong guess here can publish an unreviewed file, or delete one
nobody meant to.

---

# Appendices

## Appendix A: the full text of the revised ADR 0046

Replace the whole file
`docs/decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md` with
this:

```markdown
# 0046. Offers carry audio, video and PDF, through one checked upload pipeline

- **Status:** Proposed
- **Date:** 2026-10-06, revised 2026-10-12
- **Supersedes:** the images-only scope and free-tier budget of
  [0021](./0021-image-storage-and-upload-path.md). Its browser-side image
  sizing and direct upload stand.
- **Amends:** [0022](./0022-offers-replace-portfolio.md): ten images per offer
  instead of four, and an offer can hold audio, video and PDF
- **Related:** [plan 0057](../plans/0057-upload-pipeline-and-offer-media.md) ·
  [0058](./0058-content-waits-for-approval-beside-what-is-public.md) ·
  [0057](./0057-new-accounts-are-verified-with-a-biliran-id.md) ·
  [0040](./0040-a-deploy-must-not-break-an-open-tab.md) ·
  [0037](./0037-one-definition-of-an-api-shape.md) ·
  [operating constraints](../explanation/constraints.md) ·
  [issue #34](https://github.com/ELITES-ORG/bilikha/issues/34) ·
  [issue #66](https://github.com/ELITES-ORG/bilikha/issues/66)

## Context

A creative can only show images. Songwriters, composers, filmmakers, performers
and writers have nothing that fits their craft (#34). Message attachments (#66)
need the same machinery with private files. [0021](./0021-image-storage-and-upload-path.md)
kept uploads to images for the Supabase free tier: 1 GB of storage, 50 MB per
file and 5 GB of egress a month. Both projects are moving to Supabase Pro.

The other constraints still apply:
- Visitors are on budget Android phones and metered data.
- Render's free instance has 512 MB of RAM and cannot transcode.
- Migrations run while the old instance is still serving.
- Nothing new is public until an administrator approves it
  ([0058](./0058-content-waits-for-approval-beside-what-is-public.md)).

The first version of this record, from 2026-10-06, made each item public on
upload with a review afterwards, and added a profile-level portfolio. 0058
retired the first idea. The product owner dropped the second, and decided on
2026-10-10 to build the upload pipeline once, ahead of both #34 and #66.

## Decision

**One upload pipeline, keyed by destination and kind.** A single limits table
in the backend, served to the browser at `GET /api/v1/media/limits`, says what
each destination accepts. `offer` is the first destination. #66 adds `message`,
with a private bucket, by adding a row, not by changing the pipeline.

**For offers, four kinds, each with its own limits:**

| Kind | Stored types | Per file | Duration | Per offer |
|---|---|---|---|---|
| Image | WebP or JPEG (JPEG, PNG, WebP or HEIC picked) | 2 MB stored, 20 MB picked | | 10 |
| Audio | MP3, M4A/AAC, OGG/Opus | 15 MB | 10 min | 5 |
| Video | MP4 (H.264), WebM | 300 MB | 5 min | 2 |
| PDF | PDF | 10 MB | | 3 |

SVG, HTML, archives, executables, Office files, WAV, FLAC, MOV and HEVC video
are refused. MB means 1,000,000 bytes.

**Shared limits:**
- **Quota:** 1 GB per creative across their offers.
- **Rate limit:** 30 upload tickets per hour per account, shared with avatars,
  organisation logos and ID photos.
- **Reservations:** a ticket reserves its kind's maximum size until the upload
  is confirmed or expires after 24 hours, so a dishonest declared size cannot
  outrun the quota.

**Storage enforces the limits too.** Each kind has its own bucket with a size
limit and an allowed-types list, set by an idempotent script. Images and video
posters stay in the existing bucket. The pipeline chooses a bucket by
destination and kind, and supports private buckets.

**Two transports, both direct from the browser:**
- Images keep the signed `PUT`.
- Audio, video and PDF use Supabase's resumable (TUS) upload, authorised by the
  same signed upload token. A dropped mobile connection resumes instead of
  restarting.
- The TUS client loads only when such an upload starts.

**Nothing is recorded unchecked.** Before attaching an upload, the server reads
the stored object and requires:
- its size to equal what was declared and to be within the cap;
- its type to be on the kind's list;
- its first bytes to carry the type's file signature.

This also closes 0021's gap, where an image key was recorded without looking at
what was stored. Duration and video codec are checked in the browser only. The
size cap is the hard guarantee.

**Review follows 0058.**
- An item added to an offer not yet published is part of that offer's first
  review.
- On a published offer, an added item waits beside the public version, and so
  does a removal, until an administrator approves or rejects the change.
- There is no per-item review and no administrator "remove" of approved media:
  reports and suspension remain the way to take approved content down.

**An off switch.** `MEDIA_UPLOAD_KINDS` lists the kinds that accept uploads
besides images.
- It is empty by default.
- It is set on staging first, and on production once Pro is active there.
- Turning a kind off stops new uploads; published items stay.
- Until a backend with the limits endpoint is live, the editor offers only
  images, at the old limits (0040).

## Alternatives considered

**A separate table for media, with images left where they are.** Rejected by
the product owner, for the same reason 0022 rejected two image concepts: two
places an item lives, and two pipelines to moderate. `offer_images` gains a
`kind` instead, and keeps its name.

**Build the pipeline inside #34 and reuse it for #66.** Rejected: the first
feature to land would fix the pipeline's shape for the other, and its pull
request would grow too large to review.

**A signed `PUT` for every kind.** Rejected: a 300 MB request over mobile data
often drops, and must not restart from zero.

**One bucket, with the limits enforced only by the API.** Rejected: once the
project's per-file limit rises for video, a call that skips the API could put
300 MB of anything in the image bucket.

**Transcoding or probing on the server.** Rejected: Render cannot hold a
300 MB file, and a paid media service is a new vendor for a problem the browser
checks and the size cap already bound.

**Public on upload, reviewed afterwards** (this record's first version).
Superseded by 0058.

**A profile-level portfolio.** Dropped for now: it has no review path under
0058. It can return as its own issue.

## Consequences

**Good.**
- Every craft can show its work, and storage enforces the limits itself.
- Uploads are checked before they are recorded, images included.
- #66 reuses the pipeline and adds only its destination.
- The off switch lets every pull request merge before production pays for Pro.

**Bad.**
- **Cost moves from zero to metered.** One 300 MB video watched in full 1,000
  times uses Pro's monthly egress. `preload="none"` and the size shown before
  play keep each download the viewer's choice.
- **Phone video often fails the limits.** iPhones record MOV, usually HEVC, and
  a 5-minute 1080p video is often over 300 MB. Those creatives must export or
  trim first. The editor says so plainly.
- **Duration and codec are only as honest as the browser.** The size cap still
  holds, and review catches the rest.
- **Reserving the maximum needs headroom.** A video ticket reserves 302 MB until
  it is confirmed or expires.
- **Unconfirmed uploads sit in public buckets until they expire** (up to 24
  hours, within the uploader's quota). Their URLs are unguessable and never
  shown. Expiring them sooner is a follow-up.
- **The shared rate limit makes filling a catalogue slow:** 60 images is more
  than two hours at 30 an hour.
- **Music and video raise the stakes on rights.** The terms gain a line saying
  you must own or have the rights to what you upload, and the editor repeats
  it. A line is not enforcement.
```

---

## Appendix B: the full text of plan 0057

Create `docs/plans/0057-upload-pipeline-and-offer-media.md` with this text.
Replace `PROBE_RESULTS_JSON` as step 1.1 says.

```markdown
# 0057. The upload pipeline, and audio, video and PDF on offers

- **Status:** In progress
- **Owner:** reyxdz
- **Related:** [ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md) ·
  [ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md) ·
  [plan 0045](./0045-audio-video-and-pdf-uploads.md) (superseded) ·
  [issue #34](https://github.com/ELITES-ORG/bilikha/issues/34) ·
  [issue #66](https://github.com/ELITES-ORG/bilikha/issues/66)

## Goal

An offer can carry audio, video and PDF beside its images. Each kind has its own
limits on size, duration and count, enforced by the browser, the API and
storage. Large files upload resumably. Players download nothing until tapped.
New media waits for review as photos do (ADR 0058). All of it is built on one
upload pipeline that message attachments (#66) will reuse.

## Scope

**In scope**
- The shared pipeline:
  - the limits table and the off switch;
  - buckets per kind;
  - reservations, tickets and verification of the stored object;
  - the resumable transport;
  - the browser upload library.
- On offers:
  - attaching media;
  - every reader, deletion and review across kinds;
  - the editor, the players, badges and posters;
  - the admin previews;
  - the terms line.

**Out of scope**
- A profile-level portfolio (dropped; see ADR 0046).
- Message attachments (#66, which reuses this pipeline).
- Retiring the legacy image upload routes (a follow-up, one release later).
- Expiring stalled uploads sooner than 24 hours, and reordering media.

## Prerequisites

- **Docker:** Docker Desktop running, with `bilikha-postgres` up
  (`npm run db:up`).
- **Staging storage:** for step 0.1 and the steps that try uploads for real, the
  **staging** Supabase service-role key is in `backend/.env`, which is never
  committed.

## Blockers

- **The rollout (Phase 6) needs Supabase Pro on production.** Phases 0–5 merge
  before that, because the new kinds stay off until `MEDIA_UPLOAD_KINDS` is set.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 0. Prove the transport | 0 / 1 | Not started |
| 1. The shared pipeline | 0 / 6 | Not started |
| 2. Offer media in the data | 0 / 5 | Not started |
| 3. The offer editor | 0 / 2 | Not started |
| 4. Players, badges and posters | 0 / 3 | Not started |
| 5. Review previews and the terms | 0 / 2 | Not started |
| 6. Rollout (reyxdz) | 0 / 6 | Not started |

---

## Phase 0 — Prove the transport

### Step 0.1 — Probe Supabase's resumable upload on staging

- [ ] **Action.** Run the probe from the handoff against a throwaway private
  bucket on staging, and delete the bucket afterwards.
- [ ] **Verify.**
  - A TUS endpoint accepts a signed upload token.
  - An interrupted upload resumes from at least 6 MB.
  - The listed size and type match.
  - The first bytes can be read.
  - The bucket was removed.

Probe results:

PROBE_RESULTS_JSON

## Phase 1 — The shared pipeline (pull request 1)

### Step 1.1 — Records
- [ ] **Action.** This plan, ADR 0046 revised, plan 0045 superseded, and the
  index rows.
- [ ] **Verify.** `npm run docs:check` passes.

### Step 1.2 — Switch, limits and signatures
- [ ] **Action.** Add `MEDIA_UPLOAD_KINDS`, `media.limits.ts` and
  `media.sniff.ts`, with their tests.
- [ ] **Verify.** The tests pass.

### Step 1.3 — Schema
- [ ] **Action.** Add `media_uploads` and the new `offer_images` columns, in an
  additive migration.
- [ ] **Verify.** It migrates, and a second `db:generate` has nothing to do.

### Step 1.4 — Storage, tickets and verification
- [ ] **Action.** Add the storage functions, the ticket, abandon, limits and
  usage routes, `verifyReservation`, and the 30-an-hour limit.
- [ ] **Verify.** `media.test.ts` and the storage tests pass.

### Step 1.5 — Buckets and cleanup
- [ ] **Action.** Write `media:buckets`, extend `media:prune` to every bucket and
  to reservations, and configure staging's buckets.
- [ ] **Verify.** `media:buckets -- --check` exits 0 on staging. Write here which
  form was run.

### Step 1.6 — The browser library
- [ ] **Action.** Add the checks, probe, PUT and TUS transports, and the upload
  reducer, with their tests. Add `tus-js-client`, loaded on demand.
- [ ] **Verify.** The tests pass, and `check:bundle` shows a separate chunk.

## Phase 2 — Offer media in the data (pull request 2)

### Step 2.1 — Optional thumbnails
- [ ] **Action.** `thumb_key` becomes nullable, with an image-has-thumb check.
- [ ] **Verify.** It migrates.

### Step 2.2 — Readers
- [ ] **Action.** Every image reader filters `kind = 'image'`. `mediaForOffers`
  serves the rest.
- [ ] **Verify.** `offer-media.test.ts` passes.

### Step 2.3 — Attaching
- [ ] **Action.** `POST /offers/:id/media` verifies and records an upload under
  ADR 0058's states. The legacy image route allows 10.
- [ ] **Verify.** The attach tests pass.

### Step 2.4 — Deleting
- [ ] **Action.** Files are deleted from their own bucket.
- [ ] **Verify.** The bucket-deletion test passes.

### Step 2.5 — Review
- [ ] **Action.** The version token, approve and reject cover every kind.
- [ ] **Verify.** The `content-review.test.ts` additions pass.

## Phase 3 — The offer editor (pull request 3)

### Step 3.1 — The uploader
- [ ] **Action.** `MediaUploader` in the offer editor: limits shown before
  picking, the quota, progress, cancel, resume, the rights reminder, and the
  legacy fallback.
- [ ] **Verify.** The logic tests pass, and the bundle is within budget.

### Step 3.2 — Tried for real
- [ ] **Action.** Upload each kind through the local API against staging storage.
- [ ] **Verify.**
  - Each kind survives a reload.
  - A refusal happens before any request.
  - Cancel leaves no reservation.
  - A cut connection resumes.

## Phase 4 — Players, badges and posters (pull request 4)

### Step 4.1 — Backend
- [ ] **Action.** Media badges on cards, and a video poster as the cover when an
  offer has no image.
- [ ] **Verify.** The tests pass.

### Step 4.2 — Players
- [ ] **Action.** `AudioItem`, `VideoItem` and `DocumentLink`, with nothing
  preloaded and nothing autoplaying, and a source test.
- [ ] **Verify.** `players.test.ts` passes.

### Step 4.3 — Pages and cards
- [ ] **Action.** Listen, Watch and Read on the offer page, and badges on cards.
- [ ] **Verify.** On a throttled phone profile, only the poster downloads before
  play.

## Phase 5 — Review previews and the terms (pull request 5)

### Step 5.1 — Review card
- [ ] **Action.** The queue carries every kind, and the review card plays and
  labels added and removed media.
- [ ] **Verify.** The tests pass.

### Step 5.2 — Terms
- [ ] **Action.** Correct the limits and review lines, add the rights line, and
  move the legal date and consent version.
- [ ] **Verify.** Key parity passes, and "four images" is gone.

## Phase 6 — Rollout (reyxdz)

### Step 6.1 — Supabase Pro
- [ ] **Action.** Move the Bilikha organisation to Pro.
- [ ] **Verify.** The billing page shows Pro.

### Step 6.2 — Upload size limit
- [ ] **Action.** Set the project upload limit to 350 MB on both projects.
- [ ] **Verify.** Each project's Storage settings show 350 MB.

### Step 6.3 — Buckets
- [ ] **Action.** Run `media:buckets` on staging without a cap, then on
  production.
- [ ] **Verify.** `--check` exits 0 on both.

### Step 6.4 — Staging on
- [ ] **Action.** Set `MEDIA_UPLOAD_KINDS=audio,video,document` on Render
  `bilikha`.
- [ ] **Verify.** Each kind uploads and plays on staging, and plays on an
  iPhone.

### Step 6.5 — Release
- [ ] **Action.** Release `main` with production's switch still empty.
- [ ] **Verify.** The release checks in the guide pass.

### Step 6.6 — Production on
- [ ] **Action.** Set the switch on Render `bilikha-production`. Accept ADR 0046.
  Close #34.
- [ ] **Verify.** Each kind uploads and plays on production.

## Acceptance

- [ ] Each kind uploads, plays or opens, and survives a reload, on staging and on
  production.
- [ ] Uploads that are over-size, wrong-type, over-count, over-quota or
  rate-limited are each refused by the API, with tests.
- [ ] An object uploaded around the API with a forged type or size is refused by
  storage or at verification.
- [ ] Players download nothing until tapped, on a throttled phone profile.
- [ ] A near-300 MB video resumes after the network drops, and a 301 MB or 5:01
  video is refused before upload.
- [ ] New media waits for review on a published offer, and a rejected change
  discards only its own files.
- [ ] ADR 0046 is Accepted.

## Follow-ups

- Retire `POST /media/upload-url` with `kind: "offer"` and
  `POST /offers/:id/images`, one release after pull request 3.
- Expire stalled uploads sooner than 24 hours.
- Reorder media within an offer.
- A profile-level portfolio, with its own review design.
```

---

## Appendix C: `backend/src/modules/media/media.limits.ts`

```ts
import { env } from '../../config/env.js';
import type { KindLimitView, MediaKind, MediaLimits, UploadDestination } from '../../contracts/media.js';

/**
 * Every upload limit, in one place (ADR 0046). The browser reads them from
 * `GET /api/v1/media/limits` and never keeps its own copy. MB is 1,000,000
 * bytes, as Supabase counts it.
 */
export const MB = 1_000_000;

export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'audio', 'video', 'document'];

export interface KindLimit {
  /** Largest stored file. For an image, each of the display image and its thumbnail. */
  maxBytes: number;
  /** Largest file the browser may pick before resizing. Images only. */
  maxPickedBytes: number | null;
  maxDurationSeconds: number | null;
  /** Normalised types storage holds for this kind. */
  mimeTypes: readonly string[];
  /** How many of this kind one target (an offer) may hold. */
  perTarget: number;
  /** Counted against the quota while the upload is pending. */
  reservedBytes: number;
  transport: 'put' | 'tus';
  /** Appended to SUPABASE_STORAGE_BUCKET to name the kind's bucket. */
  bucketSuffix: '' | '-audio' | '-video' | '-documents';
  /** The extension a stored type's key ends in. Images keep `.webp` keys (ADR 0021). */
  extensions: Readonly<Record<string, string>>;
}

export const UPLOAD_LIMITS: Readonly<Record<UploadDestination, Readonly<Record<MediaKind, KindLimit>>>> = {
  offer: {
    image: {
      maxBytes: 2 * MB,
      maxPickedBytes: 20 * MB,
      maxDurationSeconds: null,
      mimeTypes: ['image/webp', 'image/jpeg'],
      perTarget: 10,
      reservedBytes: 4 * MB,
      transport: 'put',
      bucketSuffix: '',
      extensions: { 'image/webp': 'webp', 'image/jpeg': 'webp' },
    },
    audio: {
      maxBytes: 15 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: 600,
      mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'],
      perTarget: 5,
      reservedBytes: 15 * MB,
      transport: 'tus',
      bucketSuffix: '-audio',
      extensions: { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg' },
    },
    video: {
      maxBytes: 300 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: 300,
      mimeTypes: ['video/mp4', 'video/webm'],
      perTarget: 2,
      reservedBytes: 302 * MB,
      transport: 'tus',
      bucketSuffix: '-video',
      extensions: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
    },
    document: {
      maxBytes: 10 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: null,
      mimeTypes: ['application/pdf'],
      perTarget: 3,
      reservedBytes: 10 * MB,
      transport: 'tus',
      bucketSuffix: '-documents',
      extensions: { 'application/pdf': 'pdf' },
    },
  },
};

/** Per creative, across every offer (ADR 0046). */
export const QUOTA_BYTES = 1_000 * MB;

/** How long a ticket holds its reservation. */
export const RESERVATION_MS = 24 * 60 * 60 * 1000;

const ALIASES: Readonly<Record<string, string>> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/opus': 'audio/ogg',
  'audio/x-aac': 'audio/aac',
};

/** Lower-cased, parameters dropped, and the browser aliases mapped to one name. */
export function normaliseMimeType(type: string): string {
  const base = (type.split(';')[0] ?? '').trim().toLowerCase();
  return ALIASES[base] ?? base;
}

export function bucketFor(kind: MediaKind, destination: UploadDestination = 'offer'): string {
  return `${env.SUPABASE_STORAGE_BUCKET}${UPLOAD_LIMITS[destination][kind].bucketSuffix}`;
}

/** Images always; the rest as `MEDIA_UPLOAD_KINDS` says. */
export function enabledKinds(): MediaKind[] {
  return ['image', ...env.MEDIA_UPLOAD_KINDS];
}

export function isKindEnabled(kind: MediaKind): boolean {
  return enabledKinds().includes(kind);
}

/** What `GET /media/limits` serves. */
export function mediaLimitsView(): MediaLimits {
  const view = (destination: UploadDestination) =>
    Object.fromEntries(
      MEDIA_KINDS.map((kind) => {
        const limit = UPLOAD_LIMITS[destination][kind];
        const item: KindLimitView = {
          enabled: isKindEnabled(kind),
          maxBytes: limit.maxBytes,
          maxPickedBytes: limit.maxPickedBytes,
          maxDurationSeconds: limit.maxDurationSeconds,
          mimeTypes: [...limit.mimeTypes],
          perTarget: limit.perTarget,
          transport: limit.transport,
        };
        return [kind, item];
      }),
    ) as Record<MediaKind, KindLimitView>;
  return { quotaBytes: QUOTA_BYTES, destinations: { offer: view('offer') } };
}
```

---

## Appendix D: `backend/src/modules/media/media.sniff.ts`

```ts
/**
 * File signatures (ADR 0046): the first bytes of a stored object must match its
 * stored type, so a file renamed or relabelled before upload is refused when it
 * is attached.
 */
const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

function at(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return (
    bytes.length >= offset + expected.length && expected.every((value, index) => bytes[offset + index] === value)
  );
}

export function matchesSignature(mimeType: string, bytes: Uint8Array): boolean {
  switch (mimeType) {
    case 'image/webp':
      return at(bytes, 0, ascii('RIFF')) && at(bytes, 8, ascii('WEBP'));
    case 'image/jpeg':
      return at(bytes, 0, [0xff, 0xd8, 0xff]);
    case 'audio/mpeg':
      return at(bytes, 0, ascii('ID3')) || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
    case 'audio/aac':
      return at(bytes, 0, [0xff, 0xf1]) || at(bytes, 0, [0xff, 0xf9]);
    case 'audio/mp4':
    case 'video/mp4':
      return at(bytes, 4, ascii('ftyp'));
    case 'audio/ogg':
      return at(bytes, 0, ascii('OggS'));
    case 'video/webm':
      return at(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'application/pdf':
      return at(bytes, 0, ascii('%PDF-'));
    default:
      return false;
  }
}
```

---

## Appendix E: the probe script (`<scratch>/probe/probe-tus.mjs`)

```js
// Bilikha issue #34, step 0: prove Supabase's resumable upload on STAGING.
// Run from this folder: node probe-tus.mjs
// It reads backend/.env, refuses anything but the staging project, works in a
// throwaway private bucket "tus-probe", and deletes that bucket at the end.
import { readFileSync } from 'node:fs';
import { Upload } from 'tus-js-client';

const STAGING_REF = 'ufkgaablxgrmqmqjpzbl';
const PRODUCTION_REF = 'zbymjbcbapvmgupkrfer';
const BUCKET = 'tus-probe';
const CHUNK = 6 * 1024 * 1024;

const env = Object.fromEntries(
  readFileSync('C:/client_projects/Bilikha/backend/.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);
const base = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!base || !key) throw new Error('Set the STAGING SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
if (base.includes(PRODUCTION_REF) || !base.includes(STAGING_REF)) {
  throw new Error('Refusing: SUPABASE_URL is not the staging project');
}
const ref = new URL(base).hostname.split('.')[0];
const auth = { Authorization: `Bearer ${key}`, apikey: key };
const out = {};

async function call(method, path, body) {
  const response = await fetch(`${base}/storage/v1${path}`, {
    method,
    headers: { ...auth, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, text: await response.text() };
}

async function configureBucket(limit) {
  const settings = { public: false, file_size_limit: limit, allowed_mime_types: ['audio/mpeg'] };
  const created = await call('POST', '/bucket', { id: BUCKET, name: BUCKET, ...settings });
  return created.status === 200 ? created : call('PUT', `/bucket/${BUCKET}`, settings);
}

async function signedToken(objectKey) {
  const reply = await call('POST', `/object/upload/sign/${BUCKET}/${objectKey}`);
  if (reply.status !== 200) throw new Error(`sign ${objectKey}: ${reply.status} ${reply.text}`);
  return JSON.parse(reply.text).token;
}

function bytes(count) {
  const buffer = Buffer.alloc(count);
  buffer.write('ID3', 0, 'latin1');
  for (let i = 3; i < count; i += 1) buffer[i] = i % 251;
  return buffer;
}

function tus(endpoint, token, objectKey, data, { stopAfterFirstChunk = false, uploadUrl } = {}) {
  return new Promise((resolve) => {
    const result = { ok: false, error: null, firstAccepted: null, firstProgress: null, url: null };
    const upload = new Upload(data, {
      endpoint,
      uploadUrl,
      headers: { 'x-signature': token },
      metadata: { bucketName: BUCKET, objectName: objectKey, contentType: 'audio/mpeg', cacheControl: '3600' },
      chunkSize: CHUNK,
      retryDelays: [],
      onProgress(sent) {
        if (result.firstProgress === null) result.firstProgress = sent;
      },
      onChunkComplete(_size, accepted) {
        if (result.firstAccepted === null) result.firstAccepted = accepted;
        if (stopAfterFirstChunk) {
          result.url = upload.url;
          void upload.abort();
          resolve({ ...result, stopped: true });
        }
      },
      onError(error) {
        result.error = String(error?.message ?? error).slice(0, 300);
        resolve(result);
      },
      onSuccess() {
        result.ok = true;
        result.url = upload.url;
        resolve(result);
      },
    });
    upload.start();
  });
}

try {
  out.bucketCreated = (await configureBucket(1_000_000)).status;

  // 1. Which endpoint accepts a signed upload token.
  const candidates = [
    `${base}/storage/v1/upload/resumable/sign`,
    `https://${ref}.storage.supabase.co/storage/v1/upload/resumable/sign`,
    `${base}/storage/v1/upload/resumable`,
    `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`,
  ];
  out.tus = { endpoint: null, objectKey: null, tried: [] };
  for (const endpoint of candidates) {
    const objectKey = `probe/small-${out.tus.tried.length}.mp3`;
    const result = await tus(endpoint, await signedToken(objectKey), objectKey, bytes(500_000));
    out.tus.tried.push({ endpoint, ok: result.ok, error: result.error });
    if (result.ok) {
      out.tus.endpoint = endpoint;
      out.tus.objectKey = objectKey;
      break;
    }
  }
  if (!out.tus.endpoint) throw new Error('No TUS endpoint accepted a signed upload token');

  // 2. Does the listing report the real size and type?
  const listed = await call('POST', `/object/list/${BUCKET}`, { prefix: 'probe/', limit: 100, offset: 0 });
  const entry = JSON.parse(listed.text).find((object) => `probe/${object.name}` === out.tus.objectKey);
  out.listed = { size: entry?.metadata?.size ?? null, mimetype: entry?.metadata?.mimetype ?? null, expectedSize: 500_000 };

  // 3. Over the bucket's limit: refused, and when?
  {
    const objectKey = 'probe/over.mp3';
    const result = await tus(out.tus.endpoint, await signedToken(objectKey), objectKey, bytes(2_000_000));
    out.overLimit = {
      refused: !result.ok,
      refusedAt: result.ok ? null : result.firstAccepted === null ? 'creation' : 'upload',
      error: result.error,
    };
  }

  // 4. An interrupted upload resumes from where it stopped.
  await configureBucket(50_000_000);
  {
    const objectKey = 'probe/resume.mp3';
    const token = await signedToken(objectKey);
    const data = bytes(20_000_000);
    const first = await tus(out.tus.endpoint, token, objectKey, data, { stopAfterFirstChunk: true });
    const second = await tus(out.tus.endpoint, token, objectKey, data, { uploadUrl: first.url });
    out.resume = {
      stoppedAfter: first.firstAccepted,
      resumedFromOffset: second.firstProgress,
      completed: second.ok,
      error: second.error,
    };
  }

  // 5. Reading the first bytes with a range.
  out.range = { readPath: null, tried: [] };
  for (const path of [`/object/authenticated/${BUCKET}/${out.tus.objectKey}`, `/object/${BUCKET}/${out.tus.objectKey}`]) {
    const response = await fetch(`${base}/storage/v1${path}`, { headers: { ...auth, Range: 'bytes=0-63' } });
    const body = new Uint8Array(await response.arrayBuffer());
    out.range.tried.push({ path, status: response.status, bytes: body.length });
    if ((response.status === 200 || response.status === 206) && body[0] === 0x49) {
      out.range.readPath = path.replace(`${BUCKET}/${out.tus.objectKey}`, '{bucket}/{key}');
      break;
    }
  }

  // 6. Is a 300 MB bucket limit allowed on this plan?
  {
    const reply = await call('PUT', `/bucket/${BUCKET}`, {
      public: false,
      file_size_limit: 300_000_000,
      allowed_mime_types: ['audio/mpeg'],
    });
    out.bigBucket = { allowed: reply.status === 200, status: reply.status, text: reply.text.slice(0, 200) };
  }
} catch (error) {
  out.fatal = String(error?.message ?? error);
} finally {
  let deleted = { status: 0, text: '' };
  for (let attempt = 0; attempt < 5 && deleted.status !== 200; attempt += 1) {
    await call('POST', `/bucket/${BUCKET}/empty`);
    await new Promise((done) => setTimeout(done, 2000));
    deleted = await call('DELETE', `/bucket/${BUCKET}`);
  }
  out.cleanedUp = deleted.status === 200;
  if (!out.cleanedUp) out.cleanupError = `${deleted.status} ${deleted.text.slice(0, 200)}`;
  console.log(JSON.stringify(out, null, 2));
}
```

What each field means, and what step 6.3 needs:

| Field | Needed |
|---|---|
| `tus.endpoint` | A URL. `null` means stop and ask |
| `listed.size` / `listed.mimetype` | `500000` / `audio/mpeg` |
| `overLimit.refused` | `true`. `refusedAt` is only recorded |
| `resume.resumedFromOffset` | At least `6291456`, with `resume.completed: true` |
| `range.readPath` | A path such as `/object/authenticated/{bucket}/{key}`. `null` means stop and ask |
| `bigBucket.allowed` | Either value; it decides `--max-file-size` in step 1.10 |
| `cleanedUp` | `true`. If `false`, run the script again, which retries the clean-up, and tell the human if it stays `false` |
| `fatal` | Absent. If present, stop and ask |

---

## Appendix F: the pull request descriptions

Fill in every `‹…›`. Delete nothing else. Pull requests 3 to 5 need screenshots,
which the human uploads.

### F.1 Pull request 1

```markdown
## What and why

Offers will carry audio, video and PDF (#34), and messages will carry files
(#66). Both need the same machinery, so it is built once, first, as decided on
2026-10-10:
- a limits table keyed by destination and kind, served to the browser;
- a bucket per kind, configured by a script;
- reservations against a quota;
- upload tickets that sign a PUT for images and a resumable TUS upload for
  everything else;
- a verification of the stored object (size, type and file signature) before
  anything is recorded;
- the browser library that checks, probes, uploads with progress and cancel,
  and resumes.

No screen changes yet. The new kinds stay off until `MEDIA_UPLOAD_KINDS` is set.
The pipeline's first user is pull request 2.

Plan / issue: docs/plans/0057-upload-pipeline-and-offer-media.md · Part of #34

## Acceptance criteria

- [x] `GET /api/v1/media/limits` serves every limit publicly, with images enabled and the rest following `MEDIA_UPLOAD_KINDS`
- [x] `POST /api/v1/media/uploads` refuses a disabled kind, a disallowed type, an oversized or overlong file, a full offer, a full quota and the 31st ticket in an hour, each with its own code and the limit in `details`
- [x] Reservations count toward the per-offer limit and the quota, and expired ones are cleared and their files discarded
- [x] `verifyReservation` refuses a missing object, a size or type different from the declaration, and a wrong file signature, and deletes the reservation and files when it does
- [x] The TUS endpoint, resume and range read were proven on staging before building (results in plan 0057)
- [x] `media:buckets` configures one bucket per kind and checks them; `media:prune` covers every bucket and expired reservations, never the ID bucket
- [x] The browser library loads `tus-js-client` only when an upload starts

## What changed

- **Database:** `backend/drizzle/‹0039_…›.sql`, additive. New enums `media_kind` and `upload_destination`, a new table `media_uploads`, and five nullable or defaulted columns on `offer_images` (`kind`, `mime_type`, `size_bytes`, `duration_seconds`, `title`).
- **API:** four new media routes, and a lower upload rate limit.
  - New: `GET /media/limits` (public), `GET /media/usage`, `POST /media/uploads` and `DELETE /media/uploads/:id`.
  - `uploadLimiter` is 30 an hour instead of 40.
  - The legacy `POST /media/upload-url` and `POST /offers/:id/images` are unchanged.
- **UI:** none. `frontend/src/features/media/` gains a library with no screen using it yet; pull request 3 uses it.
- **Config:** `MEDIA_UPLOAD_KINDS`, optional and empty by default. It is in `.env.example`, `env.ts` and `environment.md`. It is not needed on either Render service until rollout.

## How to verify

1. `npm run db:up`, then `npm --prefix backend run db:migrate`. A second `npm --prefix backend run db:generate` has nothing to generate.
2. `cd backend && npx vitest run src/modules/media src/lib/storage.test.ts src/config --maxWorkers=1`: ‹N› tests pass.
3. `cd frontend && npx vitest run src/features/media`: ‹N› tests pass.
4. `npm run dev:api`, then `curl localhost:4000/api/v1/media/limits`: image is enabled, audio, video and document are not.
5. `npm --prefix frontend run build && npm run check:bundle`: initial JS ‹N› kB (main: ‹N› kB), and a separate `tus` chunk.

## Rollout

- [x] No migration — or the migration is safe on live data (additive; nothing the running code still reads is renamed or dropped; new required columns have a default or a backfill)
- [x] No new environment variable — or it is in `.env.example`, `env.ts` and `environment.md`, and listed above for both Render services
- [x] No one-off script — or it is named above, with when to run it

**Staging's buckets** were configured by `media:buckets` ‹with / without› `--max-file-size 50000000` (the free plan's per-file ceiling). Production's are set at rollout (plan 0057, Phase 6).

## Known gaps and risks

- **Nothing uses the pipeline yet.** Pull request 2 attaches uploads to offers, and pull request 3 adds the editor.
- **The rate limit drops to 30 an hour** for avatars, logos and ID photos too, as ADR 0046 decided.
- **Uploads stay unchecked until they are attached.** An upload that is never attached sits in a public bucket until its reservation expires (24 h). Its URL is never shown.
- **ADR 0046 stays Proposed** until reyxdz accepts it.

## Checklist

- [x] One feature; no unrelated refactors or reformatting
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run docs:check` pass locally
- [x] New behaviour has tests, including the unhappy paths; a bug fix has a test that fails without it
- [x] No secrets, `.env`, `tmp/` files, or lockfile changes unless dependencies changed
- [x] Docs updated where the change makes them wrong (`api.md`, `data-model.md`, plan boxes, an ADR for an expensive-to-reverse choice)
- [x] I read my own diff end to end and ran the feature locally
```

### F.2 Pull request 2

```markdown
## What and why

An offer can now hold audio, video and PDF items beside its images, in the data
and the API.
- **Readers:** every image reader reads images only, and the offer page and the
  owner's list carry the other media.
- **Attaching:** `POST /offers/:id/media` attaches an upload the pipeline has
  verified, under ADR 0058's states. On a published offer it waits beside the
  public version.
- **Deleting:** files are deleted from their own bucket.
- **Review:** the admin review's version, approve and reject cover every kind,
  so an added video cannot be approved unseen, and a rejected one is discarded
  from its own bucket.
- **Images:** the per-offer limit is now 10.

No screen changes. The kinds stay off.

Plan / issue: docs/plans/0057-upload-pipeline-and-offer-media.md · Part of #34

## Acceptance criteria

- [x] Every public and owner image reader excludes audio, video and PDF rows
- [x] The offer page carries live media and hides `pending_add` from the public; the owner sees every item with its state
- [x] Attaching to an unpublished offer adds a live item, to a published one a `pending_add` item, and to a rejected offer sends it back to review
- [x] Attaching refuses another user's reservation, a reservation for a different offer, and an offer that filled up meanwhile
- [x] Removing a media item from a published offer waits as `pending_remove`, and deleting an offer deletes each file from its own bucket
- [x] The review version changes when media is added; approving makes it live, rejecting discards it from its bucket
- [x] The legacy image route allows 10 images and refuses the 11th

## What changed

- **Database:** `backend/drizzle/‹0040_…›.sql`. `offer_images.thumb_key` drops `NOT NULL`, with the check `offer_images_image_has_thumb`.
- **API:** one new route, and media on the offer reads.
  - New: `POST /offers/:id/media`.
  - `media` is added to the offer detail and to `GET /offers/mine`; both are optional.
  - The images limit is 10.
- **UI:** none. `frontend/src/features/offers/api.ts` gains the optional `media` type.
- **Config:** none

## How to verify

1. `npm --prefix backend run db:migrate`.
2. `cd backend && npx vitest run src/modules/offers src/modules/admin --maxWorkers=1`: ‹N› tests pass.
3. The full backend suite: ‹N› tests pass.

## Rollout

- [x] No migration — or the migration is safe on live data (additive; nothing the running code still reads is renamed or dropped; new required columns have a default or a backfill)
- [x] No new environment variable — or it is in `.env.example`, `env.ts` and `environment.md`, and listed above for both Render services
- [x] No one-off script — or it is named above, with when to run it

## Known gaps and risks

- **The admin review card still previews images only.** Media previews come in pull request 5. Nothing can attach media until the switch is on, after pull request 5.
- **The terms of use still say four images.** Pull request 5 corrects them. Do not release between this pull request and pull request 5 without that in mind.
- **Storage deletes are now best-effort** (`discardObject`) for offer files, so a storage outage no longer fails a delete after the row is gone. `media:prune` catches any file left behind.

## Checklist

- [x] One feature; no unrelated refactors or reformatting
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run docs:check` pass locally
- [x] New behaviour has tests, including the unhappy paths; a bug fix has a test that fails without it
- [x] No secrets, `.env`, `tmp/` files, or lockfile changes unless dependencies changed
- [x] Docs updated where the change makes them wrong (`api.md`, `data-model.md`, plan boxes, an ADR for an expensive-to-reverse choice)
- [x] I read my own diff end to end and ran the feature locally
```

### F.3 Pull request 3

```markdown
## What and why

The offer editor can add audio, video and PDF beside images, using the pipeline
from pull requests 1 and 2.
- **Before upload:** the limits show before picking, and a file over a limit,
  of a refused type, or in a codec phones can't play is refused before a byte is
  sent.
- **During upload:** each upload shows its progress in MB and percent, can be
  cancelled, and resumes after a dropped connection. Leaving the page
  mid-upload warns first.
- **The rest:** images upload through the same checked path. The quota and a
  rights reminder show. With an old backend, the editor falls back to images
  only.

Plan / issue: docs/plans/0057-upload-pipeline-and-offer-media.md · Part of #34

## Acceptance criteria

- [x] Each kind uploads and survives a reload (tried against staging storage through the local API)
- [x] A `.mov`, a video over 5 minutes, and an oversized file are refused with no network request
- [x] Cancel removes the upload and its reservation
- [x] A 20 MB video on a throttled connection, cut off for 20 seconds, resumed rather than restarting
- [x] With the limits endpoint unavailable, the editor offers images only, at 4 per offer
- [x] New copy is in the offers catalogue section, with Filipino and Waray empty

## What changed

- **Database:** none
- **API:** none
- **UI:** `/account/offers`, in the edit dialog. A new `MediaUploader` replaces the image section; the images look the same. `OFFER_IMAGE_LIMIT` is removed from the frontend.
- **Config:** none

## How to verify

1. `npm run db:up`. With staging's storage keys in `backend/.env`, run `MEDIA_UPLOAD_KINDS=audio,video,document npm run dev:api`, then `npm run dev:web`.
2. As a published creative, open an offer at `/account/offers`. Add an image, an MP3, a short MP4 and a PDF, then reload.
3. Pick a `.mov` file. The refusal appears, and the Network panel shows no request.
4. `cd frontend && npx vitest run`: ‹N› tests pass.

## States checked

- [x] Empty, loading and error states
- [x] Very long text and missing optional fields
- [x] Signed out, signed in, and without permission
- [x] Creative mode and client mode, where the screen differs — n/a: the offer editor is creative-only
- [x] Admin, where it applies — n/a: not an admin screen
- [x] Phone width (375px) with the bottom navigation
- [x] Light and dark themes

## Screenshots

‹The human uploads: the editor with items and an upload in progress, 375px light and dark, 1280px light.›

## Rollout

- [x] No migration — or the migration is safe on live data (additive; nothing the running code still reads is renamed or dropped; new required columns have a default or a backfill)
- [x] No new environment variable — or it is in `.env.example`, `env.ts` and `environment.md`, and listed above for both Render services
- [x] No one-off script — or it is named above, with when to run it

## Known gaps and risks

- **The switch is still off** on staging and production. Only images can be added there until rollout.
- **Video was tried only up to ‹N› MB** on staging's ‹free / Pro› plan.

## Checklist

- [x] One feature; no unrelated refactors or reformatting
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run docs:check` pass locally
- [x] New behaviour has tests, including the unhappy paths; a bug fix has a test that fails without it
- [x] No secrets, `.env`, `tmp/` files, or lockfile changes unless dependencies changed
- [x] Docs updated where the change makes them wrong (`api.md`, `data-model.md`, plan boxes, an ADR for an expensive-to-reverse choice)
- [x] I read my own diff end to end and ran the feature locally
```

### F.4 Pull request 4

Copy the **whole** F.3 block into `<scratch>/pr4.md`. Keep every heading, every Rollout and Checklist line, and the States checked lines with their `n/a` notes. Then rewrite only the parts below, and run `npm run check:pr` on it as section 11 says.
- **What and why:** players for audio and video and links for PDFs on the offer
  page (Listen, Watch, Read), with nothing downloading until tapped; media
  badges on offer cards; and a video poster as the cover of an offer with no
  image.
- **What changed** (keep text on each `**Layer:**` line itself, or `pr-audit` fails):
  - **Database:** none.
  - **API:** `mediaBadge` on offer cards, and `mediaBadge` and `poster` on the
    profile's offers, all optional.
  - **UI:** `/offers/:id`, offer cards on `/directory` and the profile page.
  - **Config:** none.
- **Acceptance** must include:
  - the source test that every `<audio>` and `<video>` has `preload="none"` and
    nothing autoplays;
  - on a throttled phone profile, the offer page downloads only the poster
    before play;
  - initial JS ‹N› kB against `main`'s ‹N› kB.

### F.5 Pull request 5

Copy the **whole** F.3 block into `<scratch>/pr5.md`. Keep every heading, every Rollout and Checklist line, and the States checked lines with their `n/a` notes. Then rewrite only the parts below, and run `npm run check:pr` on it as section 11 says.
- **What and why:** the admin review card shows added and removed audio, video
  and PDF with players and labels, so a change is judged on what it adds. The
  terms of use correct the limits (ten images, five audio, two videos, three
  PDFs), cover review of everything added to an offer, and gain the rights
  line, with the legal date and consent version moved.
- **What changed:**
  - **Database:** none.
  - **API:** the admin queue's items carry `kind`, an optional thumb, size and
    length.
  - **UI:** `/admin/offers` review cards, and `/terms`.
  - **Config:** none.
- **Plan / issue:** `docs/plans/0057-upload-pipeline-and-offer-media.md · Part of #34`.
- **Known gaps:** the rollout in plan 0057 Phase 6 is reyxdz's.
  `CONSENT_VERSION` moved, so new registrations record the new terms, while
  existing accounts keep their recorded version.

---

## Appendix G: the rollout (reyxdz's, not the agent's)

Do these after pull request 5 is merged, in order. Each one names the exact
place to click.

1. **Supabase Pro.** Supabase dashboard → organisation **Bilikha** → **Billing**
   → change the plan to **Pro**. This covers both projects, since they share the
   organisation.
   - First decide whether staging moves too, or goes back to a free
     organisation. This is #34's open billing question.
2. **The upload size limit, on both projects:**
   - Supabase dashboard → project **bilikha-staging** → **Storage** →
     **Settings** → **Upload file size limit** → `350 MB` → **Save**.
   - Repeat for **bilikha-production**.
3. **Buckets on staging, at full size.** With staging's key in `backend/.env`:
   ```
   npm --prefix backend run media:buckets
   npm --prefix backend run media:buckets -- --check
   ```
   The second command exits 0.
4. **Buckets on production.** Put **production's** key and URL in a local
   `backend/.env`, run the same two commands, then **remove production's key**
   from `backend/.env`.
5. **Switch staging on.** Render dashboard → workspace **My Workspace** →
   service **bilikha** → **Environment** → **Add Environment Variable** →
   `MEDIA_UPLOAD_KINDS` = `audio,video,document` → **Save, rebuild and deploy**.
   Then, on bilikha-staging.vercel.app:
   - upload one of each kind;
   - play each one on an Android phone **and an iPhone**. If a format does not
     play on the iPhone, decide whether to drop it or show a note;
   - approve one in **Admin › Offers**.
6. **Release.** Release `main` to production by
   `docs/guides/release-to-production.md`, with production's switch still
   empty.
7. **Switch production on.** Render dashboard → workspace **Bilikha** → service
   **bilikha-production** → **Environment** → `MEDIA_UPLOAD_KINDS` =
   `audio,video,document` → **Save, rebuild and deploy**. Upload and play one of
   each kind on bilikha.vercel.app.
8. **Records.**
   - Set ADR 0046's status to `Accepted (reyxdz, <date>)`.
   - Tick plan 0057's Phase 6 and its Acceptance, and set its status to
     `Complete`, in both the plan and `docs/plans/README.md`.
   - Close #34.
