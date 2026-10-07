# 0047. The database is the taxonomy's source of truth; archiving replaces deletion

- **Status:** Proposed
- **Date:** 2026-10-07
- **Related:** [0009](./0009-migrations-over-db-push.md) ·
  [0032](./0032-an-accepted-agreement-is-not-deleted.md) ·
  [0035](./0035-the-admin-area-is-a-layout.md) ·
  [0037](./0037-one-definition-of-an-api-shape.md) ·
  [operating constraints §1, §3, §7](../explanation/constraints.md) ·
  [Extend the taxonomy](../guides/extend-the-taxonomy.md) ·
  [issue #14](https://github.com/ELITES-ORG/bilikha/issues/14)

## Context

The nine domains and 81 sub-domains live in
`backend/src/db/seed/taxonomy-data.ts` and are upserted by
`backend/src/db/seed/index.ts` on every run. The upsert matches on `slug` and
overwrites `name` and `displayOrder`:

```ts
.onConflictDoUpdate({
  target: creativeSubdomains.slug,
  set: { domainId, name: subdomain.name, displayOrder: subIndex + 1, updatedAt: new Date() },
})
```

That is exactly right while the seed file is the only author. It is wrong the
moment an administrator can edit a label in the admin area, because the next
seed run silently reverts the edit. There is no error, no conflict and nothing
in the log — the label is simply the old one again. An administrator would
reasonably conclude the feature is broken.

So "let admins edit the taxonomy" is not a CRUD screen on top of the existing
tables. It is a question about who owns the rows, and four problems arrive
together:

1. **Two writers, one row.** The seed and the admin both set `name`.
2. **Deletion is not available.** Every reference to `creative_subdomains`
   already uses `ON DELETE RESTRICT` — `creative_profile_subdomains`,
   `offers`, `postings`. A sub-domain with one registrant cannot be deleted,
   and should not be: it would take a published profile's category with it.
   But the reason to remove a sub-domain is usually that it was a mistake or a
   duplicate, and that reason does not go away because one person registered
   under it.
3. **Slugs are public.** They are in URLs, indexed, and shared into Messenger.
   The guide already states a slug is permanent. An edit form with a slug field
   makes it one keystroke from permanent to broken.
4. **The client caches the taxonomy forever.** `staleTime: Infinity` in
   `frontend/src/features/taxonomy/api.ts` is a deliberate concession to
   constraint 3 — refetching static reference data on prepaid data is waste.
   An open tab therefore never sees an edit.

Problem 4 is where the issue's own wording ("the cache invalidates by version")
and this decision part company. See *Alternatives*.

## Decision

**The database is the source of truth for the taxonomy. The seed inserts what
is missing and never updates what exists.**

Four parts, each addressing one problem above.

### 1. The seed becomes insert-only

`onConflictDoUpdate` becomes `onConflictDoNothing` for `creative_domains` and
`creative_subdomains`. A fresh database still gets all nine domains and all 81
sub-domains; an existing one keeps every administrator edit through every
deploy. `taxonomy-data.ts` stops being the source of truth and becomes the
*initial* data — the set a new environment starts from.

Municipalities and barangays are unaffected. Nobody edits those in the admin
area, and the eight municipalities are fixed (constraint 1), so their upsert
stays as it is.

### 2. Archiving replaces deletion

Both tables gain `archived_at timestamptz` (null = active). Archiving hides an
item from every picker and from the directory's browse surfaces while leaving
every row that references it intact and every URL that names it working.

`DELETE` remains available, and remains genuinely destructive, for exactly one
case: an item nothing references. The `ON DELETE RESTRICT` constraints already
enforce that at the database; the service turns the resulting Postgres error
into a `409` naming the count of referencing rows, rather than letting it
surface as a 500.

An archived sub-domain **stays selectable in a record that already uses it.**
A creative whose primary sub-domain was archived can still save their profile.
`me.service.ts` resolves submitted slugs in two places
(`backend/src/modules/me/me.service.ts:155` and `:250`); both accept an
archived slug when it is already on that profile, and reject it otherwise.
Without this, archiving a sub-domain locks its registrants out of their own
edit form.

This mirrors [ADR 0032](./0032-an-accepted-agreement-is-not-deleted.md): once
something has been referenced by someone else's record, it stops being ours to
delete.

### 3. Slugs are immutable in the API, not merely in the guide

The admin update endpoint accepts `name`, `description` and `displayOrder`. It
has no `slug` field, and the Zod schema uses `.strict()` so sending one is a
`400` rather than a silent no-op. Creating an item still sets a slug — that is
the one moment it is chosen.

The permanent identifier the issue asks for already exists: both tables key on
`uuid().primaryKey().defaultRandom()`, and every foreign key points at the id,
not the slug. No schema change is needed for this part; what was missing was a
write path that could not touch the slug.

### 4. Every change is recorded in `taxonomy_changes`

Append-only, one row per administrator action, shaped after
`moderation_actions`: who, what, which item, before and after. The taxonomy is
reference data taken from legislation (constraint 7); "who renamed this and
when" needs an answer that is not `git log`, because after this ADR the change
is not in git at all.

### 5. The client cache is not invalidated by polling

`staleTime: Infinity` stays. The admin screen invalidates `taxonomyKeys.all`
after its own mutations, so the administrator sees their edit immediately.
Every other open tab keeps the taxonomy it already has until it next loads the
app.

A stale tab is therefore possible, and is handled by validation rather than by
refetching: the server is the one that decides whether a submitted slug is
still acceptable, and a rejected one returns a `409` whose message tells the
person to reload. The failure mode is a rare, clear error on submit, not wrong
data silently accepted.

## Alternatives considered

**Keep the seed authoritative; no admin editing.** The status quo, and it is
not unreasonable — the domain set is statutory and will almost never change
(constraint 7). It loses because the *sub-domain labels* are not statutory, and
the ones that are wrong are wrong in ways only someone in Biliran can see. A
change currently needs a developer, a commit, a pull request reyxdz merges, and
a deploy. That is the wrong cost for fixing a typo in a label.

**A version endpoint the client polls, as issue #14 proposes.** Serve
`GET /api/v1/taxonomy/version` and check it when the tab regains focus, as
`app-update.ts` already does for `/build-id.txt`. Rejected for now: it spends a
request per active tab per hour, forever, against an event that will happen a
handful of times a year, and constraint 3 is explicit that refetching a static
taxonomy on a metered connection is pure waste. The mechanism is cheap to add
later if stale pickers turn out to be a real complaint — `app-update.ts`
already has the focus hook to hang it on. **This is a deliberate narrowing of
the issue and the part most worth arguing with.**

**Lower `staleTime` to an hour.** Simpler than a version endpoint and strictly
worse: it refetches the full domain tree hourly whether or not anything
changed, which is the waste the version endpoint was at least trying to avoid.

**Soft-delete with a boolean `is_archived`.** A timestamp costs the same and
answers "when", which the audit table then does not have to be joined to for
the common question. No reason to prefer the boolean.

**Let the seed update labels but not insert.** Inverts the problem without
solving it — the seed still overwrites administrator edits, which is the whole
complaint.

**Allow slug edits with a redirect table.** What the guide describes as the
honest cost of a slug change. Rejected as out of scope: it is a second feature
(redirects, backfill, a 301 path) attached to a form field almost nobody needs.
A wrong slug is fixed by archiving the item and creating a new one, which is
the same cost and uses machinery this ADR already builds.

## Consequences

**Easier.** A label typo is fixed in the admin area in seconds by someone who
cannot deploy. A duplicate or mistaken sub-domain can be taken out of
circulation without touching the profiles that point at it. "Who changed this"
has an answer.

**Harder.** The taxonomy stops being reproducible from the repository. Two
environments that have been edited differently now differ permanently, and
nothing detects the drift — `taxonomy-data.ts` is no longer a description of
what is in production. This is the real cost of this ADR and it is not
recovered later. A follow-up worth having: a command that prints the
difference between the seed file and the connected database, so drift is at
least visible.

**Also harder.** Every read path that lists domains or sub-domains now has to
decide whether it wants active items only or all of them, and getting that
wrong in a picker is how an archived item comes back. The default in the
service is active-only; the exceptions are named, few, and tested.

**Cost.** Two columns, one table, one migration, five endpoints, one admin
screen. Slug immutability and reference protection are both enforced in more
than one place on purpose — a `.strict()` schema and no slug column in the
update, a `RESTRICT` constraint and a service check — because the expensive
mistakes here are irreversible and a single guard is one refactor from gone.

**Accepted risk.** An open tab can show an archived sub-domain in a picker
until it reloads. Chosen over an hourly request for every user.
