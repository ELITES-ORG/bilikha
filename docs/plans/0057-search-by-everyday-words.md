# 0057. Search by everyday words

- **Status:** In progress
- **Owner:** userMarcPaul
- **Related:** [ADR 0003](../decisions/0003-postgres-native-search.md) (amended) ·
  [plan 0054](./0054-search.md) · [Extend the taxonomy](../guides/extend-the-taxonomy.md) ·
  [constraints](../explanation/constraints.md) ·
  [issue #24](https://github.com/ELITES-ORG/bilikha/issues/24)

## Goal

A woodcarver in Culaba who searches `nagkukulit` finds the woodcarvers. An
administrator attaches everyday words — Waray, Cebuano, Tagalog, English,
misspellings — to a sub-domain in the admin area, and directory search matches
them. Every search that finds nothing is counted by word and day, and the
admin area lists the most common, so the missing words show themselves.

## Decisions

#24 left two questions open. userMarcPaul settled them on 2026-10-12:

| Question | Answer |
|---|---|
| Where are aliases maintained? | **In the admin area**, beside each sub-domain in Taxonomy, so a missing word never needs a deploy. |
| Who supplies the first terms? | **Nobody yet — it ships empty.** Administrators add terms as the unmatched-search count shows what people type. No list is machine-generated (the rule of [ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md) §4, applied to search words). |

The design choices are recorded as an amendment to ADR 0003, as plan 0054's
were.

## Scope

**In scope**
- `subdomain_aliases`: many terms to one sub-domain, the same term allowed on
  two sub-domains, stored normalised (lowercase, accents folded).
- Search matches a word against aliases — by prefix and by typo, like a
  sub-domain's own name — for offers and creatives.
- `search_misses`: searches with no results, counted per word, listing and day,
  with no link to who searched; kept 90 days.
- Admin: add and remove aliases per sub-domain, audited in `taxonomy_changes`;
  the most common unmatched searches.
- A sentence in the privacy notice saying unmatched searches are counted.

**Out of scope** — and where it is handled instead
- A starter alias list — added by administrators over time.
- Folding accents in fields other than aliases — ADR 0003 keeps `unaccent`
  deferred.
- Adding an alias straight from an unmatched search — a follow-up.

## Prerequisites

- Search exists: plan 0054, merged as #77.
- The local database is migrated: `npm --prefix backend run db:migrate`.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Data and matching | 0 / 3 | Not started |
| 2. Admin | 0 / 2 | Not started |
| 3. Records | 0 / 2 | Not started |

---

## Phase 1 — Data and matching

### Step 1.1 — The tables

- [ ] **Action.** `subdomainAliases` and `searchMisses` in
  `backend/src/db/schema/taxonomy.ts`; `npm --prefix backend run db:generate`.
- [ ] **Verify.** The migration is two `CREATE TABLE`s, their indexes and the
  foreign key, and no `DROP`.

### Step 1.2 — Aliases in search

- [ ] **Action.** `normalizeTerm` in `modules/search/search-sql.ts`; a word
  also matches an alias of the offer's sub-domain, or of any of a creative's.
- [ ] **Verify.** `search.test.ts`: an alias finds a creative and an offer; by
  prefix, with accents folded, and misspelt; the same term on two sub-domains;
  an alias of a sub-domain the creative does not have does not match; aliases
  never bring back unpublished or suspended rows.

### Step 1.3 — Counting unmatched searches

- [ ] **Action.** `modules/search/search-misses.ts`: `recordMiss` from both
  listings when `q` is set, it is page 1 and nothing matched; `topMisses`.
- [ ] **Verify.** `search-misses.test.ts`: counts once per word, listing and
  day, and increments; never when something matched, on page 2 or without
  `q`; rows past 90 days go; the table has no column naming a person.

## Phase 2 — Admin

### Step 2.1 — The API

- [ ] **Action.** `POST /admin/taxonomy/subdomains/:slug/aliases`,
  `DELETE /admin/taxonomy/aliases/:id`, aliases in `GET /admin/taxonomy`,
  `GET /admin/search-misses`.
- [ ] **Verify.** `taxonomy.test.ts`: added normalised; a duplicate is 409; an
  empty term is 400; each writes a `taxonomy_changes` row; a non-admin gets 404.

### Step 2.2 — The screen

- [ ] **Action.** Admin → Taxonomy: an aliases editor on each sub-domain and a
  "Searches that found nothing" panel.
- [ ] **Verify.** 375px and 1280px, light and dark; an alias added there makes
  `/directory?view=creatives&q=<it>` find that sub-domain's creatives.

## Phase 3 — Records

### Step 3.1 — Reference and guide

- [ ] **Action.** `docs/reference/api.md`, `data-model.md`, the taxonomy guide,
  and the ADR 0003 amendment.
- [ ] **Verify.** `npm run docs:check` passes.

### Step 3.2 — The privacy notice

- [ ] **Action.** One sentence in `catalogs/legal/en.ts`, empty in `fil` and
  `war`.
- [ ] **Verify.** The pull request names it for reyxdz's review.

---

## Acceptance

- [ ] An alias added in the admin area is found by directory search for both
      offers and creatives, by prefix, without accents and with a typo.
- [ ] Searches that find nothing are counted by word and day, never by person,
      and administrators can see the most common.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check` and
      `npm run check:bundle` pass, budget unchanged.

## Follow-ups

- Adding an alias directly from an unmatched search.
- Folding accents across every searched field, if the unmatched count shows it
  matters.
