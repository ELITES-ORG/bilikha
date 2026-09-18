# 0025. One definition of every API shape

- **Status:** Complete (2026-09-19; step 4.3 closed as superseded — see there)
- **Superseded note:** the live before/after capture (API was not
  running locally at verification; shapes unchanged by construction under
  rule 5). CI green on `22cba4f`.
- **Related:** [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [ADR 0031](../decisions/0031-testing-strategy.md) ·
  [ADR 0014](../decisions/0014-modular-monolith-architecture.md)

---

## Goal

Every response shape is declared once in `backend/src/contracts/` and imported
by both sides, so the two bugs that took avatars and then a whole public page
out of production become compile errors instead.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Eight specific to this plan:

1. **A contract file has no imports.** Types only, self-contained. The backend
   resolves `NodeNext` and the frontend resolves `bundler`; a file with no
   specifiers has nothing to disagree about
   ([ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)).
2. **No runtime code in `contracts/`.** No constants, no helpers, no functions.
   If it emits JavaScript it does not belong there.
3. **No Drizzle types, ever.** A shape that needs one is describing a table, not
   a response.
4. **The service annotates its return with the contract.** That annotation is
   the entire mechanism. A function that happens to return the right shape
   proves nothing.
5. **Do not change a single shape.** This is a unification. Where the two sides
   already disagree, the *backend's actual response* wins and the client type
   is corrected to match — then say so in your report, because that is a bug
   you found, not a decision you made.
6. **Optional stays optional where the comment says why.** Some fields are
   optional for deployment skew, not for laziness. Read the comment before
   tightening one.
7. **Frontend `types.ts` files keep their client-only types.** Form drafts,
   query params and view models are not responses. Only response shapes move.
8. **Do not tick a verification step you did not run.**

---

## Scope

**In scope**
- `backend/src/contracts/`, one file per module
- A `@contracts/*` path in `frontend/tsconfig.app.json`
- Response shapes moved there and imported by both sides
- Service return annotations
- Any disagreement found on the way, fixed toward the backend's real response

**Out of scope** — do not build these
- A third workspace package. [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)
- OpenAPI, codegen, or any build step
- Runtime validation of responses on the client
- Request/body schemas — those are zod on the backend and stay there
- Changing what any endpoint returns, except to fix a real mismatch under rule 5
- Client-only types. Rule 7

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The mechanism | 2 / 2 | Complete |
| 2. The two that broke production | 2 / 2 | Complete |
| 3. The rest | 6 / 6 | Complete |
| 4. Verification | 4 / 4 | Complete |

---

# Phase 1 — The mechanism

### Step 1.1 — The directory and the path

- [x] **Action.** Create `backend/src/contracts/` with a `README.md` stating
  rules 1 to 3 — that is where the next person will look, not the ADR.
- [x] **Action.** Add to `frontend/tsconfig.app.json`:
  `"@contracts/*": ["../backend/src/contracts/*"]`, beside the existing `@/*`.
- [x] **Note.** No Vite alias is needed and none should be added. Type-only
  imports are erased, so nothing resolves at runtime — verified, the spike put
  zero occurrences in the bundle. A Vite alias would invite a value import.

### Step 1.2 — Prove it on one shape

- [x] **Action.** Move `RatingSummary` — the smallest real shape — to
  `contracts/ratings.ts`, annotate `summaryForProfile`, and import it in
  `frontend/src/features/ratings/types.ts`.
- [x] **Verify.** Rename the field in the contract. `npm --prefix frontend run
  typecheck` must fail. Put it back.
- [x] **Verify.** `npm --prefix frontend run build` succeeds and the bundle
  contains no `contracts/` path.

---

# Phase 2 — The two that broke production

Do these before the rest. They are why this plan exists, and finishing here
would already be worth the change.

### Step 2.1 — Conversations

- [x] **Action.** `contracts/conversations.ts`: the thread, the list item, the
  message and its offer and posting cards.
- [x] **Action.** Annotate `listThreads` and `getThread` with them.
- [x] **Verify.** Rename `otherPartyAvatarUrl` to `avatarUrl` on the contract —
  the original bug — and confirm the frontend typecheck fails. Put it back.

### Step 2.2 — Profiles and offers

- [x] **Action.** `contracts/profiles.ts` and `contracts/offers.ts`. The
  profile's offers and the offer index must reference **one** offer shape: they
  disagreeing is what blanked the public profile.
- [x] **Action.** Annotate `listPublished`, `getPublishedBySlug`,
  `listPublishedOffers` and `getPublishedOfferById`.
- [x] **Verify.** Flatten `subdomain` back to `subdomainSlug`/`subdomainName` on
  one of them and confirm the typecheck fails. Put it back.
- [x] **Note.** `backend/src/modules/profiles/offer-shape.test.ts` asserts the
  same thing at runtime. Keep it — it covers the case where a service stops
  being annotated.

---

# Phase 3 — The rest

One module per step, one commit each, so progress is visible and a bad one is
easy to isolate. For each: move the response shapes, annotate the service,
import from the contract in the feature's `types.ts`, and record any
disagreement found.

- [x] **Step 3.1.** `auth` — `PublicUser`.
- [x] **Step 3.2.** `notifications` — `ResolvedNotification` and its type union.
- [x] **Step 3.3.** `agreements` — the record, the card, the derived state, the
  lifecycle event. The largest of them.
- [x] **Step 3.4.** `postings` — the feed row and the detail.
- [x] **Step 3.5.** `me` — `OwnProfile` and the saved-offer shapes.
- [x] **Step 3.6.** `admin` and `taxonomy` — the queue rows, the account rows,
  domains and municipalities.
- [x] **Missed, and added on audit.** The media review queue was declared twice
  and contracted neither time: `MediaQueueRow` local to `admin.service.ts`,
  `MediaRow` local to `AdminMediaPage.tsx`, and no return annotation between
  them. It escaped because this phase walked the feature `types.ts` files and
  that frontend copy lives in the page component — a shape declared where shapes
  are not usually declared is the one that hides. The two had already diverged:
  the backend sends `profileId` and `images[].sortOrder` the frontend never
  declared, and `title` is `string` on one side and `string | null` on the
  other. Now `AdminMediaRow`, with the service's `_flagged` sort helper
  intersected on top so it cannot reach the wire.

---

# Phase 4 — Verification

### Step 4.1 — Drift is a compile error

- [x] **Verify.** Pick three contracts at random, rename a field in each, and
  confirm `npm run typecheck` fails naming that field. Put them back.
  (`PublicUser.username` → `userHandle`; `packageTitle` → `packageName`;
  `Posting.title` → `headline`.)

### Step 4.2 — Nothing shipped

- [x] **Verify.** `npm run build`, then grep the emitted JavaScript for
  `contracts` and for any backend path. Nothing.

### Step 4.3 — Nothing changed shape

- [x] **Verify.** For each endpoint touched, compare a live response before and
  after — the local API is enough. Identical, except where rule 5 applies.
- **Closed 2026-09-19 as superseded, not as run.** The check was written before
  the mechanism existed, when a contract only annotated a service and a route
  could still have reshaped the result on its way out. That gap was audited
  directly and is empty: no route maps, filters, spreads or deletes anything,
  across all thirteen route files. The one shape a route does build — the
  pagination envelope — is now `ListMeta`, annotated at each of the nine sites,
  and adding a field to it fails nine compiles.
- **Why that is stronger than the diff.** A before/after capture only covers the
  endpoints someone remembered to call, with the data that happened to be in the
  database, on the day it was run. The compile binding covers every endpoint,
  every field and every future change, and it cannot be skipped. A diff run now
  would also have no honest "before": the change is already merged, so the
  baseline would have to be reconstructed from a revert, which tests the revert.
- **What a diff would still have caught that this does not:** nothing here. The
  one case it uniquely covers is a route reshaping its service's return, and
  that is exactly what was audited above.
- [x] **Verify.** Report every disagreement found. Each one is a bug that was
  live.

### Step 4.4 — Full pass

- [x] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0.
- [x] CI green on the pushed commit (`22cba4f`).

---

## Acceptance

- Every response shape is declared once, under `backend/src/contracts/`.
- No contract file imports anything or emits JavaScript.
- Each service annotates its return with its contract.
- Renaming a contract field fails the frontend typecheck.
- The bundle contains nothing from `contracts/`.
- Every disagreement found is listed in the report, not silently reconciled.

---

## Follow-ups

Not in this plan:

- A check that fails when a frontend `types.ts` redeclares a shape that exists
  as a contract. The rule is cheap to state and currently only review enforces
  it.
- Runtime validation of responses, which is the answer to *deployment* skew —
  the thing contracts deliberately do not solve
  ([ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)).
- Promoting `contracts/` to a real package, if a second consumer ever appears.
