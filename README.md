# Bilikha

**Biliran Creative Industries Registry** — a directory and inquiry platform
connecting creative talent across Biliran with the clients, LGUs, and
organisations that hire them.

Built around the nine creative domains defined by RA 11904 (Philippine Creative
Industries Development Act), as published by DTI Biliran.

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

## Current state

This is foundation, not product. Working end to end:

- Environment validation, structured logging, graceful shutdown
- Consistent API error envelope
- Health and readiness endpoints
- The full nine-domain taxonomy (81 sub-domains) and eight municipalities,
  seeded and served
- A design system with a living style guide at `/styleguide`

Not yet built: users, creative profiles, organisations, portfolios, inquiries,
auth, search, and image handling.

**Known launch blocker:** public profiles need server-rendered HTML before
launch. Facebook's scraper does not execute JavaScript, so shared profile links
currently render without a preview card — and sharing is the product's main
discovery path. See
[ADR 0002](./docs/decisions/0002-pern-with-client-rendered-spa.md).
