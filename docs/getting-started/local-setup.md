# Local setup

Clone to a running app with real data. Budget 10 minutes, most of it waiting on
`npm install` and a Docker image pull.

If any step here fails or has drifted, fix it in the same PR as whatever you
came to do. This page rots faster than anything else in the docs.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node | 20+ (24 in use) | `node -v` |
| npm | 10+ | `npm -v` |
| Docker Desktop | any current | `docker info` |
| Git | any current | `git --version` |

`docker info` failing with a pipe error means Docker Desktop is installed but
the daemon is not running. Start the app and wait for the whale icon to settle.

You do not need Postgres installed locally — it runs in Docker.

---

## 1. Install dependencies

From the repository root:

```bash
npm run setup
```

This installs both services. It does not install anything at the root — the root
`package.json` exists only to hold cross-service scripts.

> **If npm blocks an install script:** npm 11 gates postinstall scripts. `tsx`
> and `drizzle-kit` both need esbuild's, which fetches the platform binary.
> Approve it with `npm --prefix backend install-scripts approve esbuild`.

---

## 2. Start Postgres

```bash
npm run db:up
```

First run pulls `postgres:17-alpine`, which takes a while on a slow connection.
Confirm it is healthy before continuing:

```bash
docker compose ps
# STATUS should read: Up (healthy)
```

---

## 3. Create the schema and load reference data

```bash
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```

`db:migrate` applies the committed migrations. `db:seed` loads the nine creative
domains, their 81 sub-domains, and the eight municipalities.

The seed is idempotent and matched on `slug`, so re-running it is always safe.

Expected output from the seed:

```
Municipalities seeded   count: 8
Creative taxonomy seeded  domains: 9  subdomains: 81
```

> `backend/.env` is created by `npm run setup` from `.env.example` and points at
> the Docker database. You should not need to edit it for local work.

---

## 4. Run both services

Two terminals:

```bash
npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:5173
```

Open <http://localhost:5173>. You should see the nine domains listed, loaded
from the API.

The Vite dev server proxies `/api` to the backend, so the browser stays on a
single origin. Do not point the frontend at `http://localhost:4000` directly —
cookie-based sessions will behave differently in development than in production
if you do.

---

## 5. Confirm it works

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok",...}

curl http://localhost:4000/api/v1/health/ready
# {"status":"ready","database":"connected"}

curl http://localhost:5173/api/v1/taxonomy/domains
# the full domain tree, through the Vite proxy
```

Also worth opening once: <http://localhost:5173/styleguide> — every design token
and UI primitive on one page. It is not linked from the product.

---

## Troubleshooting

**`DATABASE_URL must be a valid postgres:// connection string`**
`backend/.env` is missing. `cp backend/.env.example backend/.env`.

**API starts but `/health/ready` reports `unreachable`**
Postgres is not up, or is still starting. `docker compose ps` and wait for
`(healthy)`.

**`db:migrate` prints what look like errors, then succeeds**

Lines like `severity: 'NOTICE', code: '42P06', message: 'schema "drizzle"
already exists, skipping'` are Postgres **notices**, not errors — Drizzle
creating its own bookkeeping schema with `IF NOT EXISTS`. Expected on every run
after the first. Check the last line says `migrations applied successfully` and
the exit code is 0.

**`drizzle-kit push` exits with "Interactive prompts require a TTY"**
Expected — `db:push` wants confirmation it cannot ask for. Use
`db:generate` + `db:migrate` instead. See
[Change the database schema](../guides/change-the-database-schema.md).

**Port already in use**
Something is still running from a previous session. Find and stop it:
`netstat -ano | grep ":4000 "` then `taskkill //PID <pid> //F`.

**Frontend builds but everything is unstyled**
Almost always an interpolated Tailwind class (`` `bg-${color}-500` ``). Tailwind
only generates classes it can find as complete literals. See
[Add a UI component](../guides/add-a-ui-component.md).

---

## Resetting

```bash
npm run db:reset                      # destroys the volume, starts clean
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```
