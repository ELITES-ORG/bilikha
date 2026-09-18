# 0037. One definition of an API shape, imported by both sides

- **Status:** Accepted
- **Date:** 2026-09-19
- **Related:** [0031](./0031-testing-strategy.md) ·
  [0014](./0014-modular-monolith-architecture.md) ·
  [0012](./0012-versioned-api-prefix.md) ·
  [operating constraints §3](../explanation/constraints.md)

## Context

[0031](./0031-testing-strategy.md) named this and left it open:

> The `avatarUrl` bug is a class that tests only catch by asserting every field
> of every response, which nobody sustains. The real fix is sharing types or
> schemas across the boundary, and it is a separate decision.

Two production bugs have come from it since.

**Avatars in Messages.** The conversation list built `avatarUrl`; the client read
`otherPartyAvatarUrl`. The value was computed correctly and thrown away. It
failed silently, because the client's type marked the field optional — so "the
server did not send it" and "this person has no photo" were indistinguishable,
and `Avatar` drew initials either way.

**The public creative profile.** `GET /offers` returned `subdomain` as a nested
object; `GET /creatives/:slug` returned it flat as `subdomainSlug` and
`subdomainName`. The client, typed against the nested one, read
`offer.subdomain.name` on `undefined` inside `offers.map` and took the whole
page down — no header, no tab bar, nothing, for every creative who had an offer.
A creative with none rendered fine, which is why it survived review and three
audits.

Both compiled cleanly. Both passed every gate. The frontend hand-writes its own
interfaces for every response — 658 lines across ten files — and nothing has
ever compared them to what the backend returns.

## Decision

**A response shape is declared once, in `backend/src/contracts/`, and imported
by both sides.**

The backend annotates the service's return type with it. The frontend imports
the same file. TypeScript then refuses to compile whichever side drifts.

**Contracts contain types and nothing else — no runtime code, and no imports
except type-only imports of sibling contracts.**

The original rule forbade imports outright, on the grounds that the backend
resolves `NodeNext` — where a relative import needs a `.js` specifier — while
the frontend resolves `bundler`, and a contract importing anything has to
satisfy both.

**Amended 2026-09-19, after the restriction cost more than it bought.** It is
true of arbitrary imports and not of a sibling contract: `import type
{ AgreementCard } from './agreements.js'` typechecks under both modes, builds,
and still puts nothing in the bundle. Tested, not assumed.

Forbidding it had produced exactly what this record exists to prevent —
`ConversationAgreementCard` was a copy of `AgreementCard` that inlined the
status and lifecycle-state unions, so adding a state would have updated one copy
and silently not the other. Duplication inside the thing built to stop
duplication. `PublicProfileDetail` had likewise been exiled to the service
because it needed `ProfileOffer` from another file.

Still no imports of anything else. A contract that needs a Drizzle type, a
helper or a zod schema is not describing a response.

It also keeps the contract honest. A shape that needs a Drizzle type to describe
itself is describing a table, not a response.

**They live under `backend/src/` rather than in a shared package.** The
backend's `rootDir` is `src`, so anything outside it is a compile error there. A
third workspace would mean another `package.json`, another build, and another
thing to keep in step — for a directory of interfaces. One `paths` entry in
`frontend/tsconfig.app.json` does the same job.

**Nothing ships.** Type-only imports are erased, so no backend path reaches the
bundle and no bundler configuration changes.
[Constraint 3](../explanation/constraints.md) means a fix that cost kilobytes
would be a poor trade; this one costs none.

**Routes pass a service's return through unchanged.** The contract binds the
service, not the route. A route that reshapes what it received puts the drift
back one layer along, where nothing is watching.

**This fixes authoring drift, not deployment skew, and the difference matters.**
The two tiers deploy independently — the frontend can be live on Vercel while
Render still serves an older payload. A shared type cannot know that. Fields
that may legitimately be absent from an older deployment stay optional, with the
comment saying why, exactly as they are today. Contracts stop the two sides
being written to disagree; they do not stop them running at different versions.

## Alternatives considered

**Keep writing contract tests per endpoint.** What has been done so far, and it
works — the offer-shape test fails when the flat version is reinstated.
Rejected as the general answer: it is one test per field per endpoint, nobody
sustains it, and both production bugs happened in code that already had tests
around it.

**A third workspace package, `@bilikha/contracts`.** The textbook answer, and
correct at a larger size. Rejected for now: another `package.json`, another
build step and another version to keep aligned, to hold a folder of interfaces
that neither side compiles separately.

**Generate an OpenAPI document and generate the client from it.** Strongest
guarantee, and it would cover the wire and not just the types. Rejected: the
backend has no OpenAPI description today, so it means writing one for every
route, plus a generator in the build. That is a large change to prevent a class
of bug that one `paths` entry also prevents.

**Share zod schemas and validate responses at runtime on the client.** The only
option here that also catches deployment skew, because it checks the payload
that actually arrived. Rejected for now on
[constraint 3](../explanation/constraints.md): zod on the client is bundle
weight on a metered connection, and the schemas would still be hand-written and
could still drift from the query that fills them. **This is the answer if
deployment skew ever causes a real incident** — it is the thing contracts
deliberately do not solve.

**Do nothing.** Two blank pages in production say otherwise.

## Consequences

**Good.** The two bugs above become compile errors. Verified before deciding: a
one-token spike renamed a field on the backend side and the frontend typecheck
failed with `Property 'otherPartyAvatarUrl' does not exist`.

**Good.** No dependency, no codegen, no build step, nothing in the bundle.

**Bad.** The frontend's typecheck now depends on backend source. Moving or
renaming a contract file breaks the frontend build, and `npm --prefix frontend
run typecheck` now reads across the workspace boundary. That coupling is the
point, but it is coupling.

**Bad.** A directory called `contracts` invites things that are not contracts. A
helper, a constant, an import of a Drizzle type — each would work locally and
break the other side's resolution. The rule is simple and will still need
enforcing.

**Bad.** A contract only binds where the service annotates its return. An
un-annotated function that happens to return the right shape proves nothing, and
nothing flags it.

**Watch for.** Optional fields used to paper over a shape that is simply wrong.
Optionality is for deployment skew and for genuinely absent data. The `avatarUrl`
bug hid behind an optional field for days.
