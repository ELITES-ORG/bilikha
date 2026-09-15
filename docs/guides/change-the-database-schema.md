# Change the database schema

Schema lives in `backend/src/db/schema/`, split by area (`taxonomy.ts`,
`geography.ts`, …) and re-exported from `index.ts`. Migrations are generated
from it and committed.

---

## The loop

```bash
# 1. edit backend/src/db/schema/<area>.ts

# 2. generate a migration from the diff
npm --prefix backend run db:generate

# 3. review the generated SQL — always
cat backend/drizzle/NNNN_*.sql

# 4. apply it
npm --prefix backend run db:migrate
```

Step 3 is not optional. Drizzle infers intent from a diff and cannot always tell
a rename from a drop-and-add. A column rename it reads as a drop will silently
delete production data.

## Why not `db:push`

`db:push` syncs the schema directly with no migration file. It is faster, and
it is fine on a throwaway local database — but it needs a TTY to confirm
destructive changes, which CI does not have, and it leaves no reviewable record.
Generated migrations are the default here.

See [ADR 0009](../decisions/0009-migrations-over-db-push.md).

## Conventions

**Tables** `snake_case`, plural — `creative_profiles`.
**Columns** `snake_case` in SQL, `camelCase` in the Drizzle object:
`displayOrder: integer('display_order')`.

**Primary keys** `uuid().primaryKey().defaultRandom()`. Not serial integers —
sequential IDs leak how many creatives have registered, which is exactly the
number a thin registry should not be publishing.

**Timestamps** always `withTimezone: true`. The app is single-timezone today and
will not stay that way the moment anything is scheduled.

**Slugs** every publicly addressable row carries a `slug` with a unique index.
Slugs are permanent — see [Extend the taxonomy](./extend-the-taxonomy.md).

**Foreign keys** always specify `onDelete`. Decide deliberately between
`cascade` (child is meaningless alone) and `restrict` (deletion should fail).

## Indexes

Add one for any column you filter, sort, or join on. Table-level array syntax:

```ts
(table) => [
  uniqueIndex('creative_profiles_slug_idx').on(table.slug),
  index('creative_profiles_municipality_idx').on(table.municipalityId),
]
```

For the directory's text search, use Postgres-native `tsvector` with a GIN
index, plus `pg_trgm` for fuzzy name matching. Do not reach for an external
search service — see [ADR 0003](../decisions/0003-postgres-native-search.md).

## Relations

Drizzle's relational query API (`db.query.x.findMany({ with: … })`) only works
for relations declared with `relations()`. Declaring the foreign key is not
enough. Add both.

## Writing a migration by hand

Some changes cannot be generated — backfills, data migrations, concurrent index
builds. Generate an empty migration and edit it:

```bash
npm --prefix backend run db:generate -- --custom
```

Build indexes on large tables with `CREATE INDEX CONCURRENTLY`, which cannot run
inside a transaction block.

## Before you commit

- [ ] Generated SQL read line by line
- [ ] No unintended `DROP`
- [ ] Migration file committed alongside the schema change
- [ ] `onDelete` set on every new foreign key
- [ ] Indexes for new filter/sort/join columns
- [ ] `relations()` declared if the relational API will be used
- [ ] [`docs/reference/data-model.md`](../reference/data-model.md) updated
- [ ] Seed updated if the change touches reference data

## Rolling back

Drizzle does not generate down migrations. To undo, write a new forward
migration. In development, reset instead:

```bash
npm run db:reset
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```
