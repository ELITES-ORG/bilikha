# 0014. Modular monolith with feature slices

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

The codebase is about to grow from three reference tables to auth, profiles,
organisations, inquiries, search, and media. Structure chosen now determines
whether that stays navigable.

Relevant facts: one product, one small team, one database, one delivery
mechanism (HTTP/JSON), and a workload that is overwhelmingly CRUD, filtering,
and search. There is no complex domain algebra, no second data source, no second
transport, and no requirement to swap infrastructure.

## Decision

**A modular monolith, sliced by feature, with a light layering inside each
module.**

### Backend

```
src/
├── config/      environment, validated at boot
├── lib/         cross-cutting: logger, AppError, password, session
├── db/          client, schema, seed          ← shared kernel
├── middleware/  cross-cutting request handling
├── modules/     one folder per feature
│   └── <feature>/
│       ├── <feature>.routes.ts    HTTP: parse, authorise, respond
│       ├── <feature>.schema.ts    zod contracts
│       └── <feature>.service.ts   logic and data access
└── routes/      composition; the only place modules are mounted
```

**Rules, in priority order:**

1. A module never imports another module's internals. Import its exported
   service functions, or move the shared thing into `lib/` or `db/`.
2. Routes do HTTP. Services do logic. A route that contains a business rule, or
   a service that touches `req`/`res`, is misplaced.
3. Drizzle **is** the data layer. No repository interface wrapping it.
4. Shared types live in `db/schema` (inferred) or the module that owns them.
5. A module with no logic may skip its service file until it has some.

### Frontend

Mirrors it:

```
src/
├── components/ui/      primitives, no domain knowledge
├── features/<name>/    api hooks, types, feature components
├── lib/                api client, query client, cn
├── pages/              route composition only
└── styles/             tokens, base, motion
```

Same first rule: a feature does not reach into another feature's internals.

## Alternatives considered

**Clean / Hexagonal architecture** — domain entities, ports, adapters, mappers.
Rejected as over-engineering for this workload. Its payoff comes from complex
domain logic and multiple interchangeable adapters; here it would add an
interface and a mapper per entity to protect against swapping a database nobody
intends to swap. The cost is real: every feature spans four files before it does
anything, and a team of this size would route around it within a month.

**Layering by technical role** — `controllers/`, `services/`, `models/`,
`validators/` as top-level folders. The most common default, and rejected
because it scatters one feature across four directories. Changing registration
means touching four folders and reading past every unrelated controller. Feature
slices keep a change local.

**Microservices.** Rejected outright. One product, one team, one deployable
pair. This would buy distributed-systems failure modes and no benefit.

**No structure — routes calling Drizzle inline.** What exists today, and fine
for three reference endpoints. Rejected going forward: auth alone has real logic
(hashing, session creation, uniqueness handling, rate limits) that does not
belong in a route handler.

## Consequences

**Good.** Everything for a feature is in one folder, so a change is local and a
newcomer can read one directory to understand one thing. Module boundaries are
enforceable by review and by a lint rule if it comes to that. If a module ever
genuinely needs to be extracted into its own service, a clean boundary already
exists. Testing is straightforward: services are plain functions.

**Bad.** Database types leak into services and sometimes into route responses —
there is no domain model insulating them, so a schema change can ripple outward.
That is the accepted price of not writing mappers, and the mitigation is that
API response shapes are defined explicitly in zod rather than being whatever
Drizzle returns.

Boundary discipline is convention, not compilation. Nothing stops a module
importing another's internals except review.

**Revisit if** a module grows past roughly a dozen files, or two modules end up
in a cyclic dependency. Both are signals a third module wants to exist, not that
the architecture is wrong.
