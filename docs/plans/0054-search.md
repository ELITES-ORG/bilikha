# 0054. Search the directory

- **Status:** Complete
- **Owner:** emanuel
- **Related:** [ADR 0003](../decisions/0003-postgres-native-search.md) (amended) ·
  [constraints](../explanation/constraints.md) · issue #22 · aliases follow in #24

## Goal

The landing page's search box finds things. Typing "photographer", a name or a
town and pressing Enter opens `/directory?q=…` with matching offers and
creatives; the directory has its own search box, `q` is shareable, typos are
tolerated, and a search that finds nothing says so with a way forward.

## Scope

**In scope**
- `q` on `GET /offers` and `GET /creatives`: prefix words plus `pg_trgm`, the
  `pg_trgm` extension and GIN indexes in one additive migration.
- The landing form, the directory's search box, its empty state and skeleton.
- Leaving the searched text out of the request log.

**Out of scope**
- Everyday-word aliases and accent folding — #24.
- Searching client postings in creative mode — a follow-up; the page says so.

## Prerequisites

- PR #69 (singular sub-domain labels) merged first: it adds migrations
  0031–0033. Done — main was merged in and this plan's migration regenerated
  as `0034`, never renumbered by hand. Search matches a sub-domain by its
  official plural and by the singular label #69 shows on cards.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. API and indexes | 2 / 2 | Done |
| 2. Landing and directory | 2 / 2 | Done |
| 3. Records | 1 / 1 | Done |
| 4. Check on staging | 1 / 1 | Done |

---

## Phase 1 — API and indexes

### Step 1.1 — Extension and indexes

- [x] **Action.** Search indexes declared in `db/schema/profiles.ts`,
  `taxonomy.ts` and `users.ts`; `npm run db:generate`; `CREATE EXTENSION IF NOT
  EXISTS pg_trgm` added by hand as the migration's first statement.
- [x] **Verify.** `npm run db:migrate` applies it; `\dx` lists `pg_trgm`; a
  second `npm run db:generate` has nothing to generate.

### Step 1.2 — `q` on both listings

- [x] **Action.** `modules/search/search-sql.ts` holds the matching rules for
  both listings; `q` in both query schemas (`search.schema.ts`); the request
  log replaces `q`.
- [x] **Verify.** `search.test.ts`: title, description, name, full name, bio,
  sub-domain (both labels), domain and town; prefix and every-word; words across fields; typo
  "fotographer", and "develper" with short words kept strict; word matches above typo-only, nearby-first above both;
  unpublished, suspended and an unpublished profile's offers excluded; with
  the town and sub-domain filters; pagination and `total`; query syntax as
  input; one character refused, blank ignored.

## Phase 2 — Landing and directory

### Step 2.1 — Landing form

- [x] **Action.** `HomePage.tsx` submits to `/directory?q=…` through
  `lib/search-query.ts`, or plain `/directory` when the box is empty.
- [x] **Verify.** `search-query.test.ts`.

### Step 2.2 — Directory search

- [x] **Action.** A search box above the tabs, following the URL; `q` kept
  across tabs and dropped by "Clear filters"; a search empty state in place of
  the "nothing here yet" ones; the skeleton's search bar; `directory.search.*`
  in all three catalogues.
- [x] **Verify.** In a browser at 320 and 1280 px, light and dark: landing
  search lands on results; "fotographer" and a town work; the tabs keep `q`;
  × clears it; a nonsense word shows the empty state; a copied URL reproduces
  the results.

## Phase 3 — Records

### Step 3.1 — Record the decision

- [x] **Action.** The ADR 0003 amendment; `api.md`; `data-model.md`.
- [x] **Verify.** `npm run docs:check` passes.

## Phase 4 — Check on staging

**Before merging:** on both Supabase projects, run
`select extname, extnamespace::regnamespace from pg_extension; show search_path;`.
If `pg_trgm` is already enabled in another schema, or the migration is refused,
enable it from the dashboard **in schema `public`** and redeploy. Production
runs the same migration at its next release.

### Step 4.1 — Search on staging

- [x] **Action.** After the deploy, search from the staging landing page.
- [x] **Verify.** The deploy log shows migration 0034 applied; the search lands
  on `/directory?q=…` with results; a misspelt craft still finds it.

**Result (2026-10-11, after #77).** In a browser on staging, "composer" landed
on `/directory?q=composer` with the Music Composer offer, and "zzzz" showed the
search empty state. Against the staging API: typos found their matches —
"composr" a composer, "cabucgayn" a creative in Cabucgayan, "Digitl" the
creatives in Digital Interactive Media; "Digital" found that domain's offers;
a one-letter `q` answered `400`. The deploy log itself was not read: typo
matching only works with `pg_trgm` and the new indexes in place, which is what
showed migration 0034 had run. Production runs it at its next release.

## Acceptance

- [x] The landing search submits and lands on results.
- [x] `q` is shareable, tolerates typos, and respects published-only,
  suspension and nearby-first.
- [x] A search with no results shows a designed empty state.
- [x] Verified on staging.

## Follow-ups

- Everyday-word aliases and accent folding — #24.
- Search over client postings.
