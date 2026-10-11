# 0055. Offers and photos wait for approval before they are public

- **Status:** In progress
- **Owner:** reyxdz
- **Related:** [ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md) ·
  [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) (superseded in part) ·
  [ADR 0016](../decisions/0016-edits-never-unpublish.md) ·
  [ADR 0030](../decisions/0030-notifications.md) (amended)

## Goal

An administrator decides what appears on the directory. Before this plan, a new
offer, profile photo or organisation logo was public the moment it was saved,
and the admin media queue's **Remove** deleted it at once, with no confirmation,
no reason and no word to its owner.

After it, nothing new is public until it is approved, and rejecting something
requires a reason that its owner sees. While a change to an offer, photo or logo
waits, the approved version stays public. Approving the change replaces the
public version. Rejecting it leaves the public version exactly as it was.

## Scope

**In scope**
- An offer status (`pending_review`, `published`, `rejected`) and a filter on it
  in every public read of offers.
- One waiting change per published offer (`offer_revisions`). Added and removed
  photos wait as image states.
- A pending slot for a profile photo and an organisation logo, beside the
  approved one.
- One review endpoint with **Approve** and **Reject**. Reject requires a reason.
- Four notification types.
- The owner's views: a status and reason on each offer, on the photo and on the
  logo, plus a way to withdraw a waiting photo or logo.
- A migration that hides unreviewed content already live and queues it for
  review.

**Out of scope**
- Taking down something an administrator already approved. Reports and
  suspension stay the way to do that.
- Dropping `users.avatar_reviewed_at` and `organizations.logo_reviewed_at`.
  They are kept for now and no longer decide anything.
- Filipino and Waray strings for the logo section. The new keys are left blank,
  as ADR 0055 (language) requires.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema and backfill | 2 / 2 | Done |
| 2. API | 3 / 3 | Done |
| 3. Owner screens | 3 / 3 | Done |
| 4. Admin queue | 1 / 1 | Done |
| 5. Records | 1 / 1 | Done |
| 6. Check on staging | 0 / 1 | Not started — after merge |

---

## Phase 1 — Schema and backfill

### Step 1.1 — Columns, enums and the revisions table

- [x] **Action.**
  - In `backend/src/db/schema/profiles.ts`: `offers.status`,
    `rejection_reason` and `revision_rejection_reason`; the `offer_revisions`
    table; `offer_images.state`; `moderation_actions.offer_id`.
  - `users.avatar_pending_key` and `avatar_rejection_reason`.
  - `organizations.logo_pending_key` and `logo_rejection_reason`.
  - The four notification types.
  - Then run `npm run db:generate` from `backend/`, which produces
    `0037_yellow_bromley.sql`.
- [x] **Verify.** `npm run db:migrate` applies the migration cleanly, and a
  second `npm run db:generate` has nothing to generate.

### Step 1.2 — Hide what was never reviewed

- [x] **Action.** `0038_hide_unreviewed_content.sql`, a custom migration:
  - An offer with `reviewed_at` set is `published`. Every other offer stays
    `pending_review`.
  - A photo or logo that was never reviewed moves into its pending slot.
- [x] **Verify.** `content-review.test.ts` › "backfill" runs the SQL file
  against seeded rows.

## Phase 2 — API

### Step 2.1 — Public reads filter on status

- [x] **Action.** Filter `status = 'published'` and leave out `pending_add`
  images in:
  - `offers.service.ts` (listing and the offer page)
  - `profiles.service.ts` (a profile's offers)
  - `conversations.service.ts` (offer cards; sharing an offer)
  - `me.service.ts` (saving an offer; the saved list)
- [x] **Verify.** The tests "a new offer is hidden until approved" and "saving,
  sharing and the saved list are blocked".

### Step 2.2 — Owner writes wait beside what is public

- [x] **Action.**
  - `updateOffer`:
    - On a published offer, an edit goes into `offer_revisions`.
    - An edit back to the published values deletes the waiting change.
    - Editing a rejected offer sends it back to `pending_review`.
  - On a published offer, a new photo is `pending_add` and a removed photo is
    `pending_remove`.
  - `setAvatar` and `setLogo` write the pending slot. `clearAvatar` and
    `clearLogo` withdraw a waiting image before they touch the approved one.
- [x] **Verify.** The "changes" tests in `content-review.test.ts`, and
  `logo.test.ts`.

### Step 2.3 — One queue, one review action

- [x] **Action.**
  - `modules/admin/content-review.service.ts` holds the queue and the review
    action.
  - `POST /admin/media/:kind/:id/review` takes
    `{ action: 'approve' | 'reject', reason? }`. Reject requires a reason.
  - Each decision writes an audit row and notifies the owner.
  - The review carries the queue row's `version` and is refused with `409` if
    the item changed since. Owner writes and the review share the offer's row
    lock.
  - A waiting change counts as a reference to its sub-domain, in the taxonomy
    and when a creative removes a sub-domain from their profile.
- [x] **Verify.** The approve, reject, `409` and queue-order tests in
  `content-review.test.ts`, which also check which storage files are deleted;
  "a decision" (stale versions refused) and "a creative's write racing an
  approval" in the same file; the two offer-change tests in
  `taxonomy.test.ts`.

## Phase 3 — Owner screens

### Step 3.1 — Offers

- [x] **Action.**
  - `OfferReviewNotice` appears on each offer card and in the edit dialog.
  - The form edits the waiting change, if there is one.
  - Each photo shows its state.
  - The saved toast says whether the offer is live or waiting.
- [x] **Verify.** `offer-review.test.ts`.

### Step 3.2 — Profile photo

- [x] **Action.**
  - `AvatarUploader` shows the waiting photo with a badge, or the rejection
    reason.
  - "Withdraw new photo" removes a waiting photo.
- [x] **Verify.** `npm run typecheck`.

### Step 3.3 — Organisation logo

- [x] **Action.**
  - `LogoSection` works the same way as the profile photo.
  - The `organizations.manage.logo.*` keys are in all three catalogues.
- [x] **Verify.** The section-ownership test in `npm test`.

## Phase 4 — Admin queue

### Step 4.1 — Approve, or reject with a reason

- [x] **Action.**
  - `AdminMediaPage.tsx` is renamed "Offers and photos".
  - Each card is labelled "New offer", "Offer changes", "Avatar" or "Logo".
  - A change shows the public version beside it and the photos it adds or
    removes.
  - A photo or logo card shows the image it replaces.
  - Reject opens a reason box in the card.
- [x] **Verify.** `admin-media-logic.test.ts` and `npm run typecheck`.

## Phase 5 — Records

### Step 5.1 — Record the decision

- [x] **Action.**
  - ADR 0058.
  - Notes on ADRs 0008, 0016 and 0030.
  - `api.md` and `data-model.md`.
- [x] **Verify.** `npm run docs:check` passes.

## Phase 6 — Check on staging

**On deploy**, migration 0038 hides every offer, photo and logo that was never
reviewed. They will be missing from the staging directory until someone works
the queue.

### Step 6.1 — Review on staging

- [ ] **Action.** After the deploy, open **Admin › Offers & photos** on staging.
  Approve one item, and reject one with a reason.
- [ ] **Verify.**
  - The approved item appears on the directory.
  - The rejected item's owner sees the reason on the item and in their
    notifications.
  - An edit to a published offer leaves the public offer unchanged until it is
    approved.

## Acceptance

- [x] Nothing new is public until approved.
- [x] A waiting change leaves the public version unchanged, and rejecting the
  change leaves it as it was.
- [x] A rejection requires a reason, and its owner sees it.
- [ ] Verified on staging.

## Follow-ups

- Translate the logo section's new strings.
- Drop `avatar_reviewed_at` and `logo_reviewed_at` once nothing reads them.
