# 0028. The money, in full

- **Status:** Complete
- **Owner:** implementing agent
- **Related:** [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md) ·
  [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) ·
  [plan 0027](./0027-how-your-work-is-doing.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)

## Goal

`/account/work` reports the money on a creative's agreements in full: what is on
the table, what a client has committed to, what is running, what is finished,
and what fell through — plus what a typical agreement of theirs is worth.

Today it reports two numbers, `agreed` and `completed`, and a creative cannot
tell from them what is still only proposed, what is live, or what was lost to a
cancellation.

## The honest limit, and it is not negotiable

**Bilikha does not handle payment and cannot know whether anyone was paid.**
Every figure here describes what two people *put in writing*, at a point in its
lifecycle. "Everything about the money" means every state of the agreed value —
it does not and cannot mean income, revenue, earnings or receipts.

A creative who reads "₱21,500 completed" has completed work worth that on paper.
Whether the client paid is between them, and the platform saying otherwise would
be a lie the first time someone did not.

## Scope

**In scope**
- Centavos per lifecycle state, mirroring `agreements` and partitioning the same
  way.
- The typical value of this creative's agreements.
- A money section on `/account/work` that reads as a pipeline, not a ledger.

**Out of scope**
- **Anything implying payment.** No earned, paid, income, revenue, receipts,
  outstanding or owed.
- **Time series, month-over-month, projections.** Three agreements exist on the
  whole platform. A trend line over that is noise dressed as insight, and
  [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md)
  already rejected charts on the same ground.
- Comparing listed offer prices against agreed values — genuinely interesting,
  and deferred to Follow-ups so this stays one idea.
- Anything for clients.

## Prerequisites

- Local stack up. `cli0299739` has one completed agreement worth 900,000
  centavos; `cre0299739` has one cancelled and one superseded; `nc0850896` has
  nothing. Password `verify-pass-2026`, all local.
- Read plan 0027's audit section first — the agreement states were made to
  partition `total` exactly, and the money must partition the same way for the
  same reason.

## Rules for whoever executes this

1. **`agreedCentavos` changes meaning. This is the trap in this plan.** Today it
   means *accepted and beyond* — agreed plus in-progress plus awaiting
   confirmation plus completed. In the new shape it means only the **Agreed**
   state. Anything reading the old field must be found and updated, or the page
   will keep rendering a number whose meaning silently changed. Grep for it
   before you start and after you finish.
2. **The money partitions like the counts do.** Each state's centavos is
   accumulated in the same `switch` that counts it, so the two can never drift.
   A test asserts the per-state figures sum to the committed total.
3. **Superseded and withdrawn contribute nothing**, exactly as they count for
   nothing. A revised agreement's earlier version is not money.
4. **Median, not mean.** One ₱50,000 job among four ₱2,000 ones makes a mean
   that describes none of them. At these volumes the middle value is the honest
   summary.
5. **Never paid, earned, income, revenue or outstanding.** Rule from ADR 0039,
   repeated because this plan is entirely about money and the words are near to
   hand.
6. **The zero case is still the design.** Most creatives have nothing agreed.
   Every figure has a sentence for when it is zero, and the section must not
   render six ₱0 rows.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Money per state | 3 / 3 | Done |
| 2. What a typical agreement is worth | 2 / 2 | Done |
| 3. The section | 2 / 2 | Done |
| 4. Verification | 4 / 4 | Done |

---

# Phase 1 — Money per state

### Step 1.1 — The contract

- [x] **Action.** Replace `money` in `backend/src/contracts/work.ts`:

```ts
  /**
   * Centavos per lifecycle state, mirroring `agreements` and partitioning the
   * same way: the six below sum to `committedCentavos` plus `proposedCentavos`
   * plus `cancelledCentavos`. Superseded and withdrawn contribute nothing.
   *
   * Every figure is what was put in writing. Bilikha does not handle payment
   * and none of this is income (ADR 0039).
   */
  money: {
    /** Issued, not yet accepted — on the table, not promised. */
    proposedCentavos: number;
    /** Accepted, not yet started. */
    agreedCentavos: number;
    inProgressCentavos: number;
    awaitingConfirmationCentavos: number;
    completedCentavos: number;
    /** Accepted and then cancelled. Work that will not happen. */
    cancelledCentavos: number;
    /** Everything a client has accepted and not cancelled. */
    committedCentavos: number;
    /** The middle agreement by value. Null when there are none. */
    typicalCentavos: number | null;
  };
```

- [x] **Verify.** Every reader is reviewed against rule 1. They were enumerated
  on 2026-09-22, so this is a checklist rather than a hunt:

| File | What it does |
|---|---|
| `backend/src/contracts/work.ts` | the definition |
| `backend/src/modules/me/work.service.ts` | accumulates both figures |
| `backend/src/modules/me/work.test.ts` | five assertions — see below |
| `frontend/src/features/work/next-action.test.ts` | the summary factory's defaults |
| `frontend/src/pages/account/WorkPage.tsx` | `moneyCopy`, three references |

- [x] **The assertion that encodes the old meaning.** `work.test.ts` asserts
  `agreedCentavos: 2_150_000 + 50_000`. That sum *is* the old definition —
  a completed agreement plus an accepted one. Under the new shape it is
  `committedCentavos`, and `agreedCentavos` is `50_000` alone. Re-read it, do
  not mechanically retype it: if that expectation is updated by following the
  compiler, the meaning change has been papered over rather than made.

### Step 1.2 — Accumulate where you count

- [x] **Action.** In `loadAgreements`, add the centavos to each state's total in
  the same `case` that increments its count. Do not compute money in a second
  pass; that is how two numbers that must agree stop agreeing.
- [x] **Action.** `committedCentavos` is agreed + inProgress + awaitingConfirmation
  + completed. Not proposed (nobody has accepted it) and not cancelled (it will
  not happen).

### Step 1.3 — The invariant

- [x] **Test.** The per-state figures sum to `committed + proposed + cancelled`,
  on a creative holding one agreement in each state.
- [x] **Test.** A superseded agreement contributes nothing to any figure.
- [x] **Verify.** Break the sum deliberately — add a state's centavos twice —
  and watch the test fail.

---

# Phase 2 — What a typical agreement is worth

### Step 2.1 — The median

- [x] **Action.** `typicalCentavos` is the median value of this creative's
  agreements that a client accepted — agreed, in progress, awaiting
  confirmation, completed. Not proposed and not cancelled: neither is a price
  anyone agreed to.
- [x] **Action.** Even counts take the lower of the two middle values. Say which
  in a comment; a reader should not have to guess. There is no median helper in
  the repo — checked — so this is yours to write and to test.
- [x] **Action.** Null when there are none. Not zero — zero is a price.

### Step 2.2 — Tested at the edges

- [x] **Test.** One agreement, two, three, and none. The two-agreement case is
  the one that catches an off-by-one in the middle index.

---

# Phase 3 — The section

### Step 3.1 — It reads as a pipeline

- [x] **Action.** Rewrite `moneyCopy` in `WorkPage.tsx` to render only the
  states that are non-zero, in lifecycle order: proposed → agreed → in progress
  → awaiting confirmation → completed, with cancelled last and only when it
  happened.
- [x] **Action.** Keep the sentence that says the platform does not handle
  payment. It is the one line that stops every figure above it being misread.
- [x] **Action.** Nothing agreed → the existing single sentence. Rule 6: do not
  render six zero rows.

### Step 3.2 — The typical value

- [x] **Action.** Show it only when there are at least two accepted agreements.
  A "typical" drawn from one is that one, and saying otherwise is dressing a
  single number as a pattern.

---

# Phase 4 — Verification

### Step 4.1 — Against the database

- [x] **Verify.** As `cli0299739`, every figure matches
  `select sum(price_centavos) ... group by` run against the line items. Check
  the numbers against SQL, not against the page.

### Step 4.2 — The states still add up

- [x] **Verify.** The money partition and the count partition agree: a state
  with agreements has centavos, a state with none has zero.

### Step 4.3 — Zero, and one

- [x] **Verify.** `nc0850896` sees one sentence, not a table of ₱0. A creative
  with exactly one accepted agreement sees no "typical" figure.

### Step 4.4 — Full pass

- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green. Grep the diff for `paid`, `earned`, `income`, `revenue`,
  `outstanding`, `owed`, and for any second sum over line items. CI green on
  `35641904821` (2026-09-22).

---

## Acceptance

- Every lifecycle state's money is reported, and they add up.
- A creative can tell proposed from committed from completed from cancelled.
- A typical agreement value appears once there are at least two to draw from.
- Nothing on the page implies anyone was paid.
- A creative with nothing sees a sentence.

## Follow-ups

| Item | Why deferred |
|---|---|
| Listed offer prices against agreed values | *"You list ₱1,000–10,000; your agreements typically settle at ₱15,250"* is the most actionable money insight available, and it is a second idea. Worth its own plan once this one is in |
| Money over time | Three agreements exist platform-wide. Revisit when a single creative has enough for a month to mean something |
| Anything about payment | Would need the platform to handle or record payment, which is a product decision far larger than a dashboard |
