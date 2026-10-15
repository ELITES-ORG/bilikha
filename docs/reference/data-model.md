# Data model

Current tables as implemented. Schema source: `backend/src/db/schema/`.
Migrations: `backend/drizzle/`.

Reference data plus auth and profile tables from plan 0001.

---

## Conventions

| | |
|---|---|
| Table names | `snake_case`, plural |
| Column names | `snake_case` in SQL, `camelCase` in Drizzle |
| Primary keys | `uuid` with `defaultRandom()` — not serial, which would leak registration counts |
| Timestamps | `timestamptz`, defaulting to `now()` |
| Slugs | Unique, permanent, public identifiers |

## Extensions

- **`pg_trgm`** — trigram similarity, for typo-tolerant directory search.
  Created by migration `0034` (`CREATE EXTENSION IF NOT EXISTS`; trusted since
  Postgres 13, so the migration role may create it). On Supabase it must live in
  schema `public`, where the migrations expect it.

### Search indexes

Directory search ([ADR 0003](../decisions/0003-postgres-native-search.md),
`backend/src/modules/search/search-sql.ts`) uses two kinds of GIN index. The
query expressions are written exactly as the index expressions are; change one,
change the other.

| Index | Table | Expression |
|---|---|---|
| `offers_search_idx` | `offers` | `to_tsvector('simple', title \|\| ' ' \|\| coalesce(description, ''))` |
| `offers_title_trgm_idx` | `offers` | `title gin_trgm_ops` |
| `creative_profiles_search_idx` | `creative_profiles` | `to_tsvector('simple', coalesce(display_name, '') \|\| ' ' \|\| coalesce(bio, ''))` |
| `creative_profiles_display_name_trgm_idx` | `creative_profiles` | `display_name gin_trgm_ops` |
| `creative_subdomains_search_idx` | `creative_subdomains` | `to_tsvector('simple', name \|\| ' ' \|\| singular_name)` |
| `creative_subdomains_name_trgm_idx` | `creative_subdomains` | `name gin_trgm_ops` |
| `creative_subdomains_singular_name_trgm_idx` | `creative_subdomains` | `singular_name gin_trgm_ops` |
| `users_full_name_trgm_idx` | `users` | `(first_name \|\| ' ' \|\| coalesce(middle_name, '') \|\| ' ' \|\| last_name) gin_trgm_ops` |

They are there for growth. A search ORs conditions across joined tables, so at
today's size Postgres scans the published rows and filters them, which is
fast; the indexes start to pay once a table outgrows that.

---

## `creative_domains`

The nine RA 11904 domains. Seeded into a new environment, then **administered
from `/admin/taxonomy`** — the database is the source of truth and the seed
never overwrites it ([ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` | **Unique.** Permanent public identifier; no write path changes it |
| `name` | `text` | Display label. Edited in the admin area |
| `description` | `text` null | Unused so far |
| `display_order` | `integer` | 1–9, mirrors the statutory numbering |
| `archived_at` | `timestamptz` null | Null = active. Archiving hides it from pickers and browse surfaces; archiving a domain archives its sub-domains |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Indexes:
- `creative_domains_slug_idx` (unique) on `slug`
- `creative_domains_active_idx` on `display_order`, partial `where archived_at is null`

---

## `creative_subdomains`

81 rows across the nine domains.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `domain_id` | `uuid` FK → `creative_domains.id` | `ON DELETE CASCADE` |
| `slug` | `text` | **Unique across all domains**, not just within one |
| `name` | `text` | Display label |
| `singular_name` | `text` | Curated singular label for one offer, posting or creative, e.g. "Mobile App Developer" for "Mobile App Developers" (issue #17). Filled for existing rows by the backfill migration; set in `/admin/taxonomy` |
| `display_order` | `integer` | Order within its domain |
| `archived_at` | `timestamptz` null | Null = active. An archived sub-domain stays selectable in a profile that already holds it, and nowhere else |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Indexes:
- `creative_subdomains_slug_idx` (unique) on `slug`
- `creative_subdomains_domain_idx` on `domain_id`
- `creative_subdomains_active_idx` on `(domain_id, display_order)`, partial
  `where archived_at is null`
- `creative_subdomains_search_idx`, `creative_subdomains_name_trgm_idx`,
  `creative_subdomains_singular_name_trgm_idx` — search
  ([Search indexes](#search-indexes))

Deleting a row is refused by the `ON DELETE RESTRICT` on every referencing
table (`creative_profile_subdomains`, `offers`, `postings`), which is what
makes archiving the removal rather than a convention.

Slug uniqueness is global so a sub-domain can be addressed at
`/creatives/photographers` without its domain in the path.

Current distribution:

| # | Domain | Sub-domains |
|---|---|---|
| 1 | Audiovisual Media | 13 |
| 2 | Digital Interactive Media | 9 |
| 3 | Creative Services | 8 |
| 4 | Design | 11 |
| 5 | Publishing and Print Media | 8 |
| 6 | Performing Arts | 10 |
| 7 | Visual Arts | 8 |
| 8 | Traditional and Cultural Expressions | 8 |
| 9 | Cultural Sites | 6 |

---

## `municipalities`

The eight municipalities of Biliran. Naval is the provincial capital.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` | **Unique** |
| `name` | `text` | |
| `psgc_code` | `text` null | PSA code. Null until sourced officially — not guessed |
| `created_at` | `timestamptz` | |

Indexes: `municipalities_slug_idx` (unique) on `slug`

A lookup table rather than geospatial data is deliberate — see
[ADR 0003](../decisions/0003-postgres-native-search.md).

---

## `barangays`

Roughly 130 barangays across the eight municipalities. Sourced from the PSA
PSGC listing — never invented. The seed loader is a no-op until
`backend/src/db/seed/data/barangays.csv` is present.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `municipality_id` | `uuid` FK → `municipalities.id` | `ON DELETE CASCADE` |
| `slug` | `text` | Unique **per municipality** |
| `name` | `text` | |
| `psgc_code` | `text` null | Official PSA code when available |
| `created_at` | `timestamptz` | |

Indexes:
- `barangays_municipality_slug_idx` (unique) on `(municipality_id, slug)`
- `barangays_municipality_idx` on `municipality_id`

---

## `users`

One account model. Creative profile is an attachable role — see
[ADR 0004](../decisions/0004-unified-account-model.md). Auth is username +
password for sprint 1 ([ADR 0013](../decisions/0013-username-password-auth-sprint-1.md)).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `username` | `text` | Display case as typed |
| `username_normalized` | `text` | Lowercase; unique login key |
| `email` | `text` | Unverified in sprint 1 |
| `email_normalized` | `text` | Lowercase; unique |
| `phone` | `text` | Canonical `+639…`; unique; unverified |
| `password_hash` | `text` | argon2id |
| `first_name` / `middle_name` / `last_name` / `suffix` | `text` | Middle and suffix nullable |
| `birth_date` | `date` | Age gate (RA 10173) |
| `account_type` | enum | `individual` \| `organization`; default `individual` |
| `status` | enum | `active` \| `suspended` |
| `role` | enum | `member` \| `admin`; default `member`. First admin via `admin:grant` |
| `municipality_id` | `uuid` FK null | `ON DELETE RESTRICT`; required for new registrations ([ADR 0020](../decisions/0020-location-required-biliran-only.md)); legacy nulls remain |
| `barangay_id` | `uuid` FK null | `ON DELETE SET NULL`; required for new registrations with municipality |
| `privacy_consent_at` / `terms_accepted_at` | `timestamptz` | |
| `consent_version` | `text` | Bumped when policy text changes |
| `last_login_at` | `timestamptz` null | |
| `must_change_password` | `boolean` | Default false. Set by an administrator's password reset; while true `requireAuth` refuses every route but `GET /auth/me` and `POST /me/password` ([ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md)) |
| `avatar_key` | `text` null | Storage object key of the approved photo, the one everyone sees |
| `avatar_pending_key` | `text` null | A new photo waiting for review, seen only by its owner; replaces `avatar_key` when approved ([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)) |
| `avatar_rejection_reason` | `text` null | Why the last new photo was not approved; cleared by the next upload |
| `avatar_reviewed_at` | `timestamptz` null | Kept but no longer read since ADR 0058 |
| `view_mode` | enum | `hiring` \| `creative`; default `hiring`. Flips to `creative` when a profile is created ([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)) |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: unique on `username_normalized`, `email_normalized`, `phone`; index on
`municipality_id`; `users_full_name_trgm_idx` for search
([Search indexes](#search-indexes)).

---

## `creative_profiles`

Optional 1:1 public profile on a user. Created later via `POST /me/profile`
(not at registration) at `pending_review` — nothing auto-publishes without
phone verification.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | Unique; `ON DELETE CASCADE` |
| `slug` | `text` | Unique public URL segment; seeded from username |
| `display_name` / `bio` | `text` null | |
| `status` | enum | `draft` \| `pending_review` \| `published` \| `suspended` |
| `rejection_reason` | `text` null | Shown to the registrant after rejection |
| `reviewed_at` | `timestamptz` null | |
| `reviewed_by` | `uuid` FK null → `users.id` | `ON DELETE SET NULL` |
| `contact_preference` | `text` | Default `phone`; channel revealed when the creative responds to an inquiry |
| `edited_since_review_at` | `timestamptz` null | Set when a published profile's public fields change; cleared when an admin acknowledges the edit |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: unique on `user_id`, `slug`; `(status, created_at)` for the review
queue; `edited_since_review_at` for the Edited queue; two for search
([Search indexes](#search-indexes)).

Rejection sets `status` to `suspended` and stores the reason — there is no
separate `rejected` enum value in sprint 1.

Public edits never unpublish a profile (ADR 0016). Published profiles remain
published and set `edited_since_review_at`; suspended profiles return to
`pending_review`; draft and pending profiles retain their status. Private-only
changes such as `contact_preference` do not set the flag.

---

## `offers`

Up to six service listings per creative profile. Cascade deletes when the
profile goes. Storage objects under `offer_images` are cleaned by
`npm run media:prune`, by deleting an offer or photo, or by a review decision.
See [ADR 0022](../decisions/0022-offers-replace-portfolio.md).

Only `published` offers are public ([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)). A change to a published offer
waits in `offer_revisions` and leaves the published values as they are.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK → `creative_profiles.id` | `ON DELETE CASCADE` |
| `subdomain_id` | `uuid` FK → `creative_subdomains.id` | `ON DELETE RESTRICT`; must be registered on the profile (enforced in the service) |
| `title` | `text` | |
| `description` | `text` null | |
| `price_min_centavos` | `integer` null | Integer centavos; null with no max → "Price on request" |
| `price_max_centavos` | `integer` null | Minimum alone renders "from ₱X" |
| `sort_order` | `integer` | Default 0 |
| `status` | `offer_status` | `pending_review` \| `published` \| `rejected`. Default `pending_review`. Editing a rejected offer returns it to `pending_review` |
| `rejection_reason` | `text` null | Why a new offer was not approved; shown to its creative |
| `revision_rejection_reason` | `text` null | Why the last change to a published offer was not approved; cleared by the next edit |
| `reviewed_at` | `timestamptz` null | Set when an administrator approves the offer or a change to it |
| `flagged_at` | `timestamptz` null | Set when the description matches a contact-details pattern; sorts the review queue |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: `(profile_id, sort_order)`, `(subdomain_id, created_at)`, `reviewed_at`,
`status`; two for search ([Search indexes](#search-indexes)).

---

## `offer_revisions`

A change to a published offer, waiting for review. At most one per offer:
editing again overwrites it, and an edit back to the published values deletes
it. Approval copies it onto `offers` and deletes it. Rejection deletes it.

| Column | Type | Notes |
|---|---|---|
| `offer_id` | `uuid` PK, FK → `offers.id` | `ON DELETE CASCADE` |
| `subdomain_id` | `uuid` FK → `creative_subdomains.id` | `ON DELETE RESTRICT` |
| `title` | `text` | |
| `description` | `text` null | |
| `price_min_centavos` / `price_max_centavos` | `integer` null | As on `offers` |
| `flagged_at` | `timestamptz` null | As on `offers`, for the proposed description |
| `submitted_at` | `timestamptz` | Default now; the time of the latest edit |

---

## `offer_images`

An offer's photos, audio, video and PDFs. Per offer: up to ten images, five
audio, two videos and three PDFs (`UPLOAD_LIMITS` in
`backend/src/modules/media/media.limits.ts`). Cascade deletes when the offer
goes.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `offer_id` | `uuid` FK → `offers.id` | `ON DELETE CASCADE` |
| `object_key` | `text` | Display-size object (`offers/<profileId>/…` or legacy `portfolio/…`) |
| `thumb_key` | `text` null | An image's thumbnail or a video's poster. Audio, a PDF and a video without a poster have none. An image always has one (check `offer_images_image_has_thumb`) |
| `sort_order` | `integer` | Default 0 |
| `state` | `offer_image_state` | `live` \| `pending_add` \| `pending_remove`. Default `live`. On a published offer, a new photo is `pending_add` (not public) and a removed one `pending_remove` (still public) until the change is reviewed |
| `kind` | `media_kind` | `image` \| `audio` \| `video` \| `document`. Default `image`. Every row from before the upload pipeline is an image |
| `mime_type` | `text` null | Normalised stored type (`audio/x-m4a` is stored as `audio/mp4`). Null on images from before the pipeline |
| `size_bytes` | `bigint` null | The file plus its thumbnail or poster, as stored. Counts toward the 1 GB quota; null (counted as 0) on images from before the pipeline |
| `duration_seconds` | `integer` null | Audio and video, whole seconds rounded up |
| `title` | `text` null | The uploader's label for audio, video or a PDF |
| `created_at` | `timestamptz` | |

Indexes: `(offer_id, sort_order)`. Check `offer_images_image_has_thumb`:
`kind <> 'image' OR thumb_key IS NOT NULL`.

The readers of photos (offer cards, the offer and profile pages, saved offers,
conversation offer cards, the review queue's photos) read `kind = 'image'` rows
only. The offer page and the owner's list return the other kinds as `media`.

**Buckets.** `object_key` lives in the bucket for its `kind`: `image` in
`SUPABASE_STORAGE_BUCKET` (today `media`), `audio` in `media-audio`, `video` in
`media-video`, `document` in `media-documents`. A `thumb_key` — an image's
thumbnail or a video's poster — is always in the image bucket, beside avatars and
organisation logos. ID photos are in their own private bucket and never in these
four. `npm --prefix backend run media:buckets` keeps each bucket's size limit and
allowed types in line with the upload limits.

---

## `media_uploads`

An upload ticket that has been issued and not yet attached
([ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md)).
It reserves its kind's largest size against the uploader's quota, and counts
toward the target's per-kind limit, until it is attached, abandoned, or expires
after 24 hours. A message's reservations count toward its five files and no
quota ([ADR 0060](../decisions/0060-message-files-are-private-and-photos-audio-video-expire.md)). Attaching deletes it. `media:prune -- --delete` removes expired
rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `destination` | `upload_destination` | `offer` or `message` |
| `offer_id` | `uuid` FK null → `offers.id` | `ON DELETE CASCADE`. Required when `destination` is `offer` |
| `conversation_id` | `uuid` FK null → `conversations.id` | `ON DELETE CASCADE`. Required when `destination` is `message` |
| `kind` | `media_kind` | |
| `bucket` | `text` | The main file's bucket |
| `object_key` | `text` | The main file; for an image, the display image |
| `thumb_key` | `text` null | An image's thumbnail or a video's poster. Always in its destination's image bucket |
| `mime_type` | `text` | Normalised declared type. Verification requires the stored object to match it |
| `size_bytes` | `bigint` | Declared size of the main file. Verification requires the stored object to match it |
| `thumb_size_bytes` | `integer` null | Declared size of the thumbnail or poster |
| `duration_seconds` | `integer` null | Audio and video, whole seconds rounded up |
| `reserved_bytes` | `bigint` | Counted against the quota while the row lives |
| `expires_at` | `timestamptz` | Issue time plus 24 hours |
| `created_at` | `timestamptz` | |

Checks: `media_uploads_offer_has_offer_id` (`destination <> 'offer' OR offer_id IS NOT NULL`);
`media_uploads_message_has_conversation_id` (`destination::text <> 'message' OR conversation_id IS NOT NULL`,
compared as text because Postgres refuses a new enum value in the transaction that added it).
Indexes: unique `object_key`; `(user_id, expires_at)`; `(offer_id, kind)`; `(conversation_id, user_id)`.

---

## `moderation_actions`

Append-only audit of every approve / reject / return-to-pending / edit
acknowledgement / media-removal decision.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK null | `ON DELETE CASCADE`; null when a client avatar is removed with no creative profile |
| `subject_user_id` | `uuid` FK null → `users.id` | `ON DELETE CASCADE`; set for media removals, and to the founder for an organisation decision |
| `organization_id` | `uuid` FK null → `organizations.id` | `ON DELETE SET NULL`; set when the decision was about an organisation page, so the audit outlives a closed organisation |
| `admin_id` | `uuid` FK null | `ON DELETE SET NULL` |
| `action` | enum | `approved` \| `rejected` \| `returned_to_pending` \| `acknowledged_edit` \| `media_removed` \| `account_suspended` \| `account_reinstated` \| `rating_removed` \| `password_reset` \| `id_viewed` \| `id_verified` \| `id_declined_retry` \| `id_declined_final` \| `id_decision_reversed` \| `id_appeal_granted` \| `id_appeal_upheld` |
| `reason` | `text` null | Required for rejections |
| `id_verification_id` | `uuid` FK null → `id_verifications.id` | `ON DELETE SET NULL`. Set for the `id_*` actions, so which IDs an administrator viewed or decided is a join, not a search of `reason` |
| `offer_id` | `uuid` FK null → `offers.id` | `ON DELETE SET NULL`. Set when an offer or a change to one was approved or rejected |
| `created_at` | `timestamptz` | |

Indexes: `profile_id`, `subject_user_id`, `organization_id`, `id_verification_id`, `offer_id`, `created_at`.

---

## `id_verifications`

One row per ID submission by an account registered after ID verification
switches on ([ADR 0057](../decisions/0057-new-accounts-are-verified-with-a-biliran-id.md),
[plan 0053](../plans/0053-id-verification-for-new-accounts.md)). An account's
state is its **latest** row. **No row means not required**, which is every
account that existed before — nothing may treat "no row" as pending. A
resubmission after *try again* is a new row with its own decision and its own
7 days. Registration writes the first row, `pending` and unsubmitted, in the
same transaction as the account (plan 0053 Phase 5).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `status` | enum | `pending` \| `verified` \| `declined_retry` \| `declined_final` \| `appealed` (a *not from Biliran* decline whose appeal is open). Default `pending` |
| `id_type` | `text` null | A slug from `IdType` in `contracts/verification.ts`. Text, not an enum: the accepted list is the issue's and will change |
| `front_key` / `back_key` | `text` null | Object keys in the **private** ID bucket (`SUPABASE_ID_BUCKET`), under `ids/<user_id>/`. `back_key` null for a single-page document. Never returned by a non-admin endpoint, never logged |
| `id_consent_at` | `timestamptz` null | When the person agreed to the ID consent sentence, separate from the privacy consent on `users` |
| `submitted_at` | `timestamptz` null | Null while the open row waits for photos |
| `decided_at` | `timestamptz` null | The **latest** decision: first decision, reversal or appeal outcome. The 7 days run from it |
| `images_deleted_at` | `timestamptz` null | Set by the sweep once both objects are gone |
| `reviewed_by` | `uuid` FK null → `users.id` | `ON DELETE SET NULL` |
| `decision_reason` | `text` null | Shown to the person when declined |
| `id_number_hash` | `text` null | HMAC-SHA256 hex of the ID number an administrator typed, keyed with `ID_HASH_SECRET`. Never the number. Outlives the images |
| `id_number_absent` | `boolean` | Default false. The administrator found no number on the ID |
| `appeal_message` | `text` null | The person's one appeal against a *not from Biliran* decline, 20–1000 characters |
| `appealed_at` / `appeal_decided_at` | `timestamptz` null | When the appeal was made, and answered. Either one set closes the appeal: there is only one per decision |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes:
- `id_verifications_user_created_idx` on `(user_id, created_at)` — the latest
  row, read by the browse-only gate
- `id_verifications_queue_idx` on `submitted_at`, partial
  `where status in ('pending', 'appealed') and submitted_at is not null`
- `id_verifications_sweep_idx` on `decided_at`, partial
  `where images_deleted_at is null`
- `id_verifications_one_open_idx` (unique) on `user_id`, partial
  `where status = 'pending'` — one open submission per account
- `id_verifications_id_number_hash_idx` on `id_number_hash`, partial
  `where id_number_hash is not null`

---

## `taxonomy_changes`

Append-only audit of every administrator change to the creative taxonomy. Rows
are never updated or deleted.

It exists because of
[ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md):
once the database rather than `taxonomy-data.ts` owns the labels, "who renamed
this and when" has no answer in `git log`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `item_kind` | enum | `domain` \| `subdomain` |
| `item_slug` | `text` | **Text, not a foreign key** — the history outlives a deleted item |
| `action` | enum | `created` \| `updated` \| `archived` \| `restored` \| `deleted` |
| `admin_id` | `uuid` FK null → `users.id` | `ON DELETE SET NULL`, so the history survives the account |
| `before` | `jsonb` null | The changed fields only, as they were |
| `after` | `jsonb` null | The changed fields only, as they became |
| `created_at` | `timestamptz` | |

Indexes: `(item_kind, item_slug)`, `created_at`.

The row and the change it records are written in one transaction — a change
with no audit row is the failure this table exists to prevent.

---

## `subdomain_aliases`

Everyday words a sub-domain is also searched by (issue #24) — Waray, Cebuano,
Tagalog, English, and the misspellings people type. Administrators add them in
the admin area; nothing is seeded. An alias is never shown on a card.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `subdomain_id` | `uuid` FK → `creative_subdomains.id` | `ON DELETE CASCADE` — an alias means nothing without its sub-domain |
| `term` | `text` | Folded: lowercase, accents removed, single spaces (`normalizeTerm`) |
| `created_at` | `timestamptz` | |

Indexes: `(subdomain_id, term)` unique — the same term may sit on two
sub-domains, but not twice on one; `term`.

---

## `search_misses`

Searches that found nothing, counted (issue #24). Deliberately a count, not a
log: there is no user, session, address or time of day, so a row cannot be tied
to whoever searched.

| Column | Type | Notes |
|---|---|---|
| `term` | `text` | The search's words, lowercased and joined by a space |
| `listing` | `text` | `offers` or `creatives` |
| `day` | `date` | |
| `count` | `integer` | Default 1; incremented each time the word misses again that day |

Primary key `(term, listing, day)`; index on `day`. Rows older than 90 days are
deleted each time a miss is counted. At most 1,000 new rows a day
(`DAILY_NEW_TERMS_MAX`): search is public and not rate-limited, so a script
searching random words cannot fill the table. A word already counted that day
keeps counting past the ceiling.

---

## `creative_profile_subdomains`

Many-to-many, capped at five in application code, with at most one primary
enforced by a partial unique index.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK | `ON DELETE CASCADE` |
| `subdomain_id` | `uuid` FK | `ON DELETE RESTRICT` |
| `is_primary` | `boolean` | Default false |
| `created_at` | `timestamptz` | |

Indexes: unique on `(profile_id, subdomain_id)`; partial unique
`cps_one_primary_per_profile_idx` on `profile_id WHERE is_primary`.

---

## `conversations`

Two-party thread between a client and a creative profile
([ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md)).
Exactly one conversation per `(profile_id, client_user_id)`. Offers attach to
**messages**, not to the conversation
([ADR 0024](../decisions/0024-offers-attach-to-messages.md)). There is no
`subject` or `offer_id` on this table.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK → `creative_profiles.id` | `ON DELETE CASCADE` |
| `creative_user_id` | `uuid` FK → `users.id` | Denormalised from the profile |
| `client_user_id` | `uuid` FK → `users.id` | |
| `last_message_at` | `timestamptz` | Denormalised for the thread list |
| `client_last_read_at` / `creative_last_read_at` | `timestamptz` null | Per-side read cursors |
| `created_at` | `timestamptz` | |

Indexes: unique `(profile_id, client_user_id)`;
`(creative_user_id, last_message_at)`; `(client_user_id, last_message_at)`.

## `messages`

Append-only bodies in a conversation. Never edited or deleted in this model.
Optional `offer_id` / `posting_id` are set at insert and only nulled when the
listing is deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `conversation_id` | `uuid` FK → `conversations.id` | `ON DELETE CASCADE` |
| `sender_user_id` | `uuid` FK → `users.id` | |
| `body` | `text` | |
| `offer_id` | `uuid` FK → `offers.id` null | Optional; `ON DELETE SET NULL` so deleting a listing keeps the message |
| `posting_id` | `uuid` FK → `postings.id` null | Optional; mirror of `offer_id` for creatives replying to client work ([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)); `ON DELETE SET NULL` |
| `agreement_id` | `uuid` FK → `agreements.id` null | Optional; third attachment column for a work agreement ([ADR 0029](../decisions/0029-work-agreements-not-invoices.md)); `ON DELETE SET NULL`. Do not add a fourth without revisiting that decision |
| `created_at` | `timestamptz` | |

Indexes: `(conversation_id, created_at)`; `messages_offer_idx` on `(offer_id)`;
`messages_posting_idx` on `(posting_id)`; `messages_agreement_idx` on `(agreement_id)`.

## `message_attachments`

Files a message owns, at most five ([ADR 0060](../decisions/0060-message-files-are-private-and-photos-audio-video-expire.md)). They live in the private
message buckets and are read only through short signed URLs. Photos, audio and
video stop opening at `expires_at`; a PDF has none.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `message_id` | `uuid` FK → `messages.id` | `ON DELETE CASCADE` |
| `kind` | `media_kind` | |
| `object_key` | `text` | Unique. In the kind's private message bucket |
| `thumb_key` | `text` null | An image's thumbnail or a video's poster, in the private message image bucket |
| `mime_type` | `text` | |
| `size_bytes` | `bigint` | The file plus its thumbnail or poster, as stored |
| `duration_seconds` | `integer` null | Audio and video |
| `expires_at` | `timestamptz` null | `created_at` plus 30 days for photos, audio and video; null for a PDF |
| `file_deleted_at` | `timestamptz` null | When the sweep deleted the object |
| `created_at` | `timestamptz` | |

Indexes: unique `object_key`; `message_id`; `expires_at` where `file_deleted_at is null and expires_at is not null`.

## `agreements`

A priced package proposed in a conversation. The document status (`sent` /
`accepted` / `superseded` / `withdrawn`) is stored; the engagement lifecycle
state, the money total, and the end date are **not** — they are derived on read
([ADR 0029](../decisions/0029-work-agreements-not-invoices.md)). An accepted row
is frozen by a database trigger as well as the service.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `conversation_id` | `uuid` FK → `conversations.id` | `ON DELETE CASCADE` |
| `issued_by_user_id` | `uuid` FK → `users.id` | Always the creative; `ON DELETE RESTRICT` |
| `version` | `integer` | From 1; check `> 0` |
| `supersedes_id` | `uuid` FK → `agreements.id` null | Predecessor; `ON DELETE SET NULL` |
| `package_title` | `text` | |
| `notes` | `text` null | |
| `start_date` | `date` | |
| `duration_days` | `integer` | Check `> 0`. End date = start + duration |
| `status` | enum | `sent` \| `accepted` \| `superseded` \| `withdrawn` |
| `revision_note` | `text` null | Client's words when asking for changes |
| `revision_requested_at` | `timestamptz` null | |
| `created_at` | `timestamptz` | |

Indexes: `(conversation_id, created_at)`.

## `agreement_line_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `agreement_id` | `uuid` FK → `agreements.id` | `ON DELETE CASCADE` |
| `description` | `text` | |
| `price_centavos` | `integer` | Non-negative check; money is integer centavos |
| `sort_order` | `integer` | Default 0 |

Indexes: `(agreement_id, sort_order)`.

## `agreement_acceptances`

Who accepted what, and a SHA-256 of the exact terms they saw. One row per
agreement — unique on `agreement_id`. Never stores password material.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `agreement_id` | `uuid` FK → `agreements.id` | Unique; `ON DELETE CASCADE` |
| `accepted_by_user_id` | `uuid` FK → `users.id` | `ON DELETE RESTRICT` |
| `content_hash` | `text` | SHA-256 hex of canonical content |
| `accepted_at` | `timestamptz` | |

## `agreement_events`

Append-only engagement moves after acceptance. The accepted agreement row never
changes again; everything afterwards is a new event
([ADR 0029](../decisions/0029-work-agreements-not-invoices.md)).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `agreement_id` | `uuid` FK → `agreements.id` | `ON DELETE CASCADE` |
| `actor_user_id` | `uuid` FK → `users.id` | Who did it; `ON DELETE RESTRICT` |
| `type` | enum | `started` \| `delivery_marked` \| `completion_confirmed` \| `cancelled` |
| `note` | `text` null | Required by the service for `cancelled` |
| `created_at` | `timestamptz` | |

Indexes: `(agreement_id, created_at)`.

## `ratings`

One opinion per completed agreement, by the client on that agreement
([ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md)). No
`profile_id` — the creative is reached through
`agreement → conversation → profile`. No stored average or count; both are
derived on read and exclude suspended raters ([ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `agreement_id` | `uuid` FK → `agreements.id` | Unique; `ON DELETE CASCADE` |
| `rater_user_id` | `uuid` FK → `users.id` | The client; `ON DELETE RESTRICT` |
| `stars` | `integer` | Check between 1 and 5 |
| `comment` | `text` null | Capped at 500 in the API schema |
| `created_at` / `updated_at` | `timestamptz` | Edit/delete allowed for 14 days from `created_at` (service, not a trigger) |

Indexes: unique `(agreement_id)`; `(rater_user_id)`.

## `rating_reports`

A creative's appeal of a rating on their profile. Modelled on
`conversation_reports`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `rating_id` | `uuid` FK → `ratings.id` | `ON DELETE CASCADE` |
| `reporter_user_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `reason` | `text` | |
| `status` | enum | Reuses `report_status`: `open` \| `reviewed` \| `dismissed` |
| `created_at` | `timestamptz` | |

Indexes: `(status, created_at)`.

## `postings`

Work a client wants done. Live on publish, reviewed after; expire by
`expires_at` without a background job
([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)).

Unlike an offer, the sub-domain is **not** constrained to anything the poster
registered — a client is not a creative.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | The client; `ON DELETE CASCADE` |
| `subdomain_id` | `uuid` FK → `creative_subdomains.id` | Any of the 81; `ON DELETE RESTRICT` |
| `municipality_id` | `uuid` FK → `municipalities.id` | Where the work is; `ON DELETE RESTRICT` |
| `title` | `text` | |
| `description` | `text` null | Contact-detail patterns set `flagged_at` (advisory) |
| `budget_min_centavos` / `budget_max_centavos` | `integer` null | Integer centavos; both null renders "Budget not given" (`formatBudgetRange`) |
| `status` | enum | `open` \| `closed` \| `expired`; default `open` |
| `expires_at` | `timestamptz` | Feed excludes rows with `expires_at <= now()` |
| `reviewed_at` / `flagged_at` | `timestamptz` null | |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: `(user_id, created_at)`; `(subdomain_id, status, expires_at)` for the
creative feed; `(reviewed_at)`.

## `saved_offers`

Client bookmarks on offers. Saving twice cannot duplicate.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `offer_id` | `uuid` FK → `offers.id` | `ON DELETE CASCADE` |
| `created_at` | `timestamptz` | |

Indexes: unique `(user_id, offer_id)`; `(user_id, created_at)`.

## `conversation_reports`

Participant reports a conversation for later admin review. No auto-action.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `conversation_id` | `uuid` FK → `conversations.id` | |
| `reporter_user_id` | `uuid` FK → `users.id` | Must be a participant |
| `reason` | `text` | |
| `status` | enum | `open` \| `reviewed` \| `dismissed` |
| `created_at` | `timestamptz` | |

Index: `(status, created_at)`.

## `user_blocks`

Directional. A blocks B stops B starting or continuing a conversation with A;
it does not stop A messaging B. Mutual blocking is two rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `blocker_user_id` | `uuid` FK → `users.id` | |
| `blocked_user_id` | `uuid` FK → `users.id` | |
| `created_at` | `timestamptz` | |

Unique index on `(blocker_user_id, blocked_user_id)`.

---

## `sessions`

Backing store for `express-session`. Visible and migrated like every other
table.

| Column | Type | Notes |
|---|---|---|
| `sid` | `text` PK | |
| `data` | `text` | JSON session payload |
| `expires_at` | `timestamptz` | Indexed for prune |
| `user_id` | `uuid` FK null → `users.id` | `ON DELETE CASCADE`, indexed. Denormalised out of `data` so revoking every session an account holds is one delete ([ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md)). Null until the session carries a signed-in user. Written on `set` and on `touch`; migration `0028` backfilled sessions that predate it |

---

## `organizations`

A team of creatives with a public page
([ADR 0005](../decisions/0005-organization-pages.md),
[ADR 0054](../decisions/0054-organisations-are-teams-of-creatives.md)). **Not an
account type** — nobody signs in as one, and `users.account_type` is not used
for it. Shaped after `creative_profiles` so it joins the existing review queue.

There is **no founder column**. The founder is a row in `organization_members`,
so handing the role over is one write rather than two that can disagree.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` | **Unique.** A public URL — permanent, for the reason ADR 0049 gives for taxonomy slugs |
| `name` | `text` | |
| `bio` | `text` null | |
| `logo_key` | `text` null | Storage key of the approved logo, as `users.avatar_key`: `organizations/<id>/<uuid>.webp`. Closing deletes it |
| `logo_pending_key` | `text` null | A new logo waiting for review, uploaded by the founder or a co-founder; replaces `logo_key` when approved |
| `logo_rejection_reason` | `text` null | Why the last new logo was not approved; cleared by the next upload |
| `logo_reviewed_at` | `timestamptz` null | Kept but no longer read since ADR 0058 |
| `municipality_id` | `uuid` FK → `municipalities.id` | `ON DELETE RESTRICT` |
| `status` | `organization_status` | `pending_review` \| `published` \| `rejected` \| `suspended`. Default `pending_review` |
| `rejection_reason` | `text` null | Shown to the founder verbatim |
| `reviewed_at` | `timestamptz` null | |
| `reviewed_by` | `uuid` FK null → `users.id` | `ON DELETE SET NULL` |
| `edited_since_review_at` | `timestamptz` null | A public edit on a published page; [ADR 0016](../decisions/0016-edits-never-unpublish.md) |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: `slug` (unique), `(status, created_at)`.

**Why its own status enum** rather than `profile_status`: profiles record a
rejection as `suspended` plus a reason. For an organisation those must behave
differently — a **rejected** page stops counting toward the five-organisation
cap so the founder can submit a new one, while an organisation **suspended** for
abuse keeps counting, or suspension becomes a way to spin up a replacement.

---

## `organization_members`

Who is in a team. A row exists only after somebody founds the organisation or
accepts an invitation — nobody is listed on a public page without consenting to
it (RA 10173).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations.id` | `ON DELETE CASCADE` |
| `user_id` | `uuid` FK → `users.id` | **`ON DELETE RESTRICT`** — see below |
| `role` | `organization_role` | `founder` \| `co_founder` \| `member` |
| `title` | `text` null | Free text — "QA", "Full-stack developer". Job titles are not taxonomy |
| `joined_at` | `timestamptz` | |

Indexes:
- `(organization_id, user_id)` unique — nobody twice in one team
- `organization_id` unique **where `role = 'founder'`** — at most one founder,
  held by the database rather than by service code
- `user_id` — keeps the five-organisation cap count an index lookup

**`user_id` is `RESTRICT` on purpose.** There is no account-deletion feature
yet, so ADR 0054's rule that a founder hands over before deleting their account
has no flow to attach to. With `CASCADE`, deleting a founder at the database
would leave an organisation with no founder. `RESTRICT` makes that impossible:
nobody in an organisation can be deleted until they have left it. Whatever
deletion flow is built later must take a person out of their organisations
first, which ADR 0054 requires anyway.

The five-organisation cap counts **memberships**, never invitations, and
excludes organisations whose status is `rejected`. It is a service rule.

---

## `organization_invitations`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations.id` | `ON DELETE CASCADE` |
| `invited_user_id` | `uuid` FK → `users.id` | `ON DELETE CASCADE` |
| `invited_by` | `uuid` FK null → `users.id` | `ON DELETE SET NULL` — the record survives the inviter |
| `role` | `organization_role` | `co_founder` or `member`; never `founder`, which is founded or handed over. **Check constraint** `organization_invitations_not_founder` |
| `title` | `text` null | |
| `created_at` | `timestamptz` | |
| `expires_at` | `timestamptz` | Seven days after sending |
| `accepted_at` | `timestamptz` null | |
| `declined_at` | `timestamptz` null | |

Indexes: `(organization_id, invited_user_id)` unique **where `accepted_at` and
`declined_at` are both null** — one unanswered invitation per person per
organisation; `invited_user_id`.

Check constraints: `organization_invitations_one_answer` — `accepted_at` and
`declined_at` are never both set; `organization_invitations_not_founder` — no
invitation into the founder role.

**Expiry is computed, not stored.** An invitation expires on its own seven days
after sending: `expires_at < now()` is checked when it is read, so there is no
scheduled job.

**Re-inviting after expiry must update the row, not insert one.** `now()` is not
allowed in an index predicate, so the pending index cannot see expiry and an
expired, unanswered invitation still occupies the slot. A second insert fails
with a unique violation; refreshing the existing row's `expires_at` is the
supported path. `organizations.integrity.test.ts` pins this behaviour.

---

## `organization_subdomains`

What the organisation does. Mirrors `creative_profile_subdomains` exactly.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations.id` | `ON DELETE CASCADE` |
| `subdomain_id` | `uuid` FK → `creative_subdomains.id` | `ON DELETE RESTRICT` |
| `is_primary` | `boolean` | Default false |
| `created_at` | `timestamptz` | |

Indexes: `(organization_id, subdomain_id)` unique; `organization_id` unique
where `is_primary` — one primary; `subdomain_id`.

The caps — **one or two** domains, **up to five** sub-domains — are service
rules, not constraints. They are counts across rows, and a check constraint
would fight an administrator correcting data.

---

## `retired_organization_slugs`

Slugs of organisations that have been closed. A founder alone closes an
organisation by leaving, which deletes its row; without this table the next
organisation of the same name would take the same slug and answer every link
shared for the old one. Written in the same transaction as the delete, and
treated as taken when a slug is chosen.

| Column | Type | Notes |
|---|---|---|
| `slug` | `text` PK | The closed organisation's slug, never handed out again |
| `retired_at` | `timestamptz` | Default `now()` |

Only the slug is kept: who the team was goes with the organisation, which is
what closing it means.

---

## Seeding

`backend/src/db/seed/` — data in `taxonomy-data.ts`, runner in `index.ts`,
optional barangay CSV loader in `barangays.ts`.

The seed is **idempotent** and runs inside one transaction. Render's build
command runs it on every backend deploy.

- **Creative taxonomy: insert-only.** A missing slug is inserted; an existing
  one is left exactly as it is, including its label and its `archived_at`. An
  upsert here would silently revert every administrator edit on the next
  deploy ([ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)).
  `taxonomy-data.ts` is therefore what a *new* environment starts from, not a
  description of production.
- **Municipalities and barangays: still upserted on slug.** Nobody edits those
  in the admin area and Biliran's eight do not change.

---

## Planned

Sketched only. Nothing below is built, and the shapes will change.

| Table | Holds | Decided in |
|---|---|---|
| `subdomain_aliases` | Everyday terms in Waray/Cebuano/Tagalog/English → sub-domain | [Extend the taxonomy](../guides/extend-the-taxonomy.md) |
| `verifications` | Tier, evidence, who approved it | [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) |

Two constraints already settled and worth carrying into the schema:

- A creative may hold **at most 5** sub-domains, exactly **one** marked primary.
- Individual contact details are private by default; visibility is per-field.
  Messaging is login-gated and stays on-platform until a creative chooses to
  share contact details in a reply.
