# Deployments

Live environments and the settings that are not obvious from the code.

**No secret values appear here.** This records variable *names* and where they
live, never their contents. Secrets exist only in each host's dashboard.

Set up by following [plan 0002](../plans/0002-deployment.md).

---

## Live URLs

| | |
|---|---|
| Application | <https://bilikha.vercel.app> |
| API | <https://bilikha.onrender.com> |
| Repository | <https://github.com/ELITES-ORG/bilikha> (public) |

There is one environment. No staging yet.

---

## The arrangement

```
browser
   │
   ▼
bilikha.vercel.app          Vercel — static SPA
   │  /api/*  rewritten by frontend/vercel.json
   ▼
bilikha.onrender.com        Render — Express API (Singapore)
   │
   ▼
aws-0-ap-southeast-1        Supabase — Postgres 17 (Singapore)
   .pooler.supabase.com
```

**The `/api` rewrite is load-bearing. Do not remove it.**

Without it the browser would call `onrender.com` directly from a `vercel.app`
page — a cross-site request. The session cookie would then need
`SameSite=None`, making it a third-party cookie that Safari blocks and Firefox
isolates. The rewrite keeps everything on one origin, so `sameSite: 'lax'`
works and auth behaves the same in every browser.

Consequence: `VITE_API_BASE_URL` must stay **relative** (`/api/v1`). Setting it
to the Render URL silently defeats this.

---

## Vercel — frontend

| Setting | Value |
|---|---|
| Project | `bilikha` |
| Team | `reyxdz's projects` (Hobby) |
| Root Directory | `frontend` |
| Framework | Vite |
| Build / Output | defaults (`npm run build` → `dist`) |
| Config | `frontend/vercel.json` |

Environment variables:

| Name | Notes |
|---|---|
| `VITE_API_BASE_URL` | Must be `/api/v1`. Relative, no host |

**Hobby plan cannot deploy private organisation repositories.** This is why the
repository is public. If it ever returns to private, Vercel needs a Pro plan or
the frontend moves host — see the alternatives in
[plan 0002](../plans/0002-deployment.md).

---

## Render — API

| Setting | Value |
|---|---|
| Service | `bilikha` |
| Region | **Singapore** — must match the database region |
| Instance | Free |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build && npm run db:migrate && npm run db:seed` |
| Start Command | `npm run start` |
| Health Check Path | `/api/v1/health` |
| Node version | 22, from `backend/.node-version` |

Environment variables (values in the Render dashboard only):

| Name | Notes |
|---|---|
| `NODE_ENV` | `production`. Also what sets `cookie.secure` |
| `DATABASE_URL` | Supabase **session pooler**, with `?sslmode=require` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | The Vercel origin. Plural — the code reads `CORS_ORIGINS` |
| `SESSION_SECRET` | Unused until auth ships |

**Never set `PORT`.** Render provides it; overriding it breaks routing.

### Why `--include=dev`

Render sets `NODE_ENV=production`, so npm omits `devDependencies` — and
`typescript`, `tsx`, and `drizzle-kit` all live there. Without the flag the
build fails at `tsc: not found`, which reads like a broken project rather than
a missing flag.

### Migrations run on every deploy

The build command applies migrations and re-seeds. The seed is idempotent
(upserts on slug), so this is safe. The tradeoff is that a bad migration blocks
a deploy. Acceptable while there is no real user data; revisit before there is.

---

## Supabase — database

| Setting | Value |
|---|---|
| Organisation | ELITES |
| Project | BILIKHA |
| Region | Southeast Asia (Singapore), `ap-southeast-1` |
| Connection | **Session pooler**, port 5432 |
| Data API | **Disabled** |
| GitHub integration | Not connected |

### Session pooler, specifically

- **Direct connection** is IPv6-only without the paid IPv4 add-on.
- **Transaction pooler** (6543) does not support prepared statements, which
  `postgres.js` uses by default — it would need `prepare: false`.
- **Session pooler** (5432 on the pooler host) is IPv4 and supports prepared
  statements, so the database code works unchanged.

### The Data API is off on purpose

Supabase enables PostgREST and "automatically expose new tables" by default.
Left on, every table — including `users` with its password hashes — becomes
readable over the internet with the anon key, which is designed to be public.
Nothing here uses it; the API connects over the Postgres wire protocol.

**Do not enable it.** Supabase is a Postgres host, nothing more. In particular
do not wire up Supabase Auth — see
[ADR 0013](../decisions/0013-username-password-auth-sprint-1.md).

---

## Free-tier behaviour

| Limit | Effect |
|---|---|
| Render spins down after ~15 min idle | First request after idle takes 50+ seconds |
| Supabase pauses after ~7 days idle | Database unreachable until resumed manually |
| Render free hours | 750/month. One service pinged continuously uses ~744 |

An uptime monitor hitting `/api/v1/health/ready` every 5 minutes prevents both:
it keeps Render awake and puts a query through to Postgres.

**Budget ~$7/month for Render's starter instance before any stakeholder demo.**
A link that hangs for a minute is the whole first impression.

---

## Deploying

Both hosts deploy automatically on push to `main`. Vercel only rebuilds when
`frontend/` changes; Render only when `backend/` changes.

To roll back: Render → Deploys → *Rollback* on a previous deploy. Vercel →
Deployments → *Promote to Production* on a previous one.

---

## Not yet set up

| Item | Why it matters |
|---|---|
| Database backups | Supabase free retains very little. Needed before real accounts |
| Error tracking | Nothing reports runtime errors users hit |
| Staging environment | Every deploy goes straight to production |
| Custom domain | Cosmetic; the proxy means it is not structural |
| `render.yaml` blueprint | Render config is dashboard-only and not reproducible |
