# 0021. Image storage, sized in the browser, uploaded directly

- **Status:** Accepted
- **Date:** 2026-09-17
- **Related:** [0008](./0008-publish-immediately-with-tiers.md) ·
  [operating constraints §3](../explanation/constraints.md)

> **Partly superseded by [0022](./0022-offers-replace-portfolio.md).** The
> upload path, the browser-side sizing and the free-tier facts below are
> unchanged. What images attach to is not: portfolio items became offer images,
> and the storage ceiling is recalculated there.

## Context

The directory shows a name, a municipality and some tags. For a photographer,
painter or tattoo artist that is close to useless — the work is the pitch. Images
have been deferred three times: out of scope in
[plan 0004](../plans/0004-client-accounts-and-inquiries.md), a follow-up in
[plan 0005](../plans/0005-profile-editing-and-account.md), deferred again in
[plan 0007](../plans/0007-one-account-and-creative-role.md).

Two constraints shape how they can be added.

[Operating constraints §3](../explanation/constraints.md) records that **images
are the dominant performance risk in this product**, not JavaScript. The audience
is on budget Android over metered data. Unresized 4MB phone photos make the
directory unusable on exactly the devices that matter.

And the free tiers are specific. Supabase Storage gives **1 GB of storage, 50 MB
per file, and 5 GB of egress a month** — but **image transformations and the
Smart CDN are paid features only**. There is no on-the-fly resizing available.

## Decision

**Supabase Storage.** No new vendor, credentials already exist, and the database
is already there.

**Images are resized in the browser before upload, into two fixed sizes:** a
display image at 1600px on the long edge and a thumbnail at 400px. Both are
uploaded. Nothing is ever stored at original resolution.

This is not an optimisation. With no server-side transformation on the free tier
and no image pipeline on Render's free instance, browser-side sizing is the only
place the work can happen.

**Uploads go directly from the browser to storage using a signed URL.** The API
issues the URL and records the object key afterwards; image bytes never pass
through Render.

**Images are visible immediately and reviewed afterwards**, following
[0008](./0008-publish-immediately-with-tiers.md). They appear in an admin media
queue and can be removed. Shipping a review gate in front of uploads would
reproduce the backlog problem 0008 rejected.

**Limits:** ten portfolio items per profile, one avatar, and a post-compression
ceiling enforced when the upload is finalised.

## Alternatives considered

**Cloudflare R2.** 10 GB storage and **zero egress charges**, which is
materially better long-term. Rejected for now only because it is another vendor,
another credential, and another dashboard, and 5 GB of egress is ample at
current traffic. This is the documented migration path, not a closed door.

**Store on the Render instance.** Rejected outright: the free tier has no
persistent disk, so uploads would vanish on every deploy.

**Upload through the API and resize server-side with sharp.** The conventional
approach. Rejected on the instance: 512 MB of RAM, spins down when idle, and
image bytes would consume both its memory and its bandwidth. Browser-side sizing
moves that cost to the device that already holds the photo.

**Store one size and resize on read.** Requires transformations, which are paid.
Revisit if Supabase is ever upgraded.

**Review images before they appear.** Safer, and rejected for the reason
[0008](./0008-publish-immediately-with-tiers.md) gives: a queue nobody is staffed
to clear means nothing ever publishes.

## Consequences

**Good.** No new vendor. Render never touches image bytes, so the free instance
is unaffected by upload traffic. Every stored image is already small, so the
metered-data audience is protected by construction rather than by a later
optimisation. Two fixed sizes mean the directory can load thumbnails and the
profile page the display image.

**Bad.** Resizing depends on the browser. A very old device may be slow at it,
and a client with JavaScript disabled cannot upload at all — acceptable, since
the rest of the app is a SPA.

Fixed sizes cannot be changed retroactively. Re-deriving a new size later means
re-processing every original, and **originals are not kept**. Choosing 1600 and
400 now is a commitment.

**The ceilings are real and will arrive.** At roughly 290 KB per portfolio item
across both sizes, 1 GB holds about 3,400 images — perhaps 340 profiles with
full portfolios. 5 GB of egress is roughly 20,000 image loads a month. Neither
is close today; both are foreseeable, and R2 is the answer when they arrive.

**Images visible before review** is a real exposure, and the admin media queue is
the only thing catching it. There is still no report button on profiles, so
discovery depends on an administrator looking.

**A takedown does not reach the CDN.** Measured against the live bucket: after
`deleteObject` succeeds and the object is genuinely gone — a storage listing
confirms it — the public URL still returns 200 from the Cloudflare edge with
`cf-cache-status: HIT`. The same URL with a cache-busting query string returns
400. Purging the edge is part of the Smart CDN, which is paid.

So removing an image takes it out of the application immediately, but anyone
who already holds the exact URL can keep fetching it until the edge copy
expires. Object keys are random UUIDs and are never reused, so this only affects
someone who already had the link — but for the abusive-image case, that is
precisely who has it. This is the strongest argument for moving to R2, where we
would control invalidation.
