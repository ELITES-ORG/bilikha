# 0038. The offer card shows a rating once there is one

- **Status:** Complete
- **Owner:** done 2026-09-23
- **Related:** [plan 0037](./0037-offer-detail-puts-proof-and-action-first.md)
  (which deferred this) · [ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [constraint 1](../explanation/constraints.md) (the thin market is permanent)

## Why, and why it renders nothing today

The registrant asked for a star rating under the municipality on the offer
page's creator card. It is the right place: that card exists to answer "who is
this person", and a score is the strongest answer available.

**Every creative on the platform has no ratings.** Checked against production
rather than fixtures:

```
Balo         {"average":null,"count":0}
hellmerry    {"average":null,"count":0}
nenengB-adm  {"average":null,"count":0}
```

So the feature is built to be **invisible until it is true**. A star row that
says *No ratings yet* on every offer does not build trust — it makes "unrated"
the most prominent fact about a creative at the moment somebody is deciding
whether to inquire, and the creative cannot fix it, because a rating requires
having been hired first. That is [constraint 1](../explanation/constraints.md)
and it is why this renders nothing at zero rather than rendering an absence.

**Why build it now if it shows nothing.** The work is the same size whenever it
is done, so there is no effort saved by waiting. What is lost by waiting is
verification: right now ratings can be seeded locally and the stars actually
looked at. Whoever picks this up after the first real rating arrives will be
busy, will not easily construct a rated agreement, and will ship it unseen.

## Scope

**In scope**

- `RatingSummary` on the offer **detail** creative, so no second round trip
- The creator card rendering the score only when `count > 0`
- A service test proving the detail carries a real average

**Out of scope**

- The offer **card** in the directory. One summary per card is a query per row,
  and the directory is the hot path. Detail only.
- Any empty, "New", or zero state. The absence of a score is not a message.
- Response time, completed-project counts, or any other trust signal that has
  no data behind it.

## Rules

1. **Never a score without its count.** `RatingScore` is the only component that
   prints an average and already enforces this ([ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md)).
   Reuse it; do not format an average anywhere else.
2. **Nothing at zero.** Not `No ratings yet`, not an empty star outline, not a
   badge. `RatingScore`'s `emptyText` is deliberately not used here.
3. **Derived on read.** No stored average, no counter column.
4. **Verify with seeded ratings.** A test that only ever sees `count: 0` proves
   the feature is absent, not that it works.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The detail carries the summary | 2 / 2 | Done |
| 2. The card shows it | 2 / 2 | Done |
| 3. Verification | 2 / 2 | Done |

---

# Phase 1 — The detail carries the summary

### Step 1.1 — Contract

- [x] **Action.** A detail-specific creative type carrying
  `rating: RatingSummary`, type-imported from the sibling ratings contract,
  which [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)
  permits. `PublishedOfferCreative` — the directory card's — stays unchanged.

### Step 1.2 — Service

- [x] **Action.** `getPublishedOfferById` resolves the summary alongside the
  row. One offer means one creative means one aggregate; there is no N+1 here,
  which is exactly why the directory card is out of scope.

---

# Phase 2 — The card shows it

### Step 2.1 — Under the municipality, when there is one

- [x] **Action.** `RatingScore` at `sm`, below the municipality line, rendered
  only when `count > 0` (rule 2).

### Step 2.2 — The card stays one link

- [x] **Verify.** Plan 0037 made the whole creator row a single link to the
  profile. Adding content inside it must not introduce a nested interactive
  element or change the link's target.

---

# Phase 3 — Verification

### Step 3.1 — Seen with a real rating

- [x] **Verify.** Seed a completed agreement and a rating, then look at the
  offer page: stars and the count render under the municipality, at both widths
  and in both themes.
- [x] **Verify.** With the rating removed, the card is byte-for-byte what it is
  today — no empty row, no reserved space.

### Step 3.2 — Full pass

- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check`
  all exit 0.

---

## What was seen

Ratings were seeded locally — two raters, 5 and 4 stars — so the feature could
be looked at rather than reasoned about. That was the whole argument for doing
this now, and it produced the one thing a later attempt would have skipped.

**With a rating.** The API returned `{"average":4.5,"count":2}` and the card
read:

```
TS  OFFERED BY  Test Creative Studio
    Almeria
    ★★★★★  4.5 from 2 reviews
```

Five star glyphs plus the location pin and chevron, `nested a/button: 0`, href
still `/creatives/cre0299739`, no horizontal overflow at 387px. The row remains
a single link, which was step 2.2.

**Without one.** The same card, ratings removed:

```
TS  OFFERED BY  Test Creative Studio
    Almeria
```

Two icons instead of seven, and no reserved space — the card is what it was
before this plan, which is the promise in rule 2.

**The average is computed, not copied.** The service test asserts 3.5 from
ratings of 5 and 2. A stored or last-write-wins value would pass a single-rating
test and fail that one.

## Acceptance

- An offer by a rated creative shows the score and its count under the
  municipality.
- An offer by an unrated creative looks exactly as it does now.
- The directory is unchanged and issues no extra query per card.
- No average is stored anywhere.
