# 0057. The upload pipeline, and audio, video and PDF on offers

- **Status:** In progress — rollout remains
- **Owner:** reyxdz
- **Related:** [ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md) ·
  [ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md) ·
  [plan 0045](./0045-audio-video-and-pdf-uploads.md) (superseded) ·
  [issue #34](https://github.com/ELITES-ORG/bilikha/issues/34) ·
  [issue #66](https://github.com/ELITES-ORG/bilikha/issues/66)

## Goal

An offer can carry audio, video and PDF beside its images. Each kind has its own
limits on size, duration and count, enforced by the browser, the API and
storage. Large files upload resumably. Players download nothing until tapped.
New media waits for review as photos do (ADR 0058). All of it is built on one
upload pipeline that message attachments (#66) will reuse.

## Scope

**In scope**
- The shared pipeline:
  - the limits table and the off switch;
  - buckets per kind;
  - reservations, tickets and verification of the stored object;
  - the resumable transport;
  - the browser upload library.
- On offers:
  - attaching media;
  - every reader, deletion and review across kinds;
  - the editor, the players, badges and posters;
  - the admin previews;
  - the terms line.

**Out of scope**
- A profile-level portfolio (dropped; see ADR 0046).
- Message attachments (#66, which reuses this pipeline).
- Retiring the legacy image upload routes (a follow-up, one release later).
- Expiring stalled uploads sooner than 24 hours, and reordering media.

## Prerequisites

- **Docker:** Docker Desktop running, with `bilikha-postgres` up
  (`npm run db:up`).
- **Staging storage:** for step 0.1 and the steps that try uploads for real, the
  **staging** Supabase service-role key is in `backend/.env`, which is never
  committed.

## Blockers

- **The rollout (Phase 6) needs Supabase Pro on production.** Phases 0–5 merge
  before that, because the new kinds stay off until `MEDIA_UPLOAD_KINDS` is set.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 0. Prove the transport | 1 / 1 | Done |
| 1. The shared pipeline | 6 / 6 | Done |
| 2. Offer media in the data | 5 / 5 | Done |
| 3. The offer editor | 2 / 2 | Done |
| 4. Players, badges and posters | 3 / 3 | Done |
| 5. Review previews and the terms | 2 / 2 | Done |
| 6. Rollout (reyxdz) | 0 / 6 | Not started |

---

## Phase 0 — Prove the transport

### Step 0.1 — Probe Supabase's resumable upload on staging

- [x] **Action.** Run the probe from the handoff against a throwaway private
  bucket on staging, and delete the bucket afterwards.
- [x] **Verify.**
  - A TUS endpoint accepts a signed upload token.
  - An interrupted upload resumes from at least 6 MB.
  - The listed size and type match.
  - The first bytes can be read.
  - The bucket was removed.

Probe results:

```json
{
  "bucketCreated": 200,
  "tus": {
    "endpoint": "https://ufkgaablxgrmqmqjpzbl.supabase.co/storage/v1/upload/resumable/sign",
    "objectKey": "probe/small-0.mp3",
    "tried": [
      {
        "endpoint": "https://ufkgaablxgrmqmqjpzbl.supabase.co/storage/v1/upload/resumable/sign",
        "ok": true,
        "error": null
      }
    ]
  },
  "listed": {
    "size": 500000,
    "mimetype": "audio/mpeg",
    "expectedSize": 500000
  },
  "overLimit": {
    "refused": true,
    "refusedAt": "creation",
    "error": "tus: unexpected response while creating upload, originated from request (method: POST, url: https://ufkgaablxgrmqmqjpzbl.supabase.co/storage/v1/upload/resumable/sign, response code: 413, response text: Maximum size exceeded\n, request id: n/a)"
  },
  "resume": {
    "stoppedAfter": 6291456,
    "resumedFromOffset": 6291456,
    "completed": true,
    "error": null
  },
  "range": {
    "readPath": "/object/authenticated/{bucket}/{key}",
    "tried": [
      {
        "path": "/object/authenticated/tus-probe/probe/small-0.mp3",
        "status": 206,
        "bytes": 64
      }
    ]
  },
  "bigBucket": {
    "allowed": false,
    "status": 400,
    "text": "{\"statusCode\":\"413\",\"error\":\"Payload too large\",\"message\":\"The object exceeded the maximum allowed size\",\"code\":\"EntityTooLarge\"}"
  },
  "cleanedUp": true
}
```

## Phase 1 — The shared pipeline (pull request 1)

### Step 1.1 — Records
- [x] **Action.** This plan, ADR 0046 revised, plan 0045 superseded, and the
  index rows.
- [x] **Verify.** `npm run docs:check` passes.

### Step 1.2 — Switch, limits and signatures
- [x] **Action.** Add `MEDIA_UPLOAD_KINDS`, `media.limits.ts` and
  `media.sniff.ts`, with their tests.
- [x] **Verify.** The tests pass.

### Step 1.3 — Schema
- [x] **Action.** Add `media_uploads` and the new `offer_images` columns, in an
  additive migration.
- [x] **Verify.** It migrates, and a second `db:generate` has nothing to do.

### Step 1.4 — Storage, tickets and verification
- [x] **Action.** Add the storage functions, the ticket, abandon, limits and
  usage routes, `verifyReservation`, and the 30-an-hour limit.
- [x] **Verify.** `media.test.ts` and the storage tests pass.

### Step 1.5 — Buckets and cleanup
- [x] **Action.** Write `media:buckets`, extend `media:prune` to every bucket and
  to reservations, and configure staging's buckets.
- [x] **Verify.** `media:buckets -- --check` exits 0 on staging. Write here which
  form was run. Staging refused a bucket larger than 50 MB (`bigBucket.allowed`
  false), so the form run was `media:buckets -- --max-file-size 50000000`, then
  `media:buckets -- --check --max-file-size 50000000`, which exited 0.

### Step 1.6 — The browser library
- [x] **Action.** Add the checks, probe, PUT and TUS transports, and the upload
  reducer, with their tests. Add `tus-js-client`, loaded on demand.
- [x] **Verify.** The tests pass, and `check:bundle` shows a separate chunk.
  Initial JavaScript stayed at 178.38 kB gzip. Nothing imports the library until
  the editor (Phase 3), so the app build has no tus chunk yet; a scratch build
  with `tus-upload.ts` as an extra entry put `tus-js-client` in its own
  dynamically loaded chunk (15.56 kB gzip).

## Phase 2 — Offer media in the data (pull request 2)

### Step 2.1 — Optional thumbnails
- [x] **Action.** `thumb_key` becomes nullable, with an image-has-thumb check.
- [x] **Verify.** It migrates.

### Step 2.2 — Readers
- [x] **Action.** Every image reader filters `kind = 'image'`. `mediaForOffers`
  serves the rest.
- [x] **Verify.** `offer-media.test.ts` passes.

### Step 2.3 — Attaching
- [x] **Action.** `POST /offers/:id/media` verifies and records an upload under
  ADR 0058's states. The legacy image route allows 10.
- [x] **Verify.** The attach tests pass.

### Step 2.4 — Deleting
- [x] **Action.** Files are deleted from their own bucket.
- [x] **Verify.** The bucket-deletion test passes.

### Step 2.5 — Review
- [x] **Action.** The version token, approve and reject cover every kind.
- [x] **Verify.** The `content-review.test.ts` additions pass.

## Phase 3 — The offer editor (pull request 3)

### Step 3.1 — The uploader
- [x] **Action.** `MediaUploader` in the offer editor: limits shown before
  picking, the quota, progress, cancel, resume, the rights reminder, and the
  legacy fallback.
- [x] **Verify.** The logic tests pass, and the bundle is within budget.
  Initial JavaScript is 178.64 kB gzip in 9 files (was 178.38 kB in 8), and
  `tus-js-client` loads in its own chunk only when an upload starts.

### Step 3.2 — Tried for real
- [x] **Action.** Upload each kind through the local API against staging storage.
- [x] **Verify.**
  - Each kind survives a reload.
  - A refusal happens before any request.
  - Cancel leaves no reservation.
  - A cut connection resumes. DevTools' offline switch only stalls a request
    already under way, so the check cut every connection at a proxy instead:
    the next request resumed at offset 6,291,456, after the first stored chunk.

## Phase 4 — Players, badges and posters (pull request 4)

### Step 4.1 — Backend
- [x] **Action.** Media badges on cards, and a video poster as the cover when an
  offer has no image.
- [x] **Verify.** The tests pass.

### Step 4.2 — Players
- [x] **Action.** `AudioItem`, `VideoItem` and `DocumentLink`, with nothing
  preloaded and nothing autoplaying, and a source test.
- [x] **Verify.** `players.test.ts` passes.

### Step 4.3 — Pages and cards
- [x] **Action.** Listen, Watch and Read on the offer page, and badges on cards.
- [x] **Verify.** On a throttled phone profile, only the poster downloads before
  play. At 375px on Slow 4G with the cache off, scrolling through all three
  sections fetched the video poster and the gallery photo and nothing else;
  the MP3 was requested only when play began. Initial JavaScript is 180.75 kB
  gzip in 9 files (was 178.66 kB).

## Phase 5 — Review previews and the terms (pull request 5)

### Step 5.1 — Review card
- [x] **Action.** The queue carries every kind, and the review card plays and
  labels added and removed media.
- [x] **Verify.** The tests pass. In a browser, a change that added an MP3
  through the editor showed under Changes as "1 audio added", with the track
  labelled Added and playing; Approve made it live on the offer page.

### Step 5.2 — Terms
- [x] **Action.** Correct the limits and review lines, add the rights line, and
  move the legal date and consent version.
- [x] **Verify.** Key parity passes, and "four images" is gone.

## Phase 6 — Rollout (reyxdz)

### Step 6.1 — Supabase Pro
- [ ] **Action.** Move the Bilikha organisation to Pro.
- [ ] **Verify.** The billing page shows Pro.

### Step 6.2 — Upload size limit
- [ ] **Action.** Set the project upload limit to 350 MB on both projects.
- [ ] **Verify.** Each project's Storage settings show 350 MB.

### Step 6.3 — Buckets
- [ ] **Action.** Run `media:buckets` on staging without a cap, then on
  production.
- [ ] **Verify.** `--check` exits 0 on both.

### Step 6.4 — Staging on
- [ ] **Action.** Set `MEDIA_UPLOAD_KINDS=audio,video,document` on Render
  `bilikha`.
- [ ] **Verify.** Each kind uploads and plays on staging, and plays on an
  iPhone.

### Step 6.5 — Release
- [ ] **Action.** Release `main` with production's switch still empty.
- [ ] **Verify.** The release checks in the guide pass.

### Step 6.6 — Production on
- [ ] **Action.** Set the switch on Render `bilikha-production`. Accept ADR 0046.
  Close #34.
- [ ] **Verify.** Each kind uploads and plays on production.

## Acceptance

- [ ] Each kind uploads, plays or opens, and survives a reload, on staging and on
  production.
- [ ] Uploads that are over-size, wrong-type, over-count, over-quota or
  rate-limited are each refused by the API, with tests.
- [ ] An object uploaded around the API with a forged type or size is refused by
  storage or at verification.
- [ ] Players download nothing until tapped, on a throttled phone profile.
- [ ] A near-300 MB video resumes after the network drops, and a 301 MB or 5:01
  video is refused before upload.
- [ ] New media waits for review on a published offer, and a rejected change
  discards only its own files.
- [ ] ADR 0046 is Accepted.

## Follow-ups

- Retire `POST /media/upload-url` with `kind: "offer"` and
  `POST /offers/:id/images`, one release after pull request 3.
- Expire stalled uploads sooner than 24 hours.
- Reorder media within an offer.
- A profile-level portfolio, with its own review design.
