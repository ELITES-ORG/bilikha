# Commands

Every script, what it does, and when you want it.

Root scripts delegate into the services, so you rarely need to `cd`. Where a
root alias exists, prefer it.

---

## Root

Run from the repository root.

| Command | Does | Use when |
|---|---|---|
| `npm run setup` | Creates missing `.env` files, then installs both services | First clone; after a dependency change |
| `npm run setup:env` | Creates missing `.env` files from `.env.example`. Never overwrites | You deleted a `.env`, or a new variable was added |
| `npm run db:up` | Starts the Postgres container | Start of a work session |
| `npm run db:down` | Stops it, keeps the data volume | End of a session |
| `npm run db:reset` | **Destroys the volume** and restarts clean | Schema is tangled locally; you want a known state |
| `npm run db:migrate` | Applies pending migrations | After pulling schema changes |
| `npm run db:seed` | Loads domains, sub-domains, municipalities | After a migrate or reset |
| `npm run dev:api` | Backend on :4000, watch mode | Always |
| `npm run dev:web` | Frontend on :5173, watch mode | Always |
| `npm run build` | Production build, both services | Before deploying; to check nothing broke |
| `npm run lint` | oxlint over the frontend | Before committing |
| `npm run typecheck` | `tsc` over both services, no emit | Before committing |
| `npm run docs:check` | Verifies every relative link in the docs resolves | After editing documentation |

`db:reset` deletes all local data. It does not touch anything deployed, but you
will re-run migrate and seed afterwards.

---

## Backend

`npm --prefix backend run <script>`, or from `backend/`.

| Command | Does |
|---|---|
| `dev` | `tsx watch src/index.ts` — restarts on change |
| `build` | `tsc` to `dist/` |
| `start` | Runs the built output. Production entry point |
| `typecheck` | `tsc --noEmit` |
| `db:generate` | Writes a migration from the schema diff. **Review the SQL** |
| `db:migrate` | Applies pending migrations |
| `db:push` | Syncs schema with no migration file. Needs a TTY; not the default — see [ADR 0009](../decisions/0009-migrations-over-db-push.md) |
| `db:studio` | Opens Drizzle Studio to browse data |
| `db:seed` | Idempotent reference-data load, matched on slug |
| `admin:reset-password` | Sets a new password for a username. Sprint 1 recovery path — verify identity out of band first |
| `admin:grant` | Promotes an existing account to `admin`. **The only way to create the first administrator** |
| `migrate:offers` | Manual fallback and verifier for the portfolio → offers move. **The move itself is in migration 0013**, because `db:migrate` applies every pending migration in one pass and leaves no window for a script between creating `offers` and dropping `portfolio_items`. Idempotent; exits 0 if the table is already gone |
| `media:prune` | Dry-run list of orphaned storage objects older than 24 hours. Pass `--delete` to remove them |

---

## Admin

Sprint 1 admin operations:

**Grant administrator role**

```bash
npm --prefix backend run admin:grant -- <username>
```

The account must already exist (register through the app first). There is no
UI for role management — this script is how the first admin is created.

**Reset a forgotten password**

```bash
npm --prefix backend run admin:reset-password -- <username> <new-password>
```

Password must be at least 10 characters. Confirm the person's identity before
running this — email and phone are unverified in this sprint.

**Publish a creative profile**

Use the admin review queue at `/admin` once plan 0003 is running. Until then:

```sql
UPDATE creative_profiles SET status = 'published', updated_at = now()
WHERE slug = '<username>';
```

---

## Frontend

`npm --prefix frontend run <script>`, or from `frontend/`.

| Command | Does |
|---|---|
| `dev` | Vite on :5173, proxying `/api` to :4000 |
| `build` | `tsc -b` then `vite build` to `dist/` |
| `preview` | Serves the production build locally. Use to check the real bundle |
| `lint` | oxlint |

---

## Docker

| Command | Does |
|---|---|
| `docker compose ps` | Container status — look for `(healthy)` |
| `docker compose logs -f postgres` | Follow database logs |
| `docker compose down -v` | Stop and **delete the data volume** |

---

## Common sequences

**Fresh clone**

```bash
npm run setup
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev:api     # and npm run dev:web in a second terminal
```

**After pulling schema changes**

```bash
npm run setup          # picks up new dependencies and env variables
npm run db:migrate
npm run db:seed        # only if reference data changed; always safe
```

**Before committing**

```bash
npm run typecheck
npm run lint
npm run build
```

**Local database is a mess**

```bash
npm run db:reset && npm run db:migrate && npm run db:seed
```
