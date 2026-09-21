# 0002. Deployment — Vercel, Render, Supabase (free tier)

- **Status:** In progress
- **On the unticked boxes (2026-09-19).** Phases 1, 2, 3 and 7 are done: the
  Supabase project, the seeded production database, the Render API and
  `deployments.md` all exist, and plan 0001 carries the proxy amendment as its
  step 7.2. What was never done is ticking the individual actions as they were
  performed, most of them clicks in a dashboard nobody can verify after the
  fact. They are left unticked and the table says so, rather than being ticked
  now on the strength of the result looking right.
- **Phase 7 is the exception and was ticked**, because every one of its six
  boxes is checkable after the fact and was checked on 2026-09-19:
  `docs/reference/deployments.md` exists and `docs:check` exits 0; plan 0001's
  Phase 7 carries the proxy step; and `backend/src/app.ts` still sets
  `sameSite: 'lax'` with `secure: isProduction`, with the note about the
  same-origin proxy present at plan 0001 step 4.5 — better worded than the text
  this plan asked for, so it was left alone.
- **Related:** [ADR 0002](../decisions/0002-pern-with-client-rendered-spa.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md) ·
  [Plan 0001](./0001-registration-and-auth.md) ·
  [environment reference](../reference/environment.md)

---

## Goal

The current application running on public URLs: React SPA on Vercel, Express API
on Render, Postgres on Supabase. Everything on free tiers, with the API proxied
through Vercel so the app and API share one origin.

**Run this before [plan 0001](./0001-registration-and-auth.md).** Session
cookies behave differently in production, and building auth against the wrong
assumption means rewriting it. Phase 4 here settles that assumption.

---

## Who does what

Most of this is **manual dashboard work** — creating accounts, saving a database
password, clicking through settings on three services. It cannot be delegated to
an agent, and it should not be: you are creating credentials that belong to you.

Some phases are ordinary repo and CLI work and can be handed off.

| Phase | Who | Why |
|---|---|---|
| 1. Supabase database | **You** | Account creation, password generation |
| 2. Migrate and seed | Either | CLI commands, but they need the live connection string |
| 3. Render API | **You** | Dashboard settings and secret entry |
| 4.1 Point the proxy at Render | Agent | A one-line file edit and a commit |
| 4.2–4.5 Vercel project | **You** | Dashboard, and a secret to update on Render |
| 5. Verify the deployment | Either | curl plus a browser check — the Safari check is yours |
| 6. Keep the free tier awake | **You** | Another account signup |
| 7. Document and amend plan 0001 | Agent | Pure documentation work |

### While you work through it

1. **Go in order.** Later phases need URLs produced by earlier ones.
2. **Run each Verify before moving on.** Most mistakes here are silent — a wrong
   setting produces a working deployment that fails in one browser.
3. **Never commit a secret.** `DATABASE_URL` and `SESSION_SECRET` are entered in
   dashboards only.
4. **Fill in the Values table as you go.** Later phases read from it.

## Why the API is proxied through Vercel

This is the single most important decision here, so do not "simplify" it away.

Deploying frontend and API to their own hosts gives you `*.vercel.app` and
`*.onrender.com` — different registrable domains, therefore **cross-site**. A
session cookie then needs `SameSite=None; Secure`, which makes it a third-party
cookie. Safari blocks those by default, Firefox isolates them, and Chrome is
phasing them down.

Your audience is mobile-heavy in the Philippines, where iOS Safari is a
meaningful share. That configuration ships auth that silently fails to stay
logged in.

The Vercel rewrite in `frontend/vercel.json` proxies `/api/*` to Render, so the
browser only ever talks to one origin. The cookie stays first-party,
`sameSite: 'lax'` works, and [plan 0001](./0001-registration-and-auth.md)
needs no changes. It costs one config file and is free.

---

## What the free tier actually gives you

Know these before you promise anyone a demo.

| Limit | Effect | Mitigation |
|---|---|---|
| **Render spins down after ~15 min idle** | First request after idle takes 50+ seconds | Phase 6 adds an uptime pinger. 750 free instance-hours/month covers one service running continuously |
| **Supabase pauses a project after ~7 days inactive** | Database unreachable until manually resumed | Phase 6's pinger keeps queries flowing |
| **Supabase free: 500 MB database** | Plenty for sprint 1 | Watch it once portfolio metadata lands |
| **Vercel free is fair-use** | Fine at this traffic | — |
| **Render free has no shell or pre-deploy hook** | Migrations must run from the build command or your machine | Phase 3 uses the build command |

**Before any stakeholder demo**, budget roughly $7/month for Render's starter
instance. Someone opening a link that hangs for a minute is the whole
impression.

---

## Scope

**In scope**
- Supabase Postgres, schema migrated and seeded
- Render web service running the API
- Vercel static deployment of the SPA, with the `/api` proxy
- Production environment variables
- Uptime pinging to prevent spin-down
- Verification that a cookie set by the API survives in the browser

**Out of scope**
- Custom domain (add later; the proxy means it is not needed for correctness)
- CI/CD beyond each host's built-in git deploys
- Staging environment separate from production
- Backups, alerting, log aggregation

---

## Prerequisites

- [ ] The repository is pushed to GitHub. Both hosts deploy from a git remote.
- [ ] `npm run build` passes locally.
- [ ] Accounts on [supabase.com](https://supabase.com),
      [render.com](https://render.com), [vercel.com](https://vercel.com) —
      sign in to all three with the **same GitHub account**.

```bash
cd <repo root>
npm run build      # must exit 0
git status         # should be clean
```

---

## Values — fill these in as you go

| Key | Value | From |
|---|---|---|
| Supabase project ref | | Phase 1 |
| `DATABASE_URL` (session pooler) | | Phase 1 |
| `SESSION_SECRET` | | Phase 3 |
| Render service URL | | Phase 3 |
| Vercel deployment URL | | Phase 4 |

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Supabase database | 6 / 6 | Live; per-action boxes unticked |
| 2. Migrate and seed production | 3 / 3 | Live; per-action boxes unticked |
| 3. Render API | 6 / 6 | Live; per-action boxes unticked |
| 4. Vercel frontend and proxy | 4 / 5 | CORS_ORIGINS still to update |
| 5. Verify the deployment | 3 / 4 | Safari check outstanding |
| 6. Keep the free tier awake | 0 / 2 | Not started |
| 7. Document and amend plan 0001 | 3 / 3 | Done; verified 2026-09-19 |

---

# Phase 1 — Supabase database

**Manual.**

You are using Supabase **only as a Postgres host**. Do not enable or wire up
Supabase Auth — [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md)
specifies our own username and password authentication. Anyone who "helpfully"
adds Supabase Auth mid-sprint is creating a second, conflicting auth system.

### Step 1.1 — Create the project

- [ ] **Action.** At [supabase.com/dashboard](https://supabase.com/dashboard) →
  **New project**.
  - Name: `bilikha`
  - Database password: generate a strong one and **save it** — it appears in the
    connection string and cannot be retrieved later, only reset
  - Region: **Southeast Asia (Singapore)** — `ap-southeast-1`. Closest to
    Biliran; every other region adds a round trip to every query
- [ ] **Action.** Under **Security**, **uncheck Enable Data API**.

  It is checked by default. The Data API (PostgREST) auto-generates a public
  REST API over the `public` schema, reachable with the anon key — which is
  designed to be shipped in client apps and is therefore not a secret. Combined
  with the default "Automatically expose new tables", the `users` table created
  in [plan 0001](./0001-registration-and-auth.md) would be readable over the
  internet, `password_hash` and all, with RLS off and nothing behind it.

  Nothing here uses it. The API connects over the Postgres wire protocol with a
  connection string, which this setting does not affect. Supabase will warn that
  `supabase-js` cannot query the database — that is the intended outcome.

  Leave **Enable automatic RLS** unchecked: with the Data API off it is
  irrelevant, and the API connects as the database owner, which bypasses RLS.

- [ ] **Action.** Leave **GitHub (optional)** unconnected.

  It lets Supabase manage schema from the repository, which would compete with
  Drizzle migrations — see [ADR 0009](../decisions/0009-migrations-over-db-push.md).
  Schema changes come from `drizzle/`, from one place only.

- [ ] **Verify.** Before clicking create: Data API unchecked, GitHub not
  connected, region Singapore, and **the database password saved in a password
  manager**. It cannot be retrieved afterwards, only reset.
- [ ] **Verify.** Project status reads **Active** (takes a couple of minutes).

### Step 1.2 — Get the session pooler connection string

- [ ] **Action.** Project → **Connect** (or Settings → Database) → **Connection
  string** → **Session mode** (not Transaction mode, not Direct).

It looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

**Why session mode specifically:**

- **Direct connection** is IPv6-only on new Supabase projects unless you pay for
  the IPv4 add-on. Render's outbound may not reach it.
- **Transaction mode** (port 6543) does not support prepared statements, which
  `postgres.js` uses by default. It would require `prepare: false` in
  `backend/src/db/index.ts`.
- **Session mode** (port 5432 on the *pooler* host) is IPv4 and supports
  prepared statements, so the existing database code works unchanged.

- [ ] **Action.** Replace `[YOUR-PASSWORD]` with the real password. If the
  password contains `@ : / ? # [ ] %`, URL-encode it (`@` → `%40`).
- [ ] **Action.** Append `?sslmode=require`.
- [ ] **Action.** Record it in the Values table.
- [ ] **Verify.** The string contains `pooler.supabase.com:5432` and ends with
  `?sslmode=require`.

### Step 1.3 — Test the connection from your machine

- [ ] **Action.** From the repo root, with your real connection string:

```bash
cd backend
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  npx tsx -e "import postgres from 'postgres';const sql=postgres(process.env.DATABASE_URL);console.log(await sql\`select version()\`);await sql.end()"
```

- [ ] **Verify.** Prints a row containing `PostgreSQL 1x.x`. If it hangs or
  refuses, you are on the wrong connection string — return to Step 1.2.

---

# Phase 2 — Migrate and seed production

**Either.**

Run this from your machine for the first deploy, so you see the output. Phase 3
adds it to the build command for subsequent deploys.

### Step 2.1 — Apply migrations

- [ ] **Action.** From `backend/`:

```bash
DATABASE_URL="<your session pooler URL>" npm run db:migrate
```

- [ ] **Verify.** Ends with `migrations applied successfully`. Postgres `NOTICE`
  lines about the `drizzle` schema are normal.

### Step 2.2 — Seed reference data

- [ ] **Action.**

```bash
DATABASE_URL="<your session pooler URL>" npm run db:seed
```

- [ ] **Verify.** `domains: 9`, `subdomains: 81`, `count: 8` for municipalities.

### Step 2.3 — Confirm in Supabase

- [ ] **Action.** Supabase dashboard → **Table Editor**.
- [ ] **Verify.** `creative_domains` (9 rows), `creative_subdomains` (81),
  `municipalities` (8) all present.

---

# Phase 3 — Render API

**Manual.**

### Step 3.1 — Create the web service

- [ ] **Action.** [dashboard.render.com](https://dashboard.render.com) → **New**
  → **Web Service** → connect the GitHub repository.
- [ ] **Verify.** Render shows the repo and a settings form.

### Step 3.2 — Configure it

- [ ] **Action.** Set exactly these:

| Setting | Value |
|---|---|
| Name | `bilikha-api` |
| Region | **Singapore** |
| Branch | `main` |
| **Root Directory** | `backend` |
| Runtime | Node |
| **Build Command** | `npm ci --include=dev && npm run build && npm run db:migrate && npm run db:seed` |
| **Start Command** | `npm run start` |
| Instance Type | **Free** |

**`--include=dev` is not optional.** Render sets `NODE_ENV=production`, which
makes npm skip `devDependencies` — and `typescript`, `tsx`, and `drizzle-kit`
all live there. Without it the build fails with `tsc: not found`.

Migrations and the seed run on every deploy. The seed is idempotent, so that is
safe. The tradeoff is that a bad migration ships with a bad build; acceptable
now, and worth revisiting once there is real user data.

- [ ] **Verify.** The root directory reads `backend`, not the repo root.

### Step 3.3 — Generate a session secret

- [ ] **Action.**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Action.** Record the output in the Values table.
- [ ] **Verify.** 64 hexadecimal characters.

### Step 3.4 — Set environment variables

- [ ] **Action.** In the Render service → **Environment**, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | your Supabase session pooler URL from Phase 1 |
| `SESSION_SECRET` | the 64-character value from Step 3.3 |
| `SESSION_TTL_DAYS` | `30` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | `http://localhost:5173` for now — updated in Phase 4 |

Do **not** set `PORT`. Render provides it, and `config/env.ts` already reads it.

`NODE_ENV=production` matters beyond logging: it is what sets
`cookie.secure = true` in the session config.

`SESSION_TTL_DAYS` and `SESSION_SECRET` are only read once
[plan 0001](./0001-registration-and-auth.md) adds them to the env schema.
Setting them now means one less thing to forget then.

- [ ] **Verify.** Six variables listed, no `PORT`.

### Step 3.5 — Set the health check

- [ ] **Action.** Service → **Settings** → **Health Check Path**:
  `/api/v1/health`
- [ ] **Verify.** Saved.

### Step 3.6 — Deploy

- [ ] **Action.** **Manual Deploy** → **Deploy latest commit**. Watch the logs.
- [ ] **Verify.** Logs show the build, then the seed counts, then
  `Bilikha API listening`. Status goes **Live**.
- [ ] **Action.** Record the service URL (`https://bilikha-api.onrender.com`).
- [ ] **Verify.**

```bash
curl -s https://<your-service>.onrender.com/api/v1/health/ready
```

Expected: `{"status":"ready","database":"connected"}`

> First request after idle takes 50+ seconds. That is the free tier waking up,
> not a failure. Phase 6 addresses it.

---

# Phase 4 — Vercel frontend and proxy

**Mixed** — Step 4.1 is delegable, the rest is dashboard work.

### Step 4.1 — Point the proxy at Render

- [ ] **Action.** Edit `frontend/vercel.json` and replace `REPLACE-ME` with your
  Render hostname:

```json
{
  "source": "/api/:path*",
  "destination": "https://bilikha-api.onrender.com/api/:path*"
}
```

Use the real hostname. No trailing slash. Keep `https://`.

- [ ] **Action.** Commit and push:

```bash
git add frontend/vercel.json
git commit -m "Point Vercel API proxy at the Render service"
git push
```

- [ ] **Verify.** `node -e "JSON.parse(require('fs').readFileSync('frontend/vercel.json','utf8'));console.log('ok')"` prints `ok`, and no `REPLACE-ME` remains.

### Step 4.2 — Create the Vercel project

- [ ] **Action.** [vercel.com/new](https://vercel.com/new) → import the
  repository.

| Setting | Value |
|---|---|
| Framework Preset | **Vite** |
| **Root Directory** | `frontend` |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` (default) |
| Install Command | `npm install` (default) |

- [ ] **Verify.** Root directory reads `frontend`.

### Step 4.3 — Environment variable

- [ ] **Action.** Add one, for all environments:

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `/api/v1` |

**Relative on purpose.** It routes through the Vercel proxy, which is what keeps
the origin single and the cookie first-party. Setting it to the Render URL
defeats the entire point of Phase 4 and breaks Safari.

- [ ] **Verify.** The value is `/api/v1`, with no scheme or host.

### Step 4.4 — Deploy

- [ ] **Action.** **Deploy**, and wait.
- [ ] **Verify.** Build succeeds. Record the URL
  (`https://bilikha.vercel.app`).

### Step 4.5 — Update CORS on Render

- [ ] **Action.** Back in Render → Environment, set:

```
CORS_ORIGINS=https://<your-project>.vercel.app
```

Render redeploys automatically.

- [ ] **Verify.** After the redeploy, status is **Live**.

> With the proxy in place the browser never makes a cross-origin request, so
> CORS is not strictly exercised. Set it correctly anyway — it is the guard if
> anyone hits the Render URL directly.

---

# Phase 5 — Verify the deployment

**Either** — Step 5.4 needs a real Safari or iPhone.

### Step 5.1 — The app loads

- [ ] **Action.** Open the Vercel URL in a browser.
- [ ] **Verify.** The landing page renders with the nine domains and eight
  municipalities, in Fraunces and Archivo. If the domains fail to load, the
  proxy is misconfigured — recheck Step 4.1.

### Step 5.2 — The API is same-origin

- [ ] **Action.** DevTools → Network → reload → find the `domains` request.
- [ ] **Verify.** Its URL is `https://<your-project>.vercel.app/api/v1/...` —
  **not** an `onrender.com` URL. If you see `onrender.com`, `VITE_API_BASE_URL`
  is wrong; recheck Step 4.3.

### Step 5.3 — SPA routes work

- [ ] **Action.** Navigate directly to `https://<your-project>.vercel.app/styleguide`
  by typing it into the address bar, then hard-reload.
- [ ] **Verify.** The style guide renders. A 404 means the SPA fallback rewrite
  is missing or ordered before the `/api` rule.

### Step 5.4 — Cookies survive — the important one

This proves the whole proxy arrangement before any auth is built.

- [ ] **Action.** In the browser console on your Vercel URL:

```js
await fetch('/api/v1/health', { credentials: 'include' }).then(r => r.status)
```

- [ ] **Verify.** Returns `200`.
- [ ] **Action.** In DevTools → Application → Cookies, confirm the origin listed
  is your **vercel.app** domain.
- [ ] **Verify.** Repeat Step 5.1 in **Safari** (or an iPhone). The page must
  load and the API must respond. This is the browser that would break under a
  cross-site cookie, so it is the one that matters.

---

# Phase 6 — Keep the free tier awake

**Manual.**

### Step 6.1 — Uptime pinger

- [ ] **Action.** Create a free account at
  [uptimerobot.com](https://uptimerobot.com) → **Add New Monitor**:

| Setting | Value |
|---|---|
| Monitor Type | HTTP(s) |
| Friendly Name | `bilikha-api` |
| URL | `https://<your-service>.onrender.com/api/v1/health/ready` |
| Monitoring Interval | 5 minutes |

This does two jobs: prevents Render's 15-minute idle spin-down, and tells you
when the API is down. Using `/health/ready` rather than `/health` means a query
reaches Postgres on every check, which also keeps Supabase from pausing after 7
days.

One service pinged continuously uses about 744 of Render's 750 free
instance-hours per month. That fits — but it means you cannot run a second free
web service continuously on the same account.

- [ ] **Verify.** The monitor reports **Up** within ten minutes.

### Step 6.2 — Confirm cold starts are gone

- [ ] **Action.** Wait 30 minutes, then:

```bash
curl -s -o /dev/null -w "%{time_total}s\n" https://<your-project>.vercel.app/api/v1/taxonomy/domains
```

- [ ] **Verify.** Under 3 seconds. If it takes 50+, the monitor is not running.

---

# Phase 7 — Document and amend plan 0001

**Delegable.**

### Step 7.1 — Write down what was deployed

- [x] **Action.** Create `docs/reference/deployments.md` recording, for each of
  the three services: the URL, the region, the settings that are non-obvious
  (Render's root directory and `--include=dev`; Vercel's root directory and the
  proxy), and which environment variables are set where.

**Do not put secret values in it.** Record the variable names and where they
live, not their contents.

- [x] **Verify.** `npm run docs:check` exits 0.

### Step 7.2 — Amend plan 0001 for the proxy

Two things in plan 0001 are affected by running behind two proxies.

- [x] **Action.** Add to plan 0001, Phase 7 (Security hardening), a new step:

> **Rate limiting behind a proxy.** Requests now arrive at Render via Vercel's
> edge, so `req.ip` is a proxy address, not the client. Left uncorrected, every
> user shares one rate-limit bucket and the first five registrations lock out
> everyone.
>
> `app.set('trust proxy', 1)` in `app.ts` trusts one hop; there are now two
> (Vercel, then Render). Set `app.set('trust proxy', 2)` in production, and
> verify by logging `req.ip` for a request made from a known address — it must
> be your real client IP, not an internal one.
>
> Do **not** set `trust proxy` to `true`. That trusts the entire
> `X-Forwarded-For` chain, letting a client spoof its address and bypass rate
> limiting entirely.

- [x] **Verify.** The step is present in plan 0001's Phase 7.

### Step 7.3 — Confirm the cookie config needs no change

- [x] **Action.** Confirm plan 0001 Step 4.5 keeps `sameSite: 'lax'` and
  `secure: isProduction`. It does. **Change nothing** — the proxy is what makes
  these correct.
- [x] **Verify.** Add a note to plan 0001 Step 4.5 reading: *"Correct as written
  because the API is proxied same-origin — see plan 0002. If that proxy is ever
  removed, this configuration breaks in Safari."*

---

## Acceptance

- [ ] The Vercel URL loads and shows live data from Supabase
- [ ] Network requests go to the vercel.app origin, never onrender.com
- [ ] Direct navigation to `/styleguide` works after a hard reload
- [ ] The app works in Safari
- [ ] `/api/v1/health/ready` reports `database: connected`
- [ ] Uptime monitor is green and cold starts are gone
- [ ] `docs/reference/deployments.md` exists and contains no secrets
- [ ] Plan 0001 amended per Phase 7
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Trigger |
|---|---|
| Upgrade Render to a paid instance (~$7/mo) | Before any stakeholder demo |
| Custom domain (`bilikha.ph`) | When the name is registered — the proxy means this is cosmetic, not structural |
| Database backups | Before real user accounts exist. Supabase free retains very little |
| Staging environment separate from production | When more than one person deploys |
| `render.yaml` blueprint | When the dashboard config becomes tedious to reproduce |
| Error tracking (Sentry free tier) | When real users can hit errors you cannot see |
| Move migrations out of the build command | When a failed migration blocking a deploy becomes a real risk |
