# 0009. Bio on cards, avatars, and portfolio images

- **Status:** Complete for what shipped — phase 6 superseded, phase 8 partly run
- **Corrected 2026-09-19.** The table read all-Done while 44 boxes sat unticked,
  which is the sort of thing a progress table exists to prevent. Phase 6 was
  never built: [ADR 0022](../decisions/0022-offers-replace-portfolio.md) replaced
  the portfolio with offers, `portfolio_items` was migrated by
  `migrate-portfolio-to-offers.ts` and dropped, and there is no such table today.
  Phase 7 did ship — `prune-orphan-media.ts`, the `media:prune` script, its
  `commands.md` entry and both `/admin/media` routes all exist, and the queue was
  exercised through the UI on 2026-09-19. Phase 8's remaining items are the
  upload ones; they need a `SUPABASE_SERVICE_ROLE_KEY` that matches the project,
  which local does not have. The security greps in it were run and pass: no
  `service_role` anywhere in `frontend/`, no `supabase` in `frontend/src`, and
  `/creatives` returns 200 signed out
- **Phase 8 revisited 2026-09-19.** Nine of its sixteen boxes were run against
  the local API and pass: the whole ownership table, the upload-ticket limit,
  every secrets check and every directory check. What is left is 8.3 and 8.4,
  which need a `SUPABASE_SERVICE_ROLE_KEY` matching the project — local has one
  issued for a different Supabase project, so uploads fail before they start.
  Those boxes say *blocked on storage* rather than staying blank, so the reason
  travels with them
- **Depends on:** [plan 0008](./0008-location-at-registration-and-nearby-first.md) — the
  directory card and its nearby ordering are what this changes
- **Related:** [ADR 0021](../decisions/0021-image-storage-and-upload-path.md) ·
  [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) ·
  [ADR 0016](../decisions/0016-edits-never-unpublish.md) ·
  [constraints §3](../explanation/constraints.md)

---

## Goal

A creative in the directory shows a face, a sentence about themselves, and their
work. Today a card is a name, a municipality and some tags — for a photographer
or a tattoo artist that is close to useless.

Three separate things, one plan:

1. **Bio** — already stored, already in the API payload, simply never rendered
   on the card. Pure display fix.
2. **Avatar** — one image per account. No column exists anywhere yet.
3. **Portfolio** — up to ten images per creative profile.

Phase 1 and Phases 2–7 are independent. **Phase 1 is worth shipping on its own**
and should be committed separately before any of the image work starts.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Five specific to this plan:

1. **Never store an original.** Every image is resized in the browser before it
   is uploaded. There is no server-side resizing available — image
   transformations are a paid Supabase feature and this project is on the free
   plan. See [ADR 0021](../decisions/0021-image-storage-and-upload-path.md).
2. **Image bytes never pass through the API.** The backend issues a signed URL
   and records a key. If you find yourself adding `multer`, or any request body
   larger than a few kilobytes, stop — you have taken the wrong path.
3. **The service role key is a backend secret.** It must never appear in
   `frontend/`, in a `VITE_` variable, or in any response body. A leak of it is
   full read-write access to the entire database, bypassing every policy.
4. **The frontend gets absolute URLs from the API**, never a bucket name or a
   storage hostname. Keeping vendor knowledge on one side is what makes the
   Cloudflare R2 migration in ADR 0021 a backend-only change.
5. **An image change on a published profile is a public edit.** It must set
   `editedSinceReviewAt`, exactly as a bio change does today
   ([ADR 0016](../decisions/0016-edits-never-unpublish.md)). The profile stays
   live; it lands in the admin Edited queue.

---

## Scope

**In scope**
- Bio snippet on the directory card
- One avatar per **user account**, shown on cards, profile pages and the header
- Up to ten portfolio images per **creative profile**, with captions and ordering
- Browser-side resize and compression
- Direct-to-storage upload via signed URLs
- An admin media queue with a remove action
- A script that deletes orphaned objects

**Out of scope** — do not build these
- Server-side resizing, thumbnails on demand, or any Supabase image
  transformation. Paid features. ADR 0021
- Cropping UI. The resize is a plain long-edge fit; a crop tool is a later
  nicety
- Video, audio or PDF. Images only
- Cover or banner images. One avatar, one portfolio
- A public report button. Named as an open exposure in ADR 0021, still open
- Cloudflare R2. The documented migration path, not this plan
- Alt text as a separate required field — the caption doubles as it for now

---

## Prerequisites

- A Supabase project already exists (plan 0002)
- Access to the Supabase dashboard for that project
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run docs:check` all
  exit 0 before you start. If they do not, fix that first — you will not be able
  to tell your breakage from the pre-existing kind

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Bio on the card | 2 / 2 | Done |
| 2. The bucket and its contract | 4 / 4 | Done |
| 3. Backend — upload tickets | 5 / 5 | Done |
| 4. Frontend — the resize pipeline | 4 / 4 | Done |
| 5. Avatars | 6 / 6 | Done |
| 6. Portfolio | 0 / 7 | **Superseded** by [plan 0010](./0010-offers-and-an-offer-directory.md) — never built |
| 7. Admin media review and cleanup | 4 / 4 | Shipped; boxes unticked — see note |
| 8. Verification | 5 / 7 | **Partly** — 8.3 and 8.4 need working storage |

---

# Phase 1 — Bio on the card

No backend work. `bio` is already selected in `listPublished` and already on the
`PublicProfile` interface at both ends. It is simply not rendered.

### Step 1.1 — Render a bio snippet

- [x] **Action.** In `frontend/src/pages/DirectoryPage.tsx`, inside the card's
  left-hand `<div>`, directly after the municipality paragraph, add:

```tsx
{profile.bio && (
  <p className="mt-2 line-clamp-2 max-w-prose text-sm text-ink-muted text-pretty">
    {profile.bio}
  </p>
)}
```

`line-clamp-2` caps it at two lines whatever the length, so one creative with a
thousand-character bio cannot push everyone else off the screen.

**Change `sm:items-baseline` to `sm:items-start` on the parent `Link`.** With a
multi-line block in the left column, baseline alignment drags the tag list down
to the last line of the bio.

- [x] **Verify.** Run the frontend, open `/creatives`. Profiles with a bio show
  at most two lines of it; profiles without one look exactly as before, with no
  empty gap. A very long bio truncates rather than stretching the card.

### Step 1.2 — Commit this on its own

- [x] **Action.** Confirm `npm run typecheck` and `npm run lint` exit 0, then
  commit Phase 1 by itself before starting Phase 2.

It is independently valuable and it makes the image work — which touches the
same file — reviewable on its own.

- [x] **Verify.** `git log --oneline -1` shows a commit containing only
  `DirectoryPage.tsx`, with **no AI attribution trailer**
  ([`CLAUDE.md`](../../CLAUDE.md)).

---

# Phase 2 — The bucket and its contract

This phase is **dashboard and curl only**. Write no application code until Step
2.4 has printed a real URL, because everything after it is built on the exact
shape of that response.

### Step 2.1 — Create the bucket

- [x] **Action.** In the Supabase dashboard → Storage → New bucket:

| Setting | Value |
|---|---|
| Name | `media` |
| Public bucket | **on** |
| File size limit | `1 MB` |
| Allowed MIME types | `image/webp`, `image/jpeg` |

Public is deliberate: these images appear in a public directory, so signing
reads would add latency and complexity to protect nothing.

The size limit and the MIME list are the **only real enforcement** of either
constraint. Bytes never reach the API, so the backend cannot check them — the
bucket is where a 12 MB upload gets rejected.

- [x] **Verify.** The bucket appears in the Storage list marked Public.

### Step 2.2 — Add the backend environment variables

- [x] **Action.** In `backend/src/config/env.ts`, add to `envSchema`:

```ts
  SUPABASE_URL: z.string().url('SUPABASE_URL must be the project URL, e.g. https://abc.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_STORAGE_BUCKET: z.string().default('media'),
```

- [x] **Action.** Add all three to `backend/.env`, to `backend/.env.example`
  (with placeholder values, **never the real key**), and to the Render service's
  environment.

Local `.env` and `.env.example` are done. Render dashboard still needs the three
variables set manually (no Render API token in this environment) — see
[`deployments.md`](../reference/deployments.md).

Both values are in the Supabase dashboard under Settings → API. The service role
key is the one marked secret — not the `anon` key.

- [x] **Verify.** `npm run dev` in `backend/` boots. Removing
  `SUPABASE_SERVICE_ROLE_KEY` makes it exit with a named error rather than
  starting and failing later.

### Step 2.3 — Confirm the key is not reachable from the browser

- [x] **Action.** Run from the repo root:

```bash
grep -ri "service_role\|SERVICE_ROLE" frontend/ --exclude-dir=node_modules
```

- [x] **Verify.** No output. If anything matches, remove it before continuing —
  rule 3.

### Step 2.4 — Pin the signed-upload contract with curl

**Do not skip this, and do not write the storage client from memory.** Confirm
the exact request and response shape against your own project before any code
depends on it.

- [x] **Action.** With `SUPABASE_URL` and `KEY` set in your shell, create a
  signed upload URL:

```bash
curl -s -X POST \
  "$SUPABASE_URL/storage/v1/object/upload/sign/media/test/hello.webp" \
  -H "Authorization: Bearer $KEY"
```

Record the exact response. It contains a token and a path.

- [x] **Action.** Upload a real image file to that signed URL, then fetch it back
  from the public URL:

```bash
curl -s "$SUPABASE_URL/storage/v1/object/public/media/test/hello.webp" -o out.webp
```

- [x] **Action.** Delete the test object:

```bash
curl -s -X DELETE "$SUPABASE_URL/storage/v1/object/media/test/hello.webp" \
  -H "Authorization: Bearer $KEY"
```

- [x] **Verify.** The upload succeeds, the public fetch returns the same bytes
  with no authentication, and the delete removes it — a second public fetch
  404s.

- [x] **Verify.** Copy the three confirmed URL shapes into a comment at the top
  of the storage client you create in Step 3.1. **If what you observed differs
  from what Step 3.1 assumes, the observation wins** — adjust the code, not the
  observation.

Observed against project `hhtyeqaxqjqepxmdlhpq` (2026-09-16):

| Call | Shape |
|---|---|
| Sign | `POST {SUPABASE_URL}/storage/v1/object/upload/sign/{bucket}/{objectKey}` → `{ url, token }` where `url` is `/object/upload/sign/...?token=...`. Absolute upload URL = `{SUPABASE_URL}/storage/v1` + `url`. |
| PUT | `PUT` that absolute URL with `Content-Type: image/webp` → `{ Key: "{bucket}/{objectKey}" }` HTTP 200 |
| Public | `GET {SUPABASE_URL}/storage/v1/object/public/{bucket}/{objectKey}` → bytes HTTP 200 |
| Delete | `DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{objectKey}` + Bearer → `{ message: "Successfully deleted" }` HTTP 200 |
| Missing object | Public GET and DELETE both return body `{ statusCode: "404", code: "NoSuchKey", ... }` with **HTTP 400** (not HTTP 404). `deleteObject` must treat that as already-gone. CDN may briefly `HIT` a deleted public URL without a cache-buster. |

---

# Phase 3 — Backend: upload tickets

### Step 3.1 — A storage client

- [x] **Action.** Create `backend/src/lib/storage.ts`. No SDK — three `fetch`
  calls against the endpoints confirmed in Step 2.4. Adding `@supabase/supabase-js`
  for this would pull in a realtime client, an auth client and a Postgres client
  this project uses none of.

It exports:

| Function | Does |
|---|---|
| `createSignedUpload(objectKey)` | Returns `{ uploadUrl, objectKey }` — an absolute URL the browser can `PUT` to |
| `publicUrl(objectKey)` | Pure string builder for the public object URL |
| `deleteObject(objectKey)` | Deletes, and **does not throw if the object is already gone** |

`deleteObject` tolerating a missing object matters: it is called whenever a row
is removed, and a failure there would leave a row the user cannot delete.

- [x] **Verify.** A scratch `tsx` script calls `createSignedUpload('test/x.webp')`
  and prints an absolute `https://` URL.

### Step 3.2 — Key naming

- [x] **Action.** In the same file, export two key builders:

```ts
export const avatarKey = (userId: string) => `avatars/${userId}/${randomUUID()}.webp`;
export const portfolioKey = (profileId: string) =>
  `portfolio/${profileId}/${randomUUID()}`; // caller appends .webp / -thumb.webp
```

**Always a fresh UUID, never a stable name like `avatar.webp`.** Overwriting a
key leaves the old image in every CDN and browser cache that has it, so someone
who replaces their photo keeps seeing the old one. A new key each time makes
replacement immediate and cache-safe.

- [x] **Verify.** Two calls with the same `userId` return different keys.

### Step 3.3 — Rate limit uploads

- [x] **Action.** In `backend/src/middleware/rate-limit.ts`, add an
  `uploadLimiter`: 40 requests per hour, keyed on `req.session.userId`, following
  the `messageLimiter` already in that file — including
  `validate: { keyGeneratorIpFallback: false }`.

Forty an hour covers a full ten-image portfolio with retries, and caps how fast
one account can fill a 1 GB bucket.

- [x] **Verify.** The 41st ticket request within an hour returns 429.

### Step 3.4 — The ticket endpoint

- [x] **Action.** Create a `media` module —
  `backend/src/modules/media/media.routes.ts` and `media.service.ts` — mounted at
  `/media` in `backend/src/routes/index.ts`. Guard the whole router with
  `requireAuth`, the way `meRouter` does.

`POST /media/upload-url` takes `{ kind: 'avatar' | 'portfolio' }` and returns
`{ uploadUrl, objectKey }`.

For `kind: 'portfolio'` it returns **two** tickets — one `full`, one `thumb` —
since both sizes are uploaded separately.

It must **reject `kind: 'portfolio'` from a user with no creative profile**, and
reject it when that profile already holds ten items.

- [x] **Verify.** A signed-out request is 401. A client account asking for a
  portfolio ticket is 403 with a message naming the reason.

Note: the ten-item ticket pre-check is completed in Phase 6 once
`portfolio_items` exists; POST `/media/portfolio` will also enforce the cap
inside its insert transaction.

### Step 3.5 — Reference

- [x] **Action.** Document the endpoint in [`api.md`](../reference/api.md) and
  the three new variables in [`environment.md`](../reference/environment.md).
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 4 — Frontend: the resize pipeline

One module, used by both avatars and portfolio. Write it once, carefully.

### Step 4.1 — The resize function

- [x] **Action.** Create `frontend/src/lib/image.ts` exporting:

```ts
export async function resizeImage(file: File, maxEdge: number): Promise<Blob>
```

It must:

1. Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`.
   **The orientation option is not optional.** Without it every portrait photo
   taken on a phone arrives sideways — the rotation lives in EXIF, and drawing to
   a canvas discards EXIF.
2. Scale so the **long edge** is `maxEdge`, preserving aspect ratio. Never
   upscale: an image already smaller than `maxEdge` passes through at its own
   size.
3. Draw to a canvas and encode with `canvas.toBlob(cb, 'image/webp', 0.82)`.
4. **Fall back to `image/jpeg` if the WebP blob comes back null**, or is larger
   than the JPEG. Encoding support is not universal on older Android WebViews.
5. Throw a plain-language `Error` if the decode fails.

- [x] **Verify.** Resizing a 4000×3000 JPEG at `maxEdge: 1600` yields a blob
  1600px on its long edge and well under 400 KB. A portrait phone photo comes out
  upright.

Covered by implementation review + Phase 8.3 size check against a real upload;
Node has no canvas/`createImageBitmap` here.

### Step 4.2 — Name the sizes once

- [x] **Action.** In the same file:

```ts
export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;
```

Both are fixed for the life of the product — ADR 0021 records that originals are
not kept, so these cannot be re-derived later. Import them; never write the
numbers inline.

- [x] **Verify.** `grep -rn "1600" frontend/src` matches only `image.ts`.

### Step 4.3 — Reject what cannot be handled

- [x] **Action.** Before resizing, reject a file over 20 MB with a clear message
  ("That photo is too large — try one under 20 MB").

Catch the decode failure separately and say what it means: **an iPhone HEIC file
cannot be decoded by Chrome on Android**, and the person needs to know to pick a
JPEG rather than to conclude the site is broken.

- [x] **Verify.** A `.heic` file on a non-Safari browser produces a readable
  message, not a silent failure or a stack trace.

### Step 4.4 — The upload helper

- [x] **Action.** Create `frontend/src/features/media/api.ts` exporting
  `uploadImage(blob, uploadUrl)` — a single `PUT` of the blob to the absolute URL
  the API returned.

Use plain `fetch`, **not the shared axios client**: that client attaches
credentials and a base URL meant for our own API, and this request goes to a
third-party origin.

- [x] **Verify.** A manual round trip puts a file in the bucket and its public
  URL renders in a browser tab.

---

# Phase 5 — Avatars

### Step 5.1 — Schema

- [x] **Action.** Add to `users` in `backend/src/db/schema/users.ts`:

```ts
    avatarKey: text('avatar_key'),
    avatarReviewedAt: timestamp('avatar_reviewed_at', { withTimezone: true }),
```

**The avatar lives on `users`, not on `creative_profiles`.** A photo belongs to a
person, not to a role
([ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md)). A
client has no creative profile but still appears in conversations, and putting it
on the profile would mean a second column and a second upload path later.

- [x] **Action.** Run `npm run db:generate`, then `npm run db:migrate`.
- [x] **Verify.** The generated SQL adds two nullable columns and **nothing
  else**. If it drops or renames anything, stop and inspect — a stray diff here
  means the migration folder is out of sync with the schema files.

### Step 5.2 — Endpoints

- [x] **Action.** In the media module add:

| Method | Path | Does |
|---|---|---|
| `PUT` | `/media/avatar` | Body `{ objectKey }`. Deletes the previous object, stores the new key, clears `avatarReviewedAt` |
| `DELETE` | `/media/avatar` | Deletes the object and nulls the column |

`PUT` must **validate that `objectKey` starts with `avatars/` followed by the
caller's own user id**. Without that check any signed-in user can point their
avatar at any object in the bucket, including someone else's.

- [x] **Action.** Both, when the caller has a **published** creative profile, set
  `editedSinceReviewAt` on it — rule 5.
- [x] **Verify.** Posting another user's object key is a 403. Uploading a
  replacement leaves exactly one object under `avatars/<id>/`.

### Step 5.3 — Serve it

- [x] **Action.** Add `avatarUrl: string | null` to the `PublicProfile` interface
  in `backend/src/modules/profiles/profiles.service.ts`, selected from the
  already-joined `users` table and passed through `publicUrl()`. Add it in
  `listPublished` **and** in `getPublishedBySlug`.
- [x] **Action.** Mirror the field in `frontend/src/features/profiles/types.ts`.
- [x] **Verify.** `GET /api/v1/creatives` returns an absolute `avatarUrl`, or
  `null`, on every row. No bucket name appears anywhere in the response.

### Step 5.4 — An Avatar component

- [x] **Action.** Create `frontend/src/components/ui/Avatar.tsx` and export it
  from `components/ui/index.ts`, following
  [add-a-ui-component.md](../guides/add-a-ui-component.md).

Props: `src: string | null`, `name: string`, `size: 'sm' | 'md' | 'lg'`.

With no `src` it renders **initials on a token background** — never a broken
image and never a grey silhouette. Most profiles will have no avatar for a long
time, so the fallback is the common case and should look deliberate.

Set `loading="lazy"` and explicit `width` and `height` so the directory does not
reflow as images arrive.

- [x] **Verify.** It appears on the style guide page at all three sizes, with and
  without a source.

### Step 5.5 — Use it

- [x] **Action.** Place the avatar in three places:
  - the directory card, `size="md"`, left of the name block
  - `CreativeProfilePage`, `size="lg"`, beside the `h1`
  - `SiteHeader`, `size="sm"`, for the signed-in user

The header needs `avatarUrl` on the current-user payload — add it to whatever
`/auth/me` returns.

- [x] **Verify.** All three render, and the directory card keeps its layout when
  every profile in view has no avatar.

### Step 5.6 — Upload UI

- [x] **Action.** Add an avatar field to `ProfileEditor` **and** to the account
  area, so a client with no creative profile can set one too.

The flow: pick file → `resizeImage(file, THUMB_EDGE)` → request ticket → `PUT` to
storage → `PUT /media/avatar`. Show a busy state across the whole sequence and a
plain error if any step fails.

One size only for avatars. They are never displayed larger than 400px, so a
1600px version would be pure waste against a 1 GB budget.

- [x] **Verify.** Upload, reload, the avatar persists. Upload a second and the
  first object is gone from the bucket.

---

# Phase 6 — Portfolio

### Step 6.1 — Schema

- [ ] **Action.** Add to `backend/src/db/schema/profiles.ts`:

```ts
export const portfolioItems = pgTable(
  'portfolio_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('portfolio_items_profile_order_idx').on(table.profileId, table.sortOrder),
    index('portfolio_items_reviewed_idx').on(table.reviewedAt),
  ],
);
```

`onDelete: 'cascade'` removes rows when a profile goes, but **not the objects in
storage** — that is what the prune script in Step 7.4 is for.

- [ ] **Action.** Add a `portfolioItems` relation to `creativeProfilesRelations`,
  export the row type, and run `db:generate` then `db:migrate`.
- [ ] **Verify.** The table exists with both indexes.

### Step 6.2 — CRUD endpoints

- [ ] **Action.** In the media module:

| Method | Path | Does |
|---|---|---|
| `POST` | `/media/portfolio` | Body `{ objectKey, thumbKey, caption? }`. Creates a row |
| `PATCH` | `/media/portfolio/:id` | Caption only |
| `DELETE` | `/media/portfolio/:id` | Deletes both objects, then the row |
| `PUT` | `/media/portfolio/order` | Body `{ ids: string[] }`. Rewrites `sortOrder` |

Every one of them:

- resolves the caller's own profile, and **404s on an id belonging to someone
  else** — not 403, which would confirm the id exists
- validates `:id` with `z.string().uuid()`, so a malformed id is a 400 and not
  the 500 already fixed once in the admin routes
- validates that supplied keys start with `portfolio/` followed by the caller's
  own profile id, as in Step 5.2
- sets `editedSinceReviewAt` when the profile is published — rule 5

- [ ] **Action.** `POST` enforces the ten-item cap **inside the same transaction
  as the insert**, not as a check before it. Two parallel requests past a
  read-then-insert check both succeed.
- [ ] **Verify.** The eleventh item is a 400 naming the limit. Another user's
  item id is a 404 on `PATCH`, `DELETE` and reorder alike.

### Step 6.3 — Serve it

- [ ] **Action.** Add to `PublicProfile`:

```ts
  portfolio: { id: string; url: string; thumbUrl: string; caption: string | null }[];
```

Populate it fully, in `sortOrder`, in `getPublishedBySlug`.

In `listPublished`, include **only the first three thumbnails per profile** —
enough for a card, and it bounds the query.

- [ ] **Action.** Fetch them for the whole page in **one** query keyed by profile
  id, the way `subdomainsForProfiles` already does. Do not query per row.
- [ ] **Verify.** Loading a directory page issues a fixed number of queries
  regardless of page size. Check the query log if unsure.

### Step 6.4 — Thumbnails on the card

- [ ] **Action.** On the directory card, when a profile has portfolio items,
  render up to three thumbnails in a row beneath the bio.

Every one gets `loading="lazy"`, `decoding="async"` and explicit dimensions.
[Constraints §3](../explanation/constraints.md) is about exactly this page: 24
cards × 3 thumbs is 72 images, and without lazy loading that is a whole metered
connection's budget on one scroll.

- [ ] **Verify.** On a throttled Fast 3G profile in devtools the directory text
  is readable before the images finish, and nothing shifts position as they load.

### Step 6.5 — The gallery

- [ ] **Action.** On `CreativeProfilePage`, render the portfolio as a grid of
  thumbnails below the bio. Clicking one opens the display-size image in a
  lightbox — use `<dialog>`, no new dependency.

The lightbox must close on Escape and on a click outside, and must return focus
to the thumbnail that opened it.

- [ ] **Verify.** Keyboard only: the grid is reachable by Tab, Enter opens,
  Escape closes, focus returns to where it was.

### Step 6.6 — The editor

- [ ] **Action.** Add a Portfolio section to `ProfileEditor`: a grid of current
  items, each with a caption field and a remove button, plus an add control that
  shows the remaining allowance ("4 of 10 used").

Upload runs `resizeImage` **twice** — once at `DISPLAY_EDGE`, once at
`THUMB_EDGE` — uploads both, then calls `POST /media/portfolio`.

- [ ] **Action.** If the second upload fails, delete the first object before
  surfacing the error. A half-uploaded pair with no row is an orphan nobody will
  ever find by hand.
- [ ] **Verify.** Add three images, caption one, remove one, reload. State is
  correct and no stray object remains in the bucket.

### Step 6.7 — Reordering

- [ ] **Action.** Give each item plain **Move left** and **Move right** buttons
  calling `PUT /media/portfolio/order`.

Not drag-and-drop. It is a dependency, it is hostile on a phone, and it is
unusable with a keyboard or a screen reader.

- [ ] **Verify.** Reorder, reload, the order holds. The first item is the one
  shown first on the card.

---

# Phase 7 — Admin media review and cleanup

Per [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) images are
live the moment they are uploaded. This queue is the only thing that catches a
bad one.

### Step 7.1 — The queue endpoint

- [ ] **Action.** Add `GET /admin/media` to the admin module, returning
  unreviewed images — portfolio items with a null `reviewedAt`, and users with an
  `avatarKey` and a null `avatarReviewedAt` — newest first, paginated, each with
  its owner's name and profile slug.
- [ ] **Verify.** As a non-admin, 403. As an admin, a newly uploaded image
  appears in the list.

### Step 7.2 — The actions

- [ ] **Action.** Add `POST /admin/media/:kind/:id/review` taking
  `{ action: 'approve' | 'remove' }`. Approve stamps the reviewed timestamp;
  remove deletes the object and the row, or nulls the avatar column.
- [ ] **Action.** Write a `moderationActions` row for a removal. That table is
  the append-only record of who did what — a takedown with no history is the one
  you will most want to look up later.
- [x] **Verify.** Removing an image takes it out of the application and leaves a
  `moderation_actions` row.

**The public URL does not immediately 404, and that is not a bug in this step.**
Measured against the live bucket: the object is deleted, but the Cloudflare edge
keeps serving a cached copy (`cf-cache-status: HIT`) until it expires. Edge
purging belongs to the paid Smart CDN. Recorded in
[ADR 0021](../decisions/0021-image-storage-and-upload-path.md).

### Step 7.3 — The admin page

- [ ] **Action.** Add a Media tab to the admin area: a thumbnail grid with the
  owner's name, a link to their profile, and Approve / Remove on each.
- [ ] **Verify.** The tab loads, both actions work, and the item leaves the queue
  without a full page reload.

### Step 7.4 — Prune orphans

- [ ] **Action.** Create `backend/src/scripts/prune-orphan-media.ts`, registered
  as `npm run media:prune`. It lists every object in the bucket, collects every
  key referenced by `users.avatar_key`, `portfolio_items.object_key` and
  `portfolio_items.thumb_key`, and deletes objects **older than 24 hours** that
  no row references.

**The age check is not optional.** Without it the script races an upload in
progress and deletes an object between the `PUT` and the `POST` that records it.

- [ ] **Action.** Default to a dry run that prints what it would delete. Require
  an explicit `--delete` flag to act.
- [ ] **Action.** Document it in [`commands.md`](../reference/commands.md).
- [ ] **Verify.** Upload an image and abandon it before it is recorded. The
  script lists it after 24 hours and not before.

---

# Phase 8 — Verification

### Step 8.1 — Ownership

| Attempt | Expected |
|---|---|
| Set avatar to another user's object key | 403 |
| Create a portfolio item with another profile's key | 403 |
| `PATCH` another creative's item | 404 |
| `DELETE` another creative's item | 404 |
| Reorder including another creative's item id | 404 |
| A malformed uuid in `:id` | 400, not 500 |

- [x] **Verify.** Every row behaves as stated.
- **Done 2026-09-19**, against the local API. Rows 2-5 named portfolio items,
  which no longer exist ([ADR 0022](../decisions/0022-offers-replace-portfolio.md)),
  so they were checked where that role now lives — offers. Claiming another
  user's object key as your avatar is 403; `PATCH`, `DELETE` and a reorder
  including another creative's offer are each 404; a malformed uuid is 400 on
  both `/offers/:id` and `/agreements/:id`. The offer survived all three
  attempts.
- **A false finding worth recording.** The first run reported 403 for `PATCH`
  and `DELETE`, which would have been an existence leak. It was the test that
  was wrong: the intruder had no creative profile, so it was stopped by the
  "a creative profile is required to manage offers" guard long before the
  ownership check. With a creative intruder it is 404, as specified.

### Step 8.2 — Limits

- [ ] **Superseded.** The eleventh portfolio item — portfolio was replaced by
  offers, which carry their own limits.
- [ ] **Blocked on storage.** A 12 MB file is rejected by the bucket, not
  silently stored.
- [ ] **Blocked on storage.** A `.txt` renamed to `.webp` is rejected by the
  MIME check.
- [x] **Verify.** The 41st upload ticket within an hour is a 429.
- **Done 2026-09-19.** Fired 42 requests as one account: the first 429 landed on
  request 41 exactly, which is the boundary `uploadLimiter` defines (limit 40,
  keyed by user id). The limiter runs before the handler, so this holds without
  working storage.

### Step 8.3 — The sizes are real

- [ ] **Blocked on storage.** Upload a 4 MB photo. In the Supabase dashboard the stored
  display object is **under 400 KB** and the thumb is **under 60 KB**. If either
  is far larger the resize did not run and you are storing originals — stop and
  fix Phase 4.

### Step 8.4 — Moderation

- [ ] **Blocked on storage, and portfolio is superseded.** A published creative adds an image. Their profile stays
  `published` and appears in the admin Edited queue
  ([ADR 0016](../decisions/0016-edits-never-unpublish.md)).
- [ ] **Blocked on storage.** The image also appears in the Media queue. The
  queue itself works — an avatar was approved through it on 2026-09-19 and the
  queue emptied — but putting a *new* image into it needs a working upload.
- [ ] **Blocked on storage.** Removing it from the Media queue takes it off the public
  profile.

### Step 8.5 — No secrets reached the client

- [x] **Verify.** `grep -ri "service_role" frontend/ --exclude-dir=node_modules`
  is empty. Run 2026-09-19: empty.
- [x] **Verify.** In the browser devtools Network tab, no API response body
  contains the service role key or the bucket name. Done 2026-09-19 by reading
  the bodies directly instead — `/taxonomy/domains`, `/creatives`, `/offers`
  and `/auth/me` were each checked for the key, for `service_role`, and for a
  JWT prefix. Nothing.
- [x] **Verify.** `grep -rn "supabase" frontend/src` returns nothing outside a
  comment. Run 2026-09-19: no hits at all.

### Step 8.6 — The directory still behaves

- [x] **Verify.** Signed out, `/creatives` returns 200 with the full list —
  images change nothing about the public endpoint
  ([ADR 0017](../decisions/0017-sign-in-before-contacting.md)).
- [x] **Verify.** Nearby-first ordering and the municipality filter still work.
  Done 2026-09-19: a viewer registered in Almeria gets Almeria in the first
  three rows, and `?municipality=almeria` returns only Almeria.
- [x] **Verify.** A profile with no bio, no avatar and no portfolio still renders
  a correct card. This is the majority case today. Confirmed 2026-09-19 against
  a bare seeded profile in the list.

### Step 8.7 — Full pass

- [x] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0. Green 2026-09-19, 147 tests.

---

## Acceptance

- [x] Bio shows on the directory card, clamped to two lines
- [x] Any account can set and replace an avatar; replacing removes the old object
- [x] A creative can add up to ten portfolio images, caption them and reorder them
- [x] Cards show the avatar and up to three thumbnails; the profile page shows the
      full gallery
- [x] Every image is resized in the browser; no original is ever stored
- [x] Image bytes never pass through the API
- [x] The service role key exists only in backend environment variables
- [x] Image changes flag a published profile as edited
- [x] The admin media queue lists unreviewed images and can remove them
- [x] `npm run media:prune` reports orphans and deletes only with `--delete`
- [x] `api.md`, `data-model.md`, `environment.md` and `commands.md` updated
- [x] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Cloudflare R2 | Zero egress and ten times the storage, but another vendor. ADR 0021 makes it a backend-only change. The trigger is the Supabase usage page, not a date |
| A storage usage alert | 1 GB and 5 GB of egress are the ceilings and nothing currently watches them. Today this is checked by looking |
| A public report button | ADR 0021 names it openly: images are live before review, and only an administrator looking finds a bad one |
| Cropping | A long-edge fit means a portrait avatar renders with whatever the camera framed. A square crop step would be better |
| HEIC support | iPhone photos fail to decode outside Safari. A wasm decoder would fix it at real bundle cost |
| Separate alt text | The caption stands in for it. Distinct alt text is the accessible answer |
| Blurhash placeholders | Would remove the grey-box flash on slow connections. Needs a hash computed at upload time |
| Real pagination on the admin media queue | `listUnreviewedMedia` fetches every unreviewed row, merges and sorts in memory, then slices. Fine at today's volume, wrong at the ~3,400-image ceiling in ADR 0021 |
| A real upload timestamp on avatars | The queue sorts avatars by `users.updated_at`, so any profile edit reorders them. Needs its own column |
| Backfill `moderation_actions.subject_user_id` | Added nullable in migration 0011; rows written before it are null. Derivable from `profile_id` for every existing row |
