# 0061. A cover is a reviewed profile image, stored at two fixed widths

- **Status:** Accepted
- **Date:** 2026-10-22
- **Amends:** [0030](./0030-notifications.md) — a fifth content-review
  notification
- **Related:** [0021](./0021-image-storage-and-upload-path.md) ·
  [0058](./0058-content-waits-for-approval-beside-what-is-public.md) ·
  [0059](./0059-the-admin-area-is-organised-by-subject.md) ·
  [plan 0061](../plans/0061-a-cover-photo-on-the-creative-profile.md) ·
  [issue #36](https://github.com/ELITES-ORG/bilikha/issues/36)

## Context

The band at the top of a creative's profile page is navy because there was no
image to put there ([plan 0042](../plans/0042-the-creative-profile-page.md)).
Creatives asked to fill it with a photo of their own work (issue #36).

The band is wide and short: about 2.6:1 on a phone, 4:1 on a desktop. A
phone in Biliran is often on prepaid data, so it must not download an image
sized for a desktop (constraints §3). Since
[0058](./0058-content-waits-for-approval-beside-what-is-public.md), nothing new
is public until an administrator approves it, and since
[0059](./0059-the-admin-area-is-organised-by-subject.md), each decision is made
in its subject's section of the admin area.

## Decision

**A cover is stored at two fixed widths: 1920px and 768px.** The browser fits
the width and keeps the photo's own height, as
[0021](./0021-image-storage-and-upload-path.md) does for its 1600px and 400px
sizes; a photo under 1200 × 400 is refused before upload. These widths are a
commitment in the same way: changing them means re-encoding every stored
cover. Each file must be within **2 MB**, the limit an offer photo has, and the
API checks the stored files — their size and their file signature, WebP or
JPEG — before recording them, deleting a pair that fails.

**The profile page picks the width with `<picture>` and a media query:** a
screen under 40rem gets 768px, anything wider 1920px. A width descriptor in
`srcset` would let a 3× phone choose the 1920px file.

**A new cover waits for review, like a profile photo
([0058](./0058-content-waits-for-approval-beside-what-is-public.md)).** It sits
in a pending pair beside the approved pair. The public keeps seeing the
approved cover, or the navy band, until an administrator approves the new one.
Rejecting needs a reason; the waiting pair is deleted, the approved cover
stays, and the creative is told. The owner can withdraw a waiting cover, or
take down the approved one, without review.

**Covers are decided under Creatives, in a Covers tab
([0059](./0059-the-admin-area-is-organised-by-subject.md)).** A cover belongs
to the creative profile, so it sits with that subject, as a logo sits with its
organisation.

**A rejected cover sends `cover_rejected`,** a fifth content-review
notification beside the four of
[0058](./0058-content-waits-for-approval-beside-what-is-public.md). This amends
[0030](./0030-notifications.md). As 0030 requires, the reason is read from the
profile when the notifications open. An approved cover sends nothing: it simply
appears.

**A cover never marks the profile as edited.** It has its own review, so it
does not also put the profile in the Edited tab.

**A cover uses the profile photo's upload route**, a signed upload followed by a
confirm, not the reservation pipeline of
[plan 0057](../plans/0057-upload-pipeline-and-offer-media.md). A cover is one
slot on a profile, like a photo or a logo; the pipeline is built for targets
that hold many files, with a quota.

## Alternatives considered

**`srcset` with `sizes`.** The usual responsive image. Rejected: it lets the
browser weigh pixel density, so a 375px phone at 3× would download the 1920px
file — the cost this decision exists to avoid.

**One stored size.** Simpler storage. Rejected: one file must be either too
large for a phone or too small for a desktop.

**Live first, reviewed afterwards.** How covers were first planned, under
[0008](./0008-publish-immediately-with-tiers.md). Rejected: superseded by
[0058](./0058-content-waits-for-approval-beside-what-is-public.md) for every
other image a creative adds.

**The upload-ticket pipeline.** It checks stored files and counts a quota.
Rejected for now: covers alone would move to it while profile photos and logos
stay on their own route. All three can move together later.

**Covers under People.** People holds profile photos, the nearest kind of image.
Rejected: a profile photo belongs to an account, whether client or creative; a
cover belongs to a creative profile.

## Consequences

**Storage grows by about 400 KB per creative with a cover**, and twice that
while a replacement waits for review.

**The review queue has one more kind to work**, and the Creatives badge counts
it.

**A removed cover can outlive its removal in a CDN cache**, as
[0021](./0021-image-storage-and-upload-path.md) records for every public image.

**The confirm costs two storage reads per file** (its listing and its first
bytes), which the avatar's route does not pay.
