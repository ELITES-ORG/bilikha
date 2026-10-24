# 0061. A cover photo on the creative profile

- **Status:** Complete
- **Owner:** emanuel
- **Related:** [ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md) ·
  [ADR 0059](../decisions/0059-the-admin-area-is-organised-by-subject.md) ·
  [ADR 0021](../decisions/0021-image-storage-and-upload-path.md) ·
  [ADR 0030](../decisions/0030-notifications.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md) ·
  [plan 0042](./0042-the-creative-profile-page.md) ·
  [plan 0055](./0055-approve-before-public.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #36](https://github.com/ELITES-ORG/bilikha/issues/36)

## Goal

A creative can add one cover image from `/account/profile`, replace it and
remove it. Once an administrator approves it, it fills the band at the top of
`/creatives/:slug`: a phone downloads a 768px-wide WebP, tablet and desktop a
1920px-wide one. Until then the band stays as it was, and the creative sees
the new cover marked as waiting. A rejected cover comes back to its owner with
the reason. A profile without an approved cover shows the navy band it shows
today.

## History

First written on 2026-10-11 as plan 0055 on `feat/cover-photo-plan`, and
parked until ID verification (#51) finished. That branch was never opened as a
pull request. Meanwhile `main` took the number 0055 for
[approve before public](./0055-approve-before-public.md), and two things
changed underneath the plan:

- **[ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md):
  nothing new is public until approved.** The old plan made a cover live at
  once and reviewed it afterwards. A cover now waits in a pending slot, as a
  profile photo and a logo do.
- **[ADR 0059](../decisions/0059-the-admin-area-is-organised-by-subject.md):
  the admin area is organised by subject.** The old plan put covers in a
  single media queue that no longer exists.

This plan replaces that draft. Its migration, ADR and plan numbers are taken
from `main` as of `d8192d7`.

## Scope

**In scope**
- An approved pair and a pending pair of keys on `creative_profiles`, and a
  rejection reason.
- `PUT` and `DELETE /api/v1/media/cover`, and `kind: "cover"` on the upload
  ticket, beside the avatar's.
- A stored-size and file-signature check on confirm (2 MB per file).
- `cover` on the public profile detail; `cover`, `pendingCover` and
  `coverRejectionReason` on the owner's own profile.
- Approve and Reject (with a reason) under **Creatives → Covers**, a
  `cover_rejected` notification, and the count in `GET /admin/summary`.
- Covers kept by the orphan sweep.
- The uploader in the profile editor and the image in the profile band.
- ADR 0061, recording covers as an image kind.

**Out of scope**, and where it is handled instead
- Covers on directory cards, offer pages or in messages (issue #36).
- The cover as the profile's `og:image`: see Follow-ups.
- A crop tool or focal point: see Follow-ups.
- Moving profile photos, logos and covers onto the upload-ticket pipeline of
  [plan 0057](./0057-upload-pipeline-and-offer-media.md): see Follow-ups.

## Decided in this plan

Where this plan departs from the issue's wording or from the first draft, and
why. Each is open to challenge in this plan's pull request.

1. **A cover waits for approval (ADR 0058).** The issue predates it and says
   to review a cover "like an avatar". Today that means a pending slot: the
   approved cover stays public while a new one waits, seen only by its owner,
   and Reject needs a reason the owner is told. The first draft's "live, then
   reviewed" is dropped.
2. **Covers are decided under Creatives, in a Covers tab.** ADR 0059 puts every
   decision about a subject in that subject's section. A cover belongs to a
   creative profile, not to a person, so it does not go under People with
   profile photos. It mirrors Organisations' Logos tab.
3. **A `cover_rejected` notification.** ADR 0058 tells an owner when a photo or
   logo is not approved, and a cover is the same case. It adds a fifth type to
   ADR 0058's four, which ADR 0061 records as an amendment to ADR 0030. An
   approved cover needs no message: it simply appears, as an approved photo
   does.
4. **The avatar's route, not plan 0057's ticket pipeline.** The pipeline is
   built around a target that holds many files (an offer, a message), with
   reservations and a quota. A cover is one slot on a profile, like a profile
   photo or a logo, and both of those still use their own simple route. Moving
   all three onto the pipeline together is a follow-up, not this plan.
5. **The confirm checks what was stored.** The avatar route trusts the
   browser. A cover is larger and public, so `PUT /media/cover` reads both
   objects back with `storedObject`, refuses either over 2 MB, and checks the
   file signature with `matchesSignature` from the pipeline, deleting the pair
   on failure. 2 MB is the same limit offer images have
   (`UPLOAD_LIMITS.offer.image.maxBytes`).
6. **Four key columns, not one.** The issue names `cover_key`. There are two
   stored sizes, and offers store both keys rather than deriving one from the
   other, so there is a `cover_small_key` beside it, and a pending pair beside
   those. There is no `cover_reviewed_at`: ADR 0058 kept the avatar's and the
   logo's only because they already existed, and they decide nothing.
7. **Another profile's key is `403`, not `400`.** The issue asks for "`400`
   otherwise, same rule as `assertOwnOfferKey`", but that function throws
   `403`. Following the function keeps one rule. A malformed key, for example
   one with `..`, is still `400` from `assertSafeObjectKey`.
8. **`<picture>` with a media query, not `srcset` with `sizes`.** Width
   descriptors let the browser weigh device pixel ratio: a 375px phone at 3×
   wants 1125 pixels and would fetch the 1920px file, which fails the issue's
   own check. A `<source media>` is binding, so a phone fetches only 768px.
9. **`cover` is on the detail response only.** `PublicProfile` is also the
   directory card, which must not grow a field. The cover goes on
   `PublicProfileDetail`, and on `OwnProfile` with the pending pair, defined
   once as `ProfileCover`.
10. **A cover does not flag the profile as edited.** ADR 0058 already took new
    photos off the profile's Edited tab. A cover has its own review, and a test
    asserts `edited_since_review_at` is untouched.

## Rules for whoever executes this

1. **Each phase is one pull request into `main`,** from a fresh branch off
   `origin/main` ([ADR 0052](../decisions/0052-pull-requests-merge-by-squash-only.md)),
   with the template filled in and `pr-audit` passing. Phase 3 has no pull
   request.
2. **Generate the migration after rebasing; never renumber one by hand.** The
   next free number on `main` is `0043`, if nothing else merges first.
3. **The orphan sweep change ships in the same pull request as the columns.**
   `media:prune` deletes any object no row references. Without the change,
   every cover would be deleted 24 hours after upload.
4. **Additive only.** New columns are nullable. New contract fields the
   frontend reads are optional on the client type, and the UI copes with them
   missing: the frontend can deploy before the backend (ADR 0040).
5. **Follow the profile photo wherever a choice is not written here.**
   `setAvatar` / `clearAvatar` in `media.service.ts`, `reviewAvatar` in
   `content-review.service.ts` and `AvatarUploader.tsx` are the pattern.
6. **Route tests never stub the global `fetch`.** They mock
   `backend/src/lib/storage.js` with `vi.mock`.
7. **Backend relative imports end in `.js`.** UI uses tokens only
   ([`frontend/DESIGN.md`](../../frontend/DESIGN.md)). New copy goes in `en.ts`
   with empty `fil` and `war` values
   ([ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md)).
8. **No commit or pull request carries AI attribution** ([`CLAUDE.md`](../../CLAUDE.md)).
9. **Before each pull request,** from the repository root: `npm run typecheck`,
   `npm run lint`, `npm run docs:check`, and the tests for the files changed.
   For Phase 2, also `npm --prefix frontend run build && npm run check:bundle`.

## Prerequisites

- [x] Issue #51 (ID verification) finished, so the two don't touch
      `storage.ts`, the admin area and migrations at once. Its build phases are
      all merged; its closing pull request is #111.
- [x] This plan reviewed and merged in #112 (approved by reyxdz, 2026-10-22).
      #112 left the status Draft; this phase sets it to In progress.
- [x] Database running and current:
      `npm run db:up && npm --prefix backend run db:migrate`, with nothing
      pending.
- [x] Local storage configured: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
      in `backend/.env` ([local setup](../getting-started/local-setup.md)).

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Data, API and review | 9 / 9 | Done |
| 2. The uploader and the band | 6 / 6 | Done |
| 3. Verify on staging | 3 / 3 | Done |

---

## Phase 1 — Data, API and review

Branch `feat/cover-photo-api`, off `origin/main`. When this phase merges, the
API accepts covers and administrators can decide them, but no screen offers an
upload yet.

### Step 1.1 — The columns and the notification type

- [x] **Action.** In `backend/src/db/schema/profiles.ts`, add to
      `creativeProfiles` after `editedSinceReviewAt`:

      ```ts
      // The profile band image (issue #36): two widths of one upload under
      // covers/<profileId>/. A new cover waits in the pending pair until an
      // administrator approves it (ADR 0058); the approved pair stays public
      // meanwhile. ADR 0061.
      coverKey: text('cover_key'),
      coverSmallKey: text('cover_small_key'),
      coverPendingKey: text('cover_pending_key'),
      coverPendingSmallKey: text('cover_pending_small_key'),
      coverRejectionReason: text('cover_rejection_reason'),
      ```

- [x] **Action.** In `backend/src/db/schema/notifications.ts`, add
      `'cover_rejected'` after `'logo_rejected'`, and name covers in the
      comment above them.
- [x] **Action.** `npm --prefix backend run db:generate`. Read the file it
      writes under `backend/drizzle/`.
- [x] **Verify.** It holds five `ADD COLUMN` statements on
      `creative_profiles`, all nullable, with no default, and one
      `ALTER TYPE "notification_type" ADD VALUE 'cover_rejected'`. Nothing is
      dropped or backfilled. `npm --prefix backend run db:migrate` exits 0, and
      a second `db:generate` has nothing to generate.

### Step 1.2 — The shapes, once

- [x] **Action.** In `backend/src/lib/storage.ts`, below `offerKey`:

      ```ts
      /** A cover's base key; the caller appends `.webp` and `-768.webp` (ADR 0061). */
      export const coverKey = (profileId: string) => `covers/${profileId}/${randomUUID()}`;
      ```

- [x] **Action.** In `backend/src/contracts/profiles.ts`:

      ```ts
      /** A creative's cover (issue #36): `url` is 1920px wide, `smallUrl` 768px. */
      export interface ProfileCover {
        url: string;
        smallUrl: string;
      }

      export type PublicProfileDetail = PublicProfile & {
        offers: ProfileOffer[];
        /** The approved cover only. */
        cover: ProfileCover | null;
      };
      ```

- [x] **Action.** In `backend/src/contracts/me.ts`, import `ProfileCover` and
      add to `OwnProfile`: `cover: ProfileCover | null`,
      `pendingCover: ProfileCover | null` and
      `coverRejectionReason: string | null`.
- [x] **Action.** Add `'cover'` to the admin queue's kind wherever `'logo'` is
      listed: `AdminMediaRow['kind']` in `backend/src/contracts/admin.ts`, the
      two `z.enum`s in `admin.routes.ts`, and the summary contract's creatives
      counts (`covers`).
- [x] **Verify.** `npm run typecheck` fails only where the new fields are not
      yet produced. Steps 1.4–1.6 fill them in.

### Step 1.3 — The route tests first

- [x] **Action.** Add a `covers` block to `backend/src/modules/media/media.test.ts`,
      with the storage mock that file already uses: `createSignedUpload`,
      `storedObject` (a size per key, set by each test), `readFirstBytes` (WebP
      bytes, or not), `deleteObject` and `discardObject`. Cases:
      1. `POST /media/upload-url {kind:"cover"}` as a creative → 200, `kind: "cover"`, `full.objectKey` matching `^covers/<profileId>/[0-9a-f-]{36}\.webp$`, `small.objectKey` the same base with `-768.webp`.
      2. The same from an account with no creative profile → 403.
      3. `PUT /media/cover` with a fresh pair, both 300 KB WebP → 200. The pending pair is set, the approved pair and `edited_since_review_at` untouched, and `cover_rejection_reason` cleared.
      4. `PUT` again with a new pair → the old pending pair is discarded; the approved pair is untouched.
      5. Keys under another profile's `covers/<otherId>/` → 403, row unchanged.
      6. `smallKey` that is not `objectKey`'s own `-768.webp` → 400.
      7. `covers/<ownId>/../../avatars/x/y.webp` → 400.
      8. The large file stored at 2 MB + 1 byte → 400 `COVER_TOO_LARGE`; both objects deleted, row unchanged.
      9. A stored file whose first bytes are not WebP or JPEG → 400 `COVER_NOT_AN_IMAGE`; both deleted.
      10. One of the pair not stored → 400 `UPLOAD_INCOMPLETE`.
      11. `DELETE /media/cover` with a pending pair → 200 `removed: "pending"`; the pending pair is gone and the approved one stays. Again with none pending → `removed: "approved"`, the approved pair gone. A third time → 200, nothing deleted.
      12. A suspended creative → 401 on all three (ADR 0028).
      13. `POST /media/abandon` with an own `covers/` key → 200; another profile's → 403.
- [x] **Verify.** `npm --prefix backend run test -- src/modules/media/media.test.ts`:
      the cover cases fail, and nothing else does.

### Step 1.4 — The cover endpoints

- [x] **Action.** In `backend/src/modules/media/media.service.ts`:
      - Widen `uploadUrlBodySchema.kind` to `['avatar', 'offer', 'cover']`. For
        `cover`: `requireOwnCreativeProfile`, `base = coverKey(profile.id)`,
        sign `${base}.webp` and `${base}-768.webp`, return
        `{ kind: 'cover', full, small }`.
      - `setCoverBodySchema = z.object({ objectKey, smallKey })`, each
        `z.string().min(1).max(512)`.
      - `MAX_COVER_BYTES = UPLOAD_LIMITS.offer.image.maxBytes` (2 MB), and
        `assertOwnCoverKey(profileId, key)` shaped like `assertOwnOfferKey`, with
        the prefix `covers/<profileId>/` and the message
        `'That image does not belong to your profile'`.
      - `setCover(userId, { objectKey, smallKey })`, in this order:
        1. `requireOwnCreativeProfile`; `assertOwnCoverKey` on both keys.
        2. `objectKey` ends in `.webp`, and `smallKey` is it with `-768.webp`;
           otherwise `AppError.badRequest('Those two images are not one cover')`.
        3. `storedObject` for each. A missing one →
           `new AppError(400, 'UPLOAD_INCOMPLETE', 'The upload did not finish. Try again.')`.
        4. A size that is null or over `MAX_COVER_BYTES` → delete both, then
           `new AppError(400, 'COVER_TOO_LARGE', 'That cover is over 2 MB after resizing. Try a different photo.')`.
        5. `readFirstBytes` of each, checked with `matchesSignature` against
           `image/webp` or `image/jpeg` (the resizer falls back to JPEG). A
           mismatch → delete both, then
           `new AppError(400, 'COVER_NOT_AN_IMAGE', "That file isn't a photo. Try another.")`.
        6. Write the pending pair and clear `coverRejectionReason`, as
           `setAvatar` does. **Do not** touch `editedSinceReviewAt`.
        7. Discard the previous pending pair if it differs.
      - `clearCover(userId)`, as `clearAvatar`: withdraw a pending pair if
        there is one, otherwise take down the approved pair. Discard the
        objects, and return `{ ok: true, removed: 'pending' | 'approved' }`.
      - In `abandonObject`, before the offer fallback: a `covers/` key is
        checked with `assertOwnCoverKey` and deleted.
- [x] **Action.** In `backend/src/modules/media/media.routes.ts`, add
      `PUT /cover` and `DELETE /cover`, shaped like the avatar pair. Uploads
      stay rate-limited by `uploadLimiter` on `/upload-url`.
- [x] **Verify.** The media tests pass.

### Step 1.5 — Return the cover

- [x] **Action.** In `backend/src/modules/profiles/profiles.service.ts`,
      `getPublishedBySlug` returns `cover` from the **approved** pair only:
      `{ url: publicUrl(coverKey), smallUrl: publicUrl(coverSmallKey) }` when
      both are set and storage is configured, otherwise `null`.
      `listPublished` is untouched (Decided 9).
- [x] **Action.** In `backend/src/modules/me/me.service.ts`, every function that
      builds an `OwnProfile` (typecheck names them) returns `cover`,
      `pendingCover` and `coverRejectionReason` the same way.
- [x] **Action.** Extend the profile and `me` tests:
      - an approved cover returns both URLs on the public detail;
      - a pending cover is **not** on the public detail, and is on the owner's
        `pendingCover`;
      - a profile without one returns `cover: null`;
      - the directory's list rows have no `cover` key.
- [x] **Verify.** Those test files pass.

### Step 1.6 — Approve and Reject

- [x] **Action.** In `backend/src/modules/admin/content-review.service.ts`:
      - The queue lists a cover for each profile with a pending pair, under
        `kind: 'cover'`: `url` and `thumbUrl` from the pending pair, the
        approved `smallUrl` (if any) as what it would replace, the owner's name
        and profile slug, and the pending key as its version token.
      - The counts gain `covers`, and `GET /admin/summary` reports them under
        `creatives`.
      - `reviewCover`, modelled on `reviewAvatar`:
        - Approve moves the pending pair to the approved pair, clears the
          reason, and discards the replaced approved pair after the commit.
        - Reject needs a reason. It clears the pending pair, stores the reason,
          discards the rejected pair after the commit, and notifies the owner
          with `cover_rejected`.
        - A version that no longer matches the pending key is refused, as for
          a photo.
        - No pending cover → `AppError.notFound('No cover is waiting for review.')`.
- [x] **Action.** In `backend/src/modules/notifications/notifications.service.ts`,
      add `cover_rejected` beside `logo_rejected`: the title
      `Your new cover photo was not approved`, its target the creative's own
      profile editor, and the reason read from the profile when the centre
      opens (ADR 0030).
- [x] **Action.** Tests in `content-review.test.ts` (and `summary.test.ts`):
      - a pending cover is listed under `kind=cover` and counted;
      - approve makes it the public cover, and the old approved pair is
        discarded;
      - reject keeps the old public cover, stores the reason, sends one
        `cover_rejected`, and discards the rejected pair;
      - a stale version is refused.
- [x] **Verify.** Those test files pass.

### Step 1.7 — Creatives → Covers in the admin area

- [x] **Action.** In `frontend/src/pages/admin/AdminCreativesPage.tsx`, add a
      **Covers** tab beside the existing ones, with its count from the summary.
      It shows `ContentReviewList` for `kind=cover`, as the Organisations page
      does for logos.
- [x] **Action.** In `frontend/src/pages/admin/content-review/ReviewCard.tsx`
      (and its logic file), render a cover at a landscape aspect
      (`aspect-3/1`, `object-cover`), with the approved cover beside it when
      there is one. Extend `review-list-logic.test.ts` and
      `admin-sections.test.ts` for the new kind and count.
- [x] **Verify.** Those frontend tests pass, and `npm run typecheck` exits 0.

### Step 1.8 — Keep covers out of the orphan sweep

- [x] **Action.** In `backend/src/scripts/prune-orphan-media.ts`, select the
      four cover keys from `creativeProfiles` and add each to the media
      bucket's references. Name them in the header comment.
- [x] **Verify.** Locally, set a cover through the API and run
      `npm --prefix backend run media:prune` with the age check temporarily at
      `0`. It lists no `covers/` key that a row holds. Revert the age check;
      `git diff` on the script shows only the references and the comment.

### Step 1.9 — Docs and ADR 0061

- [x] **Action.** `docs/reference/api.md`:
      - **Media:** `kind: "cover"` and its ticket shape; `PUT` and
        `DELETE /api/v1/media/cover`, with every status and code from Step 1.3;
      - **Admin:** `cover` in the queue's kinds and in the summary;
      - the public profile detail's `cover`, and the owner's three fields.
- [x] **Action.** `docs/reference/data-model.md`: the five columns under
      `creative_profiles`, and `cover_rejected` in the notification types.
- [x] **Action.** Write `docs/decisions/0061-a-cover-is-a-reviewed-profile-image.md`
      from `_template.md`, taking the next free number if 0061 is gone:
      - **Context:** the band is navy for want of data (plan 0042); issue #36.
      - **Decision:** two width-fitted WebP sizes, 1920 and 768, fixed as ADR
        0021's sizes are; a 2 MB limit checked on what was stored, with the
        file signature; a pending pair approved or rejected under Creatives
        (ADR 0058, 0059); a fifth rejection notification, amending ADR 0030;
        no Edited flag; `<picture>` with a media query.
      - **Alternatives:** `srcset` with `sizes`; one stored size; live, then
        reviewed (ADR 0008's model, superseded by 0058); the upload-ticket
        pipeline; covers under People.
      - **Consequences:** about 400 KB more storage per creative with a cover,
        and twice that while a replacement waits; ADR 0021's CDN takedown
        caveat applies to covers.

      Add its row to `docs/decisions/README.md`. Add an "Amended by 0061" line
      to ADR 0030's header.
- [x] **Verify.** `npm run docs:check` exits 0. Open the pull request
      `Let the API store and review a cover photo per creative profile (plan 0061, phase 1)`,
      with `Part of #36`.

**Built as** (2026-10-22, branch `feat/cover-photo-api`), where it differs
from the steps above:

- Migration `0043_pale_otto_octavius.sql`: five `ADD COLUMN`s and the
  `cover_rejected` enum value, which nothing in the migration uses.
- A failed check, a replaced pending pair and a decision delete files with
  `discardObject` (best-effort; `media:prune` is the backstop), as the photo
  does. `abandonObject` keeps `deleteObject` for covers, as for offers.
- `AdminSummary.creatives.covers` is optional on the contract, for deployment
  skew (ADR 0040); the Creatives badge and tab read it with `?? 0`.
- The reader tests are a new `backend/src/modules/profiles/cover.test.ts`:
  approved cover public, a waiting one never, the owner's three fields, and no
  cover on a directory card. Two route cases were added to Step 1.3's list: a
  file of exactly 2 MB, and the JPEG fallback, are accepted.
- `data-model.md` documents no notification types, so `cover_rejected` is
  recorded in `api.md` and ADR 0061 only.
- ADR 0021 gains a header note that covers add two fixed sizes, and the
  decisions index rows for 0021 and 0030 name 0061.
- Checked locally against real storage: upload, the owner sees it waiting and
  the public does not, approve makes both widths public, a replacement shows
  the current cover beside it, reject keeps the public cover, stores the reason
  and sends `cover_rejected`, the rejected files are gone. `media:prune` with
  the age check at 0 flagged no cover a row holds, and flagged the approved
  pair once its references were removed. The Covers tab and badge were checked
  at 375 and 1280px, light and dark: no sideways overflow or overlapping
  controls.

---

## Phase 2 — The uploader and the band

Branch `feat/cover-photo-ui`, off `origin/main` after Phase 1 merges.

### Step 2.1 — Size the cover in the browser

- [x] **Action.** In `frontend/src/lib/image.ts`:
      - Export `COVER_WIDTH = 1920`, `COVER_SMALL_WIDTH = 768`,
        `COVER_MIN_WIDTH = 1200` and `COVER_MIN_HEIGHT = 400`.
      - Move the size check, the decode and the HEIC error out of
        `resizeImage` into a private `decode(file)`. `resizeImage` behaves
        exactly as before.
      - Add `resizeCover(file): Promise<{ full: Blob; small: Blob }>`: decode
        once; refuse a bitmap under 1200 × 400 with
        `'That photo is too small for a cover — use one at least 1200 × 400 pixels'`;
        fit the width to 1920 and to 768, never upscaling, with the same
        WebP-then-JPEG encode; close the bitmap.
- [x] **Action.** Tests in `frontend/src/lib/image.test.ts` (create it, or
      extend it), stubbing `createImageBitmap` and the canvas:
      - 1000 × 800 rejects with the too-small message;
      - 4000 × 3000 gives 1920 × 1440 and 768 × 576;
      - 1300 × 500 gives 1300 × 500 (not upscaled) and 768 × 295;
      - a file over the pick limit rejects before `createImageBitmap` runs.
- [x] **Verify.** `npm --prefix frontend run test -- src/lib/image.test.ts` passes.

### Step 2.2 — The client calls and types

- [x] **Action.** In `frontend/src/features/media/api.ts`: a
      `CoverUploadTicket` in `UploadTicket`, `'cover'` in `requestUploadUrl`'s
      kind, and `confirmCover(objectKey, smallKey)` and `removeCover()`,
      shaped like `confirmAvatar` and `removeAvatar`.
- [x] **Action.** On the client, keep the contract fields required and add
      optional copies for deployment skew (ADR 0040). In
      `frontend/src/features/profiles/types.ts`, add
      `cover?: ProfileCover | null` beside the comment that file already
      uses. `frontend/src/features/me/types.ts` re-exports `OwnProfile` from
      `@contracts/me`, so replace that re-export with the contract type plus
      optional `cover`, `pendingCover` and `coverRejectionReason`, and copy
      the same comment. Do not mark the fields optional in
      `backend/src/contracts/me.ts`.
- [x] **Verify.** `npm --prefix frontend run typecheck` exits 0.

### Step 2.3 — The uploader

- [x] **Action.** Create `frontend/src/features/media/CoverUploader.tsx`,
      modelled on `AvatarUploader.tsx`. Props: `cover`, `pendingCover`,
      `rejectionReason`, each possibly `undefined`.
      - **Preview:** a band in the profile's shape
        (`relative h-32 overflow-hidden rounded-lg bg-primary sm:h-44 lg:h-56 short:h-24`),
        showing the pending cover's `smallUrl` if there is one,
        otherwise the approved one, otherwise navy.
      - **Waiting:** with a pending cover, the same "waiting for review" note
        the profile photo shows, and the button reads `Withdraw new cover`.
      - **Rejected:** the reason, in the same place and words the photo uses.
      - **Hint, shown before upload:**
        `A wide landscape photo works best. Only the middle strip shows — the top and bottom are cropped on most screens. At least 1200 × 400 pixels.`
      - **Buttons:** `Add cover` / `Replace cover`, and `Remove` (or
        `Withdraw new cover`), disabled while busy.
      - **Upload:** `resizeCover` → `requestUploadUrl('cover')` → upload `full`
        → upload `small` → `confirmCover`. If `small` fails, abandon `full`; if
        the confirm fails, abandon both. Abandon errors are ignored: the sweep
        is the backstop.
      - **Errors:** inline in `<p role="alert">` with the danger token, as the
        photo uploader does. The API's `COVER_TOO_LARGE`,
        `COVER_NOT_AN_IMAGE` and `UPLOAD_INCOMPLETE` messages are shown as
        sent.
      - **After success:** invalidate `meKeys.profile()` and `profileKeys.all`.
      - Every new string goes in `en.ts`, with empty `fil` and `war`.
- [x] **Action.** Render it in `frontend/src/features/me/ProfileEditor.tsx`
      directly below the `AvatarUploader`.
- [x] **Verify.** `npm --prefix frontend run typecheck && npm run lint` exit 0;
      `catalogs.test.ts` passes.

### Step 2.4 — The image in the band

- [x] **Action.** In `frontend/src/pages/CreativeProfilePage.tsx`, inside the
      band, before the `CornerBlob`s:

      ```tsx
      {data.cover && (
        <picture>
          <source media="(min-width: 40rem)" srcSet={data.cover.url} />
          <img
            src={data.cover.smallUrl}
            alt=""
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        </picture>
      )}
      ```

      - `40rem` is Tailwind's `sm`; `theme.css` does not override it. Check
        again before writing.
      - Render the two `CornerBlob`s only when there is no cover.
      - Keep `bg-primary` on the band, so it shows while the image loads.
      - Rewrite the comment above the band: an approved cover fills it (issue
        #36), and it falls back to navy.
      - No `loading="lazy"`: the band is above the fold.
      - Back and Share need no change. Since #110 they are white icons with a
        dark outline, made to read on any photo.
- [x] **Verify.** `npm --prefix frontend run build && npm run check:bundle`
      exit 0.

### Step 2.5 — The owner's way to the cover

- [x] **Action.** If the profile page already shows its owner an edit link
      (`grep -n "account/profile" frontend/src/pages/CreativeProfilePage.tsx`),
      that link is the way to the cover. Otherwise add nothing: the issue says
      "may".
- [x] **Verify.** Nothing to run. Say in the pull request which case applied.

### Step 2.6 — Check it in a browser

- [x] **Verify**, locally with storage configured, each ticked in the pull
      request:
      - Add a cover: the editor shows it waiting; the public profile still
        shows navy. Approve it under Creatives → Covers: the profile shows it.
      - Replace it: the old cover stays public while the new one waits. Reject
        the new one with a reason: the owner sees the reason, gets the
        notification, and the old cover is still public.
      - Withdraw a waiting cover, then remove the approved one. Each survives a
        reload.
      - At 375px, DevTools → Network → Img (cache disabled) shows only the
        `-768.webp`. At 1280px, only the file without the suffix.
      - A 1000 × 800 photo is refused with the too-small message before any
        request.
      - A profile with no cover looks exactly as before, blobs included.
      - Phone width, light and dark: Back and Share read on a bright cover and
        a dark one.

      Open the pull request
      `Let creatives add a cover photo to their profile (plan 0061, phase 2)`,
      with `Closes #36`.

**Built as** (2026-10-23, branch `feat/cover-photo-ui`), where it differs
from the steps above:

- **Copy stays in the component.** `ProfileEditor`, `AvatarUploader` and
  `CreativeProfilePage` write their English directly and none uses the
  catalogue, so `CoverUploader` does the same; no `en.ts` keys were added.
  Translating the account page is its own piece of work.
- **Errors use the toast,** as the photo uploader does (it has no inline
  alert). The band preview never shows a broken image: it shows the last good
  cover, or navy.
- **The photo's browse-only note is not repeated** under the cover: the
  cover's buttons are disabled the same way, and the note sits just above.
- **Tests check the sizing logic.** The frontend tests run in Node, so the
  width-fitting and the 1200 × 400 floor are a pure `coverSize()` in
  `lib/image.ts`, tested directly in `lib/image.test.ts`, with the 20 MB
  refusal tested through `resizeCover`. `resizeImage` keeps its behaviour: its
  decode and encode moved, unchanged, into private `decodeImage` and
  `encodeImage`, which `resizeCover` shares.
- **The owner's client type uses `Omit`** of the contract's three cover
  fields, then adds them as optional; an intersection would have kept them
  required.
- **Step 2.5:** the profile page already links its owner to
  `/account/profile`, so nothing was added.
- **The band's height follows its width** (asked for after the first browser
  check, where a desktop band of 1200 × 224 cut most of the photo). Instead of
  three fixed heights, `clamp(6rem, 3.7rem + 20cqw, 18.75rem)`, measured on the
  band's own container: about 126px at 375px, 179px at 640px, 251px at
  1024px, and 4:1 (about 300px) from 1280px up; a short screen keeps 96px.
  It applies to every profile, with a cover or not, so all profiles keep one
  shape. Defined once in `features/profiles/profile-band.ts` and used by the
  profile page, its loading skeleton and the uploader's preview. Organisation
  pages, and their skeleton, keep their band.
- **Checked in a browser** with the local API and storage: a 1000 × 800 photo
  is refused before any request; a waiting cover leaves the public band navy;
  after approval a 375px screen fetched only the `-768.webp` and a 1280px one
  only the full file; a replacement waits while the approved cover stays
  public; rejecting it shows the reason and sends the notification; withdraw
  and remove each survive a reload; with no cover the profile is as before.

---

## Phase 3 — Verify on staging

No code. Run after Phase 2 deploys to staging, and recorded by a docs-only pull
request, as plan 0053's staging check was (#111).

### Step 3.1 — The round trip

- [x] **Verify.** On staging, a creative uploads a cover, an administrator
      approves it, the creative replaces it and the replacement is rejected,
      then the creative removes it. In the Supabase dashboard, the
      `covers/<profileId>/` folder holds only the pairs a row points to. A
      read-only check of the public page fetched only the 768px file at 375px
      and only the 1920px file at 1280px.

### Step 3.2 — The admin side

- [x] **Verify.** Creatives shows the Covers count in the sidebar badge and the
      tab. A cover decision does not put the profile in the Edited tab.

### Step 3.3 — Facebook's in-app browser

- [x] **Verify.** Open a profile with a cover from a Messenger link on an
      Android phone. The 768px image shows, and Back and Share work
      ([constraints](../explanation/constraints.md)).

Done by emanuel on staging, 2026-10-24, in Chrome and Facebook's in-app
browser (from a Messenger link) on an Android phone, with an administrator on
a computer, against frontend build `349f6d3555be` (#122) with the API healthy.
Profile `mimay`: the cover waited, was approved, and its rejected replacement
came back with the reason and a notification while the approved cover stayed
public. In Supabase the folder held only the approved pair, and was empty
after removal, when the API returned `cover: null`. The Covers count showed in
the badge and the tab, and the profile stayed out of Edited. A 375px screen
fetched only `-768.webp` and a 1280px one only the full file.

---

## Acceptance

Ticked 2026-10-24. Phase 3 covers what a person sees on staging; the rest rests
on the tests named after each line.

- [x] Every step above is ticked.
- [x] Issue #36's Verify list is satisfied, read through ADR 0058: the round
      trip, the per-width download, the unhappy paths in Step 1.3, an
      administrator's decision, no change without a cover, phone width in
      light and dark. Read through ADR 0058, the issue's "an admin removes a
      cover from the media queue" is the Reject decision on a waiting cover;
      an approved cover is removed by its owner. Round trip: Step 3.1
      (`media.test.ts`, `content-review.test.ts`). Per-width download: the
      read-only check in Step 3.1 on staging (`image.test.ts` for the sizes).
      Unhappy paths: `media.test.ts` (Step 1.3's cases) and `image.test.ts`
      (the 1200 × 400 floor, 20 MB). The decision: `content-review.test.ts`,
      `summary.test.ts`. No change without a cover: `cover.test.ts`. Phone
      width, light and dark: checked locally in #120 and on staging in Step
      3.1's read-only check and Step 3.3.
- [x] A cover is never public before an administrator approves it, and a
      rejected one never replaces the approved one.
      (`cover.test.ts`, `content-review.test.ts`, `media.test.ts`.)
- [x] Plan status set to Complete, with the README row updated.

## Follow-ups

- **The cover as `og:image`** for a profile that has one
  ([ADR 0056](../decisions/0056-link-previews-come-from-a-crawler-only-html-endpoint.md)).
  Use the 1920px size: Facebook wants at least 1200px wide.
- **A crop tool or focal point**, if creatives find the centred crop wrong.
- **Profile photos, logos and covers on the upload-ticket pipeline** of plan
  0057, together, when its legacy image routes are retired.
