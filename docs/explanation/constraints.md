# Operating constraints

Bilikha serves a province of roughly 180,000 people across eight municipalities.
Several decisions in this codebase look wrong by general web-development
instinct and are correct here. This page explains why, so they do not get
"fixed".

Read this before making a structural change.

---

## 1. The market is thin, and that is permanent

Some sub-domains will have zero registrants for a long time — Archeologists,
Circus Performers, Virtual Reality Creators, Digital Streaming Platforms.

**Consequences:**

- **Empty results are a normal state, not an error.** Use `EmptyState` with a
  way forward — browse the parent domain, invite someone. Never a bare "no
  results found".
- **Do not hard-gate navigation on sub-domain.** Default browsing to the domain
  level and surface adjacent sub-domains, or the directory will look emptier
  than it is.
- **Profiles span sub-domains.** A Biliran videographer is realistically also
  the photographer, the editor, and the drone operator. Single-category profiles
  would make the registry look thinner still. Hence many-to-many with a primary
  flag, capped at five.
- **Liquidity is the product risk, not features.** A transactional marketplace
  needs volume this province cannot supply on day one. The registry and
  discovery layer is the durable value; transactions can come later.

## 2. Demand is institutional, not consumer

The repeat buyers are LGUs, government programmes, schools, festival
committees, and resorts — not individuals hiring a logo designer.

**Consequences:**

- Those users procure from an **office desktop**. A mobile-only product excludes
  the highest-value audience.
- Organisations need real accounts with multiple staff — a PIO team, not one
  person's Gmail. Hence `organizations` and `organization_members`.
- Roughly a fifth of the sub-domains are themselves organisations (production
  companies, cooperatives, broadcasting stations, theatre companies). The
  registration flow must branch early on individual vs organisation.

## 3. Supply-side users are on budget Android over metered data

**Consequences:**

- **Images are the dominant performance risk**, not JavaScript. A portfolio of
  unresized 4MB phone photos makes the directory unusable regardless of backend
  quality. Compress client-side before upload; serve AVIF/WebP at multiple
  widths from a CDN; never store originals on the app server.
- **Long cache and stale times.** Reference data is `staleTime: Infinity`.
  Refetching a static taxonomy on a metered connection is pure waste.
- **Motion is transform and opacity only.** Animating layout properties stutters
  visibly on low-end hardware.
- **Fonts are self-hosted and subset.** ~102KB for both families, Latin only,
  with `font-display: swap`.
- **Forms must survive dropped connections.** Autosave each step; never require
  that the previous request succeeded server-side before the user can continue.

## 4. Facebook is the distribution channel

Most traffic will arrive from a shared post or a Messenger link, often
inside Facebook's in-app browser.

**Consequences:**

- **Every profile must be a shareable URL with a working preview card.**
  Facebook's scraper does not run JavaScript — the unresolved SSR problem in
  [architecture](./architecture.md) is a distribution problem, not a nicety.
- **Test in Facebook's in-app webview.** It breaks things desktop Chrome never
  reveals.
- Many creatives' actual portfolio *is* their Facebook page. Accepting a link is
  a legitimate portfolio option, not a fallback. Store the link; do not scrape.

## 5. Language is not only English

Biliran is Waray-speaking; Cebuano and Tagalog are both in use.

**Consequences:**

- **Taxonomy labels are bureaucratic and unsearchable.** Nobody self-describes
  as "Artisans of Indigenous Crafts". The alias table mapping everyday terms
  across four languages is load-bearing, not a nice-to-have.
- **Log every unmatched search.** It is the only honest evidence of where the
  taxonomy and aliases fall short.
- User-facing copy — privacy notice, registration help — needs Filipino, ideally
  Waray. English-only excludes exactly the registrants hardest to reach.

## 6. Everyone knows everyone

In a province of this size, social distance is short.

**Consequences:**

- **Public negative reviews are socially unusable.** People will not leave honest
  criticism of a neighbour, so a symmetric five-star system degrades to all-fives
  and carries no signal. Creative reviews are restrained; client reliability
  stays private to the creatives who received their inquiry.
- **Individuals get no public profile page.** Organisations do. A public page
  for a private individual who hired a photographer once is a privacy liability
  with no upside.
- **Contact details are private by default.** Inquiries proxy rather than
  exposing a mobile number.

## 7. It is a public registry of named individuals

Bilikha is a standalone product. There is no partner organisation and no
official mandate. What it does have is a fixed taxonomy taken from legislation,
and a database full of real people's personal data.

**Consequences:**

- **The nine domains are not ours to change.** They are the RA 11904 domain set.
  Adding a tenth makes the data incompatible with every other registry using
  that taxonomy and breaks any future statutory reporting.
- **RA 10173 (Data Privacy Act) applies squarely** — explicit consent separate
  from terms, a plain-language privacy notice, per-field visibility, export and
  deletion rights, an age gate, and likely NPC registration as a personal
  information controller. This is law, and it does not depend on having a
  government partner.
- **Moderation risk is entirely ours.** Every profile published sits under this
  product's name. There is no institution absorbing that risk, which is the
  reason sprint 1 reviews before publishing rather than after.
- **There is no external source of registrants.** An earlier version of this
  plan assumed an existing list could be imported to launch non-empty. There is
  none. Cold start has to be solved by direct recruitment, which makes
  constraint 1 harder than it first appears.

## If you are about to

| …do this | …read this first |
|---|---|
| Add an external search service | Constraint 1 — Postgres covers this scale |
| Add PostGIS or coordinate search | Constraint 1 — eight municipalities |
| Build mobile-only | Constraint 2 — institutional buyers are on desktop |
| Store uploads on the app server | Constraint 3 |
| Animate width, height, or position | Constraint 3 |
| Ship public profiles without SSR | Constraint 4 — this is the launch blocker |
| Add a sub-domain | Constraint 5 — it is probably an alias, and constraint 7 |
| Add public star ratings both ways | Constraint 6 |
| Collect a new personal field | Constraint 7 — consent and visibility |
