# Extend the taxonomy

The nine creative domains and their 81 sub-domains are **reference data**, not
user-generated content. They come from DTI's material, which follows the RA
11904 domain set.

Source of truth: `backend/src/db/seed/taxonomy-data.ts`.
Loaded by: `npm --prefix backend run db:seed`.

---

## The one rule

**A slug is permanent.**

Slugs are public identifiers. They appear in URLs, get indexed by Google, are
shared into Messenger, and will eventually be referenced by creative profile
rows. Changing one breaks every link that ever pointed at it.

- Changing a **label** is free. The seed matches on slug and updates the name in
  place.
- Changing a **slug** is a data migration, not an edit. It needs a redirect from
  the old slug and a backfill of every referencing row.

Get slugs right the first time. If one is wrong, weigh the cost of a migration
against just living with a slightly odd slug — the second option is usually
correct.

## Fixing a label

Edit the `name` in `taxonomy-data.ts`, re-run the seed. Done — the seed is
idempotent and upserts on slug.

```bash
npm --prefix backend run db:seed
```

## Adding a sub-domain

```ts
{
  slug: 'sound-engineers',      // permanent, kebab-case, no abbreviations
  name: 'Sound Engineers',      // editable
}
```

Append it to the right domain's `subdomains` array. Order within the array
becomes `displayOrder`, so inserting mid-array renumbers everything below it —
harmless, since order is presentation only.

**Before adding one, check it is genuinely missing rather than badly named.**
The most common real problem is not an absent category but a category people
cannot find. That is an alias problem, not a taxonomy problem.

## Adding a domain

Don't, without a conversation. The nine domains come from national legislation.
Adding a tenth makes Bilikha's data incompatible with every other PCIDA registry
and breaks any future reporting to DTI.

If DTI issues a revision, add it in `CREATIVE_DOMAINS` order — the array index
drives `displayOrder`, which the UI renders as the domain number.

## Aliases — the part that actually matters

A woodcarver in Culaba does not know she is *Traditional and Cultural
Expressions → Artisans of Indigenous Crafts*. She searches `nagkukulit`,
`woodcarver`, or `kahoy`.

Registration and directory search will therefore need an **alias table**
mapping everyday terms to sub-domain slugs, covering Waray, Cebuano, Tagalog,
and English.

Not yet built. When it is, conventions to hold to:

- Aliases are many-to-one — several terms point at one sub-domain
- Store them lowercase and unaccented; normalise the query the same way
- Include misspellings people actually type, not only correct forms
- **Log every unmatched query.** That log is the roadmap for alias coverage, and
  a repeated unmatched term is the only honest evidence that the taxonomy itself
  is missing something.

An alias is not a sub-domain. Adding `videographer` as an alias of *Filmmakers*
is right; adding it as a 10th sub-domain of Audiovisual Media is wrong and
fragments the directory.

## Municipalities

Also in `taxonomy-data.ts`. Biliran has eight; this list does not change. PSGC
codes are deliberately `null` rather than guessed — populate them from the
official PSA listing before any data exchange with DTI or the LGUs.

## Before you commit

- [ ] Slug is permanent-quality: kebab-case, spelled out, no abbreviations
- [ ] Adding a sub-domain, not an alias in disguise
- [ ] Seed re-run and output checked (`domains: 9  subdomains: N`)
- [ ] If a slug changed: redirect planned and referencing rows backfilled
