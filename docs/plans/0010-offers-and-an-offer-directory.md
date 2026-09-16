# 0010. Offers, and a directory that indexes them

- **Status:** Complete
- **Depends on:** [plan 0009](./0009-bio-avatars-and-portfolio-images.md) — the
  image pipeline this reuses, and the portfolio this replaces
- **Related:** [ADR 0022](../decisions/0022-offers-replace-portfolio.md) ·
  [ADR 0021](../decisions/0021-image-storage-and-upload-path.md) ·
  [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md)

---

## Goal

A creative publishes **offers** — a named service or package under one of the
sub-domains they registered, with a description, an optional price, and images.
A client filtering the directory by a sub-domain sees those offers.

This replaces the portfolio. It is not an addition to it.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged, as do the five image rules in
[plan 0009](./0009-bio-avatars-and-portfolio-images.md#rules-for-whoever-executes-this)
— browser-side resizing, no bytes through the API, the service role key stays on
the backend, absolute URLs only, and image changes flag a published profile as
edited. Four more:

1. **An offer's sub-domain must be one the creative registered.** Check it on
   every write. Do not trust the client to send a legal value.
2. **Do not add a composite foreign key** to `creative_profile_subdomains` to
   enforce that.
   [ADR 0022](../decisions/0022-offers-replace-portfolio.md) explains why:
   `updateOwnProfile` deletes and reinserts every sub-domain row on each save,
   so the constraint would reject ordinary profile edits.
3. **Money is integer centavos.** Never a float, never a string. ₱15,000 is
   `1500000`. Format for display at the edge, never in the database.
4. **Migrate portfolio rows, do not drop them.** The objects stay where they
   are; only the rows move. Deleting them would orphan images in the bucket.

---

## Scope

**In scope**
- `offers` and `offer_images` tables; `portfolio_items` migrated then dropped
- Offer CRUD for the owning creative, with sub-domain and limit enforcement
- A public offer listing with domain, sub-domain and municipality filters, and
  nearby-first ordering
- The Directory page becomes an offer listing
- Offers on the public profile page
- Admin review of offers, with a contact-details flag

**Out of scope** — do not build these
- Keeping a separate portfolio gallery. ADR 0022 chose one concept
- A required price, or any currency other than pesos
- Recording which offer a conversation is about. Follow-up; for now the composer
  pre-fills the offer title
- Full-text search over descriptions. [ADR 0003](../decisions/0003-postgres-native-search.md)
  becomes actionable after this, but is its own plan
- Any fairness or rotation rule for whose offers appear first
- Booking, scheduling, payment

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema and migration | 4 / 4 | Done |
| 2. Backend — own offers | 6 / 6 | Done |
| 3. Backend — public listing | 4 / 4 | Done |
| 4. Frontend — the offer editor | 5 / 5 | Done |
| 5. Frontend — the directory | 4 / 4 | Done |
| 6. Frontend — the profile page | 2 / 2 | Done |
| 7. Moderation | 3 / 3 | Done |
| 8. Verification | 6 / 6 | Done |

---

# Phase 1 — Schema and migration

### Step 1.1 — The tables

- [x] **Action.** In `backend/src/db/schema/profiles.ts`, add:

```ts
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    // Exactly one. The creative must have registered it — enforced in the
    // service, not by a composite FK. See ADR 0022.
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    // Integer centavos. Null means "Price on request"; a minimum alone renders
    // "from ₱X". Never a float.
    priceMinCentavos: integer('price_min_centavos'),
    priceMaxCentavos: integer('price_max_centavos'),
    sortOrder: integer('sort_order').notNull().default(0),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Set when the description matches a contact-details pattern. Advisory —
    // it sorts the review queue, it does not hide the offer.
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('offers_profile_order_idx').on(table.profileId, table.sortOrder),
    index('offers_subdomain_created_idx').on(table.subdomainId, table.createdAt),
    index('offers_reviewed_idx').on(table.reviewedAt),
  ],
);

export const offerImages = pgTable(
  'offer_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('offer_images_offer_order_idx').on(table.offerId, table.sortOrder)],
);
```

`offers_subdomain_created_idx` is the index the public listing runs on. Without
it every filtered directory page is a sequential scan.

- [x] **Action.** Add the relations, export both row types, and **do not remove
  `portfolioItems` yet** — Step 1.3 reads from it.
- [x] **Verify.** `npm run db:generate` produces a migration that only adds. If
  it drops anything, stop.

### Step 1.2 — Limits in one place

- [x] **Action.** Export from the offers service:

```ts
export const OFFER_LIMIT = 6;          // per profile
export const OFFER_IMAGE_LIMIT = 4;    // per offer
```

Both are storage decisions as much as product ones — ADR 0022 does the
arithmetic. Import them; never write the numbers inline.

- [x] **Verify.** `grep -rn "= 6\|= 4" backend/src/modules/offers` finds them
  only in that one file.

### Step 1.3 — Migrate the portfolio

- [x] **Action.** Write `backend/src/scripts/migrate-portfolio-to-offers.ts`,
  registered as `npm run migrate:offers`. For each profile holding portfolio
  items, in one transaction:
  - create a single offer titled `Portfolio`, under that profile's **primary**
    sub-domain, with no description and no price
  - move each portfolio item into `offer_images`, **keeping `objectKey` and
    `thumbKey` exactly as they are**, preserving `sortOrder`

Keys are kept because the objects are not moving. Rewriting them would mean
re-uploading every image, and any key you fail to rewrite becomes an orphan the
prune script deletes 24 hours later.

- [x] **Action.** A profile with more than `OFFER_IMAGE_LIMIT` items keeps them
  all. The cap applies to new uploads, not to migrated history — refusing to
  migrate someone's existing images would be data loss.
- [x] **Action.** Make it idempotent: skip a profile that already has an offer
  titled `Portfolio`. It will be run once locally and once in production, and a
  second accidental run must not duplicate.
- [x] **Verify.** Run locally. Every former portfolio item appears as an offer
  image, `select count(*)` before and after match, and every `object_key` is
  byte-identical to what it was.

### Step 1.4 — Drop the old table

- [x] **Action.** Only after Step 1.3 verifies: remove `portfolioItems` and its
  relation from the schema, generate the migration, and remove the now-dead
  portfolio code from the media module.
- [x] **Action.** Update `prune-orphan-media.ts` to collect keys from
  `offer_images` instead of `portfolio_items`.

**Get this one right.** If the prune script stops seeing a table that still
holds live keys, it classifies every one of those objects as an orphan and
deletes the lot on the next `--delete` run.

- [x] **Verify.** `npm run media:prune` (dry run) reports **no** orphans after
  the migration. If it lists the migrated images, the key collection is wrong —
  stop and fix before anyone runs it with `--delete`.

---

# Phase 2 — Backend: own offers

Create `backend/src/modules/offers/` with `offers.routes.ts`, `offers.schema.ts`
and `offers.service.ts`, mounted at `/offers`. Public reads are in Phase 3; the
write routes here sit behind `requireAuth`.

### Step 2.1 — Validation

- [x] **Action.** In `offers.schema.ts`:

```ts
export const offerBodySchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    subdomainSlug: z.string().trim().min(1),
    description: z.string().trim().max(2000).optional()
      .or(z.literal('').transform(() => undefined)),
    priceMinCentavos: z.number().int().positive().max(100_000_000).optional(),
    priceMaxCentavos: z.number().int().positive().max(100_000_000).optional(),
  })
  .refine(
    (d) => d.priceMinCentavos == null || d.priceMaxCentavos == null
      || d.priceMinCentavos <= d.priceMaxCentavos,
    { path: ['priceMaxCentavos'], message: 'Maximum must be at least the minimum' },
  );
```

The ceiling is ₱1,000,000. It is not about realism; it stops a typo putting a
nine-digit price on the directory.

- [x] **Verify.** A max below the min is a 400 naming `priceMaxCentavos`. Both
  absent is valid.

### Step 2.2 — The sub-domain rule

- [x] **Action.** Write `assertRegisteredSubdomain(profileId, subdomainSlug)`:
  resolve the slug, confirm a `creative_profile_subdomains` row joins it to this
  profile, and 400 otherwise with a message naming the sub-domain.
- [x] **Action.** Call it on create **and** on update. An offer whose sub-domain
  is edited to one the creative never registered is the same violation.
- [x] **Verify.** Posting an offer under a sub-domain the creative did not
  register is a 400, not a silently stored row.

### Step 2.3 — CRUD

- [x] **Action.** Behind `requireAuth`, all resolving the caller's own profile:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/offers/mine` | The caller's offers, with images, in `sortOrder` |
| `POST` | `/offers` | Enforces `OFFER_LIMIT` under an advisory lock |
| `PATCH` | `/offers/:id` | Any of title, sub-domain, description, price |
| `DELETE` | `/offers/:id` | Deletes images from storage, then the row |
| `PUT` | `/offers/order` | Body `{ ids: string[] }` |

Each one: validates `:id` with `z.string().uuid()`, **404s on an id belonging to
another profile** (never 403, which confirms it exists), and sets
`editedSinceReviewAt` when the profile is published.

- [x] **Action.** `POST` takes `pg_advisory_xact_lock(hashtext(profileId))`
  before counting, exactly as `createPortfolioItem` does. A count inside a
  transaction is not atomic under READ COMMITTED — two parallel requests both
  see five and both insert.
- [x] **Verify.** The seventh offer is a 400 naming the limit. Another
  creative's offer id is a 404 on `PATCH`, `DELETE` and reorder alike.

### Step 2.4 — Offer images

- [x] **Action.** Extend the media module: `kind: 'offer'` on
  `POST /media/upload-url` returns the `full` and `thumb` ticket pair, keyed
  `offers/<profileId>/<uuid>.webp` and `-thumb.webp`.
- [x] **Action.** Add `assertOwnOfferKey(profileId, key)` mirroring
  `assertOwnPortfolioKey`, and **call `assertSafeObjectKey` first**. The prefix
  test alone is what the traversal fix in `4c59349` was about.
- [x] **Action.** `POST /offers/:id/images` and `DELETE /offers/images/:imageId`,
  enforcing `OFFER_IMAGE_LIMIT` under the same advisory lock pattern.

Migrated images keep their legacy `portfolio/...` keys. They are never
re-asserted, because the check runs on upload only. Deletion uses the stored
key, so both prefixes work.

- [x] **Verify.** A key under another profile's prefix is 403. A key containing
  `..` is 400.

### Step 2.5 — Do not strand offers

- [x] **Action.** In `updateOwnProfile`, before rewriting the sub-domain rows,
  refuse with a 400 if any sub-domain being **removed** still has offers, naming
  them: *"Remove your 2 offers under Game Developers first."*

Without this a creative silently keeps offers under a sub-domain they no longer
claim, and those offers stay in the filtered directory.

- [x] **Verify.** Removing a sub-domain with offers is a 400 naming it. Removing
  one with none still works.

### Step 2.6 — Reference

- [x] **Action.** Document every endpoint in [`api.md`](../reference/api.md) and
  both tables in [`data-model.md`](../reference/data-model.md), and add
  `migrate:offers` to [`commands.md`](../reference/commands.md).
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 3 — Backend: the public listing

### Step 3.1 — The endpoint

- [x] **Action.** `GET /offers` — public, **no `requireAuth`**, session-*aware*
  the way `GET /creatives` is. Query: `domain`, `subdomain`, `municipality`,
  `page`, `limit`.

Only offers whose profile is `published` appear. A pending or suspended profile
must not reach the directory through its offers — that would be a way around
moderation entirely.

- [x] **Verify.** Signed out, 200 with results. An offer belonging to a
  `pending_review` profile never appears.

### Step 3.2 — Ordering

- [x] **Action.** Nearby first, then newest, then id:

```ts
const order = viewerMunicipalityId
  ? [desc(sql`${users.municipalityId} = ${viewerMunicipalityId}`), desc(offers.createdAt), asc(offers.id)]
  : [desc(offers.createdAt), asc(offers.id)];
```

The id is the stable tiebreaker. Two offers created in the same transaction
share a `createdAt`, and without it pagination can repeat or skip one.

- [x] **Verify.** As a Kawayan client, Kawayan offers lead. Signed out, newest
  first. Paging through twice returns the same set.

### Step 3.3 — The payload

- [x] **Action.** Each row returns the offer, its **first image only**, and its
  creative: `slug`, display name, municipality, `avatarUrl`, `isNearby`.

One image per card. Four would be sixteen images on a twenty-row page, and
[constraints §3](../explanation/constraints.md) is about exactly that.

- [x] **Action.** Fetch images and creatives for the whole page in **one query
  each**, keyed by id, the way `subdomainsForProfiles` does. Never per row.
- [x] **Verify.** A twenty-row page issues a fixed number of queries.

### Step 3.4 — One offer

- [x] **Action.** `GET /offers/:id` returns one published offer with all its
  images and its creative. 404 when the profile is not published.
- [x] **Verify.** A real id on an unpublished profile is 404.

---

# Phase 4 — Frontend: the offer editor

### Step 4.1 — Replace the portfolio editor

- [x] **Action.** Delete `PortfolioEditor` and build
  `frontend/src/features/offers/OfferEditor.tsx` in its place, listing the
  creative's offers with edit, delete and reorder, and showing the remaining
  allowance ("2 of 6 used").
- [x] **Verify.** The account page no longer references the portfolio.

### Step 4.2 — The form

- [x] **Action.** Title, sub-domain, description, price, images.

The sub-domain control lists **only the sub-domains on the creative's own
profile**, grouped by domain. Do not fetch the full taxonomy — offering all
eighty-one and rejecting eighty of them server-side is a trap.

- [x] **Verify.** The select contains exactly the creative's registered
  sub-domains.

### Step 4.3 — Price input

- [x] **Action.** Two optional peso fields, "From" and "To", converted to
  centavos at the boundary — `Math.round(pesos * 100)`.

Never hold money as a float beyond that conversion, and never send pesos to the
API. Show the helper text "Leave both blank for *Price on request*" so the empty
state reads as a choice.

- [x] **Verify.** ₱15,000 posts as `1500000`. Both blank saves and renders
  "Price on request".

### Step 4.4 — Images

- [x] **Action.** Reuse `resizeImage` at `DISPLAY_EDGE` and `THUMB_EDGE`
  unchanged, with the same two-size upload and the same rollback: if the second
  upload fails, delete the first object before surfacing the error.
- [x] **Verify.** Four images upload; the fifth is refused with the limit named.

### Step 4.5 — Formatting in one place

- [x] **Action.** `frontend/src/lib/money.ts` exporting `formatPriceRange(min, max)`
  returning "from ₱15,000", "₱5,000 – ₱15,000", or "Price on request".
- [x] **Verify.** All three shapes render; nothing formats money inline.

---

# Phase 5 — Frontend: the directory

### Step 5.1 — Offer cards

- [x] **Action.** `DirectoryPage` lists offers. Each card: image, title, price,
  sub-domain badge, and the creative's avatar, name, municipality and Nearby
  badge. The card links to the offer.
- [x] **Action.** `loading="lazy"`, `decoding="async"` and explicit dimensions
  on every image, as in plan 0009.
- [x] **Verify.** On throttled Fast 3G the text is readable before images land,
  and nothing shifts as they arrive.

### Step 5.2 — Filters

- [x] **Action.** Keep the existing domain, sub-domain and municipality selects
  and the URL-parameter behaviour. Only what they filter changes.
- [x] **Verify.** Existing directory URLs with `?domain=&subdomain=` still
  resolve.

### Step 5.3 — The empty state is the normal state

- [x] **Action.** When no offers match, say so plainly and link to the creative
  listing: *"No offers here yet — browse creatives in this sub-domain instead."*

[ADR 0022](../decisions/0022-offers-replace-portfolio.md) names this as the
decision's main cost. With two published profiles, **empty is what most filters
return on day one.** It has to read as a young registry rather than a broken
page.

- [x] **Verify.** Filtering to a sub-domain with no offers shows the message and
  the link works.

### Step 5.4 — Keep creatives reachable

- [x] **Action.** Keep the existing creative listing on its own route with a
  link from the directory. ADR 0022 requires that offers not gate
  discoverability.
- [x] **Verify.** A published creative with no offers is still findable.

---

# Phase 6 — Frontend: the profile page

### Step 6.1 — Offers replace the gallery

- [x] **Action.** `CreativeProfilePage` shows offers — title, price, sub-domain,
  description, images — instead of the portfolio grid. Keep the lightbox and its
  focus handling.
- [x] **Verify.** Keyboard only: reachable by Tab, Enter opens, Escape closes,
  focus returns.

### Step 6.2 — Contact about an offer

- [x] **Action.** Each offer gets a Contact button opening the existing
  composer, pre-filled with `I'm interested in "<title>".` Signed out, it routes
  to `/login?next=…` exactly as the profile Contact does
  ([ADR 0017](../decisions/0017-sign-in-before-contacting.md)).

Pre-filled text only. Recording which offer a conversation is about is a
follow-up.

- [x] **Verify.** Signed out, Contact goes to login and returns to the offer.

---

# Phase 7 — Moderation

### Step 7.1 — Flag contact details

- [x] **Action.** On create and update, set `flaggedAt` when the description
  matches a phone number, a URL, or a social handle. Advisory only — **never
  block the save and never hide the offer**.

This is what [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md)
is worth protecting: an offer saying "message me on Facebook" routes around
in-app conversations entirely.

- [x] **Verify.** A description containing `09171234567` or `fb.com/x` saves,
  appears publicly, and is flagged.

### Step 7.2 — The queue

- [x] **Action.** Extend the admin media queue to offers: unreviewed first,
  flagged ones on top, each showing title, description, price, images and owner.
  Approve stamps `reviewedAt`; Remove deletes the offer and its objects and
  writes a `moderation_actions` row with `subjectUserId`.
- [x] **Verify.** A flagged offer sorts above an unflagged one. Removing it
  leaves an audit row.

### Step 7.3 — Edits re-enter review

- [x] **Action.** Editing a published offer's title, description or price clears
  `reviewedAt` and sets `editedSinceReviewAt` on the profile
  ([ADR 0016](../decisions/0016-edits-never-unpublish.md)). The offer stays
  live.
- [x] **Verify.** Editing a reviewed offer returns it to the queue without
  hiding it.

---

# Phase 8 — Verification

### Step 8.1 — Ownership and limits

| Attempt | Expected |
|---|---|
| `PATCH` another creative's offer | 404 |
| `DELETE` another creative's offer | 404 |
| Offer under an unregistered sub-domain | 400 |
| Edit an offer's sub-domain to an unregistered one | 400 |
| Seventh offer | 400 naming the limit |
| Fifth image on one offer | 400 naming the limit |
| Image key under another profile's prefix | 403 |
| Image key containing `..` | 400 |

- [x] **Verify.** Every row behaves as stated.

### Step 8.2 — Money

- [x] **Verify.** Min only renders "from ₱X". Both render a range. Neither
  renders "Price on request". Max below min is refused.
- [x] **Verify.** No column, payload or variable holds pesos as a float.

### Step 8.3 — Moderation cannot be bypassed

- [x] **Verify.** An offer on a `pending_review` profile appears nowhere public
  — not in `GET /offers`, not at `GET /offers/:id`.
- [x] **Verify.** Suspending a published profile removes its offers from the
  directory.

### Step 8.4 — The migration

- [x] **Verify.** Every former portfolio image is an offer image with an
  unchanged `object_key`.
- [x] **Verify.** `npm run media:prune` dry run reports **no** orphans.
- [x] **Verify.** Running `migrate:offers` twice changes nothing the second
  time.

### Step 8.5 — The directory

- [x] **Verify.** Filtering by sub-domain returns only offers under it.
- [x] **Verify.** A creative with three matching offers appears three times.
- [x] **Verify.** Nearby-first works, and pagination neither repeats nor skips.
- [x] **Verify.** A filter with no offers shows the empty state, and the
  creative listing is still reachable.

### Step 8.6 — Full pass

- [x] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0.

---

## Acceptance

- [x] A creative can publish up to six offers, each under one registered
      sub-domain, with an optional price and up to four images
- [x] The directory lists offers and filters them by domain, sub-domain and
      municipality
- [x] Offers from unpublished profiles never appear publicly
- [x] Removing a sub-domain that still has offers is refused, naming them
- [x] Portfolio images survive as offer images with unchanged keys
- [x] `portfolio_items` is dropped and the prune script reports no orphans
- [x] Creatives without offers are still discoverable
- [x] Descriptions containing contact details are flagged, not blocked
- [x] `api.md`, `data-model.md` and `commands.md` updated
- [x] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Record which offer a conversation is about | A nullable `offer_id` on `conversations`. Cheap, and the pre-filled message covers the need for now |
| Full-text search over offers | [ADR 0003](../decisions/0003-postgres-native-search.md) becomes actionable once descriptions exist — this plan is what creates the text worth searching |
| A fairness rule for the directory | One creative posting six offers fills a thin sub-domain. Named in ADR 0022; no rule ships here |
| Cloudflare R2 | ADR 0022 recalculates the ceiling at roughly 140 fully populated profiles, down from 340. This moves R2 from eventually to soon |
| Offer-level availability | "Booked until December" would prevent wasted conversations |
