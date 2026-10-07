# Extend the taxonomy

The nine creative domains and their 81 sub-domains are **reference data**, not
user-generated content. They follow the RA 11904 domain set.

**Source of truth: the database.** An administrator edits the taxonomy at
`/admin/taxonomy`, and those edits survive every deploy
([ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)).

`backend/src/db/seed/taxonomy-data.ts` is the data a **new environment starts
from**, not a description of what is in production. The seed inserts a slug it
cannot find and leaves every slug it can alone.

---

## The one rule

**A slug is permanent.**

Slugs are public identifiers. They appear in URLs, get indexed by Google, are
shared into Messenger, and are referenced by creative profiles, offers and
postings. Changing one breaks every link that ever pointed at it.

- Changing a **label** is free, in the admin area, by someone who cannot deploy.
- Changing a **slug** is not offered anywhere. `PATCH /api/v1/admin/taxonomy/...`
  has no `slug` field and its schema is `.strict()`, so sending one is a `400`
  rather than a silent no-op.

**A wrong slug is fixed by archiving the item and creating a replacement.** That
is the same cost as a migration-and-redirect and uses machinery that already
exists.

## Fixing a label

`/admin/taxonomy` → the domain → **Rename**. Done. It is recorded in
`taxonomy_changes` with your account against it.

Do **not** edit `taxonomy-data.ts` for this. The seed no longer updates
existing rows, so an edit there changes nothing in any environment that has
already been seeded — including your own.

## Adding a sub-domain

`/admin/taxonomy` → the domain → **Add a sub-domain**. The slug is chosen once,
here, and is permanent from that moment: kebab-case, spelled out, no
abbreviations.

**Before adding one, check it is genuinely missing rather than badly named.**
The most common real problem is not an absent category but a category people
cannot find. That is an alias problem, not a taxonomy problem.

Add it to `taxonomy-data.ts` as well **only** if a brand-new environment should
start with it. The two are no longer kept in step automatically, and nothing
detects the drift — see *Where this gets awkward*.

## Removing one — archive, don't delete

Archiving takes a sub-domain out of every picker and browse surface while the
profiles, offers and postings that reference it keep working, and its slug stays
resolvable.

Deleting is offered only when nothing references the item at all — a slug typed
wrongly an hour ago. Everything else is refused with a `409` naming the number
of records that point at it. The guard is the `ON DELETE RESTRICT` constraint on
each referencing table, not a count read beforehand, so there is no window for a
registration to arrive mid-operation.

A creative whose sub-domain is archived **can still save their own profile with
it**. Nobody else can add it. Without that, archiving would lock registrants out
of their own edit form.

Archiving a **domain** archives its sub-domains with it, in one transaction.

## Adding a domain

Don't, without a conversation. The nine domains come from national legislation.
Adding a tenth makes Bilikha's data incompatible with every other PCIDA registry
and breaks any future statutory reporting.

The create-domain endpoint exists for a statutory revision. There is no button
for it in the admin area, on purpose.

## Where this gets awkward

The taxonomy is no longer reproducible from the repository. Two environments
edited differently now differ permanently, and **nothing detects the drift** —
`taxonomy-data.ts` stops being an accurate description of production the first
time anyone renames anything.

This is the acknowledged cost of ADR 0049, not an oversight. A
`db:taxonomy:diff` command that prints the difference between the seed file and
the connected database is the mitigation worth having, and is not built.

## Who changed what

`taxonomy_changes` is append-only: one row per administrator action, with the
account, the action, and the `before`/`after` of the fields that moved.
`GET /api/v1/admin/taxonomy/changes` reads it, newest first.

It is there because after ADR 0049 a label change is not in `git log` at all, so
"who renamed this and when" would otherwise have no answer.

## Aliases — the part that actually matters

A woodcarver in Culaba does not know she is *Traditional and Cultural
Expressions → Artisans of Indigenous Crafts*. She searches `nagkukulit`,
`woodcarver`, or `kahoy`.

Registration and directory search will therefore need an **alias table**
mapping everyday terms to sub-domain slugs, covering Waray, Cebuano, Tagalog,
and English.

Not yet built — [issue #24](https://github.com/ELITES-ORG/bilikha/issues/24),
blocked on search existing at all. When it is, conventions to hold to:

- Aliases are many-to-one — several terms point at one sub-domain
- Store them lowercase and unaccented; normalise the query the same way
- Include misspellings people actually type, not only correct forms
- **Log every unmatched query.** That log is the roadmap for alias coverage, and
  a repeated unmatched term is the only honest evidence that the taxonomy itself
  is missing something

An alias is not a sub-domain. Adding `videographer` as an alias of *Filmmakers*
is right; adding it as a 10th sub-domain of Audiovisual Media is wrong and
fragments the directory.

## Municipalities

In `taxonomy-data.ts`, and still seeded by upsert — nobody edits those in the
admin area and Biliran's eight do not change. PSGC codes are deliberately `null`
rather than guessed; populate them from the official PSA listing before any
external data exchange.

## Before you commit

- [ ] Slug is permanent-quality: kebab-case, spelled out, no abbreviations
- [ ] Adding a sub-domain, not an alias in disguise
- [ ] A label fix went through `/admin/taxonomy`, not through `taxonomy-data.ts`
- [ ] If `taxonomy-data.ts` changed, a fresh `db:reset && db:migrate && db:seed`
      still reports `domains: 9  subdomains: N`
- [ ] Removal was an archive, unless nothing referenced the item
