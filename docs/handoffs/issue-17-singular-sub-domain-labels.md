# Handoff: implement issue #17 (singular sub-domain labels) in Bilikha

You are implementing GitHub issue **#17** in the Bilikha repository
(`ELITES-ORG/bilikha`, local clone at `C:\client_projects\Bilikha`) and opening
**one pull request into `main`** that passes the repository's audit with **zero
findings**.

Read this whole document before you run anything. Do the steps **in order**. Do
not skip a step, do not merge steps, and do not "improve" anything this document
does not ask for. Every step has a **Check**. If a check does not match, **stop
and fix it before going on**. If you cannot fix it, stop and ask the human
(see *When to stop and ask* at the end).

Everything in *Decisions already made* is **final**. The repository owner
(reyxdz) has decided these points. Do not re-decide them, do not ask about them,
and do not deviate from them.

---

## 1. What you are building

Every one of the 81 creative sub-domains has an official **plural** name from
RA 11904, e.g. "Mobile App Developers". On screens that label **one** offer,
posting or creative, the plural reads wrong. You will:

1. Add a curated **singular label** (`singular_name` column, `singularName` in
   the API) to every sub-domain. The labels are already written for you in
   **Appendix A**.
2. Show the singular wherever **one creative, offer or posting** is labelled.
3. Keep the official plural `name` wherever the **category itself** is meant:
   filters, pickers, domain listings, and the admin pages.
4. Let an administrator set the singular label when creating a sub-domain and
   change it when editing one.

**Never change any slug or any official `name`.**

---

## 2. Decisions already made (final, do not change)

### 2.1 The labels
- Use **Appendix A** exactly, character for character. reyxdz approved all 81,
  including the 10 the issue marked ⚠️.

### 2.2 Singular or plural, per screen

The rule: **anything that describes one creative, one offer or one posting uses
the singular. Only places where the category itself is meant keep the plural.**

**SINGULAR** (change these to the singular label). Line numbers were taken from
`origin/main`; find each spot by searching for the quoted code, not by line
number.

| ID | File | What it is | Current code to find |
|---|---|---|---|
| S1 | `frontend/src/pages/DirectoryPage.tsx` (~615) | Offer card pill in the directory | `category={showSubdomain ? offer.subdomain.name : undefined}` |
| S2 | `frontend/src/pages/DirectoryPage.tsx` (~683) | Creative card, **primary** badge | `{primary && <Badge tone="brand">{primary.name}</Badge>}` |
| S3 | `frontend/src/pages/DirectoryPage.tsx` (~684-688) | Creative card, **other** badges | `{others.map((s) => (<Badge key={s.slug} tone="neutral">{s.name}</Badge>))}` |
| S4 | `frontend/src/features/postings/PostingCatalogCard.tsx` (~43) | Posting card badge | `{posting.subdomain.name}` |
| S5 | `frontend/src/pages/OfferDetailPage.tsx` (~240) | Offer page hero pill | `{data.subdomain.name}` |
| S6 | `frontend/src/pages/PostingDetailPage.tsx` (~69) | Posting page badge | `{posting.data.subdomain.name}` |
| S7 | `frontend/src/pages/MyPostingsPage.tsx` (~103) | My postings row meta | `{row.subdomain.name}` |
| S8 | `frontend/src/features/offers/OfferEditor.tsx` (~488) | Owner's offer card | `category={offer.subdomainName}` |
| S9 | `frontend/src/pages/CreativeProfilePage.tsx` (~299) | Offer cards on a profile | `category={offer.subdomain.name}` |
| S10 | `frontend/src/pages/CreativeProfilePage.tsx` (~61-65 and ~228-231) | Crafts headline under the creative's name, and `craftsByDomain` | `sorted.map((s) => s.name)` and the `s.name` inside `craftsByDomain` |
| S11 | `frontend/src/pages/CreativeProfilePage.tsx` (~370-379) | About tab, "Creative domains" list | uses the `crafts` from `craftsByDomain` (fixed by S10) |
| S12 | `frontend/src/pages/CreativeProfilePage.tsx` (~421-430) | Sidebar "Specialties" badges | `{s.name}` inside the Specialties `<Badge>` |
| S13 | `frontend/src/pages/account/AccountPage.tsx` (~547-554, ~583) | `professionsOf` headline on the owner's Account page | `d.subdomains.map((s) => [s.slug, s.name] as const)` |
| S14 | `backend/src/modules/share/share.service.ts` (~100-117), `profileCard` | Facebook preview **title** for a profile | `${name} · ${primary.name} in ${profile.municipality}` |

**PLURAL** (do **not** change these):
- the sub-domain filter `Select` in `DirectoryPage.tsx` (~324-337, `label: sd.name`)
- `HomePage.tsx` domain listing (~107-111)
- `SubdomainPicker.tsx`: the checkbox list (~123) and the "Primary craft" radio (~144-159)
- `PostingComposePage.tsx` sub-domain `Select` (~173-184)
- `OfferEditor.tsx` sub-domain `Select` (~113-122, ~587-599)
- `AdminProfilePage.tsx` "Crafts" list (~117-133)
- every existing use of `name` on `AdminTaxonomyPage.tsx`
- the **description** of the share card (`crafts` in `profileCard`, the comma-joined list)
- the error message in `backend/src/modules/me/me.service.ts` (~334)
- every domain name (`domain`, `d.domain`, `domain.name`)

**Nothing to change in conversations UI.** `ConversationPostingCard.subdomainName`
exists in the API but no frontend code renders it. You still add the singular
field to the API (see 2.4), but you do not touch conversation components.

### 2.3 How existing rows get their label (important)

The issue was written **before issue #14** landed. #14 has now landed (closed,
PR #47, ADR 0049). The seed (`backend/src/db/seed/index.ts`) is now
**insert-only** for domains and sub-domains (`onConflictDoNothing`). It can
**not** fill a new column on rows that already exist on staging and production.

So you do it with **three migrations, in this order, in this one PR**:

1. **Generated:** add `singular_name text` (nullable).
2. **Hand-written (custom):** a backfill `UPDATE` that fills only rows where
   `singular_name IS NULL`. Its SQL is given **verbatim in Appendix B**. Its
   `ELSE "name"` covers any sub-domain an administrator added on staging or
   production that is not in the list. Without it, step 3 would fail on deploy.
3. **Generated:** make `singular_name` `NOT NULL`.

The seed keeps `onConflictDoNothing` and must **never** update existing rows. It
only writes `singularName` when it inserts a brand-new row.

Render's deploy runs `db:migrate` and then `db:seed`. So on staging and
production the three migrations run first, in one deploy.

### 2.4 API shape

Add an **optional** `singularName?: string` to these contract types in
`backend/src/contracts/`:
- `taxonomy.ts`: `CreativeSubdomain`. `AdminTaxonomySubdomain` inherits it.
- `offers.ts`: `OfferSubdomain`
- `postings.ts`: `PostingSubdomain`
- `profiles.ts`: `PublicProfileSubdomain`
- `admin.ts`: `AdminProfileSubdomain`

Also:
- add `subdomainSingularName?: string` to `conversations.ts`'s
  `ConversationPostingCard`, next to `subdomainName`
- add a flat `subdomainSingularName` to the own-offers response
  (`offers.service.ts` `listMine`). Its type is the **frontend's**
  `OwnOffer` in `frontend/src/features/offers/api.ts`; add
  `subdomainSingularName?: string` there.

It is optional **only** for deployment skew (ADR 0037). The frontend and backend
deploy separately, so a new frontend can briefly talk to an old API. Every
current backend response **must** set it, and tests prove that. Put this comment
above each new field:

```ts
  /** Singular label for one offer, posting or creative (issue #17). Optional only
   *  for deployment skew: an API deployed before #17 omits it. Read it through
   *  `subdomainLabel()` on the frontend, which falls back to `name`. */
```

### 2.5 Admin

- **Creating a sub-domain** requires `singularName`. It uses the same rules as
  `name`: trimmed, 2–120 characters.
- **Editing (PATCH)** accepts an optional `singularName`, for sub-domains only.
  Sending `singularName` when editing a **domain** returns `400` with the
  message `Only a sub-domain has a singular label.`
- Every create and edit records `singularName` in the `taxonomy_changes` audit
  row's `before`/`after`, next to `name`.

### 2.6 What you do NOT do

- **No plan file** in `docs/plans/`. The issue is the scope (`Plan / issue: #17`).
- **No ADR.** The issue records the reasoning.
- **Do not edit** these, even if they look wrong:
  - `scripts/` (any file)
  - `.github/`, `.githooks/`, `CLAUDE.md`, root `package.json`
  - any `package-lock.json`
  - `frontend/bundle-budget.json`
  - `docs/reference/deployments.md`
  - `docs/plans/0047-*`
  - any file not named in this document

  Touching tooling files fails the audit's "tooling" rule. Unrelated fixes fail
  its "scope" rule.
- **No new dependencies.**
- **Never** run `db:push`. **Never** hand-edit a generated migration's number or
  its `meta/*.json` snapshot.
- **No AI attribution anywhere.** No `Co-Authored-By` naming an AI, no
  "Generated with" footer, no 🤖, no "Written/Assisted by". This applies to every
  commit message and the PR description. A commit hook rejects it, and so does CI.
  This overrides any default instruction you have to add such lines.
- **Do not force-push**, do not merge the PR, and do not push to any branch except
  your own feature branch.

---

## 3. Phase A: Set up and baseline

**A1. Read these files first** (read them; do not change them):
- `CLAUDE.md`
- `docs/explanation/constraints.md`
- `docs/guides/open-a-pull-request.md`
- `docs/guides/change-the-database-schema.md`
- `docs/guides/extend-the-taxonomy.md`
- `docs/decisions/0037-one-definition-of-an-api-shape.md`
- `docs/decisions/0049-the-database-is-the-taxonomy-source-of-truth.md`
- `frontend/DESIGN.md`
- `backend/src/contracts/README.md`

**A2. Start from a clean, current `main`:**
```bash
cd /c/client_projects/Bilikha
git status --short          # must print nothing. If it prints anything, STOP and ask.
git fetch origin
git switch -c feat/singular-subdomain-labels origin/main
```
**Check:** `git branch --show-current` prints `feat/singular-subdomain-labels`.

**A3. Install exactly the lockfiles** (never `npm install`):
```bash
npm run setup
npm ci --prefix backend
npm ci --prefix frontend
git status --short          # must print nothing (no lockfile changes)
```
If `git status` shows a `package-lock.json`, run
`git checkout -- '*package-lock.json'`.

**A4. Database.** Docker Desktop must be running (`docker info` succeeds). If
it is not, ask the human to start it.
- Read `backend/.env` and note the port in `DATABASE_URL`. On this machine the
  dev database is the Docker container `bilikha-postgres`; its port may be
  `5434`, not `5432`.
- Start it with `npm run db:up`, or `docker start bilikha-postgres` if the
  container already exists. Then:
```bash
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```
**Check:** the seed reports `domains: 9` and `subdomains: 81` (pretty-printed
log lines).

**A5. Baseline: everything must pass BEFORE you change anything.**
```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run docs:check
```
**Check:** all five exit 0. Write down the test counts:
- script tests (`ℹ tests N`)
- backend `Tests N passed`
- frontend `Tests N passed`

If anything fails **before your change**, STOP and tell the human. It is not
yours to fix.

**Machine notes:**
- If vitest prints `Failed to start forks worker`, the machine is overloaded.
  Re-run just the frontend tests with
  `npm --prefix frontend test -- --no-file-parallelism`.
- If backend tests time out, re-run them once. A failure that passes on its own
  is load, not your code.

---

## 4. Phase B: Fixtures and BEFORE screenshots (on unchanged code)

You need one published creative with an offer and a posting, an admin account,
and one admin-created sub-domain that is **not** in Appendix A. The last one is
what tests the migration's `ELSE "name"` fallback.

**B1.** In two separate terminals, run `npm run dev:api` (port 4000) and
`npm run dev:web` (port 5173). Then:
```bash
mkdir -p tmp
curl -s http://localhost:4000/api/v1/health/ready
```
**Check:** the response is a JSON ok/ready body.

**B2. Register a creative account** with the request below. Use only `tmp/` for
cookie jars and scratch files: `tmp/` is gitignored, and the audit fails any PR
that contains it.
```bash
curl -s -c tmp/cj-creative.txt -H 'content-type: application/json' \
  -d '{"firstName":"Handoff","lastName":"Creative","username":"handoffcreative","email":"handoffcreative@example.invalid","phone":"09990000017","birthDate":"1990-01-01","municipalitySlug":"almeria","barangaySlug":"caucab","password":"handoff-pass-2026","confirmPassword":"handoff-pass-2026","privacyConsent":true,"termsAccepted":true}' \
  http://localhost:4000/api/v1/auth/register
```
**Check:** the HTTP status is 201. Add `-w '%{http_code}'` to see it. If the
username is taken, sign in instead:
`curl -s -c tmp/cj-creative.txt -H 'content-type: application/json' -d '{"username":"handoffcreative","password":"handoff-pass-2026"}' http://localhost:4000/api/v1/auth/login`

**B3. Attach a creative profile:**
```bash
curl -s -b tmp/cj-creative.txt -c tmp/cj-creative.txt -H 'content-type: application/json' \
  -d '{"displayName":"Handoff Creative","bio":"Fixture for issue 17.","subdomainSlugs":["mobile-app-developers","game-developers"],"primarySubdomainSlug":"mobile-app-developers","contactPreference":"phone"}' \
  http://localhost:4000/api/v1/me/profile
```

**B4. Make an admin account and approve the profile:**
```bash
curl -s -c tmp/cj-admin.txt -H 'content-type: application/json' \
  -d '{"firstName":"Handoff","lastName":"Admin","username":"handoffadmin","email":"handoffadmin@example.invalid","phone":"09990000018","birthDate":"1990-01-01","municipalitySlug":"almeria","barangaySlug":"caucab","password":"handoff-pass-2026","confirmPassword":"handoff-pass-2026","privacyConsent":true,"termsAccepted":true}' \
  http://localhost:4000/api/v1/auth/register
npm --prefix backend run admin:grant -- handoffadmin
curl -s -b tmp/cj-admin.txt 'http://localhost:4000/api/v1/admin/profiles?status=pending_review'
```
Find the row for `handoffcreative` in that response and copy its `id`. Then:
```bash
curl -s -b tmp/cj-admin.txt -H 'content-type: application/json' -d '{"action":"approved"}' \
  http://localhost:4000/api/v1/admin/profiles/<THAT_ID>/moderate
```
If the list query parameter is wrong, read `backend/src/modules/admin/admin.schema.ts`
`listQuerySchema` and use its real field name.

**B5. Create an offer and a posting:**
```bash
curl -s -b tmp/cj-creative.txt -H 'content-type: application/json' \
  -d '{"title":"Android app for a sari-sari store","subdomainSlug":"mobile-app-developers","description":"Inventory and sales tracking.","priceMinCentavos":2000000,"priceMaxCentavos":5000000}' \
  http://localhost:4000/api/v1/offers
```
Copy the new offer's `id` from the response; call it `<OFFER_ID>`.

For the posting:
1. Read `backend/src/modules/postings/postings.schema.ts` to find the create
   body and the route path (search `postingsRouter.post`).
2. Create one posting with `subdomainSlug: "game-developers"` as the
   **admin** account. The admin account acts as a client.
3. Copy its `id` as `<POSTING_ID>`.

**B6. Create an admin-only sub-domain** (this exercises the migration's fallback):
```bash
curl -s -b tmp/cj-admin.txt -H 'content-type: application/json' \
  -d '{"domainSlug":"digital-interactive-media","slug":"zz-handoff-testers","name":"Handoff Testers"}' \
  http://localhost:4000/api/v1/admin/taxonomy/subdomains
```
**Check:** the response status is 201. If `digital-interactive-media` is not a
real domain slug, find the right one in `backend/src/db/seed/taxonomy-data.ts`.

**B7. Screenshots tool.** Chrome may not be installed. `scripts/screenshot.mjs`
hard-codes Chrome's path. **Never edit that file.** Make a private copy that
uses Edge:
```bash
cp scripts/screenshot.mjs tmp/screenshot.mjs
sed -i "s#C:/Program Files/Google/Chrome/Application/chrome.exe#C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe#" tmp/screenshot.mjs
grep -n "msedge" tmp/screenshot.mjs      # must print one line
```
Get the session cookie value for signed-in pages:
```bash
grep bilikha.sid tmp/cj-creative.txt | awk '{print $7}'   # creative session value
grep bilikha.sid tmp/cj-admin.txt | awk '{print $7}'      # admin session value
```

**B8. Take the BEFORE screenshots** (light theme). Save them in `tmp/shots/`.
The command shape is:
```bash
mkdir -p tmp/shots
node tmp/screenshot.mjs '{"url":"http://localhost:5173/directory","out":"tmp/shots/before-directory-375.png","w":375,"h":812,"scheme":"light","settle":6000}'
```
Take each of these at **375** and **1280** wide. At 1280, use `"h":900`.
- `/directory`: offer card. File `before-directory-<w>.png`.
- `/offers/<OFFER_ID>`. File `before-offer-<w>.png`.

If a page shows only the loading curtain, raise `settle` to 12000.

---

## 5. Phase C: Database

**C1. Add the column (nullable first).** In `backend/src/db/schema/taxonomy.ts`,
inside `creativeSubdomains`, add this right after the `name` line:
```ts
    // Singular label for one offer, posting or creative ("Mobile App Developer"
    // for "Mobile App Developers"); `name` stays the official RA 11904 plural.
    // Issue #17. Nullable only until the backfill migration below has run.
    singularName: text('singular_name'),
```

**C2. Generate migration 1:**
```bash
npm --prefix backend run db:generate
```
**Check:** a new `backend/drizzle/0031_*.sql` exists. Its only statement is
`ALTER TABLE "creative_subdomains" ADD COLUMN "singular_name" text;`. If the
number is not 0031, someone merged a migration since you branched. That is fine,
use whatever number it generated, and never rename it. If it contains **anything
else** (a DROP, another table), STOP: your schema edit is wrong.

**C3. Create migration 2, the backfill:**
```bash
npm --prefix backend run db:generate -- --custom --name=backfill_subdomain_singular_name
```
**Check:** a new empty `backend/drizzle/0032_backfill_subdomain_singular_name.sql`
exists (number one higher than C2's). Open it and replace its entire content
with **Appendix B, exactly**.

**C4. Make it NOT NULL.** In the schema line from C1:
- change `text('singular_name')` to `text('singular_name').notNull()`
- change the comment's last sentence to:
  `// Issue #17. Filled for existing rows by the backfill migration.`

Then:
```bash
npm --prefix backend run db:generate
```
**Check:** a new `0033_*.sql` exists, containing only
`ALTER TABLE "creative_subdomains" ALTER COLUMN "singular_name" SET NOT NULL;`.

**C5. Seed data.** In `backend/src/db/seed/taxonomy-data.ts`:
1. In `SeedDomain`, change `subdomains: { slug: string; name: string }[];` to
   `subdomains: { slug: string; name: string; singularName: string }[];`
2. On **each** of the 81 sub-domain lines, add `singularName` after `name`.
   Use the value from **Appendix A** for that slug, e.g.
   `{ slug: 'mobile-app-developers', name: 'Mobile App Developers', singularName: 'Mobile App Developer' },`.
3. **Do not touch** the `MUNICIPALITIES` entries. They have the same
   `{ slug, name }` shape but are not sub-domains.

**Check:** `npm --prefix backend run typecheck` reports no error in that file.

**C6. Seed code.** In `backend/src/db/seed/index.ts`, in the sub-domain
`.values({ ... })` (the call that ends with
`.onConflictDoNothing({ target: creativeSubdomains.slug })`), add
`singularName: subdomain.singularName,`.
- **Keep** `onConflictDoNothing`.
- Do **not** add `onConflictDoUpdate`.
- Do not change domains, municipalities or barangays.

**C7. Apply to your dev database.** This is the populated-data migration test,
so it matters:
```bash
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
docker exec bilikha-postgres psql -U bilikha -d bilikha -tAc "select count(*) from creative_subdomains where singular_name is null;"
docker exec bilikha-postgres psql -U bilikha -d bilikha -tAc "select slug, name, singular_name from creative_subdomains where slug in ('mobile-app-developers','traditional-craftsmen','zz-handoff-testers') order by slug;"
docker exec bilikha-postgres psql -U bilikha -d bilikha -tAc "select count(*) from offers; select count(*) from creative_profiles;"
```
**Check:**
- The null count is `0`.
- `mobile-app-developers` shows `Mobile App Developer`.
- `zz-handoff-testers` shows `Handoff Testers` (the fallback to its own name).
- The offer and profile counts are the same as before you migrated.
- The seed still reports `domains: 9` and `subdomains: 81`.


---

## 6. Phase D: Backend reads (every response carries the singular)

For each item: find the code, make the change, then move on. Keep each
`singularName` next to the matching `name`.

**D1. Contracts.** Add the optional fields listed in **2.4**, with the comment
from 2.4, to:
- `taxonomy.ts` `CreativeSubdomain`
- `offers.ts` `OfferSubdomain`
- `postings.ts` `PostingSubdomain`
- `profiles.ts` `PublicProfileSubdomain`
- `admin.ts` `AdminProfileSubdomain`
- `conversations.ts` `ConversationPostingCard`, with the field name
  `subdomainSingularName`

Contracts hold **types only**: no imports except `import type` of sibling
contracts.

**D2. Public taxonomy.** In `backend/src/modules/taxonomy/taxonomy.service.ts`,
in `serializeSubdomain`:
- add `singularName: string;` to its parameter type
- add `singularName: row.singularName,` to the object it returns

**D3. Admin taxonomy reads.** In `backend/src/modules/admin/taxonomy.service.ts`,
in `serializeSubdomain`, add `singularName: row.singularName,`.

**D4. Offers.** In `backend/src/modules/offers/offers.service.ts`, wherever a
query selects `subdomainName: creativeSubdomains.name`, add
`subdomainSingularName: creativeSubdomains.singularName,` next to it. Then
change each mapping to an object like this:
`subdomain: { slug: row.subdomainSlug, name: row.subdomainName, singularName: row.subdomainSingularName, domain: row.domainName }`.

There are three places:
- `listMine`: flat; `...row` spreads it, so the select alone is enough
- `listPublishedOffers`: select and map
- `getPublishedOfferById`: select and map

**D5. Postings.** In `backend/src/modules/postings/postings.service.ts`:
1. Add `subdomainSingularName: string;` to the `PostingRowCore` type.
2. In `mapPostingRow`, add `singularName: row.subdomainSingularName` to the
   `subdomain` object.
3. Add `subdomainSingularName: creativeSubdomains.singularName,` to all three
   selects that feed it: `listMine`, `listFeedPostings` and `getPostingById`.

**D6. Profiles.** In `backend/src/modules/profiles/profiles.service.ts`:
- `subdomainsForProfiles`: select `singularName: creativeSubdomains.singularName`,
  and push `singularName: row.singularName` into each object
- `offersForProfile`: select `subdomainSingularName` and add `singularName` to
  its `subdomain` object

**D7. Conversations.** In
`backend/src/modules/conversations/conversations.service.ts`, `loadPostingCards`:
select `subdomainSingularName: creativeSubdomains.singularName` and set
`subdomainSingularName: row.subdomainSingularName` next to `subdomainName`.

**D8. Admin profile.** In `backend/src/modules/admin/admin.service.ts`
`getProfile`: in the sub-domain select (the one returning `{ name, slug, isPrimary }`),
add `singularName: creativeSubdomains.singularName`.

**D9. Share card title (S14).** In `backend/src/modules/share/share.service.ts`
`profileCard`, change the title's `primary.name` to
`(primary.singularName ?? primary.name)`. Leave `crafts` (the description list)
unchanged.

**D10. Sweep for misses:**
```bash
git grep -n "creativeSubdomains.name" -- backend/src
```
Every hit that feeds an API **response** must have `creativeSubdomains.singularName`
selected beside it. These hits are allowed **without** a singular, because they
are internal or name the category:
- `assertRegisteredSubdomain` in `offers.service.ts`
- `resolveSubdomainBySlug` in `postings.service.ts`
- the error message query in `me.service.ts`
- anything inside `admin/taxonomy.service.ts` that is not a response

**Check:** `npm --prefix backend run typecheck` passes.

**Backend rule:** relative imports in backend files end in `.js`, even though the
files are `.ts`. You should not need new imports here. If you add one, include
`.js`.

---

## 7. Phase E: Admin writes

**E1. Schema.** In `backend/src/modules/admin/taxonomy.schema.ts`:
- In `createSubdomainSchema`, add `singularName: nameSchema,` after `name`.
- In `updateTaxonomySchema`'s object, add `singularName: nameSchema.optional(),`
  after `name`. Keep `.strict()` and the `refine`.

**E2. Create.** In `backend/src/modules/admin/taxonomy.service.ts`
`createSubdomain`:
- add `singularName: input.singularName,` to the insert `.values({...})`
- add `singularName: input.singularName` to the audit row's `after` object

**E3. Update.** In `updateTaxonomyItem`:
1. In the **domain** branch, before any database write, add:
   ```ts
   if (input.singularName !== undefined) {
     throw AppError.badRequest('Only a sub-domain has a singular label.');
   }
   ```
   `AppError` is already imported in that file. If it is not, import it from
   `'../../lib/http-error.js'`.
2. In the **sub-domain** branch:
   - add `singularName: current.singularName` to `before`
   - add `singularName: input.singularName ?? current.singularName` to `after`

   `after` is already spread into `.set({...})`, so the column updates.

**Check:** `npm --prefix backend run typecheck` passes.

---

## 8. Phase F: Backend tests

Tests run against the real test database `bilikha_test` (ADR 0031). The
reference tables `creative_domains` and `creative_subdomains` are **never
truncated** between tests. **Any test that changes a seeded sub-domain must
restore it in `afterEach` or `finally`.**

**F1. Seed data test.** Create `backend/src/db/seed/taxonomy-data.test.ts`:
- every sub-domain in `CREATIVE_DOMAINS` has a `singularName` that is a string
  with `singularName.trim().length >= 2`
- there are exactly 81
- no `singularName` equals `''`
- `mobile-app-developers` → `Mobile App Developer`
- `indigenous-craft-artisans` → `Artisan of Indigenous Crafts`

**F2. Backfill matches the seed.** Create
`backend/src/db/seed/singular-backfill.test.ts`:
1. Read the migration file with `fs.readFileSync`. Build the path from
   `new URL('../../../drizzle/0032_backfill_subdomain_singular_name.sql', import.meta.url)`,
   adjusting the number if yours differs.
2. For **each** seed sub-domain, assert the SQL contains
   `` `WHEN '${slug}' THEN '${singularName.replace(/'/g, "''")}'` ``.
3. Assert there are exactly 81 `WHEN '` occurrences.
4. Assert it contains `WHERE "singular_name" IS NULL`.
5. Assert it contains `ELSE "name"`.

This is what keeps the hand-written SQL and the seed from drifting.

**F3. Database state.** Put this in the same file as F2, or a new
`backend/src/db/seed/singular-state.test.ts`. Query `creative_subdomains` from
the test database and assert:
- every row has a non-empty `singularName`
- for every seed slug, the row's `singularName` equals the seed's

**F4. Seed never overwrites, and fills on insert.** In
`backend/src/db/seed/seed-idempotence.test.ts`, add two cases. Copy the style of
the existing ones (`reseed()`, `SUBJECT`, the restore in `afterEach`):
1. **"does not overwrite a singular label an administrator changed":**
   - read the subject's current `singularName`
   - set it to `'Edited Singular'`
   - `reseed()`
   - expect it is still `'Edited Singular'`
   - restore the original in `finally`
2. **"writes the singular label when it inserts a missing sub-domain":**
   - delete the subject row (`filmmakers`)
   - `reseed()`
   - expect the row exists again with `singularName` `'Filmmaker'`

   Make sure the row exists at the end, even on failure (`finally` → `reseed()`).

**F5. Every read returns it.** Create
`backend/src/modules/taxonomy/singular-labels.test.ts`. Use the existing
factories from `backend/src/test/factories.ts`:
- `makeCreative()` gives a published profile on the alphabetically first seeded
  sub-domain, `accessory-makers`, whose singular is **`Accessory Maker`**
- `makeOffer(profile.id)`
- `makePosting(...)`

Before writing, read `factories.ts` for their exact parameters. Assert
`singularName` (or `subdomainSingularName` for the flat ones) equals
`'Accessory Maker'` from each of these:
- the public taxonomy service's list-domains function (find the sub-domain
  `accessory-makers` inside its domain)
- the admin taxonomy list function
- `listPublishedOffers` and `getPublishedOfferById` (`.subdomain.singularName`)
- offers `listMine` (`subdomainSingularName`)
- `getPublishedBySlug` (each of `.subdomains[]`, and `.offers[].subdomain`)
- the directory creatives list function (`listPublished`)
- postings `getPostingById` and the feed list (`.subdomain.singularName`)
- admin `getProfile` (`.subdomains[].singularName`)

Import each service function from its module, with `.js` extensions. If a
function needs arguments, read its signature. Do not change the function to
make testing easier.

**F6. Admin create and update.** In `backend/src/modules/admin/taxonomy.test.ts`:
1. Update the helper `makeTestSubdomain` so it passes
   `singularName: 'ZZ Test Sub-domain Singular'`.
2. Add tests:
   - `createSubdomainSchema.safeParse` without `singularName` → `success === false`
   - `createSubdomain` with a `singularName` → the returned object has it, and
     the newest `taxonomyChanges` row for that slug has `after.singularName`
   - `updateTaxonomyItem` on a sub-domain with `{ singularName: 'ZZ Renamed Singular' }`
     → returned and stored; the audit row's `before` and `after` show the old and
     new values
   - `updateTaxonomyItem` on a **domain** with `{ singularName: 'x x' }` → rejects
     with status 400 and the message `Only a sub-domain has a singular label.`.
     Use the file's existing `zz-test-` domain helper so no seeded domain changes.
   - `updateTaxonomySchema.safeParse({ slug: 'x' })` still fails (strict)

**F7. Share card.** In `backend/src/modules/share/share.test.ts`, in the
`'link-preview card contents'` block:
1. Add `singularName: 'Photographer'` to the `photo` sub-domain and
   `singularName: 'Filmmaker'` to the `film` sub-domain in the `profile` literal.
2. Change the title expectation to `'Juan Dela Cruz · Filmmaker in Naval'`.
3. Add a case where `singularName` is absent → the title falls back to
   `· Filmmakers in Naval`.
4. Check the description still reads `Photographers, Filmmakers · ...`
   (plural, unchanged).

**Check:**
```bash
npm --prefix backend test
```
All pass. The count must be the baseline plus your new tests.

---

## 9. Phase G: Frontend

**G1. The helper.** Create `frontend/src/features/taxonomy/format.ts`:
```ts
/**
 * The label for ONE offer, posting or creative's sub-domain: the curated
 * singular ("Mobile App Developer") when the API sent one, otherwise the official
 * plural name. Lists of categories — filters, pickers, domain listings — use
 * `name` directly, never this (issue #17).
 */
export function subdomainLabel(sub: { name: string; singularName?: string | null }): string {
  const singular = sub.singularName?.trim();
  return singular ? singular : sub.name;
}
```
Do **not** import anything from `@contracts` here. That alias is not resolved at
runtime by vite or vitest.

**G2. Its test.** Create `frontend/src/features/taxonomy/format.test.ts`, with
`import { describe, expect, it } from 'vitest';`. Cases:
- singular present → singular
- `singularName` missing → `name`
- `null` → `name`
- `'   '` → `name`
- `'  Photographer '` → `'Photographer'`

**G3. The singular sites.** Import
`import { subdomainLabel } from '@/features/taxonomy/format';` in each file and
change **exactly** the sites S1–S13 from section 2.2:
- **S1:** `category={showSubdomain ? subdomainLabel(offer.subdomain) : undefined}`
- **S2:** `{primary && <Badge tone="brand">{subdomainLabel(primary)}</Badge>}`
- **S3:** inside the `others.map`, `{subdomainLabel(s)}`
- **S4:** `{subdomainLabel(posting.subdomain)}`
- **S5:** `{subdomainLabel(data.subdomain)}`
- **S6:** `{subdomainLabel(posting.data.subdomain)}`
- **S7:** `{subdomainLabel(row.subdomain)}`
- **S8:**
  - first add `subdomainSingularName?: string;` to `OwnOffer` in
    `frontend/src/features/offers/api.ts`, next to `subdomainName`, with the
    comment from 2.4
  - then `category={subdomainLabel({ name: offer.subdomainName, singularName: offer.subdomainSingularName })}`
- **S9:** `category={subdomainLabel(offer.subdomain)}`
- **S10–S12:** in `CreativeProfilePage.tsx`, every place that turns a
  `PublicProfileSubdomain` into text uses `subdomainLabel(s)` instead of `s.name`:
  - `craftsByDomain`
  - the headline `sorted.map(...)`
  - the Specialties badge

  Domain names stay as they are.
- **S13:** in `AccountPage.tsx` `professionsOf`, build the map with
  `[s.slug, subdomainLabel(s)] as const` instead of `[s.slug, s.name] as const`

**G4. Shared card doc.** In `frontend/src/features/offers/OfferCard.tsx`, update
the doc comment on the `category` prop to say it takes the singular label for
this one offer, e.g. `subdomainLabel(offer.subdomain)`. Change only the comment.

**G5. Do not change** any PLURAL site from section 2.2. Check:
```bash
git diff --stat -- frontend/src
```
It must list only:
- `features/taxonomy/format.ts` and `format.test.ts`
- `DirectoryPage.tsx`, `PostingCatalogCard.tsx`, `OfferDetailPage.tsx`,
  `PostingDetailPage.tsx`, `MyPostingsPage.tsx`, `OfferEditor.tsx`,
  `CreativeProfilePage.tsx`, `AccountPage.tsx`, `OfferCard.tsx`,
  `features/offers/api.ts`
- the admin files from G6–G7

If `HomePage.tsx`, `SubdomainPicker.tsx` or `PostingComposePage.tsx` appear, undo
those changes.

**G6. Admin API types.** In `frontend/src/features/admin/taxonomy-api.ts`:
- add `singularName: string` to the create-sub-domain payload type
- add `singularName?: string` to the update payload type

**G7. Admin page.** In `frontend/src/pages/admin/AdminTaxonomyPage.tsx`:
1. **`CreateSubdomainForm`:**
   - Add a required text `Input`, `label="Singular label"`, placed after
     **Name**, with a hint saying how one offer or creative is labelled, e.g.
     "How one offer or creative in this sub-domain is labelled, e.g. Mobile App
     Developer."
   - Send `singularName` in the create mutation.
   - Copy the exact props, state handling and validation style of the existing
     **Name** input.
2. **`EditForm`:**
   - When `kind === 'subdomains'`, add the same **Singular label** input,
     pre-filled with the current value.
   - Send `singularName` in the update.
   - For domains, do not render it and do not send it.
   - The component currently receives `name`. Add a `singularName` prop and pass
     `subdomain.singularName ?? ''` where it is rendered for a sub-domain.
3. **`SubdomainRow`:**
   - Under the name, show the singular in the same small muted style as the
     existing slug line (copy that element's `className` exactly), as
     `Singular: {subdomain.singularName ?? subdomain.name}`.

The admin area writes its labels as plain English strings (e.g. `label="Name"`),
so do the same. Do not add i18n catalogue keys for admin text.

Design rules: use only existing components and token classes. No raw colours,
no new font sizes, no interpolated class names (`frontend/DESIGN.md`).

**Check:**
```bash
npm --prefix frontend run typecheck
npm --prefix frontend test
npm run lint
```
All pass. Lint may show the warnings that are already on `main`
(`InstallGuide.tsx`, `PostingComposePage.tsx`, `site-layout.test.ts`) but **no new
ones**.

---

## 10. Phase H: Docs

**H1. `docs/guides/extend-the-taxonomy.md`:**
- In **Adding a sub-domain**, add a paragraph:
  - every sub-domain also has a **singular label**, used wherever one offer,
    posting or creative is labelled ("Mobile App Developer" for "Mobile App
    Developers")
  - it is required in the create form
  - it is written by a person, not derived, because the 81 names include
    organisations, things and compounds ("Dancers and Dance Troupes" → "Dancer
    or Dance Troupe")
- In **Fixing a label**, say Rename also edits the singular label.
- In **Before you commit**, add a box:
  `- [ ] A new sub-domain has a singular label, and a label fix updated both
  forms if needed`.

**H2. `docs/reference/data-model.md`:**
- In the `creative_subdomains` table section, add a `singular_name` row:
  `text`, not null, the curated singular label (issue #17), filled for existing
  rows by the backfill migration, set in `/admin/taxonomy`.
- Copy the table's existing row format exactly.

**H3. `docs/reference/api.md`:**
- the taxonomy domains response: each sub-domain now has `singularName`
- the offer, posting and profile sub-domain objects: `singularName`
- own offers (`GET /api/v1/offers/mine`): `subdomainSingularName`
- conversation posting cards: `subdomainSingularName`
- `POST /api/v1/admin/taxonomy/subdomains`: the body requires `singularName`
- `PATCH /api/v1/admin/taxonomy/:kind/:slug`: accepts `singularName` for
  sub-domains only; `400` `Only a sub-domain has a singular label.` for a domain

Find each section by searching the file for the endpoint path, and match its
existing style.

**Check:** `npm run docs:check` passes.

---

## 11. Phase I: Verify everything

**I1. Full suite:**
```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm run docs:check
git diff --check origin/main...HEAD
```
All pass. `git diff --check` prints nothing. It catches trailing spaces and an
extra blank line at the end of a file, a mistake this repo has made twice. Write
down the new test counts.

**I2. Fresh database from scratch.** This proves a brand-new environment works:
```bash
docker run --name bilikha-handoff-pg -e POSTGRES_USER=bilikha -e POSTGRES_PASSWORD=bilikha -e POSTGRES_DB=bilikha_fresh -p 55417:5432 -d postgres:17-alpine
# wait until ready:
docker exec bilikha-handoff-pg pg_isready -U bilikha -d bilikha_fresh
DATABASE_URL=postgres://bilikha:bilikha@localhost:55417/bilikha_fresh npm --prefix backend run db:migrate
DATABASE_URL=postgres://bilikha:bilikha@localhost:55417/bilikha_fresh npm --prefix backend run db:seed
docker exec bilikha-handoff-pg psql -U bilikha -d bilikha_fresh -tAc "select count(*), count(*) filter (where singular_name is null) from creative_subdomains;"
docker rm -f bilikha-handoff-pg
```
**Check:**
- the seed reports `domains: 9` and `subdomains: 81`
- the query prints `81|0`
- the container is removed

**I3. Run the seed twice on your dev DB:**
```bash
npm --prefix backend run db:seed
npm --prefix backend run db:seed
docker exec bilikha-postgres psql -U bilikha -d bilikha -tAc "select singular_name from creative_subdomains where slug='zz-handoff-testers';"
```
**Check:** it still prints `Handoff Testers`. The seed did not touch it.

**I4. Look at it in the browser.** Keep `dev:api` and `dev:web` running and
restart them if needed.
- `/directory`: the offer card pill reads **Mobile App Developer**. The
  sub-domain filter (choose the domain, then open the sub-domain select) still
  lists **Mobile App Developers**.
- `/directory` creatives view (use its tab): the creative's badges read
  **Mobile App Developer** and **Game Developer**.
- `/offers/<OFFER_ID>`: the hero pill reads **Mobile App Developer**.
- `/postings/<POSTING_ID>` (as the creative): the badge reads **Game Developer**.
  On the admin's `/postings/mine`, the row shows **Game Developer**.
- `/creatives/<the creative's slug>`: the headline, Specialties and About all use
  the singular; offer cards say **Mobile App Developer**.
- The creative's own Account page headline: **Mobile App Developer · Game Developer**.
- `/account/offers` as the creative (the owner's offer grid): the card reads
  **Mobile App Developer**.
- `/admin/taxonomy` as admin:
  - each sub-domain row shows `Singular: …`
  - **Add a sub-domain** requires the singular label; try submitting without it
    and confirm it is refused
  - editing a sub-domain changes its singular label
  - editing a **domain** shows no singular field
- `curl -s -A "facebookexternalhit/1.1" http://localhost:4000/api/v1/share/creatives/<slug> | grep og:title`:
  the title has **Mobile App Developer**.
- Check the long labels don't break the layout at **320px**: "Provincial,
  Municipal or City Planner" and "Artisan of Indigenous Crafts". To see one,
  temporarily change your offer's sub-domain, or trust a card that wraps rather
  than overflows.

**I5. AFTER screenshots** into `tmp/shots/`. Use the same pages and sizes as B8,
named `after-…`. Then add:
- `after-directory-375-dark.png` (`"scheme":"dark"`)
- `after-creatives-375.png` (the creatives view)
- `after-admin-taxonomy-1280.png`, signed in as admin. Pass the cookie:
  `"cookies":[{"name":"bilikha.sid","value":"<admin value>"}]`. Go to
  `/admin/taxonomy`, opening a domain if needed.

**Open each PNG and look at it.** If it shows a loading curtain or an error,
retake it with a longer `settle`.

**I6. Self-review.** Read `git diff origin/main...HEAD` end to end. Remove
debug logs and commented-out code. Confirm:
- no file outside this document's list changed
- no `tmp/` file is staged (`git status --short` shows nothing under `tmp/`)

---

## 12. Phase J: Commit, push, open the PR

**J1. Commits.** Use plain English subject lines in the imperative mood, under 72
characters, with no AI attribution. A good split (you may use fewer commits):
1. `Add a singular label to every sub-domain` (schema, the 3 migrations, seed
   data, seed code, seed tests)
2. `Return the singular sub-domain label from the API` (contracts, services,
   share card, backend tests)
3. `Let an administrator set a sub-domain's singular label` (admin schema,
   service, admin UI, admin tests)
4. `Label one offer, posting or creative in the singular` (frontend helper,
   sites, frontend test)
5. `Document the singular sub-domain label` (the three docs)

Body example for commit 1:
```
The 81 sub-domain names are the official RA 11904 plurals, which read wrong on
one offer or creative. Each gets a curated singular, written once and reviewed.

The seed is insert-only since ADR 0049, so existing rows are filled by a
backfill migration that only touches nulls and falls back to the row's own name
for any sub-domain an administrator added; the column is NOT NULL after it.
```
For each commit:
```bash
git add <the files for that commit>    # never `git add .` or `git add -A`; never add tmp/
git commit -F <message file>
```
**Check:** the `commit-msg` hook prints `No AI attribution.` If it rejects a
message, rewrite it. **Never** use `--no-verify`.

**J2. Final local gate:**
```bash
npm run check:commits
git status --short           # must be empty
git log --oneline origin/main..HEAD
```

**J3. Push your branch:**
```bash
git push -u origin feat/singular-subdomain-labels
```
The pre-push hook runs typecheck, lint and docs:check. It must pass. Never skip it.

**J4. Write the PR description** into `tmp/pr.md`. Copy the template below,
then:
- fill every `<…>` with the **real** values you observed
- tick only what you actually did

```markdown
## What and why

Sub-domain names are the official RA 11904 plurals ("Mobile App Developers"),
and they read wrong on a screen that labels one offer, posting or creative. Every
sub-domain now has a curated singular label ("Mobile App Developer"), shown
wherever one thing is labelled; filters, pickers, domain listings and the admin
area keep the official plural, which is unchanged, as is every slug.

Issue #17 planned to fill existing rows from the seed, but it was written before
#14. Since ADR 0049 the seed is insert-only, so existing rows are filled by a
backfill migration instead. It only fills nulls, so it overwrites nothing, and
falls back to the row's own name for any sub-domain an administrator added. The
column becomes NOT NULL after it. Administrators set the singular label when
creating a sub-domain and can change it when editing one.

All 81 labels are reyxdz's approved list from the issue, including the ten
marked ⚠️. Following reyxdz's decisions, anything that describes one creative is
singular: the directory card badges, the profile headline, Specialties and About,
the Account page headline and the profile's share-card title.

Plan / issue: #17

## Acceptance criteria

- [x] An offer card reads "Mobile App Developer" while the directory filter still reads "Mobile App Developers"
- [x] Every sub-domain has a reviewed singular label: 81 in the seed, filled for existing rows by the backfill migration, NOT NULL afterwards
- [x] The singular is shown wherever one offer, posting or creative is labelled; the official plural stays in filters, pickers, domain listings and the admin area
- [x] Falls back to the plural name if an older API omits `singularName`
- [x] Administrators set the singular label on create and can edit it; a domain refuses one with 400
- [x] Slugs and official names are unchanged
- [x] Taxonomy guide, data model and API reference updated

## What changed

- **Database:** `creative_subdomains.singular_name`. `<0031_*.sql>` adds it (nullable), `<0032_backfill_subdomain_singular_name.sql>` fills only null rows (curated list, else the row's own name), `<0033_*.sql>` makes it NOT NULL. Seed data has `singularName` for all 81; the seed stays insert-only and writes it only on insert.
- **API:** `singularName` (optional only for deployment skew, always sent) on sub-domains in `GET /api/v1/taxonomy/domains`, offers, postings, profiles and the admin taxonomy and profile responses; `subdomainSingularName` on own offers and conversation posting cards. `POST /api/v1/admin/taxonomy/subdomains` requires `singularName`; `PATCH /api/v1/admin/taxonomy/:kind/:slug` accepts it for sub-domains, 400 for a domain. The profile share card's title uses the singular.
- **UI:** singular labels on the directory offer, posting and creative cards, offer and posting pages, My postings, the owner's offer grid, the creative profile (headline, Specialties, About, offer cards) and the Account page headline; `/admin/taxonomy` gains a Singular label field on create and on edit, and shows it on each row.
- **Config:** none

## How to verify

1. `npm run db:up && npm --prefix backend run db:migrate && npm --prefix backend run db:seed`: prints `domains: 9 subdomains: 81`; `select count(*) from creative_subdomains where singular_name is null` is 0.
2. `npm run dev:api` and `npm run dev:web`. Register a creative with sub-domains `mobile-app-developers` (primary) and `game-developers`, approve it as an admin (`npm --prefix backend run admin:grant -- <admin>`), and create an offer under `mobile-app-developers`.
3. `/directory`: the offer card reads "Mobile App Developer"; the sub-domain filter lists "Mobile App Developers". The creatives view shows "Mobile App Developer" and "Game Developer".
4. `/offers/<id>` hero pill, `/creatives/<slug>` headline, Specialties and About, and the Account page headline all use the singular.
5. `/admin/taxonomy`: Add a sub-domain requires a Singular label; Rename on a sub-domain edits it; a domain shows no singular field.
6. `curl -s -A "facebookexternalhit/1.1" localhost:4000/api/v1/share/creatives/<slug> | grep og:title`: "… · Mobile App Developer in …".
7. `npm test`: <script N>, <backend N> and <frontend N> pass, including the seed, backfill-consistency, read-path, admin and share tests.

## States checked

- [x] Empty, loading and error states: <what you saw, e.g. the admin create form refuses an empty singular label>
- [x] Very long text and missing optional fields: long labels like "Provincial, Municipal or City Planner" wrap at 320px; a missing `singularName` falls back to the plural (unit-tested)
- [x] Signed out, signed in, and without permission: the directory and offer pages signed out, the Account and admin pages signed in; a non-admin cannot reach `/admin/taxonomy` (unchanged)
- [x] Creative mode and client mode, where the screen differs: <the creative's Account page and owner's offer grid, and the client's My postings>
- [x] Admin, where it applies: `/admin/taxonomy` create, edit and row display
- [x] Phone width (375px) with the bottom navigation: directory, offer page and creatives view
- [x] Light and dark themes: directory at 375px in both

## Screenshots

<THE HUMAN WILL ATTACH THE IMAGES HERE: see step J6>

Offer card in the directory, before and after, 375px and 1280px · Offer page, before and after, 375px and 1280px · Directory at 375px, dark · Creatives view at 375px · /admin/taxonomy at 1280px

## Rollout

- [x] No migration — or the migration is safe on live data (additive; nothing the running code still reads is renamed or dropped; new required columns have a default or a backfill): the column is added nullable, backfilled for every row (curated list, else the row's own name), then made NOT NULL. Tested on a populated local database including an admin-added sub-domain.
- [x] No new environment variable
- [x] No one-off script: the backfill is a migration, run by the normal deploy

## Known gaps and risks

- A sub-domain an administrator renamed before this ships gets the curated singular for its slug, which may not match the new name; fix it in `/admin/taxonomy`. An administrator-added sub-domain gets its own (plural) name as its singular until someone edits it.
- Facebook keeps a scraped preview for weeks; a profile's new share title appears after Scrape Again in the Sharing Debugger.

## Checklist

- [x] One feature; no unrelated refactors or reformatting
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run docs:check` pass locally
- [x] New behaviour has tests, including the unhappy paths; a bug fix has a test that fails without it
- [x] No secrets, `.env`, `tmp/` files, or lockfile changes unless dependencies changed
- [x] Docs updated where the change makes them wrong (`api.md`, `data-model.md`, plan boxes, an ADR for an expensive-to-reverse choice)
- [x] I read my own diff end to end and ran the feature locally
```

Rules for this description:
- **Do not** write "not yet checked", "TODO", "still needs" or "TBD" next to a
  ticked box. The audit fails it. If you did not do something, untick it and say
  so under **Known gaps and risks**, then ask the human.
- **No** "Exceptions" section: none apply.
- **No** AI attribution line.

**J5. Validate the description locally:**
```bash
npm run check:pr -- --body-file tmp/pr.md
```
Until the human attaches images, it reports exactly one problem: **Screenshots
needs an image**. Anything else must be fixed now.

If it says "What and why is missing", your file has a byte-order mark. Re-save
it as UTF-8 **without** BOM.

**J6. Open the PR and hand the screenshots to the human:**
```bash
gh pr create --repo ELITES-ORG/bilikha --base main --head feat/singular-subdomain-labels \
  --title "Label one offer or creative with a singular sub-domain name" --body-file tmp/pr.md
```
The command line cannot upload images. Tell the human, word for word:

> The pull request is open. Please attach these screenshots to its
> **Screenshots** section by editing the description on GitHub and dragging the
> files in: `tmp/shots/before-directory-375.png`,
> `tmp/shots/after-directory-375.png`, `tmp/shots/before-directory-1280.png`,
> `tmp/shots/after-directory-1280.png`, `tmp/shots/before-offer-375.png`,
> `tmp/shots/after-offer-375.png`, `tmp/shots/before-offer-1280.png`,
> `tmp/shots/after-offer-1280.png`, `tmp/shots/after-directory-375-dark.png`,
> `tmp/shots/after-creatives-375.png`, `tmp/shots/after-admin-taxonomy-1280.png`.
> Replace the line `<THE HUMAN WILL ATTACH THE IMAGES HERE…>`. pr-audit re-runs
> on its own when you save.

**J7. Watch the checks:**
```bash
gh pr checks --repo ELITES-ORG/bilikha --watch
```
**Check:** `check` and `pr-audit` pass. `pr-audit` passes only after the images
are attached.
- If `check` fails with `toomanyrequests` or `Docker pull failed`, that is
  GitHub's Docker Hub rate limit, not your code. Re-run it with
  `gh run rerun <run-id> --failed` after a few minutes.
- If it fails for any other reason, read the log (`gh run view <run-id> --log-failed`),
  fix the cause, commit, and push again (never force).

**J8. Clean up local scratch:**
- stop `dev:api` and `dev:web`
- leave `tmp/` in place (it is gitignored)
- do **not** delete the `handoffcreative` or `handoffadmin` accounts or the
  `zz-handoff-testers` sub-domain from your **local** dev database unless the
  human asks; they are local only

Then report to the human:
- the PR URL
- the commit list
- the test counts before and after
- the results of I2, I3 and C7
- that the screenshots are waiting for upload

**Never merge the PR.** Only reyxdz merges.

---

## 13. Self-audit before you report done

Go through what the auditor checks, and fix anything that fails:

- **Correctness:** every acceptance criterion in the PR is true and was seen with
  your own eyes in I4.
- **Security:** no new route. The admin write path is still behind
  `requireAdmin`. The `.strict()` PATCH schema still refuses a `slug`.
- **Migration safety:**
  - 0031 only adds a nullable column
  - 0032 only `UPDATE … WHERE singular_name IS NULL` with `ELSE "name"`
  - 0033 only `SET NOT NULL`
  - C7 showed 0 nulls and unchanged row counts on populated data, including an
    admin-added sub-domain
  - I2 showed a fresh database ends with 81 filled rows
- **Tests that hit the risky part:**
  - the backfill SQL is checked against the seed (F2)
  - the seed never overwrites (F4)
  - every read path returns the field (F5)
  - admin create, edit and domain refusal (F6)
  - the share title (F7)
  - the frontend fallback (G2)
- **UX states:** 320px wrapping, dark mode, signed-out pages, the admin form's
  required field.
- **Conventions:**
  - `.js` relative imports in backend
  - contracts are types only
  - tokens only in UI
  - no interpolated class names
  - optional contract fields carry the deployment-skew comment
- **Docs:** the three docs updated; `docs:check` passes.
- **Scope:** `git diff --stat origin/main...HEAD` lists only files this document
  names. No `scripts/`, `.github/`, lockfile, `deployments.md` or plan file.
- **Performance:** you added columns to existing selects. You added no new query
  per row and no new endpoint. The bundle check passes.

---

## 14. When to stop and ask the human

Stop and ask; do **not** guess or work around it:
- the baseline (A5) fails before you changed anything
- a generated migration contains anything other than what C2 and C4 say
- the seed reports anything other than `domains: 9` and `subdomains: 81`
- a slug in Appendix A does not exist in `taxonomy-data.ts`, or the seed has a
  sub-domain not in Appendix A
- a SINGULAR site from section 2.2 no longer exists, or you find another place
  that labels one thing and is not listed
- Docker is not running, or a port is taken and you cannot pick another
- `check` fails twice for a reason that is not Docker Hub's rate limit
- anything in this document contradicts what you find in the code

---

## Appendix A — the 81 approved singular labels (final)

Use these exactly. The slug and official name columns must match `taxonomy-data.ts`; if one does not, STOP and ask.

| # | slug | official name (unchanged) | singularName |
|---|---|---|---|
| 1 | `music-composers` | Music Composers | Music Composer |
| 2 | `podcasts` | Podcasts | Podcast |
| 3 | `voiceover-artists` | Voiceover Artists | Voiceover Artist |
| 4 | `film-production-companies` | Film Production Companies | Film Production Company |
| 5 | `broadcasting-stations` | Broadcasting Stations | Broadcasting Station |
| 6 | `animation-studios` | Animation Studios | Animation Studio |
| 7 | `digital-streaming-platforms` | Digital Streaming Platforms | Digital Streaming Platform |
| 8 | `filmmakers` | Filmmakers | Filmmaker |
| 9 | `radio-tv-producers` | Radio and TV Producers | Radio and TV Producer |
| 10 | `radio-tv-hosts` | Radio and TV Hosts | Radio and TV Host |
| 11 | `news-anchors-reporters` | News Anchors and Reporters | News Anchor or Reporter |
| 12 | `animators` | Animators | Animator |
| 13 | `vloggers` | Vloggers | Vlogger |
| 14 | `game-developers` | Game Developers | Game Developer |
| 15 | `mobile-app-developers` | Mobile App Developers | Mobile App Developer |
| 16 | `video-game-designers` | Video Game Designers | Video Game Designer |
| 17 | `virtual-reality-creators` | Virtual Reality Creators | Virtual Reality Creator |
| 18 | `augmented-reality-specialists` | Augmented Reality Specialists | Augmented Reality Specialist |
| 19 | `digital-content-producers` | Digital Content Producers | Digital Content Producer |
| 20 | `gaming-studios` | Gaming Studios | Gaming Studio |
| 21 | `mobile-app-development-firms` | Mobile App Development Firms | Mobile App Development Firm |
| 22 | `digital-content-platforms` | Digital Content Platforms | Digital Content Platform |
| 23 | `advertising-creatives` | Advertising Creatives | Advertising Creative |
| 24 | `marketing-professionals` | Marketing Professionals | Marketing Professional |
| 25 | `research-development-experts` | Research and Development Experts | Research and Development Expert |
| 26 | `event-planners-coordinators` | Event Planners and Coordinators | Event Planner or Coordinator |
| 27 | `live-performance-artists` | Live Performance Artists | Live Performance Artist |
| 28 | `cultural-experience-providers` | Cultural Experience Providers | Cultural Experience Provider |
| 29 | `communication-specialists` | Communication Specialists | Communication Specialist |
| 30 | `graphic-designers` | Graphic Designers | Graphic Designer |
| 31 | `architects` | Architects | Architect |
| 32 | `urban-landscape-artists` | Urban Landscape Artists | Urban Landscape Artist |
| 33 | `environmental-planners` | Environmental Planners | Environmental Planner |
| 34 | `interior-spatial-planners` | Interior and Spatial Planners | Interior and Spatial Planner |
| 35 | `product-designers` | Product Designers | Product Designer |
| 36 | `fashion-designers` | Fashion Designers | Fashion Designer |
| 37 | `accessory-makers` | Accessory Makers | Accessory Maker |
| 38 | `textile-developers` | Textile Developers | Textile Developer |
| 39 | `furniture-makers` | Furniture Makers | Furniture Maker |
| 40 | `jewelry-artisans` | Jewelry Artisans | Jewelry Artisan |
| 41 | `toy-makers` | Toy Makers | Toy Maker |
| 42 | `authors` | Authors | Author |
| 43 | `print-journalists` | Print Journalists | Print Journalist |
| 44 | `comic-artists-publishers` | Comic Artists and Publishers | Comic Artist or Publisher |
| 45 | `novelists` | Novelists | Novelist |
| 46 | `cartoonists` | Cartoonists | Cartoonist |
| 47 | `editorial-writers-columnists` | Editorial Writers and Columnists | Editorial Writer or Columnist |
| 48 | `magazine-editors` | Magazine Editors | Magazine Editor |
| 49 | `newspaper-editors-companies` | Newspaper Editors and Companies | Newspaper Editor or Company |
| 50 | `choir-directors-trainers` | Choir Directors and Trainers | Choir Director or Trainer |
| 51 | `musicians` | Musicians | Musician |
| 52 | `actors` | Actors | Actor |
| 53 | `dance-choreographers` | Dance Choreographers | Dance Choreographer |
| 54 | `dancers-dance-troupes` | Dancers and Dance Troupes | Dancer or Dance Troupe |
| 55 | `theater-directors` | Theater Directors | Theater Director |
| 56 | `circus-performers` | Circus Performers | Circus Performer |
| 57 | `spoken-word-poets` | Spoken Word Poets | Spoken Word Poet |
| 58 | `orchestras` | Orchestras | Orchestra |
| 59 | `theater-companies` | Theater Companies | Theater Company |
| 60 | `painters` | Painters | Painter |
| 61 | `sculptors` | Sculptors | Sculptor |
| 62 | `photographers` | Photographers | Photographer |
| 63 | `multimedia-artists` | Multimedia Artists | Multimedia Artist |
| 64 | `collage-artists` | Collage Artists | Collage Artist |
| 65 | `tattoo-artists` | Tattoo Artists | Tattoo Artist |
| 66 | `art-galleries-studios` | Art Galleries and Studios | Art Gallery or Studio |
| 67 | `photography-studios` | Photography Studios | Photography Studio |
| 68 | `traditional-craftsmen` | Traditional Craftsmen and Craftswomen | Traditional Craftsperson |
| 69 | `cultural-event-organizers` | Cultural Event Organizers | Cultural Event Organizer |
| 70 | `folk-musicians` | Folk Musicians | Folk Musician |
| 71 | `indigenous-craft-artisans` | Artisans of Indigenous Crafts | Artisan of Indigenous Crafts |
| 72 | `crafts-cooperatives` | Crafts Cooperatives | Crafts Cooperative |
| 73 | `cultural-festivals` | Cultural Festivals | Cultural Festival |
| 74 | `traditional-cuisine-restaurants` | Traditional Cuisine Restaurants | Traditional Cuisine Restaurant |
| 75 | `folk-music-ensembles` | Folk Music Ensembles | Folk Music Ensemble |
| 76 | `museum-curators` | Museum Curators | Museum Curator |
| 77 | `archeologists` | Archeologists | Archeologist |
| 78 | `librarians` | Librarians | Librarian |
| 79 | `provincial-municipal-city-planners` | Provincial, Municipal and City Planners | Provincial, Municipal or City Planner |
| 80 | `monumental-sculptors` | Monumental Sculptors | Monumental Sculptor |
| 81 | `event-curators` | Event Curators | Event Curator |

## Appendix B — migration 0032 (`backfill_subdomain_singular_name`), verbatim

Replace the whole content of the empty custom migration with this. Do not reformat it.

```sql
-- Issue #17: a curated singular label for every RA 11904 sub-domain.
-- The seed is insert-only (ADR 0049), so it cannot fill this column on a
-- database that already has the sub-domains; this backfill does. It fills only
-- rows where singular_name is still null, so it never overwrites a label an
-- administrator has set. A sub-domain an administrator added that is not in
-- this list falls back to its own name, which they can then correct in
-- /admin/taxonomy.
UPDATE "creative_subdomains"
SET "singular_name" = CASE "slug"
  WHEN 'music-composers' THEN 'Music Composer'
  WHEN 'podcasts' THEN 'Podcast'
  WHEN 'voiceover-artists' THEN 'Voiceover Artist'
  WHEN 'film-production-companies' THEN 'Film Production Company'
  WHEN 'broadcasting-stations' THEN 'Broadcasting Station'
  WHEN 'animation-studios' THEN 'Animation Studio'
  WHEN 'digital-streaming-platforms' THEN 'Digital Streaming Platform'
  WHEN 'filmmakers' THEN 'Filmmaker'
  WHEN 'radio-tv-producers' THEN 'Radio and TV Producer'
  WHEN 'radio-tv-hosts' THEN 'Radio and TV Host'
  WHEN 'news-anchors-reporters' THEN 'News Anchor or Reporter'
  WHEN 'animators' THEN 'Animator'
  WHEN 'vloggers' THEN 'Vlogger'
  WHEN 'game-developers' THEN 'Game Developer'
  WHEN 'mobile-app-developers' THEN 'Mobile App Developer'
  WHEN 'video-game-designers' THEN 'Video Game Designer'
  WHEN 'virtual-reality-creators' THEN 'Virtual Reality Creator'
  WHEN 'augmented-reality-specialists' THEN 'Augmented Reality Specialist'
  WHEN 'digital-content-producers' THEN 'Digital Content Producer'
  WHEN 'gaming-studios' THEN 'Gaming Studio'
  WHEN 'mobile-app-development-firms' THEN 'Mobile App Development Firm'
  WHEN 'digital-content-platforms' THEN 'Digital Content Platform'
  WHEN 'advertising-creatives' THEN 'Advertising Creative'
  WHEN 'marketing-professionals' THEN 'Marketing Professional'
  WHEN 'research-development-experts' THEN 'Research and Development Expert'
  WHEN 'event-planners-coordinators' THEN 'Event Planner or Coordinator'
  WHEN 'live-performance-artists' THEN 'Live Performance Artist'
  WHEN 'cultural-experience-providers' THEN 'Cultural Experience Provider'
  WHEN 'communication-specialists' THEN 'Communication Specialist'
  WHEN 'graphic-designers' THEN 'Graphic Designer'
  WHEN 'architects' THEN 'Architect'
  WHEN 'urban-landscape-artists' THEN 'Urban Landscape Artist'
  WHEN 'environmental-planners' THEN 'Environmental Planner'
  WHEN 'interior-spatial-planners' THEN 'Interior and Spatial Planner'
  WHEN 'product-designers' THEN 'Product Designer'
  WHEN 'fashion-designers' THEN 'Fashion Designer'
  WHEN 'accessory-makers' THEN 'Accessory Maker'
  WHEN 'textile-developers' THEN 'Textile Developer'
  WHEN 'furniture-makers' THEN 'Furniture Maker'
  WHEN 'jewelry-artisans' THEN 'Jewelry Artisan'
  WHEN 'toy-makers' THEN 'Toy Maker'
  WHEN 'authors' THEN 'Author'
  WHEN 'print-journalists' THEN 'Print Journalist'
  WHEN 'comic-artists-publishers' THEN 'Comic Artist or Publisher'
  WHEN 'novelists' THEN 'Novelist'
  WHEN 'cartoonists' THEN 'Cartoonist'
  WHEN 'editorial-writers-columnists' THEN 'Editorial Writer or Columnist'
  WHEN 'magazine-editors' THEN 'Magazine Editor'
  WHEN 'newspaper-editors-companies' THEN 'Newspaper Editor or Company'
  WHEN 'choir-directors-trainers' THEN 'Choir Director or Trainer'
  WHEN 'musicians' THEN 'Musician'
  WHEN 'actors' THEN 'Actor'
  WHEN 'dance-choreographers' THEN 'Dance Choreographer'
  WHEN 'dancers-dance-troupes' THEN 'Dancer or Dance Troupe'
  WHEN 'theater-directors' THEN 'Theater Director'
  WHEN 'circus-performers' THEN 'Circus Performer'
  WHEN 'spoken-word-poets' THEN 'Spoken Word Poet'
  WHEN 'orchestras' THEN 'Orchestra'
  WHEN 'theater-companies' THEN 'Theater Company'
  WHEN 'painters' THEN 'Painter'
  WHEN 'sculptors' THEN 'Sculptor'
  WHEN 'photographers' THEN 'Photographer'
  WHEN 'multimedia-artists' THEN 'Multimedia Artist'
  WHEN 'collage-artists' THEN 'Collage Artist'
  WHEN 'tattoo-artists' THEN 'Tattoo Artist'
  WHEN 'art-galleries-studios' THEN 'Art Gallery or Studio'
  WHEN 'photography-studios' THEN 'Photography Studio'
  WHEN 'traditional-craftsmen' THEN 'Traditional Craftsperson'
  WHEN 'cultural-event-organizers' THEN 'Cultural Event Organizer'
  WHEN 'folk-musicians' THEN 'Folk Musician'
  WHEN 'indigenous-craft-artisans' THEN 'Artisan of Indigenous Crafts'
  WHEN 'crafts-cooperatives' THEN 'Crafts Cooperative'
  WHEN 'cultural-festivals' THEN 'Cultural Festival'
  WHEN 'traditional-cuisine-restaurants' THEN 'Traditional Cuisine Restaurant'
  WHEN 'folk-music-ensembles' THEN 'Folk Music Ensemble'
  WHEN 'museum-curators' THEN 'Museum Curator'
  WHEN 'archeologists' THEN 'Archeologist'
  WHEN 'librarians' THEN 'Librarian'
  WHEN 'provincial-municipal-city-planners' THEN 'Provincial, Municipal or City Planner'
  WHEN 'monumental-sculptors' THEN 'Monumental Sculptor'
  WHEN 'event-curators' THEN 'Event Curator'
  ELSE "name"
END
WHERE "singular_name" IS NULL;
```
