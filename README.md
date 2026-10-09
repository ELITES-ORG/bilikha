# Bilikha

**Biliran Creative Industries Registry** — a directory and inquiry platform
connecting creative talent across Biliran with the clients, LGUs, and
organisations that hire them.

Built around the nine creative domains defined by RA 11904 (Philippine Creative
Industries Development Act).

---

## Quick start

Requires Node 20+, Docker Desktop, and npm.

```bash
npm run setup        # env files + dependencies for both services
npm run db:up        # Postgres in Docker
npm run db:migrate
npm run db:seed

npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:5173   (second terminal)
```

Full walkthrough and troubleshooting:
[docs/getting-started/local-setup.md](./docs/getting-started/local-setup.md)

---

## Stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL 17 |
| API | Express 5 + TypeScript, Drizzle ORM |
| Web | React 19 + TypeScript, Vite, Tailwind CSS 4 |
| Data fetching | TanStack Query + Axios |
| Routing | React Router |
| Logging | Pino |

Backend and frontend are separate services, deployable independently and
versioned together. Both are strict TypeScript.

---

## Layout

```
BILIKHA/
├── docs/              Developer documentation — start here
├── backend/           Express API
├── frontend/          React SPA  (see frontend/DESIGN.md for the design system)
├── scripts/           Repo tooling
└── docker-compose.yml Local Postgres
```

---

## Documentation

Organised by purpose — see [docs/README.md](./docs/README.md) for the map.

| | |
|---|---|
| [Getting started](./docs/getting-started/) | Get it running |
| [Guides](./docs/guides/) | How to do a specific task |
| [Reference](./docs/reference/) | API, data model, environment, commands |
| [Explanation](./docs/explanation/) | Architecture, and the constraints that shape it |
| [Decisions](./docs/decisions/) | Why we chose what we chose |
| [Plans](./docs/plans/) | Step-by-step build plans with checklists |
| [Design system](./frontend/DESIGN.md) | Tokens, primitives, and UI rules |

New to the project? Read
[operating constraints](./docs/explanation/constraints.md) early. Several
decisions here look wrong by general web-development instinct and are correct
for a province of 180,000 people.

---

## Live

| | Production | Staging |
|---|---|---|
| Application | <https://bilikha.vercel.app> | <https://bilikha-staging.vercel.app> |
| API | <https://bilikha-production.onrender.com> | <https://bilikha.onrender.com> |

`main` deploys to staging; production is released by fast-forwarding the
`production` branch — see
[ADR 0042](./docs/decisions/0042-main-is-staging-production-is-a-branch.md).

Configuration and free-tier caveats: [docs/reference/deployments.md](./docs/reference/deployments.md)

---

## Current state

Live on production since 2026-10-03, with staging running ahead of it on
`main`. Working end to end:

- **Accounts.** Username and password registration with admin moderation; one
  account that adds a creative role, and a client or creative mode
- **Creative profiles.** Crafts from the nine-domain taxonomy (81 sub-domains),
  one of eight municipalities, a bio, an avatar and portfolio images
- **Offers and the directory.** Creatives publish offers; the directory lists
  offers and creatives, nearby first
- **Client postings**, which creatives browse in the directory in creative mode
- **Conversations**, sign-in only, with **work agreements** made in the thread
- **Ratings**, earned by a completed agreement
- **A notification centre**, and the account hub: profile, offers, postings,
  how your work is doing, mode, theme and sign-in
- **An admin area** for the registration queue, media, accounts and ratings
- A privacy notice and terms, light and dark themes, an installable PWA, and a
  living style guide at `/styleguide`

Not built: organisation accounts, free-text search, and web push
([plan 0018](./docs/plans/0018-web-push.md), deferred).

**Shared links get their own preview card.** A shared profile or offer shows
its name, details and photo on Facebook, Messenger and other apps: preview
crawlers are sent to a small HTML page while people keep the SPA
([ADR 0056](./docs/decisions/0056-link-previews-come-from-a-crawler-only-html-endpoint.md)).
Search-engine indexing is still open
([ADR 0002](./docs/decisions/0002-pern-with-client-rendered-spa.md)).
