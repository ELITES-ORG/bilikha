# Deployments

Live environments and the settings that are not obvious from the code.

**No secret values appear here.** This records variable *names* and where they
live, never their contents. Secrets exist only in each host's dashboard.

Set up by following [plan 0002](../plans/0002-deployment.md), then split into
staging and production by [plan 0039](../plans/0039-staging-and-production.md).

---

## Live URLs

| | Production | Staging |
|---|---|---|
| Application | <https://bilikha.vercel.app> | <https://bilikha-staging.vercel.app> |
| API | <https://bilikha-production.onrender.com> | <https://bilikha.onrender.com> |
| Branch | `production` | `main` |
| Database | Supabase `bilikha-production` | Supabase `BILIKHA` (the original project) |

Repository: <https://github.com/ELITES-ORG/bilikha> (public).

Two complete stacks, nothing shared between them — see
[ADR 0042](../decisions/0042-main-is-staging-production-is-a-branch.md). The
original deployment became staging and kept its data; production started from
an empty database.

### Releasing

The full procedure — checks before, the command, what success and failure look
like, rolling back — is [Release to production](../guides/release-to-production.md).
In short: every merge to `main` deploys to staging, and production changes only
by fast-forwarding the `production` branch to a commit already on `main`:

```bash
git fetch origin
git push origin origin/main:production
```

Never `--force`, never commit to `production` directly, never merge from it.
Rulesets on GitHub block force-pushes and deletion, accept only commits CI has
already passed, and let only reyxdz update the branch
([ADR 0043](../decisions/0043-only-reyxdz-merges-and-releases.md)).

No ruleset can require the released commit to be on `main` already, so the
**Release guard** workflow checks it after every push to `production` and fails
— with an email to whoever pushed — if it is not. The command above can never
trip it; it catches the wrong ref pushed by mistake. Its run summary has the
recovery: roll back in Vercel, get that exact commit onto `main` with a merge
commit (reverting it there if it should not ship), then release from `main`.

---

## The arrangement

```
browser
   │
   ▼
bilikha.vercel.app                  Vercel — static SPA
   │  /api/*  rewritten by frontend/vercel.json
   ▼
bilikha-production.onrender.com     Render — Express API (Singapore)
   │
   ▼
aws-0-ap-southeast-1                Supabase — Postgres 17 (Singapore)
   .pooler.supabase.com
```

Staging is the same shape: `bilikha-staging.vercel.app` →
`bilikha.onrender.com` → the original Supabase project.

**The `/api` rewrite is load-bearing. Do not remove it.**

Without it the browser would call `onrender.com` directly from a `vercel.app`
page — a cross-site request. The session cookie would then need
`SameSite=None`, making it a third-party cookie that Safari blocks and Firefox
isolates. The rewrite keeps everything on one origin, so `sameSite: 'lax'`
works and auth behaves the same in every browser.

Consequence: `VITE_API_BASE_URL` must stay **relative** (`/api/v1`). Setting it
to the Render URL silently defeats this.

### Which API the rewrite goes to

`vercel.json` rewrites cannot read environment variables, so the target is
chosen by **hostname**. A request whose host is `bilikha.vercel.app` goes to the
production API. Every other host — the staging domain, and every preview URL of
either project — falls through to the staging API.

That default is deliberate: a preview can never write to the production
database. The cost is that **a new production domain must be added to
`frontend/vercel.json` before it goes live**, or its traffic quietly reaches
staging. The same hostname rule adds `X-Robots-Tag: noindex` to every
non-production host.

The app applies the rule too: every non-production host shows a "Staging" banner
above each page, decided in the browser by `frontend/src/lib/site-host.ts`. A
new production domain goes there as well, or production shows the banner.

---

## Vercel — frontend

| Setting | Production | Staging |
|---|---|---|
| Project | `bilikha` | `bilikha-staging` |
| Production branch | `production` | `main` |
| Ignored Build Step | `[ "$VERCEL_GIT_COMMIT_REF" != "production" ]` | none — builds previews for every branch |

Shared by both:

| Setting | Value |
|---|---|
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

| Setting | Production | Staging |
|---|---|---|
| Workspace | Bilikha | My Workspace |
| Service | `bilikha-production` | `bilikha` |
| Branch | `production` | `main` |

Shared by both:

| Setting | Value |
|---|---|
| Region | **Singapore** — must match the database region |
| Instance | Free |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build && npm run db:migrate && npm run db:seed` |
| Start Command | `npm run start` |
| Health Check Path | `/api/v1/health` |
| Node version | 22, from `backend/.node-version` |

Environment variables (values in the Render dashboard only). Each service has
its own value for every one of these — **no secret is shared between
environments**:

| Name | Notes |
|---|---|
| `NODE_ENV` | `production`. Also what sets `cookie.secure` |
| `DATABASE_URL` | Supabase **session pooler**, with `?sslmode=require` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | That environment's Vercel origin. Plural — the code reads `CORS_ORIGINS` |
| `SESSION_SECRET` | Different per environment |
| `SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`). Optional: if absent the API still boots and images are simply disabled |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret — never the anon key. Optional, as above |
| `SUPABASE_STORAGE_BUCKET` | Defaults to `media` if omitted |

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
| Projects | `bilikha-production` in organisation **Bilikha** (production); `BILIKHA` in organisation **ELITES** (staging) |
| Region | Southeast Asia (Singapore), `ap-southeast-1` |
| Connection | **Session pooler**, port 5432 |
| Data API | **Disabled**, on both |
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

`.github/workflows/keep-awake.yml` hits production's `/api/v1/health/ready`
every 10 minutes during Philippine waking hours, which keeps Render awake and
puts a query through to Postgres. **Staging is pinged once a day only.** Its
Render service is in a separate workspace with its own 750 hours, but nobody is
waiting on staging, so it sleeps and its first request after idle takes about a
minute. The daily ping is there to stop the staging database pausing.

Supabase's free plan caps active projects (two at the time of writing), and
production and staging each count as one.

**Budget ~$7/month for Render's starter instance before any stakeholder demo.**
A link that hangs for a minute is the whole first impression.

---

## Deploying

Pushes to `main` deploy staging; pushes to `production` deploy production
(see [Releasing](#releasing)). Vercel only rebuilds when `frontend/` changes;
Render only when `backend/` changes.

To roll back: Render → Deploys → *Rollback* on a previous deploy. Vercel →
Deployments → *Promote to Production* on a previous one.

---

## Not yet set up

| Item | Why it matters |
|---|---|
| Database backups | Supabase free retains very little. Needed before real accounts |
| Error tracking | Nothing reports runtime errors users hit |
| Custom domain | Cosmetic; the proxy means it is not structural |
| `render.yaml` blueprint | Render config is dashboard-only and not reproducible |
