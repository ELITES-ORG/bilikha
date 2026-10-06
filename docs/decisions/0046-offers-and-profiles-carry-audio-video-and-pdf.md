# 0046. Offers and profiles carry audio, video and PDF, each kind with its own limits

- **Status:** Proposed
- **Date:** 2026-10-06
- **Supersedes:** the images-only scope and free-tier budget of
  [0021](./0021-image-storage-and-upload-path.md). Its browser-side image
  sizing and direct upload stand.
- **Amends:** [0022](./0022-offers-replace-portfolio.md) — ten images per offer
  instead of four, and a profile-level portfolio inside the same media table
- **Related:** [plan 0045](../plans/0045-audio-video-and-pdf-uploads.md) ·
  [0008](./0008-publish-immediately-with-tiers.md) ·
  [0037](./0037-one-definition-of-an-api-shape.md) ·
  [0040](./0040-a-deploy-must-not-break-an-open-tab.md) ·
  [0042](./0042-main-is-staging-production-is-a-branch.md) ·
  [operating constraints](../explanation/constraints.md)

## Context

A creative can only show images. Songwriters, composers, filmmakers, performers
and writers have nothing to show that fits their craft
([issue #34](https://github.com/ELITES-ORG/bilikha/issues/34)).
[0021](./0021-image-storage-and-upload-path.md) kept uploads to images because
the Supabase free tier allows 1 GB of storage, 50 MB per file and 5 GB of egress
a month. Both projects (production and staging, which share one organisation
since #29) are moving to Supabase Pro, so that constraint is gone.

The other constraints still apply. Visitors are on budget Android phones and
metered data. Render's free instance has 512 MB of RAM and cannot transcode
anything. One push of `main` to `production` ships all of `main`
([0042](./0042-main-is-staging-production-is-a-branch.md)). Migrations run in
Render's build while the old instance is still serving.

Two gaps in today's image path also affect this decision:

- The confirm step records an object key without checking what was stored.
  Anyone calling the API directly can put any bytes in the bucket, up to the
  project's per-file limit.
- `offers.reviewed_at` covers the whole offer. An image added after review is
  never reviewed, and an administrator can only remove the whole offer.

## Decision

**An allowlist of four kinds, each with its own limits.** The server enforces
them, and each kind's storage bucket enforces them again:

| Kind | Formats | Per file | Duration | Per offer, and in the portfolio |
|---|---|---|---|---|
| Image | JPEG, PNG, WebP or HEIC picked; stored as WebP or JPEG | 20 MB picked (checked in the browser), 2 MB stored | | 10 |
| Audio | MP3, M4A/AAC, OGG/Opus | 15 MB | 10 min | 5 |
| Video | MP4 (H.264), WebM | 300 MB | 5 min | 2 |
| PDF | PDF | 10 MB | | 3 |

SVG, HTML, archives, executables, WAV, FLAC, MOV and HEVC video are refused.

**Shared limits:**

- **Quota:** 1 GB (1,000,000,000 bytes) per creative, across offers and
  portfolio. Avatars don't count.
- **Rate limit:** 30 upload tickets per hour per account, shared by every kind
  including images and avatars.
- **Pending uploads:** a ticket reserves its kind's *maximum* size against the
  quota until the upload is confirmed or expires (24 hours). This limits orphaned
  uploads to the quota without needing a separate cap on pending uploads.

**One media table, generalised in place.** `offer_images` gains a `kind` and the
item's facts (type, size, duration, title, owner, review state), with the
upload ticket stored in a new `media_uploads` table:

- `offer_id` becomes optional. An item without an offer is in the creative's
  portfolio.
- The SQL table keeps the name `offer_images` for now. Renaming it safely takes
  two releases and is a follow-up.
- Every read goes through one module that filters by kind, and a source test
  enforces that.

**One bucket per kind**, each with a `file_size_limit` and `allowed_mime_types`,
set by an idempotent script. Images stay in the existing bucket. Video posters
are images and live there too.

**Two ways to upload, both direct from the browser.** Images keep the signed
`PUT` from 0021. Audio, video and PDF use Supabase's resumable (TUS) endpoint,
authorised by the same signed upload token. A dropped connection then resumes
instead of restarting. The TUS client loads only when such an upload starts.

**What the server checks before recording an upload:**

- The size, which must equal the declared size and be within the cap.
- The stored type, which must be on the kind's allowlist.
- The first bytes, which must carry the kind's file signature. This also closes
  the existing image gap.

Duration and video codec are checked in the browser only. The server can't read
them without downloading the file, so the size cap is the hard guarantee.

**Each item is reviewed on its own.** It is public on upload and reviewed
afterwards, as [0008](./0008-publish-immediately-with-tiers.md) requires. An
administrator approves or removes a single item. Review of the offer's text is
unchanged.

**An off switch.** `MEDIA_UPLOAD_KINDS` lists the kinds that accept uploads
besides images. It is empty by default, set on staging first, and set on
production only once Pro is active there. Turning a kind off stops new uploads.
Items already published stay visible.

**The API serves the limits** at `GET /api/v1/media/limits`, so the browser
never keeps its own copy of the numbers. Until a backend with that endpoint is
live, the editor treats the response as missing and offers only images, at
today's limits ([0040](./0040-a-deploy-must-not-break-an-open-tab.md)).

## Alternatives considered

**A separate `media` table, with images left where they are.** Cleaner names and
no risk to existing image reads. Rejected by the product owner, for the same
reason [0022](./0022-offers-replace-portfolio.md) rejected two image concepts:
two places an item can live, and two pipelines to moderate.

**Rename `offer_images` to `media_items` in this work.** Rejected for now. A
rename breaks the old instance that keeps serving during the migration. Doing it
safely takes two releases, which is why it is a follow-up.

**One bucket, with limits enforced only by the API.** Simpler to set up. Rejected
because the project's per-file limit has to rise to 300 MB for video, and a
direct call that skipped the API could then put 300 MB of anything in the image
bucket. Per-kind buckets keep storage's own refusal meaningful.

**A signed `PUT` for every kind.** One upload path. Rejected for video, and for
consistency for audio and PDF: a 300 MB request over mobile data often drops, and
must not restart from zero.

**Transcoding or probing on the server.** It would allow HEVC, MOV and arbitrary
bitrates, and prove duration. Rejected: Render's instance can't hold a 300 MB
file in memory, and a paid media service is a new vendor for a problem the
browser checks and the size cap already bound.

**Supabase image transformations,** now that Pro includes them. Not adopted: the
browser-side sizing works, keeps stored files small, and doesn't depend on an
upstream feature.

**Each kind with its own rate limit.** More generous for images. Rejected by the
product owner in favour of one simple number.

**Counting pending uploads at their declared size,** with a separate cap on
pending uploads. Rejected: the declared size is whatever the browser claims, so
a dishonest client could reserve 1 KB and upload 300 MB.

## Consequences

**Good.**

- Every craft can show its work.
- Storage enforces the per-file limits itself.
- Uploads become checked. The image gap from 0021 closes as part of this work,
  not as a separate fix.
- A media item added after review now reaches the review queue.
- The off switch lets this merge into `main` and reach staging before
  production pays for Pro.

**Bad.**

- **Cost moves from zero to metered.** Pro includes 100 GB of storage and
  250 GB of egress a month. One 300 MB video watched in full 1,000 times uses
  all of that egress. `preload="none"`, and showing the size before play, keep
  each download the viewer's choice. They don't make egress free.
- **Phone video often fails the limits.** A 5-minute 1080p phone video is often
  over 300 MB. iPhones record MOV files, usually in HEVC. Those creatives have to
  export or trim first. The editor says so plainly, but it is friction for the
  people this feature is for.
- **Duration and codec are only as honest as the browser.** A modified client
  can upload a 300 MB, 20-minute file declared as 5 minutes. The size cap still
  holds, and review catches the rest.
- **The table's name misrepresents its contents** until the rename follow-up
  ships.
- **Reserving the maximum makes video uploads need headroom.** A video ticket
  reserves 302 MB until it is confirmed or expires. A creative can have at most
  three video uploads in progress at once, and with more than about 700 MB used
  can't start even a 20 MB video until the quota frees up. The editor shows the
  used / total quota, and says why a video was refused.
- **Unconfirmed uploads are public until they expire.** The buckets are public,
  and the type, size and signature checks run at confirm. An upload that is
  never confirmed stays reachable at its URL until its reservation expires, up to
  24 hours — at most the creative's 1 GB quota of unchecked content served from
  Bilikha's storage. The URLs are unguessable and the bucket still refuses the
  wrong declared type and an oversized file. Expiring stalled uploads sooner is a
  follow-up in the plan.
- **The shared rate limit makes filling a catalogue slow.** Six offers with ten
  images each is 60 tickets, so more than two hours at 30 an hour.
- **Takedowns improve but aren't instant.** Pro's Smart CDN purges the edge copy
  when an object is deleted, which narrows 0021's caveat. Anyone who downloaded
  the file still has it.
- **Music and video raise the stakes on rights.** The terms of use gain a line
  saying you must own or have the rights to what you upload, and the editor
  repeats it. A line isn't enforcement.
