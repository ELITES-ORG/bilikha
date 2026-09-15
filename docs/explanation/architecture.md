# Architecture

Why the system is shaped this way. For *how to change it*, see the
[guides](../guides/); for exact names and values, see the
[reference](../reference/).

---

## Two services, one repository

```
          browser
             │
   ┌─────────┴──────────┐
   │  React SPA (Vite)  │   :5173 dev
   └─────────┬──────────┘
             │  /api/v1  (Vite proxies in dev; same origin in prod)
   ┌─────────┴──────────┐
   │  Express 5 API     │   :4000
   └─────────┬──────────┘
             │  Drizzle
   ┌─────────┴──────────┐
   │  PostgreSQL 17     │
   └────────────────────┘
```

They are deployed and scaled independently but versioned together. At this size
a monorepo with two `package.json` files beats either a single bundled service
or separate repositories: one PR can change an endpoint and its consumer, and
there is no package to publish between them.

The frontend never talks to Postgres. The backend serves no HTML.

---

## Request lifecycle

A request to `GET /api/v1/taxonomy/domains`:

1. **`app.ts` middleware**, in order — `helmet` (security headers), `cors`
   (origin allowlist), `compression`, JSON body parsing, `pino-http` (one log
   line per request)
2. **`routes/index.ts`** matches the `/taxonomy` prefix
3. **`modules/taxonomy/taxonomy.routes.ts`** runs the handler
4. **Drizzle** issues SQL through the `postgres.js` pool
5. **Response** wrapped in `{ data }`
6. **No match, or a throw** → `notFoundHandler` / `errorHandler`, producing the
   single `{ error: { code, message, details } }` shape

Express 5 forwards rejected promises from `async` handlers to the error handler
by itself, so there is no `asyncHandler` wrapper anywhere. Do not add one.

---

## Backend layering

```
src/
├── config/     environment, validated once at boot
├── lib/        logger, AppError
├── db/         client, schema, seed
├── middleware/ cross-cutting request handling
├── modules/    features — router, validation, data access
└── routes/     composition; the only place modules are mounted
```

**Environment is validated at boot, not at use.** `config/env.ts` parses
`process.env` with zod and exits on failure. A bad `DATABASE_URL` crashes at
startup with a message naming the field, rather than surfacing as a confusing
error inside a handler three layers deep an hour later.

**Errors are thrown, never hand-written.** `AppError` carries a status and a
code; everything else reaching the handler is treated as a bug, logged at error
level, and reported as a generic 500. The client therefore sees exactly one
error shape.

**Modules do not import each other's internals.** Shared behaviour moves to
`lib/` or the database layer. Two modules reaching into one another is the
signal that a third thing wants to exist.

---

## Frontend layering

```
src/
├── components/ui/      primitives with no domain knowledge
├── features/<name>/    types + query hooks per feature
├── lib/                api client, query client, cn
├── pages/              route composition only
└── styles/             tokens, base, motion
```

**Server state is TanStack Query's, not React's.** Anything fetched lives in the
query cache with a key from that feature's key factory. Copying fetched data
into `useState` creates a second source of truth that goes stale.

**Stale times are long on purpose.** Reference data is `Infinity`; the default
is five minutes. Most users are on metered mobile data — see
[constraints](./constraints.md).

**All errors normalise through `toApiError`** so components render
`error.message` without knowing whether the failure was a timeout, an offline
device, or a 500.

**Styling is tokens only.** No raw hex, no one-off shadows, no arbitrary font
sizes. See [`frontend/DESIGN.md`](../../frontend/DESIGN.md).

---

## The known architectural debt

The SPA is client-rendered, which conflicts with the product's core discovery
mechanism: Google indexing profile pages, and Facebook and Messenger rendering
link previews. **Facebook's scraper does not execute JavaScript**, so a shared
profile link currently renders as a blank card.

`index.html` carries static Open Graph tags as a stopgap. That does not solve
per-profile tags.

Before public launch this needs one of:

1. An SSR layer in front of the SPA for public routes
2. A prerender service serving cached HTML to crawlers
3. Migrating the public directory to a framework with SSR

The split that makes this tractable is already in place: the **public directory**
is anonymous and SEO-critical; the **creative dashboard** is login-gated and has
no SEO value. Only the first needs solving, and the second is what a future
Capacitor mobile build would wrap.

Recorded as [ADR 0002](../decisions/0002-pern-with-client-rendered-spa.md).

---

## What is deliberately absent

| Not here | Why |
|---|---|
| PostGIS | Eight municipalities. A lookup table answers every location question this product has |
| Elasticsearch / Algolia | Hundreds to low thousands of profiles. Postgres full-text plus `pg_trgm` covers it |
| Redis | No cache or session store needed yet. Postgres-backed sessions will do when auth lands |
| GraphQL | A handful of read-heavy endpoints with predictable shapes |
| Microservices | One product, one team, one deployable pair |

Each of these is a real option later. None is justified by current load, and
every one of them adds an operational component someone has to run.
