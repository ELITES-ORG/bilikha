# 0047. Admin-managed taxonomy — create, edit, archive domains and sub-domains

- **Status:** In progress
- **Owner:** userMarcPaul
- **Related:** [ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md) ·
  [ADR 0009](../decisions/0009-migrations-over-db-push.md) ·
  [ADR 0032](../decisions/0032-an-accepted-agreement-is-not-deleted.md) ·
  [ADR 0035](../decisions/0035-the-admin-area-is-a-layout.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [plan 0022](./0022-admin-layout.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [Extend the taxonomy](../guides/extend-the-taxonomy.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #14](https://github.com/ELITES-ORG/bilikha/issues/14)

## Goal

An administrator can create, rename, reorder, archive, restore and — only when
nothing references it — delete a creative domain or sub-domain from
`/admin/taxonomy`, and the next deploy does not revert any of it. Archived
items disappear from pickers and browse surfaces while every profile, offer,
posting and URL that already names one keeps working. Every change leaves an
audit row.

## Rules for whoever executes this

- **Read [ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)
  first.** It is the whole design. In particular: the seed stops updating,
  slugs are immutable, and the client cache is deliberately *not* invalidated
  by polling.
- **Four PRs, in order.** Phase 1, phase 2, phase 3, phase 4. Each is
  releasable on its own and each leaves the app working. Do not open one PR for
  the lot.
- **Backend relative imports end in `.js`.** The build is ESM with `NodeNext`.
- **Read the generated migration SQL line by line** before applying it. A
  Drizzle diff cannot always tell a rename from a drop.
- Run `npm run typecheck`, `npm run lint`, `npm run test` and
  `npm run docs:check` before reporting any phase done.

## Prerequisites

Everything below must be true before step 1.1.

- [ ] **Not met — ADR 0049 is still Proposed.** Only reyxdz can accept it.
      Execution went ahead on userMarcPaul's instruction; nothing is merged, so
      the decision is still reversible by discarding this branch.
      Verify: `head -4 docs/decisions/0049-the-database-is-the-taxonomy-source-of-truth.md`.
- [x] A local database is running and current:
      ```bash
      npm run db:up
      npm --prefix backend run db:migrate
      npm --prefix backend run db:seed
      ```
      Expected final line: `domains: 9  subdomains: 81` then `Seed complete`.
- [x] Branch `feat/admin-managed-taxonomy` cut from `main`.

## Blockers

- **None blocking phase 4.** Issue #14 says to coordinate with "the admin
  redesign, which is live work", and `MY-ISSUES.md` reads that as
  [plan 0043](./0043-the-account-hub-redesign.md). It is not: 0043 is the
  account hub (`/account`) and does not touch `frontend/src/pages/admin/` at
  all. The admin layout this plan builds on is
  [plan 0022](./0022-admin-layout.md), which is **Complete**. The only live
  plan touching the admin area is [plan 0045](./0045-audio-video-and-pdf-uploads.md)
  (Draft, owner reyxdz), and only `AdminMediaPage.tsx` — a file phase 4 never
  opens. Confirm this is still true before starting phase 4:
  `grep -rln "pages/admin" docs/plans/*.md`.
- Phase 1 cannot start until ADR 0049 is Accepted. The seed change is the part
  that is awkward to reverse once an environment has been edited.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema, migration and the seed | 6 / 6 | Done |
| 2. Service, validation and audit | 6 / 6 | Done |
| 3. Endpoints, contracts and read paths | 7 / 7 | Done |
| 4. The `/admin/taxonomy` screen | 0 / 5 | Not started — ships as its own pull request |
| 5. Documentation | 4 / 4 | Done |

---

## Phase 1 — Schema, migration and the seed

**PR 1.** Adds the columns and the audit table, and stops the seed overwriting
edits. No behaviour change visible to anyone yet: nothing writes `archived_at`
and nothing reads it.

### Step 1.1 — Add `archivedAt` to both taxonomy tables

- [x] **Action.** In `backend/src/db/schema/taxonomy.ts`, add to
      `creativeDomains` and to `creativeSubdomains`, after `displayOrder`:
      ```ts
          // Null means active. Archiving hides the item from pickers and browse
          // surfaces without touching the profiles, offers and postings that
          // already reference it, and without breaking a URL that names its
          // slug (ADR 0049).
          archivedAt: timestamp('archived_at', { withTimezone: true }),
      ```
      Add a partial index to each table's index array so the active-only reads
      the service does on every page are indexed:
      ```ts
        index('creative_domains_active_idx').on(table.displayOrder).where(sql`archived_at is null`),
      ```
      and the same for `creative_subdomains` on `(domainId, displayOrder)` as
      `creative_subdomains_active_idx`. Import `sql` from `drizzle-orm`.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.2 — Add the `taxonomy_changes` audit table

- [x] **Action.** In `backend/src/db/schema/taxonomy.ts`, after
      `creativeSubdomains`, add — the shape follows `moderationActions` in
      `backend/src/db/schema/profiles.ts:97`:
      ```ts
      export const taxonomyChangeActionEnum = pgEnum('taxonomy_change_action', [
        'created',
        'updated',
        'archived',
        'restored',
        'deleted',
      ]);

      /**
       * Append-only record of every administrator change to the taxonomy. Rows
       * are never updated or deleted.
       *
       * This exists because of ADR 0049: once the database rather than
       * `taxonomy-data.ts` is the source of truth, "who renamed this and when"
       * has no answer in git. `item_kind` and `item_slug` are stored as text,
       * not as a foreign key, so the history of a deleted item survives it.
       */
      export const taxonomyChanges = pgTable(
        'taxonomy_changes',
        {
          id: uuid('id').primaryKey().defaultRandom(),
          itemKind: taxonomyItemKindEnum('item_kind').notNull(),
          itemSlug: text('item_slug').notNull(),
          action: taxonomyChangeActionEnum('action').notNull(),
          // Nullable so the history survives an administrator's account being
          // deleted, as moderation_actions does.
          adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
          // The changed fields only, before and after. Never the whole row:
          // the point of reading this table is to see what moved.
          before: jsonb('before'),
          after: jsonb('after'),
          createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        },
        (table) => [
          index('taxonomy_changes_item_idx').on(table.itemKind, table.itemSlug),
          index('taxonomy_changes_created_idx').on(table.createdAt),
        ],
      );

      export const taxonomyItemKindEnum = pgEnum('taxonomy_item_kind', ['domain', 'subdomain']);

      export type TaxonomyChange = typeof taxonomyChanges.$inferSelect;
      ```
      Declare `taxonomyItemKindEnum` *above* `taxonomyChanges`, not below —
      the snippet lists it second for readability only. Add `pgEnum` and
      `jsonb` to the `drizzle-orm/pg-core` import and import `users` from
      `./users.js`.
- [x] **Verify.** `npm --prefix backend run typecheck` passes and
      `grep -n "taxonomyChanges" backend/src/db/schema/index.ts` shows the
      re-export (add it if `index.ts` lists tables explicitly).

### Step 1.3 — Generate and read the migration

- [x] **Action.**
      ```bash
      npm --prefix backend run db:generate
      cat backend/drizzle/0026_strange_celestials.sql
      ```
- [x] **Verify.** The SQL contains `ALTER TABLE "creative_domains" ADD COLUMN "archived_at"`,
      the same for `creative_subdomains`, `CREATE TABLE "taxonomy_changes"`, two
      `CREATE TYPE`, and the four indexes. **It contains no `DROP`.** If it
      contains a `DROP`, stop and re-read the schema diff — do not apply it.

### Step 1.4 — Apply the migration

- [x] **Action.** `npm --prefix backend run db:migrate`
- [x] **Verify.**
      ```bash
      docker compose exec -T db psql -U bilikha -d bilikha -c "\d creative_subdomains" -c "\d taxonomy_changes"
      ```
      `archived_at` appears on `creative_subdomains`; `taxonomy_changes` exists.

### Step 1.5 — The seed stops updating what already exists

- [x] **Action.** In `backend/src/db/seed/index.ts`, replace the
      `.onConflictDoUpdate(...)` call on `creativeDomains` with
      `.onConflictDoNothing({ target: creativeDomains.slug })`, and the one on
      `creativeSubdomains` with
      `.onConflictDoNothing({ target: creativeSubdomains.slug })`.

      `onConflictDoNothing` returns no row, so the existing
      `const [insertedDomain] = await tx.insert(...).returning(...)` is `undefined`
      for a domain that already exists and the `Failed to upsert domain` throw
      fires on every re-run. Replace that block with an insert followed by a
      select on slug:
      ```ts
            await tx
              .insert(creativeDomains)
              .values({ slug: domain.slug, name: domain.name, displayOrder: domainIndex + 1 })
              .onConflictDoNothing({ target: creativeDomains.slug });

            // onConflictDoNothing returns nothing when the row was already
            // there, which after ADR 0049 is the normal case: the seed fills
            // gaps and never overwrites an administrator's edit. The id is
            // read back rather than returned.
            const [existingDomain] = await tx
              .select({ id: creativeDomains.id })
              .from(creativeDomains)
              .where(eq(creativeDomains.slug, domain.slug))
              .limit(1);

            if (!existingDomain) {
              throw new Error(`Failed to insert domain ${domain.slug}`);
            }
      ```
      Use `existingDomain.id` where `insertedDomain.id` was used. Import `eq`
      from `drizzle-orm`.

      Leave the `municipalities` upsert and `seedBarangays` exactly as they
      are — ADR 0049 changes the creative taxonomy only.

      Update the file's header comment: it currently claims labels are
      refreshed on every run, which this step makes false.
- [x] **Verify.** Rename one sub-domain by hand, re-seed, confirm the rename
      survives:
      ```bash
      docker compose exec -T db psql -U bilikha -d bilikha -c "update creative_subdomains set name = 'ZZ Seed Guard' where slug = 'filmmakers'"
      npm --prefix backend run db:seed
      docker compose exec -T db psql -U bilikha -d bilikha -c "select name from creative_subdomains where slug = 'filmmakers'"
      ```
      Expected: `ZZ Seed Guard`. Before this step it would read `Filmmakers`.
      Then restore it:
      ```bash
      docker compose exec -T db psql -U bilikha -d bilikha -c "update creative_subdomains set name = 'Filmmakers' where slug = 'filmmakers'"
      ```

### Step 1.6 — Test that the seed is idempotent and non-destructive

- [x] **Action.** Create `backend/src/db/seed/seed-idempotence.test.ts` with two
      cases: seeding twice leaves 9 domains and 81 sub-domains; and a row whose
      `name` was changed keeps that name after a re-seed. Follow the import and
      `db` usage in `backend/src/modules/admin/moderation.test.ts`.
- [x] **Verify.** `npm --prefix backend run test` passes, including the new file.

---

## Phase 2 — Service, validation and audit

**PR 2.** The service layer, with tests, and no routes yet. Nothing reachable
over HTTP at the end of this phase — that is deliberate, so the validation
rules get reviewed on their own.

### Step 2.1 — Add the admin taxonomy contracts

- [x] **Action.** In `backend/src/contracts/taxonomy.ts`, add `archivedAt: string | null`
      to `CreativeDomain` and `CreativeSubdomain`, then append the admin shapes
      (ADR 0037 — one definition, imported by both sides):
      ```ts
      /** Admin views include archived items; public ones never do. */
      export interface AdminTaxonomyDomain extends CreativeDomain {
        subdomains: AdminTaxonomySubdomain[];
        /** Rows across every table that reference this domain's sub-domains. */
        referenceCount: number;
      }

      export interface AdminTaxonomySubdomain extends CreativeSubdomain {
        referenceCount: number;
      }

      export interface TaxonomyChangeEntry {
        id: string;
        itemKind: 'domain' | 'subdomain';
        itemSlug: string;
        action: 'created' | 'updated' | 'archived' | 'restored' | 'deleted';
        adminUsername: string | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
        createdAt: string;
      }
      ```
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 2.2 — Add the Zod schemas, with slugs immutable on update

- [x] **Action.** Create `backend/src/modules/admin/taxonomy.schema.ts`.
      Follow the shape and comment style of `admin.schema.ts`.
      - `createDomainSchema` / `createSubdomainSchema`: `slug` (kebab-case,
        `/^[a-z0-9]+(-[a-z0-9]+)*$/`, 2–64 chars), `name` (trimmed, 2–120),
        `description` optional, `displayOrder` optional positive int.
        `createSubdomainSchema` also takes `domainSlug`.
      - `updateTaxonomySchema`: `name`, `description`, `displayOrder`, all
        optional — **and `.strict()`**, so a request carrying `slug` is a `400`
        rather than a silently ignored field. Comment why: a slug is a public
        identifier and an edit form must not be one keystroke from breaking
        every link that names it.
      - `taxonomyParamsSchema`: `{ slug: z.string().min(1) }`.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 2.3 — Write the service tests before the service

- [x] **Action.** Create `backend/src/modules/admin/taxonomy.test.ts` covering,
      at minimum:
      - creating a sub-domain writes a `created` audit row;
      - updating a name writes an `updated` row carrying `before` and `after`;
      - `updateTaxonomySchema.parse({ slug: 'x' })` throws;
      - archiving a referenced sub-domain succeeds and leaves the referencing
        `creative_profile_subdomains` row intact;
      - deleting a referenced sub-domain throws a `409`;
      - deleting an unreferenced one succeeds and writes a `deleted` row;
      - restoring sets `archivedAt` back to null;
      - creating a sub-domain whose slug collides returns `409`.
      Use `makeAdmin` and `makeCreative` from `backend/src/test/factories.ts`.
- [x] **Verify.** `npm --prefix backend run test` runs them and they **fail**,
      naming the missing service functions. A test that passes here is testing
      nothing.

### Step 2.4 — Write the service

- [x] **Action.** Create `backend/src/modules/admin/taxonomy.service.ts`
      exporting `listTaxonomyForAdmin`, `createDomain`, `createSubdomain`,
      `updateTaxonomyItem`, `archiveTaxonomyItem`, `restoreTaxonomyItem`,
      `deleteTaxonomyItem` and `listTaxonomyChanges`. Follow
      `admin.service.ts` for structure, and `taxonomy.service.ts` for
      serialisation.
      - Every mutation runs in one `db.transaction`, writing the row and its
        `taxonomy_changes` entry together. A change with no audit row is a bug,
        and two statements outside a transaction is how that happens.
      - `referenceCount` is one query per kind: for a sub-domain, the sum of
        matching rows in `creative_profile_subdomains`, `offers` and
        `postings`.
      - Delete catches the Postgres foreign-key violation (`code === '23503'`)
        and rethrows `AppError.conflict` naming the count. Do not pre-check and
        then delete — the gap between the two is a race, and `RESTRICT` is the
        real guard.
      - Archiving a **domain** archives its sub-domains in the same
        transaction, each with its own audit row. A visible domain whose
        children are gone is worse than either state.
- [x] **Verify.** `npm --prefix backend run test` — every case from step 2.3
      passes.

### Step 2.5 — Archived items stay editable for whoever already uses them

- [x] **Action.** In `backend/src/modules/me/me.service.ts`, the two places
      that resolve submitted sub-domain slugs (around `:155` and `:250`)
      currently accept any slug that exists. Narrow them to active slugs
      **plus** the slugs already on that profile, so archiving does not lock a
      registrant out of their own edit form (ADR 0049). Reject the rest with
      the existing `field: 'subdomainSlugs'` error.
- [x] **Verify.** Add a case to `backend/src/modules/admin/taxonomy.test.ts`:
      a creative whose sub-domain is archived can re-save an unchanged profile;
      a creative adding a *different* archived sub-domain is rejected.
      `npm --prefix backend run test` passes.

### Step 2.6 — Public read paths exclude archived items

- [x] **Action.** In `backend/src/modules/taxonomy/taxonomy.service.ts`, add
      `where: isNull(creativeDomains.archivedAt)` to `listDomains` and the
      equivalent on the nested `subdomains`, and to `getDomainBySlug`'s
      sub-domain list. `getDomainBySlug` itself keeps serving an archived
      domain — the slug is public and a shared link must not 404 — but the
      service's doc comment should say so explicitly, because it reads as an
      oversight otherwise.
- [x] **Verify.** Archive one sub-domain locally, then
      `curl -s localhost:4000/api/v1/taxonomy/domains | grep -c '"slug"'`
      returns a count one lower than before. Restore it afterwards.

---

## Phase 3 — Endpoints, contracts and read paths

**PR 3.** The five endpoints. Admin-only by construction: `adminRouter`
already calls `requireAdmin` for everything mounted under it.

### Step 3.1 — Mount the routes

- [x] **Action.** Create `backend/src/modules/admin/taxonomy.routes.ts` with
      `GET /taxonomy`, `POST /taxonomy/domains`, `POST /taxonomy/subdomains`,
      `PATCH /taxonomy/:kind/:slug`, `POST /taxonomy/:kind/:slug/archive`,
      `POST /taxonomy/:kind/:slug/restore`, `DELETE /taxonomy/:kind/:slug` and
      `GET /taxonomy/changes`. Parse `kind` with
      `z.enum(['domains', 'subdomains'])`. Copy the parse-then-call shape from
      `admin.routes.ts`; no logic in the route.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 3.2 — Attach it to the admin router

- [x] **Action.** In `backend/src/modules/admin/admin.routes.ts`, after the
      `requireAdmin` line, add `adminRouter.use(taxonomyAdminRouter);`.
- [x] **Verify.** Signed out:
      `curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/v1/admin/taxonomy`
      returns **`404`**, not `401`. `requireAdmin` answers 404 on purpose — the
      existence of an admin surface is not something an ordinary user needs
      confirmed. This step originally expected 401; 404 is correct.

### Step 3.3 — Check every endpoint by hand against the running API

- [x] **Action.** Signed in as an administrator, exercise create → update →
      archive → restore → delete on a throwaway sub-domain
      (`slug: zz-test-subdomain`).
- [x] **Verify.** Each returns `200`/`201`; `select * from taxonomy_changes
      order by created_at` shows five rows in that order.

### Step 3.4 — Confirm a referenced item cannot be deleted over HTTP

- [x] **Action.** `DELETE /api/v1/admin/taxonomy/subdomains/filmmakers`, which
      has registrants in the seeded local data.
- [x] **Verify.** `409`, body `error.code` is `CONFLICT`, message names the
      count. **Not a 500** — a 500 here means the `23503` catch in step 2.4 is
      not firing.

### Step 3.5 — Confirm a slug cannot be changed over HTTP

- [x] **Action.** `PATCH /api/v1/admin/taxonomy/subdomains/filmmakers` with
      `{"slug":"films","name":"Filmmakers"}`.
- [x] **Verify.** `400`, `VALIDATION_ERROR`, and
      `select slug from creative_subdomains where name = 'Filmmakers'` still
      reads `filmmakers`.

### Step 3.6 — Mirror the contracts on the frontend

- [x] **Action.** Add the new types to `frontend/src/features/taxonomy/types.ts`
      and create `frontend/src/features/admin/taxonomy-api.ts` with the query
      and mutation hooks, following `frontend/src/features/admin/api.ts`. Every
      mutation's `onSuccess` invalidates both `adminKeys.all` and
      `taxonomyKeys.all` — the second is what makes the administrator's own
      pickers correct immediately (ADR 0049 §5).
- [x] **Verify.** `npm --prefix frontend run typecheck` passes.

### Step 3.7 — Document the endpoints

- [x] **Action.** Add the eight routes to the `/admin/*` section of
      `docs/reference/api.md`, in the file's existing format, including the
      `409` and `400` cases from steps 3.4 and 3.5.
- [x] **Verify.** `npm run docs:check` passes.

---

## Phase 4 — The `/admin/taxonomy` screen

**PR 4, not in this one.** `ADMIN_SECTIONS` plus a route is the whole cost of a
new admin surface (ADR 0035), so this phase adds files rather than editing
siblings. Only `AdminMediaPage.tsx` is contended, and nothing here touches it.

It is a separate pull request because `pr-audit` requires screenshots and all
seven "States checked" boxes the moment a `.tsx` file changes, and the screen
has not been rendered yet. Holding it back keeps that requirement off the API
work, which has nothing to show.

### Step 4.1 — Add the section

- [ ] **Action.** Add `{ label: 'Taxonomy', path: '/admin/taxonomy' }` to
      `ADMIN_SECTIONS` in `frontend/src/pages/admin/admin-sections.ts`. That
      array plus a route is the whole cost of a new admin surface (ADR 0035) —
      do not edit the sibling pages.
- [ ] **Verify.** `npm --prefix frontend run test` passes
      `admin-sections.test.ts`.

### Step 4.2 — Build the page

- [ ] **Action.** Create `frontend/src/pages/admin/AdminTaxonomyPage.tsx`:
      the nine domains, each expandable to its sub-domains, with create,
      rename, reorder, archive, restore and delete. Archived items are shown
      with their state and their reference count, not hidden — an administrator
      needs to see what they archived in order to restore it.
      Primitives from `frontend/src/components/ui/` only. Tokens only: no raw
      colours, no interpolated Tailwind class names
      ([`frontend/DESIGN.md`](../../frontend/DESIGN.md)).
- [ ] **Verify.** `npm --prefix frontend run lint` and `typecheck` pass.

### Step 4.3 — Make delete say what it does

- [ ] **Action.** Delete asks for confirmation naming the item, and is only
      offered when `referenceCount` is 0. Archive is the primary action
      everywhere else. The confirmation text says the deletion cannot be undone
      and that archiving is the reversible option.
- [ ] **Verify.** With a referenced item selected, no delete control is
      reachable.

### Step 4.4 — Add the route

- [ ] **Action.** In `frontend/src/App.tsx`, lazy-import `AdminTaxonomyPage`
      alongside the other admin pages and add the nested route under `/admin`.
      It must land in the existing admin chunk, not a new one.
- [ ] **Verify.** `npm --prefix frontend run build && npm run check:bundle`
      passes with the budget **unchanged**. The page is lazy, so the initial
      bundle must not move; if it does, the import is not lazy.

### Step 4.5 — Check it on a phone-sized viewport

- [ ] **Action.** Open `/admin/taxonomy` at 360px wide and at 320px.
      **Not done:** no Chrome or Chromium on the machine this was executed on,
      so `scripts/screenshot.mjs` could not run. The layout was written to the
      rules — wrapping rows, `min-h-11` controls, no fixed widths — but that is
      not the same as having looked at it.
- [ ] **Verify.** No horizontal scroll; every control at least 44px
      ([plan 0046](./0046-responsive-on-every-screen.md)).

---

## Phase 5 — Documentation

Fold each step into the PR that makes it true rather than leaving them to the
end — a guide that describes the old behaviour is worse than no guide.

### Step 5.1 — Rewrite the taxonomy guide

- [x] **Action.** `docs/guides/extend-the-taxonomy.md` currently opens with
      "Source of truth: `backend/src/db/seed/taxonomy-data.ts`", which phase 1
      makes false. Rewrite it around the admin area: labels are edited there,
      `taxonomy-data.ts` is the data a new environment starts from, removal is
      archiving. Keep "a slug is permanent" as the one rule and say that the
      API now enforces it. Ship with PR 1.
- [x] **Verify.** `npm run docs:check` passes and no sentence in the file
      claims the seed updates labels.

### Step 5.2 — Update the data model reference

- [x] **Action.** In `docs/reference/data-model.md`, add `archived_at` to
      `creative_domains` (line ~22) and `creative_subdomains` (line ~40), add a
      `taxonomy_changes` section after `moderation_actions` (line ~227), and
      update the `Seeding` section (line ~492) to say the creative taxonomy is
      insert-only. Ship with PR 1.
- [x] **Verify.** `npm run docs:check` passes.

### Step 5.3 — Remove the planned-work note

- [x] **Action.** If `docs/reference/data-model.md`'s `Planned` section or the
      README lists admin-managed taxonomy as not built, remove those rows.
      Ship with the PR that makes each true.
- [x] **Verify.** `grep -rn "admin-managed taxonomy" docs README.md` returns
      only this plan and ADR 0049.

### Step 5.4 — Mark the plan and ADR

- [x] **Action.** Set this plan's Progress table and Status to match what
      shipped. If a phase was deferred, say so in the table cell rather than
      leaving the boxes bare.
- [x] **Verify.** `npm run docs:check` passes — `check-plan-status.mjs` fails a
      plan whose status outruns its table.

---

## Acceptance

- [x] A renamed sub-domain survives a re-seed. Verified by planting a rename,
      running `db:seed`, and reading the label back; and by
      `seed-idempotence.test.ts`. The deploy itself is unverified — no deploy
      has run from this branch.
- [x] Archiving a referenced sub-domain hides it from `GET /taxonomy/domains`,
      keeps it in the admin tree, leaves the referencing row intact, and leaves
      the registrant able to re-save their profile. Verified over HTTP and in
      `taxonomy.test.ts`.
- [x] Deleting a referenced item returns `409` naming the count. Verified over
      HTTP against a real referencing profile.
- [x] `PATCH` with a `slug` returns `400 VALIDATION_ERROR`
      (`Unrecognized key: "slug"`) and the slug is unchanged. Verified over HTTP.
- [x] Create, update, archive, restore and delete each wrote one row naming the
      administrator; the deleted item's history survived it.
- [x] Non-admins and signed-out callers get `404` on every `/admin/taxonomy`
      route — the documented default-deny, not 401 or 403.
- [x] Re-running the seed left a renamed label, an archived item and the 9/81
      counts untouched.
- [x] `typecheck`, `lint`, `docs:check` pass; backend 140 + 17 new tests and
      frontend 101 pass; `check:bundle` passes at 158.79/159.10 kB JS and
      17.67/17.80 kB CSS — **budget unchanged**.

## Not verified here

- **No deploy has run from this branch**, so "the edit survives a deploy" is
  verified only as "the edit survives the seed that a deploy runs".
- **Nothing is merged.** ADR 0049 is still Proposed, and accepting it is
  reyxdz's call.
- **Phase 4 is written but not in this pull request.** The screen has never
  been rendered — there was no browser on the machine this was executed on —
  so it waits for screenshots.

## Follow-ups

- **Seed drift is invisible.** ADR 0049 gives up reproducibility from the
  repository and nothing detects the divergence. A `db:taxonomy:diff` command
  printing the difference between `taxonomy-data.ts` and the connected database
  is the cheap mitigation. Not in this plan.
- **A stale tab can show an archived sub-domain in a picker** until it reloads.
  Deliberate (ADR 0049 §5, alternatives). The version endpoint the issue
  proposes is the fix if this turns out to matter; `app-update.ts` already has
  the focus hook to hang it on.
- **Aliases** — the everyday-words search in
  [issue #24](https://github.com/ELITES-ORG/bilikha/issues/24) may want to be
  maintained from this same screen. Out of scope here, and blocked on #22
  regardless.
- **Domain creation is built but should almost never be used.** The nine
  domains are statutory (constraint 7). Consider whether the create-domain
  control belongs in the UI at all, or whether the endpoint alone is enough.
