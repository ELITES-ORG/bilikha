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

---

## `creative_domains`

The nine RA 11904 domains. Seeded, never user-created.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` | **Unique.** Permanent public identifier |
| `name` | `text` | Display label. Freely editable |
| `description` | `text` null | Unused so far |
| `display_order` | `integer` | 1–9, mirrors the statutory numbering |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Indexes: `creative_domains_slug_idx` (unique) on `slug`

---

## `creative_subdomains`

81 rows across the nine domains.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `domain_id` | `uuid` FK → `creative_domains.id` | `ON DELETE CASCADE` |
| `slug` | `text` | **Unique across all domains**, not just within one |
| `name` | `text` | Display label |
| `display_order` | `integer` | Order within its domain |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

Indexes:
- `creative_subdomains_slug_idx` (unique) on `slug`
- `creative_subdomains_domain_idx` on `domain_id`

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
| `avatar_key` | `text` null | Storage object key; one avatar per account |
| `avatar_reviewed_at` | `timestamptz` null | Cleared on upload; set by admin media review |
| `view_mode` | enum | `hiring` \| `creative`; default `hiring`. Flips to `creative` when a profile is created ([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)) |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: unique on `username_normalized`, `email_normalized`, `phone`; index on
`municipality_id`.

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
queue; `edited_since_review_at` for the Edited queue.

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
`npm run media:prune` or by the delete / admin-remove paths. See
[ADR 0022](../decisions/0022-offers-replace-portfolio.md).

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
| `reviewed_at` | `timestamptz` null | Cleared when title, description, or price changes; set by admin media review |
| `flagged_at` | `timestamptz` null | Set when the description matches a contact-details pattern; sorts the review queue, does not hide the offer |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: `(profile_id, sort_order)`, `(subdomain_id, created_at)`, `reviewed_at`.

---

## `offer_images`

Up to four images per offer. Cascade deletes when the offer goes.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `offer_id` | `uuid` FK → `offers.id` | `ON DELETE CASCADE` |
| `object_key` | `text` | Display-size object (`offers/<profileId>/…` or legacy `portfolio/…`) |
| `thumb_key` | `text` | Thumbnail object |
| `sort_order` | `integer` | Default 0 |
| `created_at` | `timestamptz` | |

Indexes: `(offer_id, sort_order)`.

---

## `moderation_actions`

Append-only audit of every approve / reject / return-to-pending / edit
acknowledgement / media-removal decision.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK null | `ON DELETE CASCADE`; null when a client avatar is removed with no creative profile |
| `subject_user_id` | `uuid` FK null → `users.id` | `ON DELETE CASCADE`; set for media removals |
| `admin_id` | `uuid` FK null | `ON DELETE SET NULL` |
| `action` | enum | `approved` \| `rejected` \| `returned_to_pending` \| `acknowledged_edit` \| `media_removed` |
| `reason` | `text` null | Required for rejections |
| `created_at` | `timestamptz` | |

Indexes: `profile_id`, `subject_user_id`, `created_at`.

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
| `budget_min_centavos` / `budget_max_centavos` | `integer` null | Integer centavos; both null = budget on request |
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

---

## Seeding

`backend/src/db/seed/` — data in `taxonomy-data.ts`, runner in `index.ts`,
optional barangay CSV loader in `barangays.ts`.

The seed is **idempotent**, upserting on `slug` inside one transaction. Safe to
run on every deploy. Correcting a label updates in place rather than orphaning
anything that references it.

---

## Planned

Sketched only. Nothing below is built, and the shapes will change.

| Table | Holds | Decided in |
|---|---|---|
| `organizations` | Public pages for companies, cooperatives, LGUs | [ADR 0005](../decisions/0005-organization-pages.md) |
| `organization_members` | Many users per organisation, with roles | [ADR 0005](../decisions/0005-organization-pages.md) |
| `subdomain_aliases` | Everyday terms in Waray/Cebuano/Tagalog/English → sub-domain | [Extend the taxonomy](../guides/extend-the-taxonomy.md) |
| `verifications` | Tier, evidence, who approved it | [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) |

Two constraints already settled and worth carrying into the schema:

- A creative may hold **at most 5** sub-domains, exactly **one** marked primary.
- Individual contact details are private by default; visibility is per-field.
  Messaging is login-gated and stays on-platform until a creative chooses to
  share contact details in a reply.
