# 0012. Versioned API prefix from day one

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

The API has exactly one consumer today: the web frontend, deployed from the same
repository at the same time. Versioning an API with a single lockstep consumer
is usually premature — you can simply change both sides in one PR.

That will not stay true. The plan already anticipates a Capacitor-wrapped mobile
build of the creative dashboard. Once an app is in the Play Store, its consumers
update on their own schedule, or never. A user on a three-month-old build still
issues requests, and a breaking change strands them.

Third-party integrations are also plausible later — reporting, data exchange —
and those consumers are entirely outside our release cycle.

## Decision

Mount everything under `/api/v1` from the start. Routers compose into
`apiRouter` in `src/routes/index.ts`, which is mounted once at that prefix.

## Alternatives considered

**Unversioned `/api`.** Simpler, and honest about there being one consumer.
Rejected: adding a version later means either moving every route — breaking any
client that exists by then — or running an unversioned and a versioned surface
in parallel, which is worse than having done it up front.

**Header-based versioning** (`Accept: application/vnd.bilikha.v1+json`). More
RESTful in principle. Rejected: harder to inspect in a browser, harder to curl,
harder to cache, and needless ceremony for this size of surface.

**Per-endpoint versioning.** Maximum flexibility. Rejected: the bookkeeping cost
exceeds any benefit for an API of this size.

## Consequences

**Good.** A future mobile build ships against a contract that will not move under
it. Introducing `/api/v2` alongside `/api/v1` is mechanical when it is needed.
The prefix is a single mount point, so it costs nothing to maintain.

**Bad.** Slightly longer URLs, and a version number that will stay at `v1`
indefinitely — which can read as speculative to someone encountering it now.

**Note.** The frontend does not hardcode the prefix: `VITE_API_BASE_URL` defaults
to `/api/v1`, so moving to `v2` is a configuration change for the web client, not
a code change.

Versioning is not a substitute for compatibility discipline. Additive changes —
new optional fields, new endpoints — go into `v1`. A new version is for genuinely
breaking changes only, and each one that exists is a surface someone has to keep
alive.
