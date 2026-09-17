# 0019. Automated tests and CI

- **Status:** Complete, except step 6.2 — CI has not yet been seen red
- **Related:** [ADR 0031](../decisions/0031-testing-strategy.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)

---

## Goal

`npm test` runs, against a real Postgres, the checks that would have caught the
bugs this project has actually had. CI runs them, plus typecheck, lint and
build, on every push.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Seven specific to this plan:

1. **Never mock the database.** No mocked Drizzle, no fake repositories, no
   repository interface introduced so it can be faked.
   [ADR 0031](../decisions/0031-testing-strategy.md) lists the bugs a mock would
   have reported green through.
2. **Never assert on reference data.** Municipalities, barangays, domains and
   sub-domains are a fixture. A test that expects a count of them fails the day
   someone edits a CSV.
3. **Every test builds what it needs.** No shared mutable fixture, no test that
   depends on another having run.
4. **Tests run against `bilikha_test`, never `bilikha`.** The harness refuses to
   start if the database name is not the test one — truncating the development
   database by accident must be impossible, not merely unlikely.
5. **No snapshot tests, no page-render assertions.** ADR 0031.
6. **A test that fails only sometimes is deleted or fixed the same day.** A
   suite people have learned to re-run teaches them to ignore it.
7. **Do not add a coverage threshold.**

---

## Scope

**In scope**
- Vitest for backend and frontend
- A `bilikha_test` database, migrated and reference-seeded
- Truncate-between-tests isolation
- Factories: users, creatives, conversations, postings
- First suites: authorization and visibility, suspension, money, moderation
  transitions, notifications, and the queries carrying raw SQL
- Frontend unit tests for pure logic only
- A GitHub Actions workflow: typecheck, lint, test, build
- Linting the backend, which has never been linted

**Out of scope** — do not build these
- Playwright or any browser harness. ADR 0031, and the trigger is in Follow-ups
- Mocked-database unit tests. Rule 1
- Snapshot or render tests. Rule 5
- Coverage reporting or thresholds. Rule 7
- Tests for plan 0016, which is unbuilt
- Refactoring services to be "more testable". If a function needs restructuring
  to test, say so rather than doing it inside this plan

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The harness | 4 / 4 | Complete |
| 2. Factories | 2 / 2 | Complete |
| 3. The suites that matter | 5 / 5 | Complete |
| 4. Frontend units | 1 / 1 | Complete |
| 5. Lint the backend | 1 / 1 | Complete |
| 6. CI | 1 / 2 | Workflow written, not yet seen fail |
| 7. Verification | 4 / 4 | Complete locally |

---

# Phase 1 — The harness

### Step 1.1 — Vitest

- [x] **Action.** Add `vitest` to backend and frontend. Backend config:
  `environment: 'node'`, `globals: false` (import `describe`/`it`/`expect`
  explicitly), and **`fileParallelism: false`** — one database, shared, so
  parallel files would truncate each other's rows mid-test.
- [x] **Action.** Root script `"test": "npm --prefix backend run test && npm --prefix frontend run test"`.

### Step 1.2 — The test database

- [x] **Action.** `TEST_DATABASE_URL` in the backend env schema, optional, read
  only by the harness.
- [x] **Action.** Built into `src/test/global-setup.ts` rather than a separate
  script: it creates `bilikha_test` if absent, migrates it, and runs the
  reference seed. One place, so CI cannot drift from local by forgetting a step.
- [x] **Why.** The seed is idempotent reference data
  (`backend/src/db/seed/index.ts`), so this is safe to re-run and gives every
  test the foreign keys it needs for municipalities and sub-domains.

### Step 1.3 — Isolation

- [x] **Action.** A global setup that fails loudly, before any test runs, when:
  Postgres is unreachable ("run `npm run db:up`"), or the target database is not
  named `bilikha_test` (rule 4).
- [x] **Action.** A `beforeEach` that truncates. Built better than specified:
  the table list is *discovered* from `pg_tables` minus the four reference
  tables, rather than starting from `users` and cascading. A hard-coded list is
  how a suite starts leaking rows six months after it was written.
- [x] **Verify.** Write a throwaway test that inserts a user, and a second that
  counts them, and confirm the second sees zero regardless of order.

### Step 1.4 — Pool teardown

- [x] **Action.** Close the database pool after the run, or Vitest hangs on an
  open handle. `closeDatabase()` already exists.

---

# Phase 2 — Factories

### Step 2.1 — The factories

- [x] **Action.** `backend/src/test/factories.ts`:
  - `makeUser(overrides?)` — unique username and email per call, real argon2
    hash only when the test needs to authenticate (it is slow; default to a
    precomputed hash for one known password)
  - `makeAdmin(overrides?)`
  - `makeCreative(overrides?)` — user plus a `creative_profiles` row, with a
    sub-domain from the seeded taxonomy, defaulting to `published`
  - `makeConversation(clientId, creativeProfileId)`
  - `makePosting(userId, overrides?)`
- [x] **Action.** Every factory returns the inserted row, not just an id.

### Step 2.2 — Prove them

- [x] **Verify.** A test that creates a creative and reads it back through
  `listPublished` — the factory and the service agree, or the factory is wrong.

---

# Phase 3 — The suites that matter

Order matters: 3.1 is the one that pays for the whole plan.

### Step 3.1 — Suspension and visibility

- [x] **Action.** All eight public read paths — creative directory, single
  profile, offer index, single offer, postings feed, single posting, saving an
  offer, starting a conversation — visible while `active`, gone when
  `suspended`, back on reinstatement.
- [x] **Found.** `saveOffer` filtered on `users.status` without joining `users`,
  so saving any offer failed with a missing-FROM-clause error. Shipped earlier
  the same day and missed by the hand verification, because that never exercised
  saving. Fixed with the join. This test's first run paid for the plan.
- [x] **Action.** A test that `requireAuth` rejects a suspended account, and
  that `requireAdmin` returns 404 rather than 403 to a non-admin.
- [x] **Why.** This is [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)
  in executable form. It was verified once by hand and nothing holds it.

### Step 3.2 — The queries with raw SQL

- [x] **Action.** Exercise every service query that builds a fragment with
  `sql\`\`` or a computed `ORDER BY`, with enough rows to make ordering
  observable — the nearby-first creative feed especially.
- [x] **Why.** `ORDER BY false` was a Postgres 42601 that reached production and
  broke the feed for 11 of 47 profiles. This step exists because of it.

### Step 3.3 — Money

- [x] **Action.** Offers and postings: centavos stored exactly, ranges with a
  null bound, and a price above the integer range refused rather than truncated.
- [x] **Action.** Assert no column is a float, by reading
  `information_schema.columns` for anything matching `%centavos%`.

### Step 3.4 — Moderation

- [x] **Action.** Each transition — approve, reject, return to pending,
  acknowledge edit — reaches the right status, writes its `moderation_actions`
  row, and rejects without a reason is refused.
- [x] **Action.** Account suspension refuses self-suspension and refuses to
  suspend another administrator.

### Step 3.5 — Notifications

- [x] **Action.** Approving a profile notifies its owner and not the admin; a
  suspended actor tombstones; an unresolvable target degrades to no link; one
  user cannot mark another's notification read; `notifyOnce` collapses repeats
  while unread.
- [x] **Action.** A failing `notify` does not fail its caller — point it at a
  non-existent user and assert the moderation decision still commits.
- [x] **Why.** All of this was verified by hand in a script that no longer
  exists. This is that script, kept.

---

# Phase 4 — Frontend units

### Step 4.1 — Pure logic only

- [x] **Action.** Vitest with `environment: 'node'`. Cover `@/lib/money`
  (`groupPesoDigits`, `pesoInputToCentavos`, `centavosToPesoInput`,
  `formatPriceRange`) and `relativeTime`. Round-trip pesos through centavos and
  back.
- [x] **Action.** No React, no Testing Library, no jsdom in this plan. Rule 5.

---

# Phase 5 — Lint the backend

### Step 5.1 — Extend lint

- [x] **Action.** Add oxlint to the backend and change the root `lint` script to
  run both. Fix what it finds, or record why a rule is disabled.
- [x] **Note.** Expect real findings — this code has never been linted.

---

# Phase 6 — CI

### Step 6.1 — The workflow

- [x] **Action.** `.github/workflows/ci.yml`, on push and pull request:
  Node from `.nvmrc` or the engines field, `npm ci` in both workspaces, a
  `postgres:17-alpine` service container with a health check, then
  `db:test:setup`, `typecheck`, `lint`, `test`, `build`.
- [x] **Action.** Cache npm downloads by lockfile hash.

### Step 6.2 — Make it mean something

- [ ] **Action.** Confirm the workflow fails when a test fails, by pushing a
  deliberately broken test on a branch and watching it go red. Then remove it.
- [ ] **Note.** A green badge that has never been red proves nothing.
- [ ] **Outstanding.** The workflow has never run. Its YAML is unvalidated
  against GitHub's runner, and nothing has confirmed a failing test turns the
  check red. Until that is done, CI is an assumption.

---

# Phase 7 — Verification

### Step 7.1 — It catches the real ones

- [x] Reintroduce `ORDER BY false` in the creative feed. The suite must fail.
  Revert.
- [x] Remove one `eq(users.status, 'active')` filter. The suite must fail.
  Revert.
- [x] **Why.** A suite that does not fail when the original bug is reinstated is
  not testing what it claims to.

### Step 7.2 — Isolation holds

- [x] Run the whole suite twice in a row without resetting anything. Identical
  results.
- [x] Run a single file on its own. It passes.

### Step 7.3 — It refuses the wrong database

- [x] Point `TEST_DATABASE_URL` at `bilikha` and confirm the harness refuses to
  run before truncating anything. Rule 4.

### Step 7.4 — Full pass

- [x] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0
  locally and in CI. The development database still has its data.

---

## Acceptance

- `npm test` runs backend and frontend suites against `bilikha_test`.
- The harness refuses to run against the development database.
- Reinstating `ORDER BY false`, or dropping a suspension filter, turns the suite
  red.
- No test mocks the database or asserts on reference data.
- CI runs typecheck, lint, test and build on every push. **Not yet seen red** —
  step 6.2 is outstanding.
- The backend is linted.

---

## Follow-ups

Not in this plan:

- **Playwright**, when a user-facing regression escapes twice that only a
  browser would have caught. The nested `<form>` and the landing-page 404s are
  one each; a third is the trigger.
- **Sharing types or schemas across the API boundary**, which is the real answer
  to the `avatarUrl` class of bug. Needs its own ADR.
- Parallel test databases, when the suite stops finishing in seconds.
- Tests for plan 0016, written with it rather than after it.
