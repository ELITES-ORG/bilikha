# 0060. Message files are private, and photos, audio and video expire after 30 days

- **Status:** Proposed
- **Date:** 2026-10-14
- **Related:** [0046](./0046-offers-and-profiles-carry-audio-video-and-pdf.md) ·
  [0029](./0029-work-agreements-not-invoices.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0018](./0018-conversations-replace-one-shot-inquiries.md) ·
  [0057](./0057-new-accounts-are-verified-with-a-biliran-id.md) ·
  [plan 0060](../plans/0060-message-attachments.md) ·
  [issue #66](https://github.com/ELITES-ORG/bilikha/issues/66)

## Context

A message carries text and at most one link each to an offer, a posting and a
work agreement. People need to send files — a reference photo, a draft logo, a
demo track, a rough cut, a quote as a PDF — and today they leave for Messenger
to do it, taking the record of what was agreed with them.

reyxdz settled the product on 2026-10-10 (#66): images, audio, video and PDF;
the per-file caps of offers except a shorter chat video (100 MB, 3 minutes);
five files a message; and photos, audio and video kept for 30 days, with
notice to both people.

Three things were already true:

- [ADR 0046](./0046-offers-and-profiles-carry-audio-video-and-pdf.md) built one
  upload pipeline keyed by destination and kind, and said #66 adds `message`
  "by adding a row, not by changing the pipeline".
- [ADR 0029](./0029-work-agreements-not-invoices.md) made `agreement_id` the
  third attachment column on `messages` and drew a line: **a fourth attachment
  type means designing this properly, not another column**.
- [ADR 0057](./0057-new-accounts-are-verified-with-a-biliran-id.md) already
  keeps private files — ID photos — in a private bucket read through signed
  URLs, and deletes them on an hourly timer inside the API.

A conversation is private between two people (RA 10173). A public URL can be
forwarded or guessed, so nothing here may live in the public `media` bucket.

## Decision

**Files are rows of their own, not a fourth column.** `message_attachments`
holds up to five files per message: `message_id` (`ON DELETE CASCADE`), `kind`,
`object_key`, `thumb_key` (an image's thumbnail or a video's poster),
`mime_type`, `size_bytes`, `duration_seconds`, `created_at`, `expires_at` and
`file_deleted_at`. ADR 0029's three columns point at rows that exist elsewhere;
these are files the message owns, so a child table keeps a real foreign key and
answers the line ADR 0029 drew. A message with a file may have an empty body.

**`message` is a destination in the pipeline's limits table.** Its row carries
#66's limits: image 2 MB stored (20 MB picked), audio 15 MB and 10 minutes,
video 100 MB and 3 minutes, PDF 10 MB — and **five files a message, any mix**.
A ticket is issued against a conversation the caller is in, after the same
checks as an offer's (type, size, duration, rate limit) plus the conversation's:
a participant, not blocked by the other person, not over five files pending in
that conversation. The send step verifies and consumes the tickets inside the
transaction that writes the message, as an offer's attach step does. There is
no storage quota for messages: expiry bounds what photos, audio and video cost,
and a PDF is 10 MB at most.

**Private buckets, one per kind.** `{bucket}-messages`, `-messages-audio`,
`-messages-video` and `-messages-documents`, each private with its own
`file_size_limit` and `allowed_mime_types`, configured by `media:buckets`. Per
kind, as offers are, because Supabase enforces size and type per bucket.

**Reads go through the API, one file at a time.** The thread returns what a
file is — kind, type, size, duration, and when it expires — never a URL. The
browser asks `GET /conversations/:id/attachments/:attachmentId/url` for a
thumbnail or the file when it is about to show or play it, and gets a signed
URL that lasts at most five minutes and never past `expires_at`. Only the two
participants are answered; a suspended account is refused by the per-request
check (ADR 0028). Polling the thread (ADR 0018) therefore downloads nothing, and
nothing larger than a thumbnail moves until someone taps it.

**Expiry is decided when a file is read.** `expires_at` is `created_at` plus 30
days for photos, audio and video, and null for a PDF. From that instant the API
issues no URL, whatever any job has or has not done. A sweep on the API's hourly
timer — beside the ID retention pass — deletes expired objects, stamps
`file_deleted_at`, and sends the three-day notice to **both** participants, at
most one per conversation per day. The sweep is best-effort and idempotent: a
late or repeated run changes nothing a reader sees. `npm run messages:sweep`
runs it by hand.

**An administrator sees files only through a report.** The report view lists
the reported conversation's attachments and issues the same short URLs. There
is no other admin path to a message file.

**Off in production until the buckets exist.** `MESSAGE_ATTACHMENTS` (default
off) gates the ticket and the composer's attach button, as
`MEDIA_UPLOAD_KINDS` gated offer media. Files already sent stay readable when it
is off.

## Alternatives considered

**A fourth nullable column on `messages`.** Rejected by ADR 0029 itself, and it
holds one file where #66 needs five.

**Message files in the public offer buckets under unguessable keys.** Rejected:
an unguessable key is still a public URL once copied, it cannot be revoked at 30
days, and RA 10173 asks for more than obscurity for a private conversation.

**Signed URLs inside the thread response.** Simpler for the browser, and it
would sign every thumbnail and file on every poll — a storage call per file per
refresh, and URLs that expire while the page is open. Rejected.

**Expiry enforced only by deleting the objects.** Rejected: the only scheduler
the API has is its own timer, which does not run while Render is asleep, and
GitHub's scheduled workflows run hours late (`keep-awake.yml`). A deadline that
depends on either is not a deadline.

**A storage quota per account, as offers have.** Rejected for now: expiry
bounds the cost of everything but PDFs, and a quota would refuse a file in the
middle of a negotiation for reasons the sender cannot see. Revisit if PDFs grow.

## Consequences

**Easier.** People can exchange the files a hire needs without leaving the
record. The pipeline gains a destination without changing its shape. Expiry
holds even if the sweep stalls, and the thread poll stays as cheap as it is.

**Harder.** Every file read is an API round trip, and the browser must refresh
a URL that lapses after five minutes. Photos, audio and video vanish after 30
days; the thread keeps a placeholder saying what was there and when it went, and
the notices are the only warning. Four more buckets to configure per
environment.

**Costs.** Supabase Pro on production before release, as for offer media: the
free tier caps a file at 50 MB. The sweep adds a notification type,
`attachment_expiring`.
