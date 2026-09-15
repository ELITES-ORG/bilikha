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
