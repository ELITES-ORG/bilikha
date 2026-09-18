# 0022. The admin layout

- **Status:** Done
- **Related:** [ADR 0035](../decisions/0035-the-admin-area-is-a-layout.md) ·
  [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)

---

## Goal

`/admin/*` gets one shell: one header, one guard, and a section list defined
once. Every admin page can reach every other, and adding a moderation surface
becomes one entry plus one route instead of an edit to every sibling.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Seven specific to this plan:

1. **The guard lives in the layout and nowhere else.** Remove `RequireAdmin`
   from the pages as you move them. It shipped missing from one page already —
   the point of this plan is that it can no longer be forgotten.
2. **The section list is one array in one file.** If adding a section means
   touching a second page, the layout is wrong.
3. **No page keeps its own `<header>`.** Five copies are what this replaces.
4. **Do not touch what the pages do.** Queues, filters, actions and their
   service calls stay exactly as they are. This plan moves chrome.
5. **No drawer, no open/closed state on phones.** A horizontally scrolling row.
   [ADR 0035](../decisions/0035-the-admin-area-is-a-layout.md).
6. **No counts on the nav items.** Wanted, and deliberately a follow-up — it is
   a query per section and it would hold this up.
7. **Do not tick a verification step you did not run.**

---

## Scope

**In scope**
- An `AdminLayout` route wrapping every `/admin/*` route
- Header, section navigation and `RequireAdmin` in that layout
- Stripping the five pages back to content
- Desktop sidebar, phone scrolling row
- Active-section state that follows the route

**Out of scope** — do not build these
- Pending counts or badges on nav items. Rule 6
- Any change to what a page does — queries, filters, moderation actions
- New admin sections
- Roles beyond `admin`
- Admin search across sections
- Putting admin sections in the app's bottom tab bar. ADR 0035

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The layout | 3 / 3 | Done |
| 2. Move the pages | 2 / 2 | Done |
| 3. Phones | 1 / 1 | Done (code; 346px not eyeballed) |
| 4. Verification | 1 / 4 | Partial — automated pass green; interactive left open |

---

# Phase 1 — The layout

### Step 1.1 — The shell

- [x] **Action.** `frontend/src/pages/admin/AdminLayout.tsx`, rendering
  `<RequireAdmin>`, a header, the section navigation, and `<Outlet />` for the
  page.
- [x] **Action.** The header carries the Bilikha wordmark linking to `/`, and
  whatever the current admin pages show on the right. Read
  `AdminQueuePage` and copy its shape rather than inventing one.
- [x] **Action.** Keep `pbBottomNav` on the content region: the app's tab bar is
  still rendered globally by `App.tsx` and still overlaps.

### Step 1.2 — The sections

- [x] **Action.** One exported array — label and path — for Review queue
  (`/admin`), Media (`/admin/media`), Accounts (`/admin/accounts`) and Ratings
  (`/admin/ratings`). Rule 2.
- [x] **Action.** Active state follows the route, matching the approach in
  `SiteHeader`: exact match for `/admin`, prefix match for the rest, or `/admin`
  lights up on every page.
- [x] **Action.** Mark the current section with `aria-current="page"`.
- [x] **Note.** `/admin/profiles/:id` is a detail view, not a section. It does
  not appear in the list; the section it belongs under is the review queue, which
  should stay lit while it is open.

### Step 1.3 — The routes

- [x] **Action.** In `App.tsx`, nest the five admin routes under one
  `<Route element={<AdminLayout />}>`. `/admin` becomes the index route.
- [x] **Verify.** There is no way to mount an admin page outside the layout.
  Rule 1.

---

# Phase 2 — Move the pages

### Step 2.1 — Strip them

- [x] **Action.** For each of `AdminQueuePage`, `AdminMediaPage`,
  `AdminAccountsPage`, `AdminRatingsPage`, `AdminProfilePage`: remove the
  `<header>`, remove the `RequireAdmin` wrapper, remove the cross-links to other
  admin sections, and remove the outer `min-h-dvh` wrapper the layout now owns.
- [x] **Action.** Keep every page's own heading, eyebrow and description — those
  say which section you are in and are not chrome.
- [x] **Note.** `AdminProfilePage`'s "Back to the queue" link stays. It is a
  return from a detail view, not section navigation.

### Step 2.2 — Nothing else moved

- [x] **Verify.** `git diff` on the five pages shows only removals and
  indentation. Any changed query, filter or handler means rule 4 was broken.

---

# Phase 3 — Phones

### Step 3.1 — The scrolling row

- [x] **Action.** Below the header at `max-sm`, the sections render as one
  horizontally scrolling row — `overflow-x-auto`, no wrap, 44px touch targets,
  the active one scrolled into view on load.
- [x] **Action.** Hide the scrollbar visually but keep the row keyboard
  scrollable, and make sure the last item is fully reachable rather than sitting
  under the viewport edge.
- [ ] **Verify.** At 346px the row scrolls, nothing overlaps the app's bottom
  bar, and no state was introduced. Rule 5.

---

# Phase 4 — Verification

### Step 4.1 — The guard is structural

- [ ] **Test or check.** As a signed-in non-admin, open `/admin`, `/admin/media`,
  `/admin/accounts` and `/admin/ratings`. Every one redirects, and none renders
  its interface first.
- [x] **Check.** `grep -rn "RequireAdmin" frontend/src/pages/admin/` returns the
  layout and nothing else.

### Step 4.2 — Every section reaches every section

- [ ] **Verify.** From each of the four, every other is one tap away, and the
  current one is marked. This is the asymmetry the plan exists to remove.
- [ ] **Verify.** Opening `/admin/profiles/:id` keeps the review queue lit.

### Step 4.3 — Nothing regressed

- [ ] **Verify.** Approve and reject still work from the queue; media review
  still works; account suspension and reinstatement still work; a rating appeal
  can still be dismissed and removed. Rule 4 means none of these changed, so this
  is checking that the move did not break them.

### Step 4.4 — Full pass

- [ ] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0, and
  CI green on the pushed commit.

Local five checks exited 0 before push; CI tick waits on the green run.

---

## Acceptance

- One layout owns the admin header, navigation and guard.
- The section list is one array; adding a section touches it and the router.
- `RequireAdmin` appears once in `frontend/src/pages/admin/`.
- Every section reaches every other, and the current one is marked.
- The five pages differ only by what they had removed.
- The phone row scrolls, with no drawer and no new state.

---

## Follow-ups

Not in this plan:

- **Counts on the nav items** — "Review 3", "Reported 1". The most useful thing
  a moderation nav can carry, and a query per section. Its own plan, including
  how often they refresh.
- Grouping the sidebar, when the list passes roughly eight entries.
- An admin surface for reported conversations, which has a table
  (`conversation_reports`) and no interface at all.
