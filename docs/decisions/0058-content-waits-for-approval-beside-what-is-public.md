# 0058. Offers and images wait for approval, beside what is already public

- **Status:** Accepted
- **Date:** 2026-10-11
- **Supersedes:** the image and offer part of [0008](./0008-publish-immediately-with-tiers.md)
  — "uploaded images reviewed by a human within 24h, with fast takedown"
- **Amends:** [0030](./0030-notifications.md) — four notification types ·
  [0016](./0016-edits-never-unpublish.md) — offers and photos no longer flag
  the profile
- **Related:** [0016](./0016-edits-never-unpublish.md) ·
  [0022](./0022-offers-replace-portfolio.md) ·
  [plan 0055](../plans/0055-approve-before-public.md)

## Context

Under ADR 0008 an offer, a profile photo and an organisation logo went live the
moment they were saved, and an administrator looked at them afterwards in the
media queue. The queue's only actions were **Approve** (clear it from the queue)
and **Remove** (take it down). Remove deleted an offer outright — title, price,
description and every photo — with no confirmation, no reason and no word to
the creative. Their work simply vanished.

Using the queue made the gap plain: the administrator's mental model was "this
is where we decide whether a post appears on the directory", and that is a
reasonable model for a registry that carries the province's name. ADR 0008 had
already named holding content until approval as "the fallback position".

## Decision

**Nothing new is public until an administrator approves it.** That covers a new
offer, a change to an offer, a new profile photo and a new organisation logo.

**What is already public stays public while a change waits.** A published offer
keeps showing its approved version; the edit — text, added photos, removed
photos — waits beside it. Approving swaps the change in. Rejecting drops it, and
the published offer stays exactly as it was. A new photo or logo waits in a
pending slot the same way, seen only by its owner, and replaces the approved one
only when approved. This keeps ADR 0016's promise that editing never takes
anything down.

**A rejection always has a reason, and its owner is told.** The reason is shown
where they act on it — on the offer, under the photo, on the organisation's
page — and in a notification. A rejected new offer stays hidden until its
creative changes it, which sends it back for review; nothing they wrote is lost.

**A decision never deletes the creative's work.** The only files deleted are
those of a change that will never be shown: photos added in a rejected change,
or a photo replaced by an approved one.

**Content that was public but never reviewed goes into the queue, hidden**, when
this ships. Content an administrator already approved stays public.

### How it is stored

- `offers.status`: `pending_review` → `published`, or `rejected` with
  `rejection_reason`. Only `published` offers appear anywhere public: the
  directory, search, the offer page, the profile page, saved offers, a
  conversation's offer card, link previews.
- `offer_revisions`: one waiting change per published offer. Editing again
  updates it; an edit back to the published values withdraws it.
- `offer_images.state`: `live`, or for a published offer `pending_add` (unseen
  until approved) and `pending_remove` (still public until approved).
- `users.avatar_pending_key` and `organizations.logo_pending_key`, beside the
  approved key, with a rejection reason each.
- The order of a creative's offers is theirs to change at once: it changes no
  content.
- A new offer, a change to an offer and a new photo no longer set the profile's
  `edited_since_review_at` (ADR 0016's **Edited** tab). They have their own
  review.

### Notifications (amends ADR 0030)

| Event | Who is told |
|---|---|
| An offer, or a change to one, approved | its creative |
| An offer, or a change to one, not approved — with the reason | its creative |
| A new profile photo not approved — with the reason | its owner |
| A new organisation logo not approved — with the reason | the founder |

An approved photo or logo needs no message: it simply appears. The reason is
read from the item when the notification centre opens, never copied into the
notification, as ADR 0030 requires.

## Alternatives considered

**Keep publishing first, and make Remove ask for a reason.** The smallest
change, and it keeps the directory filling during a registration drive — ADR
0008's original argument. Rejected by the product owner: content that carries
the registry's name should be seen by an administrator before the public sees
it.

**Hide a published offer while its edit waits.** Strictest, and simpler to
store. Rejected: fixing a typo would take an offer off the directory for hours,
and a client mid-conversation would find it gone. It would also break ADR 0016.

**Show initials while a replacement photo waits.** Simpler: no pending slot.
Rejected for the same reason — a profile should not lose its face because its
owner tried a better photo.

**Delete a rejected offer, with a notice.** Rejected: the creative loses what
they wrote, and the usual fix is a small change.

## Consequences

**A new creative's offers are not visible until reviewed**, which makes the
review queue a dependency of a registration drive: someone must work it daily.
The queue sorts flagged items (contact details in a description) first and the
rest oldest first.

**Every public read of offers filters on status**, and every new one must. The
owner's own views read the waiting version too; nothing else may.

**Taking down something already approved is not part of this queue.** The queue
only holds what waits for a decision. Reports and suspension remain the way to
remove approved content.

**`users.avatar_reviewed_at` and `organizations.logo_reviewed_at` are kept but
no longer decide anything**; a later migration can drop them.
