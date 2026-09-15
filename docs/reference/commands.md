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
