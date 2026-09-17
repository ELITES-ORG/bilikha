# 0028. Suspension is enforced per request, and content is hidden by derivation

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0004](./0004-unified-account-model.md) ·
  [0013](./0013-username-password-auth-sprint-1.md) ·
  [0021](./0021-image-storage-and-upload-path.md) ·
  [0025](./0025-client-postings-and-mirrored-home.md)

## Context

`users.status` has existed since the unified account model
([0004](./0004-unified-account-model.md)), and login refused a suspended
account. Nothing else did.

`requireAuth` checked only that a session carried a `userId`. Sessions live for
30 days. So an account suspended at any point kept every write it already had —
posting work, sending messages, editing its profile, uploading images — until
its session happened to expire. Suspension meant "cannot sign in again", not
"cannot act", which is not what the word means to the administrator clicking it.

This surfaced from a report that turned out to be about something else. Someone
whose creative profile was still `pending_review` could post work, which looked
like a hole. It is not: `user_status` is only `active | suspended`, and
[0019](./0019-one-account-creative-as-attachable-role.md) makes the account
live at registration while review applies to the creative profile alone. Posting
work is a client action, and the client side was never under review.

What was wrong there was the wording. The banner read "Your registration is
being reviewed", which describes the whole account being held, so the correct
behaviour read as a bug. That copy was fixed in the same change.

Looking for the flaw it described is what found the real one above.

There is a second half. Even with writes stopped, a suspended account's
*existing* work stayed visible: their profile in the directory, their offers in
the offer index, their postings on every creative's Home. Taking someone off the
platform while leaving their work in the shop window is not a suspension.

## Decision

**`requireAuth` reads the account's current status from the database on every
request.** No caching in the session. A suspension takes effect on the
suspended person's next click, not on their next sign-in.

The session is destroyed at the same moment, so the browser stops presenting
credentials that will only be rejected.

**It answers 401, not 403.** `GET /auth/me` sits behind this guard, and the
client treats 401 as "signed out" and 403 as an error screen. A suspended person
should land on the signed-out site, not on a stack trace. The comment in
`require-auth.ts` says so, because the status code looks wrong until you know
which route it is protecting.

**`requireAdmin` applies the same test**, so suspending an administrator — which
`setAccountStatus` refuses anyway — could not leave them holding the admin area.

**Every public read path checks the owner's status.** Eight places: the creative
directory and a single profile, the offer index and a single offer, the postings
feed and a single posting, saving an offer, and starting a conversation. Most
reach it by `innerJoin` on `users` with `status = 'active'` in the `WHERE`;
`getPostingById` and `requireContactableProfile` resolve one row and test
`status` directly. All of them fail the way a missing row does — `404`, never a
message that confirms the account exists.

**Nothing is copied.** No column is flipped on `creative_profiles`, no row is
moved, no offer is marked hidden. Visibility is *derived* from the owner's
status at read time.

**An administrator can do this from the product**, at `/admin/accounts`:
look up by username, email or name, suspend with a required reason, reinstate.
`setAccountStatus` refuses self-suspension and refuses to suspend another
administrator, and writes `account_suspended` / `account_reinstated` into
`moderation_actions` with `subject_user_id` set — the account is the subject,
not a profile, because a client being suspended has no profile.

## Alternatives considered

**Cache the role and status in the session.** One database read saved per
request. Rejected: it reintroduces exactly the delay this ADR exists to remove,
and the window is as long as the session — up to 30 days. The read is a primary
key lookup on a connection that is already open.

**Return 403 for a suspended account.** More honest as a status code. Rejected
on the `/auth/me` behaviour above: it would show an error screen where the
correct outcome is the signed-out site. The comment in the middleware carries
the reason so the next reader does not "fix" it.

**Cascade a status change onto the content.** Set `creative_profiles.status =
'suspended'`, mark the offers, close the postings. Tempting, because each read
path then stays as it is. Rejected: reinstatement has to undo it exactly, and it
cannot — a profile that was `draft` before the suspension must not come back
`published`, and a posting that had already expired must not reopen. Every
copied flag is a second source of truth that has to be restored perfectly.
Deriving from one column makes reinstatement free and total, which is how it was
verified: visible, then hidden, then fully restored.

**A `WHERE` clause per call site, without the join.** Rejected: `users.status`
is not on `creative_profiles`, `offers` or `postings`, so there is nothing to
filter without reaching the owner.

## Consequences

**Good.** Suspension means what the word means. It applies within one request,
it covers reads and writes together, and it is completely reversible because
nothing was destroyed to apply it. An administrator can do it without a database
console.

**Good.** Any account-level status added later needs no new call sites — only a
change to what counts as "active".

**Bad.** One extra query on every authenticated request. It is indexed and
small, but it is on the hot path, and it will look like an easy saving to
whoever profiles this next. That is the main reason this ADR exists.

**Bad.** Eight read paths must each remember the check. A ninth public surface
added without it silently leaks suspended content, and nothing fails loudly to
say so. The postings feed needed the join on both the rows query and its count
query — a count that disagrees with its page is the shape this bug takes.

**Watch for.** Threads that already exist. A suspended creative disappears from
the directory, but a client who had messaged them still holds the conversation.
Messaging is guarded by the per-request check on the suspended side, so they
cannot reply — but the client is not told why the replies stopped.
