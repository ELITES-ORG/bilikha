# 0055. A cover photo on the creative profile

- **Status:** Ready
- **Owner:** emanuel
- **Related:** [ADR 0021](../decisions/0021-image-storage-and-upload-path.md) ·
  [ADR 0016](../decisions/0016-edits-never-unpublish.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md) ·
  [plan 0042](./0042-the-creative-profile-page.md) ·
  [plan 0053](./0053-id-verification-for-new-accounts.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #36](https://github.com/ELITES-ORG/bilikha/issues/36)

## Goal

A creative can upload one cover image from `/account/profile`, replace it and
remove it. It fills the band at the top of `/creatives/:slug`: a phone
downloads a 768px-wide WebP, tablet and desktop a 1920px-wide one. The cover is
live as soon as it is set and reviewed afterwards in the admin media queue,
where an administrator can remove it. A profile without a cover, or whose cover
was removed, shows the navy band it shows today.

## Scope

**In scope**
- Two nullable key columns and a review timestamp on `creative_profiles`.
- `kind: "cover"` on the upload ticket, `PUT` and `DELETE /api/v1/media/cover`.
- A stored-size check (2 MB per file) on confirm.
- `cover` on the public profile detail and on the owner's own profile.
- Covers in the admin media queue, and in the orphan-cleanup script.
- The uploader in the profile editor and the image in the profile band.
- A short ADR recording covers as a third image kind.

**Out of scope** — and where it is handled instead
- Covers on directory cards, offer pages or in messages (issue #36).
- The cover as the profile's `og:image`: issue #18's follow-up, noted below.
- A crop tool or focal point: listed under Follow-ups.
- A storage-level 2 MB limit. See Decided 3.

## Decided in this plan

Where this plan departs from the issue's wording, and why. Each is open to
challenge in the plan's pull request.

1. **Two key columns, not one.** The issue names `cover_key`. There are two
   stored sizes, and offers already store both keys explicitly
   (`offer_images.object_key` / `thumb_key`) rather than deriving one from the
   other, so this adds `cover_small_key` beside it.
2. **Another profile's key is `403`, not `400`.** The issue asks for "`400`
   otherwise, same rule as `assertOwnOfferKey`", but that function throws
   `403`. Following the function keeps one rule. A malformed key, for example
   one with `..`, is still `400` from `assertSafeObjectKey`.
3. **The 2 MB limit is enforced by the API only.** Every kind shares one media
   bucket. Lowering its limit to 2 MB would cap offer images too, and per-type
   buckets arrive with #34 ([plan 0045](./0045-audio-video-and-pdf-uploads.md),
   still Draft). Confirm checks the stored size and deletes an oversized pair.
   When #34 lands, covers move to its image bucket and limit.
4. **`<picture>` with a media query, not `srcset` with `sizes`.** Width
   descriptors let the browser weigh device pixel ratio. A 375px phone at 3×
   wants 1125 pixels and would fetch the 1920px file, which fails the issue's
   own check. A `<source media>` is binding, so a phone fetches only 768px.
5. **A cover does not flag the profile as edited.** The issue says to follow the
   avatar rule. But `setAvatar` *does* call `markPublishedProfileEdited`, which
   puts the profile in the Edited queue. The issue's intent is that a cover is
   reviewed once, in the media queue. So covers never touch
   `edited_since_review_at`, and a test asserts it.
6. **`cover` is on the detail response only.** `PublicProfile` is also the
   directory card, which must not grow a field. It goes on
   `PublicProfileDetail` and on `OwnProfile`, defined once as `ProfileCover`.
7. **A short ADR, not a note in 0021.** ADR 0021 calls its 1600/400 sizes "a
   commitment". Covers add two more fixed sizes, fitted to width rather than the
   long edge. That is a new commitment and gets its own record.

## Rules for whoever executes this

1. **Phase 1 waits for [#81](https://github.com/ELITES-ORG/bilikha/pull/81)**
   (plan 0053, Phase 1). It adds migration `0035` and makes `listObjects`
   report each object's size, which the 2 MB check reads. Branch Phase 1 from
   `origin/main` *after* #81 merges. Generate the migration then. Never
   renumber one by hand.
2. **Each phase is one pull request into `main`,** from a fresh branch off
   `origin/main` ([ADR 0052](../decisions/0052-pull-requests-merge-by-squash-only.md)),
   with the template filled in and `pr-audit` passing. Phase 3 has no pull
   request.
3. **The orphan script change ships in the same pull request as the columns.**
   The script lists the whole bucket and deletes anything no row references.
   Without the change, every cover would be deleted 24 hours after upload.
4. **Additive only.** New columns are nullable. New contract fields the
   frontend reads are optional on the client type, and the UI copes with them
   missing: the frontend can deploy before the backend (ADR 0040).
5. **Route tests never stub the global `fetch`.** They mock
   `backend/src/lib/storage.js` with `vi.mock`, as plan 0053 does.
6. **Backend relative imports end in `.js`.** UI uses tokens only
   ([`frontend/DESIGN.md`](../../frontend/DESIGN.md)).
7. **No commit or pull request carries AI attribution** ([`CLAUDE.md`](../../CLAUDE.md)).
8. **Before each pull request,** from the repository root: `npm run typecheck`,
   `npm run lint`, `npm run docs:check`, `npm test`. For Phase 2, also
   `npm --prefix frontend run build && npm run check:bundle`.

## Prerequisites

- [x] #81 merged into `main` (2026-10-11, `cd52e83`). `listObjects` reports
      `size`.
- [ ] Database running and current:
      `npm run db:up && npm --prefix backend run db:migrate`, with nothing
      pending.
- [ ] Local storage configured: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
      set in `backend/.env` ([local setup](../getting-started/local-setup.md)).

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Data, API and moderation | 0 / 10 | Not started |
| 2. The uploader and the band | 0 / 6 | Not started |
| 3. Verify on staging | 0 / 3 | Not started |

---

## Phase 1 — Data, API and moderation

Branch `feat/cover-photo-api`, off `origin/main` after #81. When this phase
merges, the API accepts covers but no screen offers an upload. Administrators
can already see and remove covers in the queue.

### Step 1.1 — Add the columns

- [ ] **Action.** In `backend/src/db/schema/profiles.ts`, add to
      `creativeProfiles` after `editedSinceReviewAt`:

      ```ts
      // The profile band image (issue #36), two widths of one upload under
      // covers/<profileId>/. Live when set, reviewed afterwards like an
      // avatar; cleared by the owner or by an admin takedown. ADR 0058.
      coverKey: text('cover_key'),
      coverSmallKey: text('cover_small_key'),
      coverReviewedAt: timestamp('cover_reviewed_at', { withTimezone: true }),
      ```

- [ ] **Action.** `npm --prefix backend run db:generate`. Read the new file it
      writes under `backend/drizzle/` (`0037_*.sql` if nothing else has
      merged since this plan was written; `0036` is #78's).
- [ ] **Verify.** It contains exactly three `ALTER TABLE "creative_profiles"
      ADD COLUMN` statements, all nullable, with no default, no `DROP` and no
      backfill. `npm --prefix backend run db:migrate` then exits 0.

### Step 1.2 — Add the key helper

- [ ] **Action.** In `backend/src/lib/storage.ts`, below `offerKey`:

      ```ts
      export const coverKey = (profileId: string) =>
        `covers/${profileId}/${randomUUID()}`; // caller appends .webp / -768.webp
      ```

- [ ] **Verify.** `npm --prefix backend run typecheck` exits 0.

### Step 1.3 — Define the shapes once

- [ ] **Action.** In `backend/src/contracts/profiles.ts`, add `ProfileCover`.
      Change `PublicProfileDetail` to carry it:

      ```ts
      /** A creative's cover (issue #36): `url` is 1920px wide, `smallUrl` 768px. */
      export interface ProfileCover {
        url: string;
        smallUrl: string;
      }

      export type PublicProfileDetail = PublicProfile & {
        offers: ProfileOffer[];
        cover: ProfileCover | null;
      };
      ```

- [ ] **Action.** In `backend/src/contracts/me.ts`, import `ProfileCover` from
      `./profiles.js` and add `cover: ProfileCover | null;` to `OwnProfile`.
- [ ] **Action.** In `backend/src/contracts/admin.ts`, widen `AdminMediaRow.kind`
      to `'avatar' | 'offer' | 'cover'`, and update its doc comment.
- [ ] **Verify.** `npm run typecheck` fails only where the new fields are not
      yet produced: `profiles.service.ts`, `me.service.ts`, and the admin media
      page's kind maps. Those are Steps 1.5, 1.6 and 1.8.

### Step 1.4 — Write the media route tests first

- [ ] **Action.** Create `backend/src/modules/media/media.test.ts`, the first
      route test for this module. Mock `../../lib/storage.js`:
      - `createSignedUpload` returns `{ uploadUrl: 'https://storage.test/' + key, objectKey: key }`.
      - `deleteObject` resolves.
      - `listObjects` returns sizes that each test sets.

      Use `makeUser`, `makeCreative` and `suspend` from `src/test/factories.ts`.
      Cases:
      1. `POST /media/upload-url {kind:"cover"}` as a creative → 200, `kind: "cover"`, `full.objectKey` matching `^covers/<profileId>/[0-9a-f-]{36}\.webp$`, and `small.objectKey` the same base with `-768.webp`.
      2. The same request from an account with no creative profile → 403.
      3. `PUT /media/cover` with a fresh pair, both 300 KB in `listObjects` → 200. The row has both keys and `cover_reviewed_at` null; `edited_since_review_at` is unchanged on a published profile (Decided 5).
      4. `PUT` again with a new pair → `deleteObject` called with both old keys, and the row holds the new pair.
      5. `PUT` with keys under another profile's `covers/<otherId>/` → 403, and the row is unchanged.
      6. `PUT` where `smallKey` is not `objectKey`'s own `-768.webp` → 400.
      7. `PUT` with `covers/<ownId>/../../avatars/x/y.webp` → 400.
      8. `PUT` where `listObjects` reports the large file at 2 MB + 1 byte → 400 `COVER_TOO_LARGE`. Both objects deleted, and the row unchanged.
      9. `PUT` where `listObjects` does not list one of the pair → 400 `UPLOAD_INCOMPLETE`.
      10. `DELETE /media/cover` → 200. Both keys null, both objects deleted. Calling it again → 200, no deletes.
      11. A suspended creative → 401 on all three endpoints (ADR 0028).
      12. `POST /media/abandon` with own `covers/` key → 200. With another profile's `covers/` key → 403.
- [ ] **Verify.** `npm --prefix backend test -- media` runs 12 tests. The
      cover cases fail, and nothing else does.

### Step 1.5 — Implement the cover endpoints

- [ ] **Action.** In `backend/src/modules/media/media.service.ts`:
      - Widen `uploadUrlBodySchema.kind` to `z.enum(['avatar', 'offer', 'cover'])`.
      - Change the `requireOwnCreativeProfile` message to
        `'A creative profile is required to upload this image'`.
      - Add `setCoverBodySchema = z.object({ objectKey: z.string().min(1).max(512), smallKey: z.string().min(1).max(512) })`.
      - Add `MAX_COVER_BYTES = 2 * 1024 * 1024` and `assertOwnCoverKey(profileId, key)`,
        shaped exactly like `assertOwnOfferKey` with the prefix `covers/<profileId>/`
        and the message `'That image does not belong to your profile'`.
      - In `issueUploadUrl`, before the offer branch: for `kind === 'cover'`,
        call `requireOwnCreativeProfile`, set `base = coverKey(profile.id)`, sign
        `${base}.webp` and `${base}-768.webp`, and return
        `{ kind: 'cover', full: {…}, small: {…} }`.
      - `setCover(userId, { objectKey, smallKey })`:
        1. Find the profile with `requireOwnCreativeProfile`.
        2. Run `assertOwnCoverKey` on both keys.
        3. Require `smallKey === objectKey.replace(/\.webp$/, '-768.webp')`
           and `objectKey.endsWith('.webp')`. Otherwise
           `AppError.badRequest('Those two images are not one cover')`.
        4. `listObjects(\`covers/${profile.id}/\`)`. If either key is missing,
           throw `new AppError(400, 'UPLOAD_INCOMPLETE', 'The upload did not finish. Try again.')`.
        5. If either size is null or above `MAX_COVER_BYTES`, delete both
           objects, then throw `new AppError(400, 'COVER_TOO_LARGE', 'That cover is over 2 MB after resizing. Try a different photo.')`.
        6. Read the current `coverKey` and `coverSmallKey`. Update the row:
           both keys, `coverReviewedAt: null`, `updatedAt: new Date()`. **Do not**
           call `markPublishedProfileEdited`.
        7. Delete the previous pair if it differs. Return `{ objectKey, smallKey }`.
      - `clearCover(userId)`: read the current pair, then null all three
        columns and set `updatedAt`. Delete the pair if it existed. Return
        `{ ok: true }`.
      - In `abandonObject`, before the offer fallback: if the key starts with
        `covers/`, run `requireOwnCreativeProfile`, then `assertOwnCoverKey`,
        then `deleteObject`, and return.
- [ ] **Action.** In `backend/src/modules/media/media.routes.ts`, add
      `PUT /cover` and `DELETE /cover`, shaped exactly like the avatar pair.
      Uploads stay rate-limited by `uploadLimiter` on `/upload-url`.
- [ ] **Verify.** `npm --prefix backend test -- media`: 12 passed.

### Step 1.6 — Return the cover

- [ ] **Action.** In `backend/src/modules/profiles/profiles.service.ts`,
      `getPublishedBySlug`: select `coverKey` and `coverSmallKey`, and return
      `cover: row.coverKey && row.coverSmallKey && isStorageConfigured() ? { url: publicUrl(row.coverKey), smallUrl: publicUrl(row.coverSmallKey) } : null`.
      Leave `listPublished` untouched (Decided 6).
- [ ] **Action.** Make the same addition in
      `backend/src/modules/me/me.service.ts`, `getOwnProfile`, and in any
      other function that builds an `OwnProfile`. Typecheck names them.
- [ ] **Action.** Extend the existing profile tests
      (`grep -rl "creatives/" backend/src/modules/profiles/*.test.ts`):
      - a profile with a cover returns both URLs;
      - one without returns `cover: null`;
      - the directory list rows have no `cover` key.
- [ ] **Verify.** `npm --prefix backend test -- profiles me`: all pass.

### Step 1.7 — Covers in the admin queue

- [ ] **Action.** In `backend/src/modules/admin/admin.service.ts`,
      `listUnreviewedMedia`: inside the `isStorageConfigured()` block, add cover
      rows from `creativeProfiles` joined to `users`, where `cover_key` is not
      null and `cover_reviewed_at` is null. Each row is
      `{ id: profile.id, kind: 'cover', createdAt: profile.updatedAt, url: publicUrl(coverKey), thumbUrl: publicUrl(coverSmallKey), caption: null, ownerName, profileSlug, profileId, _flagged: false }`,
      merged into the same sort.
- [ ] **Action.** In `reviewMedia`, widen `kind`, and route `'cover'` to a new
      `reviewCoverMedia`:
      - approve stamps `coverReviewedAt`;
      - remove, in one transaction, nulls the three columns and inserts a
        `media_removed` moderation action with reason
        `'Cover removed by admin'`, then deletes both objects after the commit,
        as avatars do;
      - a profile without a cover → `AppError.notFound('No such cover.')`.
- [ ] **Action.** In `backend/src/modules/admin/admin.routes.ts`, widen the
      `/media/:kind/:id/review` enum to `['avatar', 'offer', 'cover']`.
- [ ] **Action.** Add tests to the existing admin media tests
      (`grep -rl "admin/media" backend/src/modules/admin/*.test.ts`):
      - an unreviewed cover is listed with its profile;
      - approve removes it from the queue;
      - remove clears the columns, writes the audit row and deletes both
        objects, and the public profile then returns `cover: null`.
- [ ] **Verify.** `npm --prefix backend test -- admin`: all pass.

### Step 1.8 — The admin page knows the new kind

- [ ] **Action.** In `frontend/src/pages/admin/AdminMediaPage.tsx` and
      `frontend/src/pages/admin/admin-media-logic.ts`, add `cover` wherever a
      map or filter is keyed by `MediaKind`:
      - the label `Cover`;
      - a `Covers` tab with its count;
      - the counts.

      Render a cover row like an avatar row, using `thumbUrl`, at a landscape
      aspect (`aspect-3/1`, `object-cover`). Extend
      `admin-media-logic.test.ts` with a `cover` row for filtering and counts.
- [ ] **Verify.** `npm --prefix frontend test -- admin-media`: all pass.
      `npm run typecheck` exits 0.

### Step 1.9 — Keep covers out of the orphan sweep

- [ ] **Action.** In `backend/src/scripts/prune-orphan-media.ts`, also select
      `coverKey` and `coverSmallKey` from `creativeProfiles` and add both to
      `referenced`. Add `creative_profiles.cover_key / cover_small_key` to the
      header comment.
- [ ] **Verify.** Locally, set a cover through the API, then back-date its
      objects past the age check: run `npm --prefix backend run media:prune`
      with `AGE_MS` temporarily set to `0`. The output lists no `covers/` key
      that the row holds. Revert `AGE_MS`. `git diff` shows only the
      `referenced` additions and the comment.

### Step 1.10 — Docs for the API and data

- [ ] **Action.** `docs/reference/api.md`:
      - in **Media**, add `kind: "cover"` and its ticket shape, then
        `PUT /api/v1/media/cover` and `DELETE /api/v1/media/cover` with every
        status code from Step 1.4;
      - in **Admin media**, add `cover` to the kinds;
      - on the public profile detail, add `cover`.
- [ ] **Action.** `docs/reference/data-model.md`: add the three columns under
      `creative_profiles`.
- [ ] **Action.** Write `docs/decisions/0058-a-cover-is-a-third-image-kind.md`
      from `_template.md`. Take the next free number if 0058 is taken by then.
      - **Context:** the band was navy for want of data (plan 0042).
      - **Decision:** two width-fitted WebP sizes, 1920 and 768; a 2 MB API
        limit; live-then-reviewed; no profile-edit flag; `<picture>` with a
        media query.
      - **Alternatives:** srcset/sizes; one stored size; reviewing before
        showing; flagging the profile as edited.
      - **Consequences:** about 400 KB more storage per creative with a cover;
        the 1920/768 widths are fixed as 0021's are; the CDN takedown caveat
        of 0021 applies to covers too.

      Add a row to `docs/decisions/README.md`. Add one line to ADR 0021's
      header notes pointing to 0058.
- [ ] **Verify.** `npm run docs:check` exits 0. Open the pull request
      `Let the API store a cover photo per creative profile (plan 0055, phase 1)`.

---

## Phase 2 — The uploader and the band

Branch `feat/cover-photo-ui`, off `origin/main` after Phase 1 merges.

### Step 2.1 — Size the cover in the browser

- [ ] **Action.** In `frontend/src/lib/image.ts`:
      - Export `COVER_WIDTH = 1920`, `COVER_SMALL_WIDTH = 768`,
        `COVER_MIN_WIDTH = 1200` and `COVER_MIN_HEIGHT = 400`.
      - Move the size check, the decode and the HEIC error out of `resizeImage`
        into a private `decode(file)`. `resizeImage` behaves exactly as before.
      - Add `resizeCover(file): Promise<{ full: Blob; small: Blob }>`:
        1. Run `decode(file)` once.
        2. If the bitmap is under 1200 × 400, throw
           `'That photo is too small for a cover — use one at least 1200 × 400 pixels'`.
        3. Fit the width to 1920 and to 768, never upscaling, with the same
           WebP-then-JPEG encode.
        4. Close the bitmap.
- [ ] **Action.** Create `frontend/src/lib/image.test.ts`, or extend it if it
      exists. Stub `createImageBitmap` and the canvas:
      - a 1000 × 800 source rejects with the too-small message;
      - a 4000 × 3000 source produces 1920 × 1440 and 768 × 576;
      - a 1300 × 500 source produces 1300 × 500, not upscaled, and 768 × 295;
      - a 21 MB file rejects before `createImageBitmap` is called.
- [ ] **Verify.** `npm --prefix frontend test -- image`: all pass.

### Step 2.2 — The client calls

- [ ] **Action.** In `frontend/src/features/media/api.ts`:
      - Add `CoverUploadTicket = { kind: 'cover'; full: {…}; small: {…} }` to
        `UploadTicket`.
      - Widen `requestUploadUrl`'s `kind` parameter.
      - Add `confirmCover(objectKey, smallKey)` (`PUT /media/cover`) and
        `removeCover()` (`DELETE /media/cover`), shaped like `confirmAvatar`
        and `removeAvatar`.
- [ ] **Action.** In `frontend/src/features/me/types.ts`, keep `cover`
      optional on the client `OwnProfile` (`cover?: ProfileCover | null`). Do
      the same in `frontend/src/features/profiles/types.ts` for the detail
      type, with the deployment-skew comment the file already uses.
- [ ] **Verify.** `npm --prefix frontend run typecheck` exits 0.

### Step 2.3 — The uploader

- [ ] **Action.** Create `frontend/src/features/media/CoverUploader.tsx`,
      modelled on `AvatarUploader.tsx`. Props: `cover: ProfileCover | null | undefined`.
      - **Preview.** A band in the profile's shape (`h-24 sm:h-32`, `rounded-lg`,
        `bg-primary`) showing `smallUrl`, or the navy band when there is none.
      - **Hint, always visible before upload.**
        `A wide landscape photo works best. Only the middle strip shows — the top and bottom are cropped on most screens. At least 1200 × 400 pixels.`
      - **Buttons.** `Add cover` / `Replace cover` and `Remove`, disabled while
        busy.
      - **Upload flow.** `resizeCover` → `requestUploadUrl('cover')` → upload
        `full` → upload `small` → `confirmCover`.
      - **On failure.** If `small` fails after `full` succeeded, call
        `abandonUpload(full.objectKey)`. If `confirmCover` fails, abandon both.
        Ignore abandon errors, since the orphan sweep is the backstop.
      - **Errors.** Show every error as a plain inline message in
        `<p role="alert" className="mt-2 text-sm text-danger-700">`, not only a
        toast, so the band never shows broken. Use `describe()` as the avatar
        uploader does: `COVER_TOO_LARGE` and `UPLOAD_INCOMPLETE` messages come
        from the API unchanged.
      - **On success.** Invalidate `meKeys.profile()` and `profileKeys.all`.
      - **File input.** The same `accept` list as the avatar input.
- [ ] **Action.** Render it in `frontend/src/features/me/ProfileEditor.tsx`,
      directly below the `AvatarUploader` (line ~168), passing
      `profile.cover`.
- [ ] **Verify.** `npm --prefix frontend run typecheck && npm --prefix frontend run lint`
      exit 0.

### Step 2.4 — The image in the band

- [ ] **Action.** In `frontend/src/pages/CreativeProfilePage.tsx`, inside the
      band (line ~180), before the `CornerBlob`s:

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

      - Check that `40rem` matches the `sm` breakpoint in
        `frontend/src/styles/theme.css`, and use that value if it differs.
      - Render the two `CornerBlob`s only when there is no cover.
      - Keep `bg-primary` on the band, so it shows while the image loads.
      - Rewrite the comment above the band to say a cover fills it when set
        (issue #36), and that it falls back to navy.
      - Leave out `loading="lazy"`. The band is above the fold, and lazy
        loading would delay it.
      - `BackPill` and `ShareButton` already sit on a solid `bg-surface` with a
        shadow, so they stay legible on any photo. Do not change them.
- [ ] **Verify.** `npm --prefix frontend run build && npm run check:bundle`
      exit 0.

### Step 2.5 — Owner link from the profile page

- [ ] **Action.** Only if the profile page already shows the owner an edit
      link (`grep -n "account/profile" frontend/src/pages/CreativeProfilePage.tsx`),
      leave it as the way to the cover. Otherwise add nothing: the issue says
      "may".
- [ ] **Verify.** Nothing to run. Record which case applied in the pull
      request.

### Step 2.6 — Check it in a browser

- [ ] **Verify**, locally with storage configured, each item ticked in the pull
      request:
      - Upload, replace and remove a cover; each survives a reload.
      - After replacing, `npm --prefix backend run media:prune` shows no
        `covers/` objects except, after 24 hours, ones abandoned on purpose.
      - At 375px, DevTools → Network → Img shows only the `-768.webp`. At
        1280px, only the `.webp` without the suffix. Disable the cache for both.
      - A 1000 × 800 photo is refused with the too-small message before any
        request.
      - A profile with no cover looks exactly as before, with the blobs present.
      - Phone width in light and dark: Back and Share are legible on a bright
        photo and on a dark one.

      Open the pull request
      `Let creatives add a cover photo to their profile (plan 0055, phase 2)`,
      with `Closes #36`.

---

## Phase 3 — Verify on staging

No pull request. Run after Phase 2 deploys to staging.

### Step 3.1 — The round trip

- [ ] **Verify.** On staging, a creative account uploads, replaces and removes
      a cover, and each survives a reload. In the Supabase dashboard, the
      `covers/<profileId>/` folder holds exactly the current pair.

### Step 3.2 — Moderation

- [ ] **Verify.** An admin sees the cover in `/admin/media` under Covers and
      removes it. The profile shows the navy band. The profile is not in the
      Edited queue.

### Step 3.3 — Facebook's in-app browser

- [ ] **Verify.** Open a profile with a cover from a Messenger link on an
      Android phone. The 768px image shows, and Back and Share work
      ([constraints §4](../explanation/constraints.md)).

---

## Acceptance

The plan is complete when every box below is checked.

- [ ] Every step above is ticked.
- [ ] Issue #36's Verify list is satisfied: round trip, per-width download,
      the unhappy paths tested in Step 1.4, admin removal, no change without a
      cover, phone width in light and dark.
- [ ] Plan status set to Complete, with the README row updated.

## Follow-ups

- **The cover as `og:image`** for a profile that has one (#18's endpoint,
  [ADR 0056](../decisions/0056-link-previews-come-from-a-crawler-only-html-endpoint.md)).
  Use the 1920px size: Facebook wants at least 1200px wide.
- **A crop tool or focal point**, if creatives find the centred crop wrong.
- **Move covers to #34's image bucket** and its limit when plan 0045 lands
  (Decided 3).
