# Data model

Current tables as implemented. Schema source: `backend/src/db/schema/`.
Migrations: `backend/drizzle/`.

Everything below is reference data. No user or profile tables exist yet.

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
| `display_order` | `integer` | 1–9, mirrors DTI's numbering |
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

## Seeding

`backend/src/db/seed/` — data in `taxonomy-data.ts`, runner in `index.ts`.

The seed is **idempotent**, upserting on `slug` inside one transaction. Safe to
run on every deploy. Correcting a label updates in place rather than orphaning
anything that references it.

---

## Planned

Sketched only. Nothing below is built, and the shapes will change.

| Table | Holds | Decided in |
|---|---|---|
| `users` | Account, auth, private contact | [ADR 0004](../decisions/0004-unified-account-model.md) |
| `creative_profiles` | Optional 1:1 with `users`. The public profile | [ADR 0004](../decisions/0004-unified-account-model.md) |
| `creative_profile_subdomains` | Many-to-many, with one row flagged primary | [ADR 0004](../decisions/0004-unified-account-model.md) |
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
