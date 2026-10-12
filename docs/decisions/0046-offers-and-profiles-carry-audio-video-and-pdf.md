# 0046. Offers carry audio, video and PDF, through one checked upload pipeline

- **Status:** Proposed
- **Date:** 2026-10-06, revised 2026-10-12
- **Supersedes:** the images-only scope and free-tier budget of
  [0021](./0021-image-storage-and-upload-path.md). Its browser-side image
  sizing and direct upload stand.
- **Amends:** [0022](./0022-offers-replace-portfolio.md): ten images per offer
  instead of four, and an offer can hold audio, video and PDF
- **Related:** [plan 0057](../plans/0057-upload-pipeline-and-offer-media.md) ·
  [0058](./0058-content-waits-for-approval-beside-what-is-public.md) ·
  [0057](./0057-new-accounts-are-verified-with-a-biliran-id.md) ·
  [0040](./0040-a-deploy-must-not-break-an-open-tab.md) ·
  [0037](./0037-one-definition-of-an-api-shape.md) ·
  [operating constraints](../explanation/constraints.md) ·
  [issue #34](https://github.com/ELITES-ORG/bilikha/issues/34) ·
  [issue #66](https://github.com/ELITES-ORG/bilikha/issues/66)

## Context

A creative can only show images. Songwriters, composers, filmmakers, performers
and writers have nothing that fits their craft (#34). Message attachments (#66)
need the same machinery with private files. [0021](./0021-image-storage-and-upload-path.md)
kept uploads to images for the Supabase free tier: 1 GB of storage, 50 MB per
file and 5 GB of egress a month. Both projects are moving to Supabase Pro.

The other constraints still apply:
- Visitors are on budget Android phones and metered data.
- Render's free instance has 512 MB of RAM and cannot transcode.
- Migrations run while the old instance is still serving.
- Nothing new is public until an administrator approves it
  ([0058](./0058-content-waits-for-approval-beside-what-is-public.md)).

The first version of this record, from 2026-10-06, made each item public on
upload with a review afterwards, and added a profile-level portfolio. 0058
retired the first idea. The product owner dropped the second, and decided on
2026-10-10 to build the upload pipeline once, ahead of both #34 and #66.

## Decision

**One upload pipeline, keyed by destination and kind.** A single limits table
in the backend, served to the browser at `GET /api/v1/media/limits`, says what
each destination accepts. `offer` is the first destination. #66 adds `message`,
with a private bucket, by adding a row, not by changing the pipeline.

**For offers, four kinds, each with its own limits:**

| Kind | Stored types | Per file | Duration | Per offer |
|---|---|---|---|---|
| Image | WebP or JPEG (JPEG, PNG, WebP or HEIC picked) | 2 MB stored, 20 MB picked | | 10 |
| Audio | MP3, M4A/AAC, OGG/Opus | 15 MB | 10 min | 5 |
| Video | MP4 (H.264), WebM | 300 MB | 5 min | 2 |
| PDF | PDF | 10 MB | | 3 |

SVG, HTML, archives, executables, Office files, WAV, FLAC, MOV and HEVC video
are refused. MB means 1,000,000 bytes.

**Shared limits:**
- **Quota:** 1 GB per creative across their offers.
- **Rate limit:** 30 upload tickets per hour per account, shared with avatars,
  organisation logos and ID photos.
- **Reservations:** a ticket reserves its kind's maximum size until the upload
  is confirmed or expires after 24 hours, so a dishonest declared size cannot
  outrun the quota.

**Storage enforces the limits too.** Each kind has its own bucket with a size
limit and an allowed-types list, set by an idempotent script. Images and video
posters stay in the existing bucket. The pipeline chooses a bucket by
destination and kind, and supports private buckets.

**Two transports, both direct from the browser:**
- Images keep the signed `PUT`.
- Audio, video and PDF use Supabase's resumable (TUS) upload, authorised by the
  same signed upload token. A dropped mobile connection resumes instead of
  restarting.
- The TUS client loads only when such an upload starts.

**Nothing is recorded unchecked.** Before attaching an upload, the server reads
the stored object and requires:
- its size to equal what was declared and to be within the cap;
- its type to be on the kind's list;
- its first bytes to carry the type's file signature.

This also closes 0021's gap, where an image key was recorded without looking at
what was stored. Duration and video codec are checked in the browser only. The
size cap is the hard guarantee.

**Review follows 0058.**
- An item added to an offer not yet published is part of that offer's first
  review.
- On a published offer, an added item waits beside the public version, and so
  does a removal, until an administrator approves or rejects the change.
- There is no per-item review and no administrator "remove" of approved media:
  reports and suspension remain the way to take approved content down.

**An off switch.** `MEDIA_UPLOAD_KINDS` lists the kinds that accept uploads
besides images.
- It is empty by default.
- It is set on staging first, and on production once Pro is active there.
- Turning a kind off stops new uploads; published items stay.
- Until a backend with the limits endpoint is live, the editor offers only
  images, at the old limits (0040).

## Alternatives considered

**A separate table for media, with images left where they are.** Rejected by
the product owner, for the same reason 0022 rejected two image concepts: two
places an item lives, and two pipelines to moderate. `offer_images` gains a
`kind` instead, and keeps its name.

**Build the pipeline inside #34 and reuse it for #66.** Rejected: the first
feature to land would fix the pipeline's shape for the other, and its pull
request would grow too large to review.

**A signed `PUT` for every kind.** Rejected: a 300 MB request over mobile data
often drops, and must not restart from zero.

**One bucket, with the limits enforced only by the API.** Rejected: once the
project's per-file limit rises for video, a call that skips the API could put
300 MB of anything in the image bucket.

**Transcoding or probing on the server.** Rejected: Render cannot hold a
300 MB file, and a paid media service is a new vendor for a problem the browser
checks and the size cap already bound.

**Public on upload, reviewed afterwards** (this record's first version).
Superseded by 0058.

**A profile-level portfolio.** Dropped for now: it has no review path under
0058. It can return as its own issue.

## Consequences

**Good.**
- Every craft can show its work, and storage enforces the limits itself.
- Uploads are checked before they are recorded, images included.
- #66 reuses the pipeline and adds only its destination.
- The off switch lets every pull request merge before production pays for Pro.

**Bad.**
- **Cost moves from zero to metered.** One 300 MB video watched in full 1,000
  times uses Pro's monthly egress. `preload="none"` and the size shown before
  play keep each download the viewer's choice.
- **Phone video often fails the limits.** iPhones record MOV, usually HEVC, and
  a 5-minute 1080p video is often over 300 MB. Those creatives must export or
  trim first. The editor says so plainly.
- **Duration and codec are only as honest as the browser.** The size cap still
  holds, and review catches the rest.
- **Reserving the maximum needs headroom.** A video ticket reserves 302 MB until
  it is confirmed or expires.
- **Unconfirmed uploads sit in public buckets until they expire** (up to 24
  hours, within the uploader's quota). Their URLs are unguessable and never
  shown. Expiring them sooner is a follow-up.
- **The shared rate limit makes filling a catalogue slow:** 60 images is more
  than two hours at 30 an hour.
- **Music and video raise the stakes on rights.** The terms gain a line saying
  you must own or have the rights to what you upload, and the editor repeats
  it. A line is not enforcement.
