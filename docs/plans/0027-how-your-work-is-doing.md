# 0027. How your work is doing

- **Status:** Partial
- **Owner:** implementing agent
- **Related:** [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md) ·
  [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) ·
  [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [ADR 0031](../decisions/0031-testing-strategy.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)

## Goal

A creative opens `/account`, reads one sentence telling them the most useful
thing they could do next, and taps through to a page that shows how their work
is doing — derived entirely from rows that already exist.

At today's volumes almost every creative has zero offers, zero agreements and
zero ratings. That is the design target, not an edge case
([ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md)).

## Scope

**In scope**
- `GET /me/work` returning a derived summary of the signed-in creative's work.
- A pure `nextAction(summary)` function, and a page at `/account/work`.
- A `HubRow` on the account hub whose summary is that next action.

**Out of scope**
- **Profile view tracking.** Nothing records a view today and ADR 0039
  deliberately does not add it. Do not add an impressions figure, not even at
  zero — a column that can never be non-zero is worse than its absence.
- Charts. There is nothing with enough points to plot.
- Anything for clients. This is a creative-only surface.
- Changing what any existing endpoint returns.

## Prerequisites

- Local stack up, and a creative account with *some* activity plus one with
  none. Both were confirmed in this state on 2026-09-22:

| Account | Profile | Offers | Inquiries | Agreements | Use |
|---|---|---|---|---|---|
| `nc0850896` | published | 0 | 0 | 0 | the zero case — the one to design against |
| `cre0299739` | published | 1 | 1 | 2 | the populated case |
| `adm0403418` | **none** | — | — | — | must get a 404 and no hub row |

  Password `verify-pass-2026` for all three. Local only.
- Read [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md),
  particularly why the zero case is the default layout.

## Rules for whoever executes this

1. **Derive everything.** No counter column, no aggregate table, no cached
   total. [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) settled
   this for agreement totals and the reasoning carries: a stored number that can
   disagree with its rows is worse than computing it. Reuse
   `summaryForProfile` for ratings rather than writing a second average.
2. **The zero case is the design, not the fallback.** Build and look at the
   empty version first. If it reads as a list of failures, the copy is wrong.
3. **Never show a bare zero where a sentence would help.** "No offers yet —
   clients cannot hire what they cannot see priced" instead of "Offers: 0".
4. **No impressions, views or reach.** Rule out by ADR 0039. A zero that can
   never move is a promise the product does not keep.
5. **`nextAction` is pure and tested.** It takes the summary and returns the
   action. No React, no fetching — the same shape as `admin-sections.ts`, which
   is how the marking logic got tested without a browser.
6. **Creative-only**, behind the same `profileSlug` guard every other
   creative-only surface uses.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. What the rows already say | 3 / 3 | Done |
| 2. The next action | 2 / 2 | Done |
| 3. The surface | 3 / 3 | Done |
| 4. Verification | 3 / 4 | Partial — local gates green; CI pending push |

---

# Phase 1 — What the rows already say

### Step 1.1 — The contract

- [x] **Action.** Add `backend/src/contracts/work.ts` with the summary shape.
  Types only, and it may type-import a sibling contract
  ([ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)):

```ts
export interface WorkSummary {
  profile: { slug: string; status: ProfileStatus; editedSinceReviewAt: string | null };
  offers: { total: number; savedByOthers: number };
  inquiries: { total: number; awaitingYourReply: number };
  agreements: {
    total: number;
    awaitingClientAcceptance: number;
    inProgress: number;
    awaitingClientConfirmation: number;
    completed: number;
    cancelled: number;
  };
  /** Centavos, summed from line items. Never a float, never pesos. */
  money: { agreedCentavos: number; completedCentavos: number };
  ratings: RatingSummary;
}
```

- [x] **Why these and not others.** Each one is either something the creative can
  act on, or evidence that the acting worked. `savedByOthers` is the only signal
  of interest that exists without view tracking.

### Step 1.2 — The service

- [x] **Action.** `backend/src/modules/me/work.service.ts` exporting
  `workSummary(userId): Promise<WorkSummary>`, annotated with the contract.
- [x] **Action.** Derive every field. **Reuse, do not reimplement** — these are
  already exported from `agreements.service.ts` and a second copy would be a
  second answer:

| Need | Use | Not |
|---|---|---|
| The lifecycle state of an agreement | `deriveState(...)` | Reading `agreements.status` and calling it the state |
| The value of an agreement | `totalOf(lineItems)` | A fresh `sum()` over line items |
| Rating average and count | `summaryForProfile(slug)` | A second `avg(stars)` |
| Pesos on screen | `formatPesos(centavos)` from `@/lib/money` | Any new formatter |

- [x] **Action.** `savedByOthers` joins `saved_offers` to `offers` on
  `offer_id`, then to the profile. It is the only interest signal that exists
  without view tracking, so it is worth getting right.
- [x] **Action.** Integer centavos throughout. Never a float, never pesos in the
  service.
- [x] **Verify.** For a creative with no activity, every number is 0 and
  `ratings.average` is null — not 0, which would read as a one-star average.

### Step 1.3 — The route

- [x] **Action.** `GET /me/work` behind `requireAuth`, 404 for an account with no
  creative profile. Not 403 — the existence of a creative surface is not
  something a client needs confirmed.
- [x] **Test.** Against the real database with factories: a creative with
  nothing, a creative with activity, and a client account getting a 404.
  Authorization and visibility first, per
  [ADR 0031](../decisions/0031-testing-strategy.md).

---

# Phase 2 — The next action

### Step 2.1 — The rule

- [x] **Action.** `frontend/src/features/work/next-action.ts` exporting a pure
  `nextAction(summary): { headline: string; body: string; to?: string }`, in
  this priority order:

| When | Next action |
|---|---|
| Profile is `pending_review` | Waiting on review — nothing to do, say so plainly |
| Profile is `suspended` | Read why, and what to change |
| Profile edited since review | The edit is queued; the live version is still up |
| Published, no offers | Add an offer |
| An inquiry is awaiting your reply | Reply to it |
| An agreement is in progress and delivery is not marked | Mark it delivered when it is done |
| An agreement is awaiting the client's confirmation | Waiting on them — no action |
| Everything is current | Say that, and do not invent a task |

- [x] **Why a table.** This is a state machine and it is the whole product logic
  of the page. Getting the order wrong tells a creative to add an offer while an
  unanswered client sits in their inbox.

### Step 2.2 — Tested without a browser

- [x] **Test.** `next-action.test.ts`: one case per row above, plus the
  precedence pairs that matter — an unanswered inquiry outranks "add an offer",
  and a suspended profile outranks everything.
- [x] **Verify.** Break one precedence rule deliberately and watch a test fail.
  A table-driven test that passes in any order is testing nothing.

---

# Phase 3 — The surface

### Step 3.1 — The page

- [x] **Action.** `/account/work`, titled *How your work is doing*, behind
  `RequireAuth` and returning the not-found page for an account with no creative
  profile.
- [x] **Action.** Next action first, then the numbers grouped: your offers, your
  inquiries, your agreements, the value agreed, your rating.
- [x] **Never say paid, earned or income.** Bilikha does not handle payment and
  the agreement record says so on its face. The figure is what was *agreed* and
  what was agreed on work since *completed* — whether money changed hands is
  between the two people, and claiming otherwise would be the platform asserting
  something it cannot know.
- [x] **Action.** Each group has a zero sentence. Rule 3.

### Step 3.2 — The hub row

- [x] **Action.** On `/account`, a `HubRow` to `/account/work` labelled
  *How your work is doing*, whose `summary` is the next action's headline —
  so the most useful sentence is visible without opening anything.
- [x] **Action.** Render the row only for an account with a creative profile.

### Step 3.3 — Money reads correctly

- [x] **Action.** Use the existing money formatter. Centavos in, pesos out,
  never a float.
- [x] **Verify.** An agreement of 2,150,000 centavos reads ₱21,500.

---

# Phase 4 — Verification

### Step 4.1 — The zero case is the one to look at

- [x] **Verify.** As `nc0850896` — published profile, nothing else — open
  `/account/work`. Every group shows its sentence, the next action is *add an
  offer*, and nothing on the page reads as a failure. Screenshot it; this is the
  page most creatives will see.

### Step 4.2 — The populated case

- [x] **Verify.** As `cre0299739`, the counts match the database. Check the
  agreement states against `select status from agreements`, and the money
  against the line items, rather than against what the page says.

### Step 4.3 — Not for clients

- [x] **Verify.** As `adm0403418` (no creative profile): no hub row, and
  `/account/work` does not render the page. `GET /me/work` returns 404.

### Step 4.4 — Full pass

- [ ] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, and CI green. Grep the diff for any counter column, any cached total,
  and for the words `impression`, `views` or `reach`. Local gates and grep done
  2026-09-22; CI pending push.

---

## Acceptance

- A creative sees the single most useful next thing on `/account` without
  opening anything.
- `/account/work` reports offers, inquiries, agreements by state, money agreed
  and completed, saved-by-others and rating — all derived.
- A creative with no activity gets sentences, not a column of zeros.
- A client sees none of it, and the endpoint 404s for them.
- No new table, no counter column, no view tracking.

## Follow-ups

| Item | Why deferred |
|---|---|
| Profile view tracking | The number creatives actually ask for. Needs its own ADR: a write on every public profile read, a table that outgrows the rest, and under constraints 6 and 7 a real question about showing *who* looked. ADR 0039 explains the deferral |
| A metrics grid | What was originally asked for. Right build once a typical creative has non-zero rows — worth re-checking against the database rather than assuming |
| Charts over time | Nothing has enough points yet. Revisit with views, or with a year of agreements |
| The same surface for clients | Clients have postings, inquiries sent and agreements received. Mirrored, and not yet asked for |
