# 0031. Tests run against a real database, at the service layer

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0014](./0014-modular-monolith-architecture.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0010](./0010-theme-static-tokens.md)

## Context

There are no automated tests. Every verification so far has been a script
written by hand, run once, and deleted — including the ones that checked
suspension enforcement and notification delivery. Nothing stops any of it
regressing, and nothing runs on push.

The question is not whether to test but what to test, and the honest input is
the list of bugs this project has actually shipped or nearly shipped:

| Bug | Where it lived |
|---|---|
| `ORDER BY false` → Postgres 42601, broke the feed | generated SQL |
| Suspended accounts kept full write access | authorization |
| Suspended accounts' content stayed public | query filters |
| Path traversal in storage object keys | service validation |
| A migration that would have dropped production data | schema |
| Migration snapshot drift | schema tooling |
| `avatarUrl` sent, `otherPartyAvatarUrl` expected | API contract |
| `bg-paper-sunk` — an invented Tailwind token | silent no-op |
| A nested `<form>` that killed Save | markup |

Nearly all of them live in the service layer, in SQL, or in the contract between
backend and frontend. **A mocked database would have caught none of the top
six.** `ORDER BY false` is the clearest case: every assertion about that
function passes against a mock, because the mock does not parse SQL. Only
Postgres knows that a bare constant is a column ordinal.

That rules out the default shape — a wide base of unit tests over mocked
repositories — before it is proposed. It would be a large amount of work aimed
away from where this codebase actually breaks.

## Decision

**Vitest.** Vite is already the frontend bundler, and the backend is ESM with
`NodeNext` resolution, where Jest needs transform configuration to work at all.
One runner for both sides.

**The default test is an integration test: a real service function against a
real Postgres.** No mocked database, no mocked Drizzle, no repository
interfaces introduced for the purpose of faking them. If a test would pass
against a mock of the thing that is broken, it is not testing the thing.

**A separate `bilikha_test` database, reset between tests by truncating.**

Not by wrapping each test in a transaction and rolling back, which is the
faster and more common choice. The code under test opens its own transactions
and takes `pg_advisory_xact_lock`, and an advisory *transaction* lock taken
inside a harness-owned transaction is scoped to the harness, not to the code.
The concurrency behaviour under test would be a behaviour the harness invented.
Truncation is slower and leaves the code running exactly as it runs in
production.

**Reference data is a fixture; everything else is built by the test.** The seed
is idempotent reference data — municipalities, barangays, domains, sub-domains
— so it is loaded once into the test database and never truncated. No test
asserts on it: "the directory returns 47 profiles" is a test that fails the day
somebody adds a barangay, and it teaches people to delete tests to make builds
pass.

**Factories, not fixture files.** `makeUser`, `makeCreative`, `makeConversation`.
Every hand-written verification in this project rebuilt that scaffolding from
scratch, which is most of why they were written once and thrown away.

**What must have tests**, in priority order, because this is where the bugs
were:

1. **Authorization and visibility** — who can read and write what, and what a
   suspended account can still see or do.
2. **Money** — centavos in, centavos out, never a float.
3. **State machines** — moderation transitions, and the agreement lifecycle when
   it lands.
4. **Any query with a raw SQL fragment or a computed `ORDER BY`.**
5. **Pure frontend logic** — money formatting, relative time, derivations.

**What is deliberately not tested**: page rendering, component markup, snapshot
tests. The one markup bug here — a nested `<form>` — would have needed a full
browser to catch, and a snapshot of a page freezes its markup without asserting
anything about behaviour.

**No coverage threshold.** A percentage target drives tests toward whatever is
easy to cover, which is the code that does not need them. The list above is the
standard instead, and review is what enforces it.

**CI on GitHub Actions, with a Postgres service container, on every push.**
Tests nobody runs are worse than no tests, because they suggest a safety that is
not there. The same workflow also runs `typecheck`, `lint` and `build`.

**The backend gets linted.** `npm run lint` currently runs the frontend only, so
the half of the codebase holding the authorization logic has never been linted.

**The frontend/backend contract is not solved by tests, and this ADR does not
pretend otherwise.** The `avatarUrl` bug is a class that tests only catch by
asserting every field of every response, which nobody sustains. The real fix is
sharing types or schemas across the boundary, and it is a separate decision. In
the meantime a small number of response-shape assertions cover the endpoints the
frontend depends on most.

## Alternatives considered

**Unit tests over a mocked database.** Fast, no Docker, runs anywhere. Rejected
on the table above: it is aimed away from every serious bug this project has
had, and it would have reported green through all of them.

**Transaction-per-test with rollback.** Materially faster, and the usual advice.
Rejected on the advisory-lock problem above. It is the right choice for a
codebase that does not manage its own transactions; this one does, in exactly
the places most worth testing.

**Testcontainers.** Isolated, disposable, no shared state. Rejected for now: it
pulls an image per run and this project already has a Postgres container in
`docker-compose.yml` that every contributor starts anyway. Worth revisiting if
parallel test runs start colliding.

**Playwright end-to-end tests.** They would have caught the nested `<form>` and
the landing-page 404s, which were real. Rejected for this round: a browser
harness is a large dependency, slow, and flaky unless carefully maintained, and
the failure class it covers is rarer here than the service-layer one. The
trigger for revisiting is named in the plan rather than left to taste.

**A coverage threshold in CI.** Rejected above.

## Consequences

**Good.** The tests exercise the code as production runs it: real SQL, real
constraints, real transactions, real advisory locks. A `42601` shows up as a
failing test rather than an empty feed.

**Good.** Factories make the next verification cheap, so the habit of writing a
script and deleting it can stop.

**Good.** CI turns four checks that are currently run by whoever remembers into
something that blocks a push.

**Bad.** Tests need Docker running. A contributor with the container down gets
failures that look like broken code, so the harness has to say plainly that the
database is not up.

**Bad.** Integration tests are slower than unit tests, and truncation is slower
than rollback. At this size that is seconds; it will not stay seconds forever,
and the first response should be parallel databases rather than mocks.

**Bad.** Two databases locally, both needing migrations. One more thing to be
stale.

**Watch for.** Tests that assert on reference data creeping in, because it is
convenient. They fail for reasons unrelated to what they test, and a test that
cries wolf gets deleted rather than fixed.
