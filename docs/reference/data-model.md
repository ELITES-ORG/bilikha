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
| `municipality_id` | `uuid` FK | `ON DELETE RESTRICT` |
| `barangay_id` | `uuid` FK null | `ON DELETE SET NULL` |
| `privacy_consent_at` / `terms_accepted_at` | `timestamptz` | |
| `consent_version` | `text` | Bumped when policy text changes |
| `last_login_at` | `timestamptz` null | |
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: unique on `username_normalized`, `email_normalized`, `phone`; index on
`municipality_id`.

---

## `creative_profiles`

Optional 1:1 public profile on a user. Sprint 1 creates rows at
`pending_review` — nothing auto-publishes without phone verification.

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
| `created_at` / `updated_at` | `timestamptz` | |

Indexes: unique on `user_id`, `slug`; `(status, created_at)` for the review queue.

Rejection sets `status` to `suspended` and stores the reason — there is no
separate `rejected` enum value in sprint 1.

---

## `moderation_actions`

Append-only audit of every approve / reject / return-to-pending decision.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK | `ON DELETE CASCADE` |
| `admin_id` | `uuid` FK null | `ON DELETE SET NULL` |
| `action` | enum | `approved` \| `rejected` \| `returned_to_pending` |
| `reason` | `text` null | Required for rejections |
| `created_at` | `timestamptz` | |

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
| `portfolio_items` | Images and links per profile | |
| `inquiries` | Client → creative, sent as a user or an organisation | |
| `subdomain_aliases` | Everyday terms in Waray/Cebuano/Tagalog/English → sub-domain | [Extend the taxonomy](../guides/extend-the-taxonomy.md) |
| `verifications` | Tier, evidence, who approved it | [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) |

Two constraints already settled and worth carrying into the schema:

- A creative may hold **at most 5** sub-domains, exactly **one** marked primary.
- Individual contact details are private by default; visibility is per-field,
  and inquiries proxy rather than exposing a mobile number.
