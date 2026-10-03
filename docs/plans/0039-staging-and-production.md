# 0039. Staging and production — the current deployment becomes staging

- **Status:** In progress
- **Owner:** reyxdz
- **Related:** [ADR 0042](../decisions/0042-main-is-staging-production-is-a-branch.md) ·
  [plan 0002](./0002-deployment.md) ·
  [deployments](../reference/deployments.md)

## Goal

Two complete environments. The deployment that exists today — the Render
service `bilikha.onrender.com` and the original Supabase project — becomes
**staging**, fed by `main`, with its data kept. A new Render service and a new
Supabase project become **production**, fed by a `production` branch, starting
from an empty database with reference data only. `bilikha.vercel.app` ends up
serving production; staging gets `bilikha-staging.vercel.app`.

The reasoning, and the alternatives rejected, are in
[ADR 0042](../decisions/0042-main-is-staging-production-is-a-branch.md).

## Scope

**In scope**
- A `production` branch, protected against force-push and deletion
- A production Supabase project with the `media` bucket
- A production Render service on the `production` branch
- A staging Vercel project on `main`
- Moving the original Vercel project, and with it `bilikha.vercel.app`, to the
  `production` branch
- The repository changes: host-based proxy in `frontend/vercel.json`, the
  keep-awake job pinging production, and the documentation

**Out of scope** — and where it is handled instead
- Copying existing data into production. Production starts fresh by decision;
  the existing data stays in staging
- A custom domain — [deployments](../reference/deployments.md), "Not yet set up"
- A visible "this is staging" banner in the app — Follow-ups below

## Who does what

| Phase | Who | Why |
|---|---|---|
| 1. The `production` branch | Either | `git push` and a GitHub setting |
| 2. Production database | **You** | Account owner, a password to keep |
| 3. Production API | **You** | Dashboard and secret entry |
| 4. Staging frontend | **You** | Dashboard |
| 5. Move `bilikha.vercel.app` to `production` | **You** | Dashboard |
| 6. Merge the repository changes | Either | A pull request into `main` |
| 7. Cut over | Either | One `git push`, then browser checks |
| 8. Tidy up | **You** | Dashboard, and ticking this plan |

**Go in order.** The order is what keeps the public site working throughout:
`bilikha.vercel.app` keeps calling the staging API until the single push in
Phase 7, and only then switches to production.

## Prerequisites

- Owner access to the Supabase organisation, the Render workspaces, and the
  Vercel team `reyxdz's projects`. As built: staging's Render service `bilikha`
  is in the workspace **My Workspace**; production's `bilikha-production` is in
  the workspace **Bilikha**.
- Supabase's free plan caps active projects. Check before Phase 2 that there is
  room for one more.
- A clean local checkout of `main`:

```bash
git fetch origin && git status
# On branch main — Your branch is up to date with 'origin/main'
```

## Values — fill these in as you go

**No secret values here.** Secrets go in the dashboards and a password manager.

| Value | Production | Staging |
|---|---|---|
| Web origin | `https://bilikha.vercel.app` | `https://bilikha-staging.vercel.app` |
| API origin | `https://bilikha-production.onrender.com` (confirm in 3.1) | `https://bilikha.onrender.com` |
| Supabase project | `bilikha-production` | `BILIKHA` (existing) |
| Database password | in the password manager | unchanged |

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The production branch | 2 / 2 | Done 2026-10-03 |
| 2. Production database | 3 / 4 | Partial — the bucket (2.3) is proven by the upload in 7.3 |
| 3. Production API | 4 / 4 | Done 2026-10-03 |
| 4. Staging frontend | 1 / 3 | Partial — CORS update and browser sign-in outstanding |
| 5. Move bilikha.vercel.app to production | 2 / 2 | Done 2026-10-03 |
| 6. Merge the repository changes | 0 / 2 | Not started |
| 7. Cut over | 0 / 4 | Not started |
| 8. Tidy up | 0 / 3 | Not started |

---

# Phase 1 — The production branch

### Step 1.1 — Create it from today's `main`

It must start from the commit **before** this plan's repository changes. That
commit still proxies every host to the staging API, which is what keeps
`bilikha.vercel.app` unchanged through Phase 5.

- [x] **Action.** From the repo root, with `main` not yet containing the
  Phase 6 changes:

```bash
git push origin origin/main:refs/heads/production
```

- [x] **Verify.**

```bash
git ls-remote origin production main
# the two lines show the same commit hash
```

Done 2026-10-03: `production` created at `7992593`, matching `main`.

### Step 1.2 — Protect it

- [x] **Action.** GitHub → repository → **Settings** → **Rules** → **Rulesets**
  → **New branch ruleset**. Name `production`, enforcement **Active**, target
  branch `production`. Enable **Restrict deletions** and **Block force pushes**.
  Leave "Require a pull request" **off** — a release is a direct fast-forward
  push (ADR 0042), and requiring a pull request would block it.
- [x] **Verify.** Settings → Rules → Rulesets lists `production` as **Active**,
  targeting one branch, with both rules enabled. Do not test it with a real
  force-push: if the rule were missing, the test would rewrite the branch.

Done 2026-10-03 via the API as ruleset `24409375` (deletion and
non-fast-forward, no bypass actors). Confirmed with
`gh api repos/ELITES-ORG/bilikha/rules/branches/production`.

---

# Phase 2 — Production database

**Manual.** Same settings as the original project in
[plan 0002 Phase 1](./0002-deployment.md), which explains each one.

### Step 2.1 — Create the project

- [x] **Action.** [supabase.com/dashboard](https://supabase.com/dashboard) →
  ELITES organisation → **New project**.
  - Name: `bilikha-production`
  - Database password: generate a strong one and **save it in a password
    manager** — it cannot be retrieved later, only reset
  - Region: **Southeast Asia (Singapore)**
  - **Security → Enable Data API: unchecked**
  - GitHub: not connected
- [x] **Verify.** Project status reads **Active**, and Settings → Data API shows
  it disabled.

### Step 2.2 — Get the session pooler connection string

- [x] **Action.** Project → **Connect** → **Session pooler**. Put the real
  password in, URL-encoding any of `@ : / ? # [ ] %`, and append
  `?sslmode=require`.
- [x] **Verify.** It contains `pooler.supabase.com:5432` and ends with
  `?sslmode=require`. Keep it for Step 3.2; do not paste it anywhere else.

### Step 2.3 — Create the `media` bucket

- [ ] **Action.** Storage → **New bucket**:

| Setting | Value |
|---|---|
| Name | `media` |
| Public bucket | **on** |
| File size limit | `1 MB` |
| Allowed MIME types | `image/webp`, `image/jpeg` |

The size limit and MIME list are the only enforcement of either rule — see
[plan 0009 Step 2.1](./0009-bio-avatars-and-portfolio-images.md).

- [ ] **Verify.** `media` is listed and marked Public.

### Step 2.4 — Get the storage credentials

- [x] **Action.** Settings → **API Keys**. Copy the **Project URL** and the
  **`service_role`** key from the **Legacy API keys** tab.

  The backend checks the key's `service_role` claim at boot, so it must be the
  legacy JWT (starts `eyJ`), not the anon key and not a newer `sb_secret_` key.
  If this project offers no legacy keys, stop here: production can run without
  images until the storage client is checked against the newer key format.

- [x] **Verify.** The key starts with `eyJ`.

---

# Phase 3 — Production API

**Manual.** Same settings as the staging service, which are recorded in
[deployments](../reference/deployments.md).

### Step 3.1 — Create the web service

- [x] **Action.** [dashboard.render.com](https://dashboard.render.com) → the
  workspace **Bilikha** → **New** → **Web Service** → the
  `ELITES-ORG/bilikha` repository:

| Setting | Value |
|---|---|
| Name | `bilikha-production` |
| Region | **Singapore** |
| Branch | **`production`** |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npm run build && npm run db:migrate && npm run db:seed` |
| Start Command | `npm run start` |
| Instance Type | Free |

- [x] **Verify.** The service URL is `https://bilikha-production.onrender.com`.
  Confirmed 2026-10-03 — no suffix, so no file needed changing.
  **If Render added a suffix**, record the real URL in the Values table and
  replace `bilikha-production.onrender.com` with it in `frontend/vercel.json`
  and `.github/workflows/keep-awake.yml` before Phase 6.

### Step 3.2 — Set environment variables

- [x] **Action.** Service → **Environment**:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the production pooler string from Step 2.2 |
| `SESSION_SECRET` | a **new** value — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never staging's |
| `SESSION_TTL_DAYS` | `30` |
| `LOG_LEVEL` | `info` |
| `CORS_ORIGINS` | `https://bilikha.vercel.app` |
| `SUPABASE_URL` | the production Project URL from Step 2.4 |
| `SUPABASE_SERVICE_ROLE_KEY` | the production `service_role` key from Step 2.4 |
| `SUPABASE_STORAGE_BUCKET` | `media` |

Do **not** set `PORT`.

- [x] **Verify.** Nine variables, no `PORT`, and `DATABASE_URL` /
  `SUPABASE_URL` both name the **production** project ref — not staging's.

### Step 3.3 — Set the health check

- [x] **Action.** Settings → **Health Check Path**: `/api/v1/health`.
- [x] **Verify.** Saved.

### Step 3.4 — Deploy and confirm a fresh database

- [x] **Action.** Trigger the first deploy (Render starts it on creation).
- [x] **Verify.** The build log ends with `Seed complete`, and:

```bash
curl -s https://bilikha-production.onrender.com/api/v1/health/ready
# {"status":"ready","database":"connected"}
```

Confirmed 2026-10-03: `ready`, 9 domains and 81 sub-domains served, and
`/creatives` and `/offers` both empty on production while staging returns
three of each — production is on its own database.

- [x] **Verify.** The runtime log contains **no** warning about
  `SUPABASE_SERVICE_ROLE_KEY` — neither the anon-key warning nor the
  different-project warning.

Confirmed 2026-10-03: a log search for `supabase` on `bilikha-production`
returned nothing.

---

# Phase 4 — Staging frontend

**Manual.**

### Step 4.1 — Create the project

- [x] **Action.** [vercel.com](https://vercel.com) → team `reyxdz's projects` →
  **Add New** → **Project** → import `ELITES-ORG/bilikha`:

| Setting | Value |
|---|---|
| Project Name | `bilikha-staging` |
| Root Directory | `frontend` |
| Framework | Vite |
| Environment variable | `VITE_API_BASE_URL` = `/api/v1` |

Its production branch defaults to `main`, which is correct: for this project,
"production" means "the staging site".

- [x] **Verify.** The project's domain is `bilikha-staging.vercel.app`. If that
  name was taken, record the real one in the Values table; nothing in the
  repository needs it, because every non-production host already falls through
  to the staging API.

### Step 4.2 — Allow the staging origin on the staging API

- [ ] **Action.** Render → `bilikha` (the original service) → Environment →
  set `CORS_ORIGINS` to
  `https://bilikha.vercel.app,https://bilikha-staging.vercel.app`.
  Both, for now — `bilikha.vercel.app` still calls this API until Phase 7.
- [ ] **Verify.** The service redeploys and `/api/v1/health/ready` on
  `bilikha.onrender.com` returns `ready`.

### Step 4.3 — Confirm staging works end to end

- [x] **Verify.**

```bash
curl -s https://bilikha-staging.vercel.app/api/v1/health/ready
# {"status":"ready","database":"connected"}
```

Confirmed 2026-10-03: ready, and `/api/v1/creatives` through the staging site
returns the original three creatives.

- [ ] **Verify.** In a browser, sign in on `bilikha-staging.vercel.app` with an
  existing account. It works — the data is the original data.

---

# Phase 5 — Move bilikha.vercel.app to production

**Manual.** After this phase the original project builds only the `production`
branch. Nothing visible changes yet: `production` is the same commit the site
is already serving.

### Step 5.1 — Change the production branch

- [x] **Action.** Vercel → project `bilikha` → **Settings** → **Environments**
  → **Production** → **Branch Tracking** → `production`. Save. (On older
  dashboards the same setting is Settings → **Git** → **Production Branch**.)

  Vercel refuses the change until the branch has a deployment, and it had
  none: the push in Step 1.1 changed nothing under `frontend/`, so it was
  skipped. Fix: Deployments → **Create Deployment** → ref `production`, then
  save again. Done 2026-10-03 that way.
- [x] **Verify.** Deployments → the current **Production** deployment is still
  the commit from Step 1.1.

### Step 5.2 — Stop it building every branch

Both Vercel projects watch the same repository, so without this every push
builds twice.

- [x] **Action.** Same project → **Settings** → **Build and Deployment** →
  **Ignored Build Step** → **Run my Bash script**. (It is not on the Git
  settings page. Once the command is edited the Behavior reads **Custom**,
  which is correct — the Bash-script preset expects a script file.)

```bash
[ "$VERCEL_GIT_COMMIT_REF" != "production" ]
```

  Exit 0 skips the build; the test succeeds, and so skips, on every branch
  except `production`.

- [x] **Verify.** Saved. It is checked for real in Step 6.2.

---

# Phase 6 — Merge the repository changes

### Step 6.1 — Merge into `main`

The changes: `frontend/vercel.json`, `.github/workflows/keep-awake.yml`,
[ADR 0042](../decisions/0042-main-is-staging-production-is-a-branch.md), this
plan, and the documentation.

- [ ] **Action.** Open a pull request into `main` and merge it after CI passes.
- [ ] **Verify.** CI is green on `main`.

### Step 6.2 — Confirm what moved, and what did not

- [ ] **Verify.** Vercel `bilikha-staging` deployed the merge commit; Vercel
  `bilikha` shows the build **skipped** (Ignored Build Step).
- [ ] **Verify.** Staging carries the new headers; production does not yet:

```bash
curl -sI https://bilikha-staging.vercel.app/ | grep -i x-robots-tag
# x-robots-tag: noindex
curl -s https://bilikha-staging.vercel.app/api/v1/health/ready
# {"status":"ready","database":"connected"}
```

---

# Phase 7 — Cut over

This is the only step users can see. `bilikha.vercel.app` switches from the
staging API to production, and from the original data to an empty directory.

### Step 7.1 — Promote

- [ ] **Action.**

```bash
git fetch origin
git push origin origin/main:production
```

- [ ] **Verify.** Vercel `bilikha` builds and promotes the new commit; Render
  `bilikha-production` deploys it (if `backend/` changed).

### Step 7.2 — The proxy points at production

- [ ] **Verify.**

```bash
curl -s https://bilikha.vercel.app/api/v1/health/ready
# {"status":"ready","database":"connected"}
curl -sI https://bilikha.vercel.app/ | grep -i x-robots-tag
# (no output — production is indexable)
```

- [ ] **Verify.** In a browser on `bilikha.vercel.app`, an account that exists
  on staging **cannot** sign in. That is the proof the site now talks to the
  production database.

### Step 7.3 — Sessions survive on production

- [ ] **Action.** Register a new account on `bilikha.vercel.app`.
- [ ] **Verify.** Reload the page: still signed in. Repeat once in Safari or on
  an iPhone, as plan 0002 Step 5.4 requires.
- [ ] **Verify.** Upload an avatar. It appears, and its image URL points at the
  **production** Supabase project. This is what proves the `media` bucket from
  Step 2.3.

### Step 7.4 — Create the first production admin

- [ ] **Action.** From the repo root, with the production connection string
  from Step 2.2 (not committed, not saved to `.env`):

```bash
DATABASE_URL="<production pooler string>" npm --prefix backend run admin:grant -- <your-username>
```

- [ ] **Verify.** Signing out and back in on `bilikha.vercel.app` shows the
  admin area.

---

# Phase 8 — Tidy up

### Step 8.1 — Staging no longer serves the production origin

- [ ] **Action.** Render → `bilikha` → `CORS_ORIGINS` =
  `https://bilikha-staging.vercel.app`.
- [ ] **Verify.** Staging still signs in.

### Step 8.2 — The pinger reaches both

- [ ] **Action.** GitHub → Actions → **Keep the API awake** → **Run workflow**,
  once with `production` and once with `staging`.
- [ ] **Verify.** Both runs succeed, logging `production readiness returned 200`
  and `staging readiness returned 200`.

### Step 8.3 — Record it

- [ ] **Action.** If any URL differs from the Values table defaults, correct it
  in [deployments](../reference/deployments.md) and the README's Live table.
- [ ] **Verify.** Tick this plan, set its status and Progress table, update
  [the plan index](./README.md), and `npm run docs:check` exits 0.

---

## Acceptance

- [ ] `bilikha.vercel.app` talks to `bilikha-production.onrender.com`, which
  talks to the `bilikha-production` Supabase project
- [ ] `bilikha-staging.vercel.app` talks to `bilikha.onrender.com`, which talks
  to the original Supabase project, with its data intact
- [ ] A push to `main` changes staging only
- [ ] `git push origin origin/main:production` is the only way production
  changes, and a force-push to `production` is rejected
- [ ] Staging responses carry `X-Robots-Tag: noindex`; production's do not

## Follow-ups

- **A staging banner.** Staging looks exactly like production, and anyone with
  the link can register there. A visible marker would stop test data being
  mistaken for real use — but it needs a build-time flag the app does not have
  yet.
- **A custom domain for production.** When it arrives, add it as a second host
  rule in `frontend/vercel.json` *before* pointing DNS at it, or its traffic
  falls through to staging (ADR 0042).
- **Backups for production.** Already listed under "Not yet set up" in
  [deployments](../reference/deployments.md); it now applies to the database
  that matters.
