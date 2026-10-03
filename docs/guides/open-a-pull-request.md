# Open a pull request

Nothing reaches `main` without an audit, and `main` is staging
([ADR 0042](../decisions/0042-main-is-staging-production-is-a-branch.md)). The
audit is quick when the pull request carries its own evidence and slow when the
reviewer has to reconstruct it. This page is what "carries its own evidence"
means.

GitHub pre-fills every pull request from
[`.github/pull_request_template.md`](../../.github/pull_request_template.md).
Fill it in; this page explains why each part is there.

## How it is enforced

Nothing here is on trust ([ADR 0043](../decisions/0043-only-reyxdz-merges-and-releases.md)):

| Gate | When | Blocks |
|---|---|---|
| `pre-push` hook | Every `git push` | The push, if typecheck, lint or the docs checks fail. Skippable — it is early warning, not the gate |
| `check` (CI) | Every push | The merge, if typecheck, lint, tests, build, docs or commit messages fail |
| `pr-audit` | Opening, editing or pushing to a pull request | The merge, if the description is incomplete or the diff breaks a rule below |
| Code owner | — | The merge, until reyxdz approves. A push after approval dismisses it |
| `main` rulesets | — | Anyone but reyxdz merging, and anyone merging past a red check |

A failing pull request can still be opened and discussed. It cannot be merged.

### Check before opening

Save the description you are about to paste into a file, then:

```bash
npm run check:pr -- --body-file pr.md
```

It runs exactly what the `pr-audit` check runs, against `origin/main...HEAD`.

On GitHub, `pr-audit` always runs `main`'s copy of the check, never the pull
request's — so changing `scripts/check-pr.mjs` or the workflow in a pull request
does not change how that pull request is checked. It applies after merging.

### What `pr-audit` checks

**The description:** every template section filled in; `Plan / issue:` not
blank; at least one checkable acceptance criterion; no blank layer under "What
changed"; no unticked box under Rollout or Checklist. When the UI changes,
"States checked" has every state ticked or marked `n/a`, and "Screenshots" has
an image.

**The diff:**

| If the diff… | …it must also | Unless the description says |
|---|---|---|
| changes `backend/src/db/schema/` | add a migration in `backend/drizzle/` | `No migration: <why>` |
| changes route files | change `docs/reference/api.md` | `No API docs: <why>` |
| changes `backend/src/config/env.ts` | change `backend/.env.example` and `docs/reference/environment.md` | `No env docs: <why>` |
| changes a `package-lock.json` | change the `package.json` beside it | `Lockfile only: <why>` |
| changes application code | change a test | `No tests: <why>` |
| adds `.env`, `tmp/`, `tmp-*` or cookie files | — | nothing: remove them |

An exception is one line, anywhere outside a comment, with a reason of at least
ten characters. The check accepts the line; the audit decides whether the
reason holds.

---

## Before writing code

- **A written scope with acceptance criteria.** For anything multi-step, a plan
  in [`docs/plans/`](../plans/); for a small change, an issue with a checkable
  list. The audit checks the work against that list. Without one, "done" is a
  guess.
- **An ADR** in [`docs/decisions/`](../decisions/) for any choice that would be
  expensive to reverse, or that rejects a reasonable alternative.
- **One feature per pull request.** No drive-by refactors, no reformatting files
  the feature did not need. A mixed diff is where a bug hides.
- **Read what applies:** [`CLAUDE.md`](../../CLAUDE.md),
  [operating constraints](../explanation/constraints.md), and the guide for the
  layer you are touching.

## Repository hygiene

- Branch from current `main`, and run `npm run setup` once per clone — it
  installs the commit hook.
- **No AI attribution** in commits or the description. The hook and CI both
  reject it ([ADR 0041](../decisions/0041-ai-attribution-is-blocked-by-a-hook-not-a-rule.md)).
- **Never commit** `.env`, a secret, `tmp/`, or a cookie jar.
- **No lockfile changes unless dependencies changed.** npm 11 on Windows strips
  the `libc` fields from `package-lock.json` on a plain install. The diff looks
  harmless and changes which native binaries Linux installs on CI and Render.
  `git checkout -- '*package-lock.json'` if you did not mean to change one.

## The description

The audit reads it before the diff. Each section of the template exists because
its absence cost an audit time:

| Section | Why |
|---|---|
| What and why | The diff shows what changed, never why |
| Acceptance criteria | What the audit checks against |
| What changed, by layer | Where to look first; a migration changes what the audit is |
| How to verify | Exact steps, accounts, roles, fixture commands. "Click around" cannot be repeated |
| States checked | The happy path is the state least likely to be broken |
| Screenshots | A screen nobody looked at in dark mode is a screen that is broken in dark mode |
| Rollout | Anything the deploy itself must do, or be told |
| Known gaps | A limitation stated is a decision; a limitation found is a finding |

**Fixtures.** `node scripts/seed-fixtures.mjs` reaches states the API will not
hand you on demand — an expired posting, one somebody replied to. Verify against
those, not three identical happy-path rows.

**Screenshots.** `scripts/screenshot.mjs` takes them at phone width, in either
theme, signed in — see [Check a screen in a browser](./check-a-screen-in-a-browser.md).

## Checks

All of these pass locally before asking for an audit. CI runs the same set; a
red CI is not ready for review.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run docs:check
```

## Tests

- New behaviour has tests: service-layer tests against a real Postgres on the
  backend ([ADR 0031](../decisions/0031-testing-strategy.md)), Vitest for
  frontend logic.
- A bug fix comes with a test that fails without the fix.
- The unhappy paths are covered: acting on somebody else's resource, invalid
  input, a suspended account
  ([ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)), an
  expired or edge state.

## Database changes

The strictest part of the audit, because Render runs migrations on deploy —
against staging's data the moment the pull request merges, and against
production's at the next release.

- Generate and commit the migration
  ([Change the database schema](./change-the-database-schema.md)). Never
  `db:push` ([ADR 0009](../decisions/0009-migrations-over-db-push.md)).
- **Every migration must be safe on live data.** Add before you remove: no
  renaming or dropping a column the running code still reads, and a new
  required column needs a default or a backfill. A destructive change takes two
  releases — stop reading it, then drop it.
- Keep the seed idempotent, and update
  [the data model](../reference/data-model.md).

## API changes

- Follow [Add an API endpoint](./add-an-api-endpoint.md): the error envelope,
  an auth and an ownership check on every route, and the shared contract
  ([ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)).
- Relative imports end in `.js`. It compiles without; it fails at runtime.
- List endpoints paginate, and nothing queries once per row.
- Update [the API reference](../reference/api.md).

## Frontend changes

- Tokens only, per [`frontend/DESIGN.md`](../../frontend/DESIGN.md) — no raw
  colours, sizes or shadows, and never an interpolated class name.
- Reuse the primitives in `frontend/src/components/ui/` before adding one
  ([Add a UI component](./add-a-ui-component.md)).
- Works at phone width with the bottom navigation, in both themes.
- Labelled inputs, visible focus, reachable by keyboard.
- Nothing secret in a `VITE_` variable — they are inlined into the public
  bundle.

## New environment variables

Add it to the service's `.env.example`, to `backend/src/config/env.ts`, and to
[the environment reference](../reference/environment.md). Name it in the
description's Rollout section: it must be set on **both** Render services —
`bilikha` (staging) and `bilikha-production` — before the release that needs it.
A required variable that is missing stops the API at boot.

## Self-review

Read your own diff end to end before asking anyone else to. Remove debug
logging, commented-out code, and any TODO without an issue. Run the feature
locally, start to finish, against fixtures. Tick plan boxes only for what was
actually checked — `docs:check` catches some false claims, not all.

---

## What the audit checks

- **Correctness** against the acceptance criteria
- **Security** — authentication, ownership, validation, data leaking into a
  response
- **Migration safety** on live data
- **Tests** that exercise the risky part, not only the easy one
- **UX states** — empty, error, long, phone, dark
- **Conventions and docs**
- **Scope** — nothing in the diff the description does not explain
- **Performance** — query counts, pagination, bundle size

Each finding names a file and line and a concrete way it fails.

## Why the audit runs locally

A pull request's preview deployment is behind Vercel's login, and its `/api`
calls go to the **staging** API, which runs `main`'s backend — not the pull
request's. A backend change is therefore invisible on a preview. The audit
checks the branch out and runs it against a local database
([Local setup](../getting-started/local-setup.md)), which is why "How to
verify" must work from a fresh local setup.

## After the audit

Merge → staging deploys automatically → check the change on
`bilikha-staging.vercel.app` → release:

```bash
git fetch origin
git push origin origin/main:production
```

The whole procedure, with what to check and how to roll back:
[Release to production](./release-to-production.md).
