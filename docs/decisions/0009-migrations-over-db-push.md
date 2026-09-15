# 0009. Generated migrations over `db:push`

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Drizzle offers two ways to move schema changes into a database.

`drizzle-kit push` diffs the schema against the live database and applies the
difference directly. Fast, no files, ideal while a model is still moving.

`drizzle-kit generate` writes a timestamped SQL migration; `migrate` applies
pending ones in order. Slower, produces reviewable artefacts.

Two practical facts pushed the decision. `push` requires a TTY to confirm
potentially destructive changes — it fails outright in CI or any non-interactive
shell, which is how it first surfaced here. And Drizzle infers intent from a
diff: a column rename can read as a drop plus an add, which silently deletes
data.

## Decision

Generated migrations are the default. `db:generate` → **read the SQL** →
`db:migrate`, with the migration file committed alongside the schema change.

`db:push` stays in `package.json` for fast iteration against a throwaway local
database. It is never used against anything shared or deployed.

Reviewing the generated SQL before applying it is mandatory, not advisory.

## Alternatives considered

**`push` everywhere.** Fastest loop, no files to manage. Rejected: no reviewable
record, no ordered history, fails in CI, and the rename-as-drop failure mode is
silent and unrecoverable.

**Hand-written SQL migrations only.** Maximum control and no inference risk.
Rejected as the default: it duplicates the schema definition, and the two drift.
Generation plus mandatory review gets most of the safety at a fraction of the
effort — and hand-writing is still available via `generate --custom` for
backfills and concurrent index builds.

**A different migration tool** (node-pg-migrate, Atlas). Rejected: a second tool
alongside Drizzle, which already owns the schema definition.

## Consequences

**Good.** Every schema change is a reviewable artefact in the PR that makes it.
Migrations apply in a deterministic order across every environment. CI can run
them without a terminal. Destructive changes are visible before they run.

**Bad.** Slower during early iteration, when the schema changes several times a
day. Requires the discipline to actually read the generated SQL — a habit that
erodes precisely when someone is in a hurry, which is exactly when it matters.

Drizzle generates no down migrations. Undoing means writing a new forward
migration; locally, reset and re-run instead.

**Note.** The seed is separate from migrations and idempotent, upserting on
slug. Reference data changes go there, not into a migration.
