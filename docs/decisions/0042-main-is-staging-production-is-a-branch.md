# 0042. `main` deploys to staging; production is a branch it is promoted to

- **Status:** Accepted
- **Date:** 2026-10-03
- **Related:** [0002](./0002-pern-with-client-rendered-spa.md) ·
  [0040](./0040-a-deploy-must-not-break-an-open-tab.md) ·
  [plan 0039](../plans/0039-staging-and-production.md)

## Context

Until now there was one environment. Every push to `main` went straight to the
site people use: Vercel rebuilt the frontend, Render rebuilt the API, and the
Render build ran migrations against the only database. A bad migration or a
broken page reached users in the same minute it reached the developer.

A second environment needs three things decided: which hosts it lives on, how
code reaches each one, and how the frontend knows which API to call.

The constraints shaping the answer:

- **Everything is on free tiers.** Render gives 750 instance hours per
  workspace per month, and the keep-awake job spends about 530 of them on
  production. Supabase pauses a free project after about seven idle days.
- **The API is proxied through Vercel** so the app and API share one origin and
  the session cookie stays first-party ([deployments](../reference/deployments.md)).
  The proxy target is written in `frontend/vercel.json`, and `vercel.json`
  rewrites cannot read environment variables.
- **The existing deployment already has data** — test accounts, offers,
  uploads. It becomes staging rather than being thrown away.

## Decision

**Two complete stacks, one per environment.** Each has its own Vercel project,
its own Render service and its own Supabase project. Nothing is shared between
them — not the database, not the storage bucket, not `SESSION_SECRET`.

| | Staging | Production |
|---|---|---|
| Branch | `main` | `production` |
| Web | `bilikha-staging.vercel.app` | `bilikha.vercel.app` |
| API | `bilikha.onrender.com` | `bilikha-production.onrender.com` |
| Database | the original Supabase project | a new Supabase project |

**`main` is staging.** Every merge to `main` deploys to staging, as every merge
always has. Nothing about day-to-day work changes.

**`production` only ever moves forward to a commit already on `main`.** A
release is a fast-forward:

```bash
git fetch origin
git push origin origin/main:production
```

Without `--force`, git refuses anything that is not a fast-forward, so the
command itself enforces the rule. Nobody commits to `production` directly, and
nothing is ever merged *from* it.

**The proxy picks its target by hostname.** `frontend/vercel.json` sends `/api`
to the production API only when the request's host is `bilikha.vercel.app`.
Every other host — the staging domain, every preview URL of either project —
falls through to the staging API.

The fallback is chosen for its failure mode. If the production hostname changes
and the rule is not updated, production visitors hit the staging API: their
accounts do not exist there, so it fails loudly at sign-in. The reverse default
would let every preview deployment write to the production database, silently.

Every non-production host also sends `X-Robots-Tag: noindex`, so staging never
competes with the real site in search results.

**The existing deployment became staging.** The original Render service and
Supabase project keep their data and their URLs. The original Vercel project
keeps `bilikha.vercel.app` and switched its production branch to `production`;
a new Vercel project serves staging. The domain people have already shared
stays on the real site.

## Alternatives considered

**`main` is production, a `staging` branch feeds staging.** Equally common, and
it reads naturally. It loses here because it would have meant re-pointing the
live Render service and Vercel project at a new branch, and because everyday
merges would go straight to production again — the thing this change exists to
stop. Promotion would also run the wrong way: work would land on `staging`
first and be merged into `main`, so `main` would stop being where work lands.

**One Vercel project, with staging as a preview branch.** Vercel gives every
project preview deployments, so a separate project looks redundant. But a
preview's URL is long and team-scoped, preview deployments sit behind Vercel's
deployment protection by default, and preview environment variables are shared
across every branch. A second project gives staging a stable, public, short URL
and maps one-to-one onto the Render and Supabase split.

**Routing middleware reading the API origin from an environment variable.**
Configuration-as-environment is the cleaner idea, and it would remove the
hostnames from the repository. It adds a function invocation in front of every
API request, a new dependency, and code that cannot run under the local Vite
proxy, to solve a problem two lines of static configuration already solve. Worth
revisiting if a third environment or a custom domain makes the host list grow.

**Tags or GitHub releases instead of a branch.** Render and Vercel both deploy
branches, not tags. Tag-driven deploys would need a deploy hook and a workflow
to call it — more machinery, and another free-tier secret to look after.

**Share one Supabase project, with a second schema for staging.** It saves the
second free project. It also means one database password reaches both
environments, and a staging migration runs against the production server. The
isolation is the point.

## Consequences

- A bad migration or broken page reaches staging first. It reaches users only
  when someone promotes it.
- Promotion is a manual step, so a fix waits for it too. For an urgent fix:
  merge to `main`, check staging, promote. There is no shortcut that skips
  staging, on purpose.
- Hostnames now live in two files: `frontend/vercel.json` and
  `.github/workflows/keep-awake.yml`. A new production domain — a custom domain,
  say — must be added to both, or production traffic falls back to staging.
- Staging sleeps. The first request after idle waits about a minute. Its Render
  service is in a different workspace from production's, so the two never
  compete for free hours — keep it that way, or the 530 hours production
  spends leave staging very little.
- The staging database is free-tier too and is pinged once a day so it does not
  pause. If it pauses anyway, it is resumed by hand in the Supabase dashboard.
- Staging is publicly reachable. Anyone with the URL can register there. Its
  data is test data and must be treated as public.
