# 0056. The admin area by subject

- **Status:** In progress
- **Owner:** reyxdz
- **Related:** [ADR 0059](../decisions/0059-the-admin-area-is-organised-by-subject.md) ·
  [ADR 0035](../decisions/0035-the-admin-area-is-a-layout.md) (amended) ·
  [ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)

## Goal

An administrator can tell where to go without learning the system first. Each
admin section is one subject: Creatives, Offers, Organisations, People, Reports.
Every decision about that subject is made in its section, so an organisation's
logo sits with the organisation and a profile photo sits with the person. The
sidebar shows how many items wait in each section, and keeps the work separate
from the tools.

## Scope

**In scope**
- `GET /admin/summary`: what waits under each subject.
- `kind` and `change` filters on `GET /admin/media`.
- The grouped sidebar with its counts.
- The Offers and People pages.
- A Logos tab on Organisations.
- Renamed Creatives, Reports and Find an account.
- Redirects from the old addresses.

**Out of scope**
- **ID checks under People:** plan 0053 Phase 3.
- **The same Approve and Reject wording** on profiles, organisations and
  reports.
- **A combined inbox of everything waiting.**

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. API | 2 / 2 | Done |
| 2. Navigation | 2 / 2 | Done |
| 3. Pages | 3 / 3 | Done |
| 4. Records | 1 / 1 | Done |
| 5. Check on staging | 0 / 1 | Not started — after merge |

---

## Phase 1 — API

### Step 1.1 — The queue by subject

- [x] **Action.** `listContentQueue` takes an optional `kind` (`offer`,
  `avatar` or `logo`) and `change` (`new` or `edit`). A `change` filter
  implies `kind: 'offer'`. `GET /admin/media` accepts both as query
  parameters, and without them it returns the whole queue, as before.
- [x] **Verify.** `summary.test.ts` › "the content queue by subject".

### Step 1.2 — The summary

- [x] **Action.**
  - `contentQueueCounts()` counts without building the queue.
  - `openReportCount()` counts open reports.
  - `modules/admin/summary.service.ts` combines them with the profile and
    organisation counts into `GET /admin/summary`.
- [x] **Verify.** `summary.test.ts` › "the admin summary": one item of every
  kind waiting, plus items that are not waiting; and all zeros when nothing
  waits.

## Phase 2 — Navigation

### Step 2.1 — Sections and groups

- [x] **Action.** `admin-sections.ts` lists the sections in two groups. Each
  section of work has a `waiting` count read from the summary. Creatives stays
  marked on a profile detail.
- [x] **Verify.** `admin-sections.test.ts`.

### Step 2.2 — The sidebar

- [x] **Action.**
  - `AdminLayout` shows the group headings and a badge per section, with no
    badge at zero, on desktop and phones.
  - `useSummaryFollowsDecisions` re-reads the summary when any admin write
    settles.
- [x] **Verify.** `npm run typecheck`, and the browser check in Phase 5.

## Phase 3 — Pages

### Step 3.1 — One content-review list

- [x] **Action.**
  - The card moves from the old media page to `content-review/ReviewCard.tsx`.
  - `content-review/ContentReviewList.tsx` shows one subject's part of the
    queue, with search, sort and the decision.
  - The search and sort logic lives in `review-list-logic.ts`.
- [x] **Verify.** `review-list-logic.test.ts`.

### Step 3.2 — Offers, People, and Logos

- [x] **Action.**
  - `AdminOffersPage` has two tabs, New offers and Changes.
  - `AdminPeoplePage` holds Profile photos.
  - `AdminOrganizationsPage` gains a Logos tab.
  - `AdminMediaPage` is deleted.
- [x] **Verify.** `npm run typecheck` and `npm test`.

### Step 3.3 — Names and addresses

- [x] **Action.**
  - The review queue becomes Creatives (`/admin/creatives`), Ratings becomes
    Reports (`/admin/reports`), and Accounts becomes Find an account.
  - `/admin`, `/admin/media` and `/admin/ratings` redirect to their new
    sections.
  - The page skeletons and the profile detail's back link follow.
- [x] **Verify.** `npm run typecheck`.

## Phase 4 — Records

### Step 4.1 — Record the decision

- [x] **Action.**
  - ADR 0059, and a note on ADR 0035.
  - `api.md`.
- [x] **Verify.** `npm run docs:check`.

## Phase 5 — Check on staging

### Step 5.1 — Walk the admin area

- [ ] **Action.** After the deploy, open each section on staging, on a desktop
  and on a phone.
- [ ] **Verify.**
  - Every count in the sidebar matches its page's tabs.
  - Approving an item lowers its count without a reload.
  - `/admin/media` lands on Offers.

## Acceptance

- [x] Every decision about a subject is made in that subject's section.
- [x] The sidebar separates the work from the tools, and counts what waits.
- [x] The old addresses still work.
- [ ] Checked on staging.
