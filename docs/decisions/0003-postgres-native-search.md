# 0003. Postgres-native search, no PostGIS

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

The directory needs two lookup capabilities: text search over creative names,
crafts, and descriptions; and filtering by location.

Scale is the deciding fact. Biliran has roughly 180,000 residents across eight
municipalities. A realistic ceiling for registered creatives is hundreds to low
thousands, not millions. Location questions are all of the form "who works in
Naval?" — never "who is within 5km of this point?"

## Decision

**Text search:** Postgres-native. `tsvector` with a GIN index for full-text,
`pg_trgm` for fuzzy and typo-tolerant name matching.

**Location:** a `municipalities` lookup table with a foreign key. No coordinates,
no PostGIS.

## Alternatives considered

**Elasticsearch, Algolia, Meilisearch.** Better relevance tuning and faceting at
scale. Rejected: none of that is reachable at this volume, and each adds a
service to run, sync, pay for, and keep consistent with Postgres. Sync drift
between a primary store and a search index is a whole class of bug this product
does not need.

**PostGIS with coordinates.** Enables radius search and distance sorting.
Rejected: with eight municipalities, "radius" is meaningless — the entire
province is smaller than most single-city delivery zones. It adds an extension,
a spatial index, and a data-collection burden (every creative would need
coordinates) to answer a question nobody asks.

**`LIKE '%term%'`.** Simplest. Rejected: no stemming, no ranking, no typo
tolerance, and it cannot use a standard index. `pg_trgm` covers the same ground
properly.

## Consequences

**Good.** One datastore, one backup, one consistency model. Search results are
transactionally consistent with the data by construction. No sync pipeline. No
additional hosting cost.

**Bad.** Relevance tuning is more manual than a dedicated engine — weighting
fields, composing `ts_rank` — and faceted counts across many filters will need
hand-written SQL. Multilingual stemming is weak: Postgres has no Waray or
Cebuano dictionary, so those terms are matched lexically rather than stemmed.

That last point is mitigated at a different layer. The alias table mapping
everyday Waray, Cebuano, Tagalog, and English terms to sub-domain slugs does
more for real-world findability than any stemmer would — see
[Extend the taxonomy](../guides/extend-the-taxonomy.md).

**Revisit if** the registry expands beyond Biliran, or search latency exceeds
~200ms at p95 with correct indexes in place. Neither is close.

## Amendment — 2026-10-10: how search is built (issue #22)

Search shipped on `GET /offers` and `GET /creatives` as a `q` parameter. The
decision above holds; these are the choices made in building it.

- **The `simple` configuration, with prefix words.** English stemming turns
  "photographer" into `photograph` and mangles Waray and Filipino words, so
  there is no stemming at all. Each typed word becomes a prefix (`photo:*`), so
  a partial word still finds the whole one. The query is split on anything
  that is not a letter or digit before it reaches `to_tsquery`, so no input can
  be read as query syntax.
- **Every word must match some field**, and words may match different fields:
  "photographer naval" is a craft and a town. Comparing the whole query by
  trigram instead let "dalisay kali" match "Dalisay Ramos" on one strong word.
- **`pg_trgm` per word, on name-like fields only** — titles, names, sub-domain
  and town names — for words of three characters or more. A word of up to five
  letters must reach the default word similarity threshold (0.6); a word of six
  or more needs 0.5, because a dropped letter costs a long word more trigrams
  ("develper" scores 0.58 against "Developer"). Measured over every seeded
  sub-domain and town name, a one-letter drop was found 26% of the time at 0.6
  and 93% at 0.5 for words of 6–7 letters, and 72% and 100% at 8 or more. The
  extra loose matches are mostly kindred crafts ("artisans" and "artists"),
  and they sort after every match as typed. Short words gained little from a
  lower threshold and matched more unrelated names, so they stay at 0.6.
  Descriptions and bios are long enough that trigrams match noise.
- **The town is searchable.** The landing page has always promised "craft,
  name, or town".
- **A sub-domain matches by both its labels**: the official RA 11904 plural
  ("Art Galleries and Studios") and the singular label cards show ("Art
  Gallery or Studio"). A prefix of the singular does not always reach the
  plural — "gallery" is not the start of "galleries". The **domain** matches
  too ("Digital Interactive Media"): it is the eyebrow on every card, so people
  search for it. Domains are nine rows and get no index.
- **Order: nearby-first, then relevance, then newest.** Relevance is two keys:
  rows where every word matched as typed before typo-only matches, then the
  word similarity of the main name. No `ts_rank`: at this size the two keys
  order results the way a person expects, and they cannot float a long bio
  that happens to repeat a word.
- **Query time, not generated columns.** The searchable text spans five tables,
  and a generated column cannot read a joined row. The GIN indexes are
  expression indexes written exactly as the query is. Because a search ORs
  across joined tables, Postgres scans the published rows today; the indexes
  are there for growth.
- **No `unaccent` yet.** It is not immutable, so it cannot sit in an index
  expression without a wrapper. Folding accents belongs with the everyday-word
  aliases (#24), which normalise queries anyway.

Postings, the creative-mode directory, are not searchable yet.
