# 0021. Ratings, earned by a completed agreement

- **Status:** Complete
- **Related:** [ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md) ·
  [ADR 0029](../decisions/0029-work-agreements-not-invoices.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [ADR 0030](../decisions/0030-notifications.md)

---

## Goal

A client who confirms an engagement complete is invited to rate the creative:
1–5 stars and a short note. One rating per completed agreement, public on the
creative's profile, editable for fourteen days and frozen after.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Nine specific to this plan:

1. **A rating requires a completed agreement, checked server-side.** Not a
   completed *conversation*, not an accepted agreement — completed. This is the
   only thing standing between the registry and spam, and hiding the button is
   not enforcing it.
2. **One rating per agreement, enforced by a unique index**, not by a service
   check that races itself.
3. **The average is never a column.** It is derived on read, like the agreement
   total and the lifecycle state. A stored average goes stale the moment a rater
   is suspended.
4. **The count travels with the score, everywhere it is shown.** "5.0" alone is
   a lie in a thin market. If you render a score without its count, you have
   broken [ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md).
5. **Do not sort or filter the directory by rating.** Not in this plan, not as a
   convenience, not behind a query parameter.
6. **Suspended raters drop out by derivation**, per
   [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md). Every
   read joins `users` and filters `status = 'active'` — and the count and the
   average must agree with each other after it.
7. **The edit window is enforced in the service, not by a trigger.** Unlike an
   acceptance, a rating is an opinion rather than evidence of a commitment; a
   clock-reading trigger would make every test time-dependent for a product rule.
   Say this in a comment so the asymmetry with `agreement_acceptances` reads as a
   decision.
8. **Tests ship in the same commit**, against a real database, using
   `backend/src/test/factories.ts`.
9. **Do not tick a verification step you did not run.**

---

## Scope

**In scope**
- `ratings` and `rating_reports` tables
- Rate from the completion modal, or later from the agreement record
- Edit and delete inside fourteen days; frozen after
- Stars, count and reviews on the creative's public profile
- A creative's appeal, and an admin queue to answer it
- A notification to the creative when a rating arrives
- Tests for all of it

**Out of scope** — do not build these
- Rating clients, or any symmetric rating. [ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md)
- Public replies to a rating
- Sorting, filtering or ranking the directory by rating. Rule 5
- A Bayesian or weighted average. Plain mean, with the count beside it
- Photos on reviews
- Editing a rating after the window, by anyone including an admin. An admin
  removes; nobody rewrites

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 2 / 2 | Done |
| 2. Service | 4 / 4 | Done |
| 3. API | 1 / 1 | Done |
| 4. Rating it | 3 / 3 | Done |
| 5. Showing it | 2 / 2 | Done |
| 6. Appeals | 2 / 2 | Done |
| 7. Verification | 6 / 6 | Complete |

---

# Phase 1 — Schema

### Step 1.1 — Tables

- [x] **Action.** `backend/src/db/schema/ratings.ts`:

  `ratings`:
  - `id` uuid pk
  - `agreementId` → `agreements.id`, cascade, **unique** — rule 2
  - `raterUserId` → `users.id`, restrict — the record names who spoke
  - `stars` integer not null, check between 1 and 5
  - `comment` text nullable, capped at 500 in the schema that validates it
  - `createdAt`, `updatedAt` timestamptz

  `ratingReports` — a creative's appeal, modelled on `conversation_reports`:
  - `id` uuid pk
  - `ratingId` → `ratings.id`, cascade
  - `reporterUserId` → `users.id`, cascade
  - `reason` text not null
  - `status` reuses `reportStatusEnum`
  - `createdAt`

  Indexes: `ratings(rater_user_id)`, `rating_reports(status, created_at)`.

- [x] **Note.** No `profile_id` on `ratings`. The creative is reachable through
  `agreement → conversation → profile`, and a copied foreign key is a second
  source of truth ([ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)).
- [x] **Note.** No `average` anywhere. Rule 3.

### Step 1.2 — Moderation and migration

- [x] **Action.** Add `rating_removed` to `moderationActionEnum`, with
  `ALTER TYPE ... ADD VALUE`.
- [x] **Action.** Migrate, commit the Drizzle snapshot alongside, then
  `db:generate` again and confirm it emits nothing.

---

# Phase 2 — Service

New module: `backend/src/modules/ratings/`.

### Step 2.1 — Leaving one

- [x] **Action.** `rateAgreement({ userId, agreementId, stars, comment })`.
  Refuses unless: the caller is the **client** on that agreement, the agreement
  is `accepted`, and its derived state is `Completed`. Reuse `deriveState` from
  the agreements service rather than reading a status column — there is not one.
- [x] **Action.** Rely on the unique index for the second attempt, and translate
  the constraint violation into a clear refusal. Rule 2.
- [x] **Verify.** A creative rating their own agreement is refused. A stranger is
  refused with 404, not 403.

### Step 2.2 — Changing one

- [x] **Action.** `updateRating` and `deleteRating`, author only, refused once
  `createdAt` is more than fourteen days old.
- [x] **Action.** Put the window in one exported constant with a comment naming
  [ADR 0033](../decisions/0033-ratings-earned-by-a-completed-agreement.md), and
  rule 7's reason for it living here rather than in a trigger.

### Step 2.3 — Reading them

- [x] **Action.** `listForProfile(profileSlug, { page, limit })` returning the
  rows, and `summaryForProfile(profileSlug)` returning `{ average, count }`
  derived in the same query shape.
- [x] **Action.** Both join through `agreements → conversations` to the profile
  **and** join `users` on the rater with `status = 'active'`. Rule 6.
- [x] **Verify.** Suspend a rater and confirm the count drops by one and the
  average moves. A count that disagrees with the list is the bug shape this
  codebase has shipped twice.

### Step 2.4 — Telling the creative

- [x] **Action.** Add `rating_received` to `notificationTypeEnum`, its title, and
  its branch in `resolveTargets` linking to the creative's own profile.
- [x] **Action.** Emit through `notify()` after the rating commits. It never
  throws and never fails the rating.

---

# Phase 3 — API

### Step 3.1 — Routes

- [x] **Action.** Behind `requireAuth` except the two public reads:
  - `POST /agreements/:id/rating` — leave one
  - `PATCH /ratings/:id`, `DELETE /ratings/:id` — author, inside the window
  - `POST /ratings/:id/report` — the creative's appeal
  - `GET /creatives/:slug/ratings` — public list
  - `GET /creatives/:slug/ratings/summary` — public `{ average, count }`
- [x] **Action.** Rate-limit `POST /agreements/:id/rating` per user. A completed
  agreement is required, so abuse is bounded, but the endpoint writes public text
  about a named person.

---

# Phase 4 — Rating it

### Step 4.1 — The modal

- [x] **Action.** On a successful **Confirm completion**, open a modal: five
  stars, a short note, **Submit** and **Not now**.
- [x] **Action.** "Not now" dismisses and never asks again automatically. ADR
  0033 — a rating nobody was nagged into is worth more.
- [x] **Action.** The stars are a real radio group, keyboard reachable, each with
  an accessible label. Not a row of click handlers on icons.
- [x] **Note.** The prompt is owned by `AgreementPage`, not by
  `AgreementLifecycleActions`, which stops rendering the moment the state
  becomes Completed — a modal owned there would unmount as it opened.

### Step 4.2 — Later

- [x] **Action.** A completed, unrated agreement shows "Rate this creative" on
  its record page, for the client only. That is where "later" leads.
- [x] **Action.** Once rated, the same place shows the rating with an Edit
  control while inside the window, and nothing after it.
- [x] **Note.** Delete sits beside Edit, behind a confirm, and only inside the
  window: `DELETE /ratings/:id` is in scope and tested, and leaving it with no
  way to reach it would mean a client could change their words but not take them
  back. The count follows it down, because every write invalidates the summary
  the profile prints beside the list.
- [x] **Note.** Deciding between the two needs the agreement's own rating, which
  no existing response carried: `GET /agreements/:id/rating` was added for it
  rather than joining the rating into the agreement record, which would have
  changed a shape phase 3 had already tested.

### Step 4.3 — Feedback

- [x] **Action.** Everything through `toast.run`, as every action here does.

---

# Phase 5 — Showing it

### Step 5.1 — On the profile

- [x] **Action.** The creative profile shows the average to one decimal, the
  star row, and the count — "4.6 from 12 reviews". Rule 4: never the score alone.
- [x] **Action.** Below it, the reviews: stars, note, relative time, and the
  rater's display name.
- [x] **Action.** With no ratings, say so plainly rather than rendering an empty
  star row, which reads as zero.
- [x] **Note.** One component prints the average (`RatingScore`), and it takes
  the summary whole. There is no way to render a score through it without the
  count, which is rule 4 enforced in a single place rather than per call site.

### Step 5.2 — Nowhere else

- [x] **Verify.** Grep the directory, the offer index and the postings feed for
  any rating join. There should be none. Rule 5.
- [x] **Note.** Nothing in `profiles.service.ts`, `offers` or `postings` mentions
  a rating on either tier. The profile page fetches the summary and the list as
  their own public calls, so a feed cannot pick one up by editing a shared shape.

---

# Phase 6 — Appeals

### Step 6.1 — Reporting

- [x] **Action.** On their own profile, a creative can report a rating with a
  required reason. This is their only recourse — ADR 0033 — so it is reachable in
  two taps, not buried.

### Step 6.2 — The admin queue

- [x] **Action.** `/admin/ratings` lists open reports with the rating, the
  reason, and both parties. An administrator can dismiss the report or remove the
  rating, writing `rating_removed` into `moderation_actions` with the reason.
- [x] **Action.** Removal deletes the rating. There is no rewriting: ADR 0033
  says an admin removes and nobody edits someone else's words.
- [x] **Note.** The service functions existed from phase 2 but nothing reached
  them: `GET /admin/ratings`, `POST /admin/ratings/reports/:id/dismiss` and
  `POST /admin/ratings/:id/remove` were added to `admin.routes.ts`, behind the
  `requireAdmin` guard the whole router already carries.

---

# Phase 7 — Verification

Against a database that is up.

### Step 7.1 — Only a completed agreement earns one

- [x] **Test.** Rating is refused on an agreement that is sent, accepted but not
  started, in progress, awaiting confirmation, and cancelled. Accepted only when
  Completed.
- [x] **Test.** The creative cannot rate. A third account gets 404.

### Step 7.2 — One each

- [x] **Test.** A second rating on the same agreement is refused by the index.
- [x] **Test.** The same client completing a *second* agreement with the same
  creative can rate again.

### Step 7.3 — The window

- [x] **Test.** Edit and delete succeed inside fourteen days. With `createdAt`
  backdated past the window, both are refused and the row is unchanged.

### Step 7.4 — Suspension

- [x] **Test.** Suspend a rater: the review leaves the list, the count drops, and
  the average recomputes. Count and list agree. Reinstate and all three return.

### Step 7.5 — Appeals

- [x] **Test.** A creative can report a rating on their own profile and not one
  on someone else's. An admin removing it writes `rating_removed` and the rating
  leaves the profile.

### Step 7.6 — Full pass

- [x] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0, and
  CI green on the pushed commit. Grep the diff for a stored average and for any
  rating join in the directory.
- [x] **Note.** Local five checks and CI (`35283320844`) both green. Greps clean:
  no stored average; no rating join in directory, offer index or postings feed.

---

## Acceptance

- Only the client on a Completed agreement can rate, and only once per agreement.
- Stars and a short note appear on the creative's profile, always with the count.
- Editing and deleting work for fourteen days and are refused after.
- A suspended rater's review leaves, and the count and average agree.
- A creative can appeal; an admin can remove; the removal is recorded.
- No stored average, and nothing in the directory ranks by rating.

---

## Follow-ups

Not in this plan:

- Whether the distribution is flat. ADR 0033 says that if a hundred ratings show
  no variance, the honest response is to say so rather than keep displaying it.
  Somebody has to look.
- Rating clients, which ADR 0033 rejects for now on retaliation grounds.
- A weighted average, if the thin-market distortion turns out to bite.
