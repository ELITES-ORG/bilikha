<!--
Every PR into main is audited before it is merged. This template is what the
audit reads first. The reasoning behind each section, and what the audit checks:
https://github.com/ELITES-ORG/bilikha/blob/main/docs/guides/open-a-pull-request.md

The `pr-audit` check fails this pull request until every section is filled
in, and merging is blocked until it passes. Check before opening, with this
description saved to a file:  npm run check:pr -- --body-file pr.md

States checked and Screenshots are required when the UI changes. No AI
attribution anywhere — not in commits, not in this description.
-->

## What and why

<!-- One paragraph. Link the plan (docs/plans/NNNN) or issue this delivers. -->

Plan / issue:

## Acceptance criteria

<!-- Copied from the plan or issue. Each one checkable by someone else. -->

- [ ]

## What changed

<!-- Write "none" for a layer this PR does not touch. -->

- **Database:** <!-- tables, columns, the migration file in backend/drizzle/ -->
- **API:** <!-- method, path, who may call it, request and response shape -->
- **UI:** <!-- routes and screens -->
- **Config:** <!-- new environment variables — name only, never a value -->

## How to verify

<!-- Exact steps a reviewer can follow on a fresh local setup. Which account,
which role, which fixture command, which URL. -->

1.

## States checked

- [ ] Empty, loading and error states
- [ ] Very long text and missing optional fields
- [ ] Signed out, signed in, and without permission
- [ ] Creative mode and client mode, where the screen differs
- [ ] Admin, where it applies
- [ ] Phone width (375px) with the bottom navigation
- [ ] Light and dark themes

## Screenshots

<!-- The main states, light and dark, at phone width. scripts/screenshot.mjs
takes them — see docs/guides/check-a-screen-in-a-browser.md. -->

## Rollout

- [ ] No migration — or the migration is safe on live data (additive; nothing the running code still reads is renamed or dropped; new required columns have a default or a backfill)
- [ ] No new environment variable — or it is in `.env.example`, `env.ts` and `environment.md`, and listed above for both Render services
- [ ] No one-off script — or it is named above, with when to run it

## Exceptions

<!-- Only if a rule in the PR audit genuinely does not apply. One line each, with
a real reason — the audit judges it:

No tests: <why>
No API docs: <why>
No migration: <why>
No env docs: <why>
Lockfile only: <why>
Tooling change: <why it belongs in this pull request>
Budget raised: <why the first page load must grow>

Delete this section if there are none. -->

## Known gaps and risks

<!-- What is deliberately not done, and anything you are unsure about. -->

## Checklist

- [ ] One feature; no unrelated refactors or reformatting
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run docs:check` pass locally
- [ ] New behaviour has tests, including the unhappy paths; a bug fix has a test that fails without it
- [ ] No secrets, `.env`, `tmp/` files, or lockfile changes unless dependencies changed
- [ ] Docs updated where the change makes them wrong (`api.md`, `data-model.md`, plan boxes, an ADR for an expensive-to-reverse choice)
- [ ] I read my own diff end to end and ran the feature locally
