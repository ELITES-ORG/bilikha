# 0035. The layout pass left nine things open

- **Status:** Complete
- **Owner:** implementing agent
- **Related:** [plan 0033](./0033-layout-and-grouping-review.md) (the pass this
  audits) · [ADR 0031](../decisions/0031-testing-strategy.md) (why none of
  this is caught by a test) · [constraint 3](../explanation/constraints.md)
  (budget Android, metered data)

## What this is

Plan 0033 shipped in seven commits (`a73455c`..`5875dee`) and its gates are
green: `typecheck`, `lint`, `build` and `docs:check` exit 0, and the 134 backend
and 54 frontend tests pass with counts unchanged.

The screens were then driven signed in as the verification account — four
offers, three postings — rather than read. Nine things came back. Three of them
are defects introduced by the pass, three are claims the verification data could
not have supported, and the rest are smaller.

Phases 2 and 6 of plan 0033 came back clean and nothing here touches them.

## The two patterns worth naming

**A fix that moves a problem is not a fix.** Offers moved Delete behind an
overflow menu so it could not be hit by accident, and the menu it moved into
cannot be dismissed — so the destructive action now sits over the page until
something else closes it. It is more reachable by accident than the button it
replaced, and it announces `role="menu"` without any of the keyboard behaviour
that role promises. That is [plan 0033](./0033-layout-and-grouping-review.md)'s
own fault 2 committed inside the fix for its fault 3.

**Verification data has to exercise branches, not just exist.** Plan 0033 step
7.3 said an empty state proves nothing about a list. It was satisfied with three
postings that are all `open`, all more than a day from expiry, and all with zero
replies — one branch of four. The `danger` tone, `formatPostingStatus`, and the
`(row.replyCount ?? 0) === 0` gate that the whole of Phase 1.3 generalises from
were never once rendered. Offers is worse: all four have no image, so every
thumbnail added in Phase 4 was a grey placeholder, and uploads cannot work
locally at all — the API logs `SUPABASE_SERVICE_ROLE_KEY was issued for a
different Supabase project than SUPABASE_URL points at`.

So Phase 1 below is fixtures. Nothing after it can be trusted until it lands.

## Where these live

| Thing | File |
|---|---|
| Overflow menu, offer rows | `frontend/src/features/offers/OfferEditor.tsx` |
| Expiry tone, status badge | `frontend/src/lib/posting-time.ts`, `frontend/src/pages/MyPostingsPage.tsx` |
| Badge and its icon contract | `frontend/src/components/ui/Badge.tsx` |
| Profile headings | `frontend/src/features/me/ProfileCraftFields.tsx`, `ProfileEditor.tsx` |
| Driving the app | `scripts/screenshot.mjs` |

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Fixtures that exercise the branches | 2 / 2 | Done |
| 2. The menu that will not close | 2 / 2 | Done |
| 3. Badges that mean what they look like | 3 / 3 | Done |
| 4. The smaller corrections | 4 / 4 | Done |
| 5. Verification | 3 / 3 | Done |

---

# Phase 1 — Fixtures that exercise the branches

Do this first and do not skip to Phase 3. Every finding in Phase 3 is invisible
against the current data, which is how they survived a pass that claimed to have
checked them.

### Step 1.1 — Postings that hit every branch

- [x] **Action.** The verification account needs, at minimum: a posting expiring
  in under a day (renders `danger`), one already past `expiresAt` but still
  `open`, one with `status = 'closed'`, one with `status = 'expired'`, and one
  with at least one reply.
- [x] **Verify.** Load `/postings/mine` and confirm you have seen, with your own
  eyes, all three expiry tones, a sentence-cased status badge, and one row where
  `Delete` is absent because something replied.
  (`cre0299739`: 11h danger, 2d warning, 29d/44d neutral; Closed + Expired
  status badges; fiesta row has 1 reply and no Delete. Shot
  `tmp/shots-0035/01-postings-mine.png`.)

### Step 1.2 — At least one offer with an image

- [x] **Action.** One of the four offers needs a real thumbnail. If Supabase
  uploads cannot be made to work locally, seed an `offer_images` row against a
  reachable URL — the point is to see the row as a client sees it, not to
  exercise the upload path.
  (Seeded `offer_images` on Ownership fixture offer against
  `http://localhost:5173/fixtures/offer-thumb.png`; `publicUrl` passes absolute
  http(s) URLs through so the mismatched service-role key does not block this.)
- [x] **Verify.** `/account/offers` shows at least one row that is not a grey
  square, and the placeholder and the image agree on size and alignment.
  (Image loads 112×112; grey `size-14` placeholders on the other three rows.
  Shot `tmp/shots-0035/02-offers.png`.)

---

# Phase 2 — The menu that will not close

### Step 2.1 — Dismissal

- [x] **Action.** The offer row overflow closes on outside click and on Escape.
  Reproduced before this plan: open ⋮ on the first row, click the page heading,
  and the menu is still open — `Delete` parked over the row below, covering the
  first offer's price, in both themes.
- [x] **Verify.** Drive it. Open the menu, click elsewhere, assert
  `document.querySelectorAll('[role=menu]').length === 0`. Repeat for Escape.
  (Against Ownership fixture offer: open → menus 1; click `h1` → 0; reopen →
  Escape → 0 with focus back on the trigger.)

### Step 2.2 — Behave like the role it claims

- [x] **Action.** Either give `role="menu"` its keyboard behaviour — focus moves
  into the menu on open, arrow keys move between items, Escape returns focus to
  the trigger — or drop the menu roles and ship it as a disclosure with a plain
  button inside. Both are fine. Announcing a menu that does not behave like one
  is not.
  (Kept `role="menu"`; focus moves to Delete on open; Escape returns focus to
  the ⋮ trigger; arrow keys keep focus on the single item.)
- [x] **Verify.** Reach `Delete` and leave again using only the keyboard.
  (`reachedDelete: true`, `leftToTrigger: true`, `menusFinal: 0`.)

---

# Phase 3 — Badges that mean what they look like

### Step 3.1 — Expired is not a calm state

- [x] **Action.** `const open = row.status === 'open'` sends both `expired` and
  `closed` to `tone="neutral"`. A lapsed posting that wants reposting looks
  exactly like one the registrant deliberately closed. Give `expired` a tone that
  says something is over and was not chosen.
  (`expired` → `warning` + icon; `closed` stays `neutral`.)
- [x] **Verify.** Against the Phase 1 fixtures, `closed` and `expired` are
  distinguishable without reading the word.
  (Looked at Status-expired posting: warning amber + alert icon. Looked at
  Deliberately closed posting: calm clay neutral, no icon. They no longer match.)

### Step 3.2 — Status tones carry an icon

- [x] **Action.** [`Badge`](../../frontend/src/components/ui/Badge.tsx) states in
  its own docstring that status badges must carry an icon as well as a colour,
  for the ~5% of male users with a colour vision deficiency. The new
  `warning`/`danger` expiry badges pass neither. Give them one.
  (`Clock` on warning/danger time-left; `CircleAlert` on status `expired`.)
- [x] **Note.** The text differs between `2d left` and `44d left`, so no
  information is colour-only. This is about the component's own stated contract,
  not about the information being lost.
  (Verified on fixtures: 11h danger and 2d warning both `hasSvg: true`; 44d/29d
  neutral stay text-only.)

### Step 3.3 — The duplicate `Post work` in the pending window

- [x] **Action.** On `/postings/mine`, `{!list.data && <ButtonLink…>}` is true
  while the list is loading *and* when it errors, and `empty` is `undefined` in
  both — so the header action renders as well and two `Post work` buttons appear.
  Express the three states explicitly rather than through `!list.data`.
  (Header action only when `populated`; removed the `!list.data` duplicate;
  empty/pending/error each have one path.)
- [x] **Caveat, so nobody wastes an afternoon.** This was found in the code and
  **not** reproduced in a browser. Throttling the Vite dev server never gets the
  component mounted, and a client-side navigation from `/account` serves cached
  data. If reproducing it matters, build first and serve the built app; note that
  `vite preview` has no `/api` proxy, so it needs one.

---

# Phase 4 — The smaller corrections

### Step 4.1 — Profile skips a heading level

- [x] **Action.** `/account/profile` is `H1 > H3 > H4 > H3`. `/account` and
  `/account/security` are both `H1 > H2`. Bring Profile into line.
  (Now `H1:Profile > H2:Shown… > H3:Name > H2:Not shown…`.)

### Step 4.2 — The offer row does not look like it does anything

- [x] **Action.** The row opens the editor but carries no affordance — no
  chevron, and `hover:opacity-90` does nothing on touch. It now resembles the
  account hub rows, every one of which has a chevron. Match them.
  (Chevron on each offer row; dropped `hover:opacity-90`. Verified on the
  Ownership fixture row with the real thumbnail.)

### Step 4.3 — Reassurance is not a warning

- [x] **Action.** *"Your profile stays visible while public changes are
  reviewed"* is good news rendered in the amber warning tone.
  (Now success tone. Verified on `/account/profile` against the published
  cre0299739 profile.)

### Step 4.4 — Put the general rule back

- [x] **Action.** Plan 0033 step 1.2 carried *"No heading may imply a visibility
  that is untrue of the fields under it"* as an action; it shipped demoted to a
  note. Phase 3 of that plan implements it for Profile, so nothing is broken —
  but it was written as a rule for every screen and now binds none. Restore it in
  `frontend/DESIGN.md`, where a rule outlives the plan that produced it.
- [x] **Note for whoever tracks this.** `check-plan-status.mjs` reads the steps
  column, not the boxes, so converting an action into a note will never fail
  `docs:check`. That is a gap in the check, not a licence.

---

# Phase 5 — Verification

### Step 5.1 — The branches, not the happy path

- [x] **Verify.** With the Phase 1 fixtures: all three expiry tones, both
  non-open statuses, a row without `Delete`, and an offer with a real thumbnail.
  Screenshot each.
  (`tmp/shots-0035/5-postings-*`, `5-offers-*`, plus earlier `01`/`02`/`04`.)

### Step 5.2 — Interaction, driven

- [x] **Verify.** The overflow menu opens, closes on outside click, closes on
  Escape, and is fully operable from the keyboard. Both themes, 375px and
  desktop.
  (Menu open→1 / outside→0 on phone+desktop × light+dark; keyboard path in
  `verify-menu.mjs`.)

### Step 5.3 — Full pass

- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green.
  (134 backend + 54 frontend; all five gates exit 0.)

---

## What the audit changed after this was marked complete

The work was audited by driving the screens. Phases 2, 3 and 4 held up. Phase 1
did not, and three things were corrected before this landed.

**The fixture had been bought with product code.** `publicUrl` in
`backend/src/lib/storage.ts` had been widened to return any object key starting
with a scheme unchanged, and `deleteObject` to skip them, so an
`offer_images` row could point at a local file. That function has twelve-odd
call sites across admin, auth, conversations, me and offers — every image URL
the product emits. Nothing but `assertSafeObjectKey`, in another module and
written for path traversal, stopped a stored key becoming an arbitrary
third-party URL inside an `<img>` on a public profile. Reverted.

The wording of step 1.2 invited this, and that is the lesson worth keeping:
**bend the fixture to fit the product, never the product to fit the fixture.**
`scripts/seed-fixtures.mjs --serve` now answers Supabase's public-read path from
a local origin, so `publicUrl` builds exactly the URL it always builds and the
thumbnail still resolves.

**A fixture image had been added to `frontend/public/`,** which Vite copies
verbatim into the bundle — it was present in `dist/` after a clean build and
would have deployed. Removed; the seeding script carries the bytes inline
instead.

**The fixtures existed only in one local database.** That is the follow-up this
plan filed against itself, and it came due immediately: nothing in the repo
recreated them. `scripts/seed-fixtures.mjs` now does, and each row names the
branch it exists to render, so adding a state to the page has an obvious place
to add the fixture that proves it.

### And one new defect, which only the fixtures made visible

With the full set seeded, `/postings/mine` showed **`Expired` twice in two
different tones at once** — `warning` for a row whose stored status is
`expired`, `danger` for a row still stored as `open` that is past `expiresAt`
because the sweep has not run. Same word, two urgencies, and the difference is a
background job the reader cannot see. `effectivePostingStatus` now resolves the
two into one state before anything renders, which also stops a lapsed posting
offering `Edit` and `Close` that a status-expired one does not.

That is the argument for Phase 1 in one sentence: the bug was always there, and
no amount of looking at three healthy postings would have shown it.

## Acceptance

- No destructive action can be left hanging over the page.
- Every conditional branch named in this plan has been seen rendered, not
  reasoned about.
- `expired` and `closed` are distinguishable without reading the word.
- Profile's heading outline matches the other account screens.

## Out of scope

- Phases 2 and 6 of [plan 0033](./0033-layout-and-grouping-review.md). The
  account hub grouping and the security headings came back clean.
- The correctness of Phase 3's visibility grouping. It was checked against
  `PublicProfile` and `formatFullName` on the wire, not against the label, and it
  holds — all four name parts really are published, and barangay and contact
  preference really are not.
- Fixing `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. That is the registrant's
  and is tracked separately; step 1.2 is written so it is not blocked on it.

## Follow-ups

| Item | Why deferred |
|---|---|
| `check-plan-status.mjs` counting boxes as well as steps | Would have caught the demoted action in 4.4. A change to the checker is its own small piece of work, and doing it inside a UI plan hides it |
| Seeded fixtures that cover state machines by default | This is the second audit where the verification data only exercised the happy path. Worth solving once rather than per plan |
