# API reference

Base URL: `/api/v1`

The prefix is versioned from day one so a future mobile wrapper can ship against
a stable contract — see [ADR 0012](../decisions/0012-versioned-api-prefix.md).

> Maintained by hand while the surface is small. Once it stabilises, replace
> this with a generated OpenAPI spec — hand-written API docs drift from the code
> eventually, without exception.

---

## Conventions

**Success** — always wrapped in `data`:

```jsonc
{ "data": { } }
{ "data": [ ], "meta": { "page": 1, "limit": 20, "total": 134 } }
```

**Error** — one shape, produced centrally:

```jsonc
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No creative domain with slug \"nope\"",
    "details": []
  }
}
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request failed schema validation. `details` lists `{ path, message }` per field |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | No such resource, or no such route |
| `CONFLICT` | 409 | Violates a uniqueness or state constraint |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled. `message` is generic in production |

Timestamps are ISO 8601 UTC. IDs are UUID v4.

---

## Health

### `GET /api/v1/health`

Liveness — the process is up. Cheap; safe for a load balancer to poll often.

```json
{ "status": "ok", "uptime": 37.24, "timestamp": "2026-09-15T12:10:20.880Z" }
```

### `GET /api/v1/health/ready`

Readiness — the process is up **and** can reach Postgres. Use this one as a
deployment gate.

`200`

```json
{ "status": "ready", "database": "connected" }
```

`503`

```json
{ "status": "not_ready", "database": "unreachable", "message": "..." }
```

Note this endpoint returns its failure shape directly rather than the standard
error envelope — a readiness probe should describe itself, not raise.

---

## Taxonomy

Reference data. Small, static, and requested on nearly every page.

### `GET /api/v1/taxonomy/domains`

All nine domains with their sub-domains nested, both ordered by `displayOrder`.
Served in one round trip rather than as nested lookups.

```jsonc
{
  "data": [
    {
      "id": "c36524bd-…",
      "slug": "audiovisual-media",
      "name": "Audiovisual Media",
      "description": null,
      "displayOrder": 1,
      "createdAt": "2026-09-15T12:09:33.526Z",
      "updatedAt": "2026-09-15T12:09:33.526Z",
      "subdomains": [
        {
          "id": "a229b84c-…",
          "domainId": "c36524bd-…",
          "slug": "music-composers",
          "name": "Music Composers",
          "singularName": "Music Composer",
          "displayOrder": 1,
          "createdAt": "…",
          "updatedAt": "…"
        }
      ]
    }
  ]
}
```

Currently returns 9 domains and 81 sub-domains.

`name` is the official RA 11904 plural, used wherever the category itself is
meant — filters, pickers, domain listings. `singularName` is the curated label
for **one** offer, posting or creative ("Mobile App Developer"), issue #17.
Every sub-domain object in the API — here, and nested in offers, postings,
profiles and the admin responses — carries both.

### `GET /api/v1/taxonomy/domains/:slug`

One domain with its sub-domains. Same object shape as above.

`404` when the slug does not exist.

### `GET /api/v1/taxonomy/municipalities`

The eight municipalities of Biliran, ordered by name.

```jsonc
{
  "data": [
    {
      "id": "632d7ee7-…",
      "slug": "almeria",
      "name": "Almeria",
      "psgcCode": null,
      "createdAt": "2026-09-15T12:09:33.526Z"
    }
  ]
}
```

`psgcCode` is `null` until populated from the official PSA listing — deliberately
not guessed.

### `GET /api/v1/taxonomy/municipalities/:slug/barangays`

Barangays for one municipality, ordered by name. Returns an empty array when
the PSA list has not been loaded yet — not an error.

```jsonc
{
  "data": [
    { "id": "…", "slug": "poblacion", "name": "Poblacion" }
  ]
}
```

`404` when the municipality slug does not exist.

---

## Auth

Username and password. Sessions are server-side in Postgres, carried by an
httpOnly cookie named `bilikha.sid`. Email and phone are collected but
**unverified** in sprint 1 — contact details only.

### `POST /api/v1/auth/register`

Creates a base account only — a `users` row with no creative profile. Signs the
new user in. Rate limited to 5 attempts per IP per hour. Municipality and
barangay are required (Biliran only —
[ADR 0020](../decisions/0020-location-required-biliran-only.md)). Creative
profile fields are collected later via `POST /me/profile`.

Request body:

```jsonc
{
  "firstName": "Juan",
  "middleName": "Santos",       // optional
  "lastName": "dela Cruz",
  "suffix": "Jr.",              // optional
  "username": "juancruz",
  "email": "juan@example.com",
  "phone": "09171234567",
  "birthDate": "1995-04-12",
  "municipalitySlug": "naval",
  "barangaySlug": "atipolo",
  "password": "correct horse battery",
  "confirmPassword": "correct horse battery",
  "privacyConsent": true,
  "termsAccepted": true
}
```

`barangaySlug` is validated **scoped to** `municipalitySlug`. A barangay that
exists only under another municipality (e.g. Naval + Culaba's `looc`) is a
`400` on `barangaySlug`.

`201`

```jsonc
{
  "data": {
    "id": "…",
    "username": "juancruz",
    "firstName": "Juan",
    "lastName": "dela Cruz",
    "email": "juan@example.com",
    "role": "member",
    "profileSlug": null,
    "profileStatus": null,
    "rejectionReason": null
  }
}
```

| Status | When |
|---|---|
| `400` | Validation failed; unknown municipality / barangay; or mismatched pair |
| `409` | Username, email, or phone already taken; or reserved username |
| `429` | Rate limited |

### `POST /api/v1/auth/login`

```jsonc
{ "username": "juancruz", "password": "correct horse battery" }
```

`200` — same `data` shape as register. Rate limited to 10 failed attempts per
IP per 15 minutes (`skipSuccessfulRequests`).

| Status | When |
|---|---|
| `401` | Incorrect username or password |
| `403` | Account suspended |
| `429` | Rate limited |

### `POST /api/v1/auth/logout`

Destroys the session and clears the cookie. `204` with an empty body.

### `GET /api/v1/auth/me`

Requires a valid session. Returns the same public user shape as login, including
`role`, `viewMode` (`hiring` \| `creative`), `municipalitySlug`,
`municipalityName` (null for legacy accounts that never set a location),
`profileStatus`, and `rejectionReason` (set when a registration was rejected).

`401` when unsigned-in or the session points at a deleted user.

---

## Account

All `/me/*` routes require a signed-in session. They derive ownership from the
session user id; no profile or user id is accepted from the request.

### `PATCH /api/v1/me/view-mode`

```jsonc
{ "viewMode": "hiring" } // or "creative"
```

Persists which side of the market Home, Messages, and History show
([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)).
`creative` requires a creative profile — otherwise `400` with
`field: "viewMode"`. Returns `{ data: { viewMode } }`.

### `GET /api/v1/me/profile`

Returns the signed-in user's creative profile when one exists, including their
own contact details, `contactPreference`, moderation status, rejection reason,
edit-review flag, selected sub-domain slugs, and primary sub-domain slug.
Accounts without a profile receive `{ "data": null }`.

### `POST /api/v1/me/profile`

Creates a creative profile for the signed-in account. Name and location already
live on the user from registration; this body is sub-domains (1–5, one
primary), display name, bio, and contact preference. The profile enters
`pending_review` and appears in the admin queue. No `moderation_actions` row is
written at create — nothing has been moderated yet. Also sets the account's
`viewMode` to `creative` so finishing setup lands on the creative side.

A second call for the same account returns `409`. Unknown taxonomy slugs return
`400`. Location columns on the user are not written here.

### `PUT /api/v1/me/profile`

Replaces the signed-in creative's editable name, profile text, location,
sub-domains, primary sub-domain, and contact preference. Unknown taxonomy slugs
return `400`; accounts without a profile receive `404`.

Public edits follow ADR 0016: a published profile stays published and sets
`editedSinceReviewAt`; a suspended profile returns to `pending_review` and
clears its rejection reason; draft and pending profiles keep their status.
Changing only `contactPreference` does not set the edit-review flag.

### `POST /api/v1/me/password`

```jsonc
{
  "currentPassword": "correct horse battery",
  "newPassword": "a different long password",
  "confirmPassword": "a different long password"
}
```

Verifies the current password before replacing it, regenerates the session id,
and keeps the user signed in. A wrong current password returns `401`. Limited to
five failed attempts per user per hour; successful requests do not consume the
budget.

### `GET /api/v1/me/blocks`

Lists users the caller has blocked (`userId`, `username`, `name`, `createdAt`).

### `POST /api/v1/me/blocks`

```jsonc
{ "userId": "…" }
```

Blocks another user. Idempotent — a second call for the same pair returns
`200`. Blocking yourself returns `400`. Unknown users return `404`.

### `DELETE /api/v1/me/blocks/:userId`

Removes a block. Idempotent when the pair was not blocked.

### `GET /api/v1/me/saved-offers`

Saved offers for the caller, newest first. Each row:

- `id`, `savedAt`
- `offer` — `{ id, title, priceMinCentavos, priceMaxCentavos, image }` where
  `image` is `{ url, thumbUrl }` for the first image by `sortOrder`, or `null`
- `creative` — `{ slug, displayName, municipality, avatarUrl }`

Deleting an offer cascades the save row away.

### `POST /api/v1/me/saved-offers`

```jsonc
{ "offerId": "…" }
```

Saves a **published** offer (creative profile must be `published`). Idempotent —
already saved → `200`; newly saved → `201`. Unpublished or unknown offers →
`400` with `field: "offerId"`.

### `DELETE /api/v1/me/saved-offers/:offerId`

Removes a save. Always `204`, including when the offer was never saved.

---

## Admin

All `/admin/*` routes require an administrator session. Non-admins and signed-out
callers receive `404 NOT_FOUND` — the surface is default-deny and does not
advertise itself.

### `GET /api/v1/admin/profiles`

Paginated review queue. Default `status=pending_review`, oldest first. The
virtual `status=edited` filter returns only published profiles whose
`editedSinceReviewAt` is set, ordered by the oldest edit first.

Query: `status` (`draft`, `pending_review`, `published`, `suspended`, or
`edited`), `page`, `limit` (max 50).

```jsonc
{
  "data": [
    {
      "id": "…",
      "slug": "juancruz",
      "status": "pending_review",
      "editedSinceReviewAt": null,
      "createdAt": "…",
      "firstName": "Juan",
      "lastName": "dela Cruz",
      "username": "juancruz",
      "municipality": "Naval",
      "subdomainCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "status": "pending_review" }
}
```

### `GET /api/v1/admin/profiles/counts`

Counts per status for the queue tabs. `edited` is the count of flagged,
published profiles and is independent of the `published` total.

```jsonc
{ "data": { "pending_review": 3, "published": 1, "suspended": 0, "edited": 1 } }
```

### `GET /api/v1/admin/profiles/:id`

Full registration for review: name, contact details, crafts, and moderation
history (newest first). Contact fields are admin-only.

### `POST /api/v1/admin/profiles/:id/moderate`

```jsonc
{ "action": "approved" }
{ "action": "rejected", "reason": "Please use your real name." }
{ "action": "returned_to_pending" }
{ "action": "acknowledged_edit" }
```

Rejection requires a non-empty `reason`. Each decision writes a
`moderation_actions` row in the same transaction. Rejection sets profile status
to `suspended` and stores the reason for the registrant banner. Acknowledging an
edit clears `editedSinceReviewAt` without changing the published status.

---

### `POST /api/v1/admin/error-check`

No body. Throws on purpose and answers the same generic `500
INTERNAL_SERVER_ERROR` as any bug, so error reporting can be checked on a live
environment without breaking anything real
([ADR 0053](../decisions/0053-errors-are-reported-to-sentry-without-personal-data.md)).
The report arrives as `Deliberate error check, sent by an administrator`, tagged
with the route `/api/v1/admin/error-check` and that environment.

## Creatives (public)

Published profiles only. Unpublished or pending profiles return 404 — the same
status whether the slug is unknown or awaiting review.

Public payloads never include `email`, `phone`, or `birthDate`.

### `GET /api/v1/creatives`

Public. Session-aware, not session-required. Query: `domain`, `subdomain`,
`municipality` (slugs, optional), `page` (default 1), `limit` (default 20,
max 50).

When the caller is signed in and has a municipality, rows from that municipality
lead the list (`createdAt` desc as tiebreaker). Each row then includes
`isNearby: true|false`. Anonymous visitors and accounts with a null municipality
see the previous recency order and no `isNearby` field.

`200` — `{ data: PublicProfile[], meta: { page, limit, total } }`

### `GET /api/v1/creatives/:slug`

`200` — `{ data: PublicProfile }`. `404` when missing or not published.

`PublicProfile`: `slug`, `displayName`, `fullName`, `bio`, `avatarUrl`,
`municipality`, optional `isNearby`, `subdomains[]` (`slug`, `name`,
`singularName`, `domain`, `isPrimary`), `offers[]` (`id`, `title`,
`description`, `priceMinCentavos`, `priceMaxCentavos`, `subdomain` (`slug`,
`name`, `singularName`, `domain`), `images[]` with
`id` / `url` / `thumbUrl` / `sortOrder`), `memberSince`. Directory cards from
`GET /creatives` omit `offers` — the offer listing is `GET /offers`.

---

## Link previews (crawlers)

Public, no session. They answer **HTML, not JSON**: the `<head>` a
link-preview crawler reads, and a single link in the body. `frontend/vercel.json`
sends crawlers here by `User-Agent`; people never reach them
([ADR 0056](../decisions/0056-link-previews-come-from-a-crawler-only-html-endpoint.md)).

Always `200` with `Content-Type: text/html`, `Cache-Control: public, max-age=600`
and `Vary: User-Agent`. Tags: `<title>`, `description`, `canonical`,
`og:site_name`, `og:type`, `og:url`, `og:title`, `og:description`,
`og:image` (absolute; `og:image:width`/`height` for the default image), and
`twitter:card`/`title`/`description`/`image`. `og:url` is the page on this
deployment's site.

Anything the public page would 404 — unpublished, suspended, unknown, or a
malformed offer id — gets the generic Bilikha card, which names nothing about
the item. Its `og:url` and `canonical` stay the shared link itself, never the
home page: Facebook scrapes whatever `og:url` names, so the home page would
replace this card with the SPA's site-wide tags. An unexpected error gets the
same card with `Cache-Control: no-store`.

### `GET /api/v1/share/creatives/:slug`

Title `{name} · {primary craft} in {municipality}`; description the bio
(clipped), or the crafts and municipality; image the avatar (`summary` card) or
`/og-default.png`.

### `GET /api/v1/share/offers/:id`

Title the offer's; description `{price} · {creative}, {municipality}` and the
offer's description (clipped); image the first photo (`summary_large_image`) or
`/og-default.png`.

---

## Conversations

All routes require a signed-in session. Authorisation is by participation: the
caller must be the client or the creative on that thread. Non-participants get
`404` (never `403`, never content). See
[ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md) and
[ADR 0024](../decisions/0024-offers-attach-to-messages.md).

Rate limited to 60 successful writes per user per hour (`POST /`,
`POST /ensure`, and `POST /:id/messages`).

### `POST /api/v1/conversations`

Start or continue a conversation with a **published** profile. Optional
`offerId` is stored on the **message**, not the conversation.

```jsonc
{
  "profileSlug": "juancruz",
  "body": "Looking for a muralist available in October for a ~3m wall in Naval.",
  "offerId": "optional-uuid-when-contacting-from-an-offer"
}
```

`offerId` is optional. When set, the offer must exist and belong to the creative
being contacted; otherwise `400` with `field: "offerId"`. There is no subject —
threads are identified by the other person and last message.

`201` for a new thread, `200` when continuing an existing client↔profile pair
(`body` is appended; a second `offerId` attaches a second card on the new
message). Rejects self-contact (`400`). If the creative has blocked the caller →
`403` with a neutral “cannot be delivered” message. Unpublished slugs → `404`.

Message payloads include `offer` when present: `{ id, title, priceMinCentavos,
priceMaxCentavos, image, available }` (`image` is `{ url, thumbUrl }` or `null`;
`available` is `true` while the offer row exists). Deleting an offer nulls
`messages.offer_id`, so later reads show `offer: null`.

### `POST /api/v1/conversations/ensure`

```jsonc
{ "profileSlug": "juancruz" }
// or, for a creative replying to a posting:
{ "postingId": "uuid" }
```

Get or create the client↔profile thread **without** sending a message. Provide
exactly one of `profileSlug` or `postingId`.

- `profileSlug` — caller is the client; same published / self / block checks as
  `POST /`. Used by Inquire so the composer can attach an offer before the
  client types.
- `postingId` — caller is the creative; posting must be open and unexpired;
  caller must not be the author and must have a creative profile. Creates the
  one-per-pair thread with the posting's author as client.

Returns `{ data: { id } }`.

### `GET /api/v1/conversations`

Thread list for the caller, filtered by `mode` (`hiring` \| `creative`, default
`hiring`). In `hiring`, threads where you are the client; in `creative`, where
you are the creative. Newest `lastMessageAt` first. Query: `mode`, `page`,
`limit`. Each row: `id`, `profileSlug`, `otherPartyName`, `avatarUrl`, `role`
(`client` \| `creative`), `lastMessage`, `unreadCount`, `lastMessageAt`. No
subject.

### `GET /api/v1/conversations/unread-count`

`{ data: { count } }` — messages from the other party newer than the caller's
last-read timestamp.

### `GET /api/v1/conversations/history`

Query: `mode` (`hiring` \| `creative`, default `hiring`).

**Hiring** — inquiry history for the caller **as client**: their own sent
messages that carry an `offer_id`, **grouped by offer** (asking thrice → one
row), newest `lastAskedAt` first. Each row:

- `conversationId`, `lastAskedAt`
- `replied` — true if the creative sent any message in that thread after the
  client's last ask about this offer
- `offer` — card shape as above, or omitted if the offer was deleted
- `creative` — `{ slug, displayName, municipality, avatarUrl }`

**Creative** — postings the caller replied to, grouped by posting, newest
`lastRepliedAt` first. Each row: `conversationId`, `lastRepliedAt`, `replied`
(client messaged after the last reply), `posting` card, `client`
`{ name, avatarUrl }`.

### `GET /api/v1/conversations/:id`

Thread + messages. Includes `otherPartyUserId` and `otherPartyName`. Each
message may include `offer` and/or `posting` (card or `null`), plus
`offerRemoved` / `postingRemoved` when the FK was set but the row is gone. A
posting card carries `subdomainName` (the official plural) and
`subdomainSingularName` (the singular label for one posting, issue #17).
Query: `after` (message uuid, for
polling), `limit`. Non-participants → `404`. No subject.

### `POST /api/v1/conversations/:id/messages`

```jsonc
{
  "body": "Happy to discuss rates this week.",
  "offerId": "optional-uuid-for-a-second-inquiry-in-the-same-thread",
  // or, when a creative replies to a posting:
  "postingId": "optional-uuid"
}
```

`201`. Attach **either** `offerId` or `postingId`, not both. `offerId` must
belong to the conversation's creative profile (`400` with `field: "offerId"`
otherwise). `postingId` must be an open, unexpired posting whose author is the
thread's client, and the caller must be the creative (`400` with
`field: "postingId"` otherwise, including replying to your own posting).
Attached only on this message; never rewrites earlier messages. If the other
party has blocked the caller → neutral `403`. Non-participants → `404`.

### `POST /api/v1/conversations/:id/read`

Marks the caller's side as read up to now.

### `POST /api/v1/conversations/:id/report`

```jsonc
{ "reason": "Unsolicited commercial spam after I said I was not interested." }
```

`201`. Stored as `open` for later admin review. Non-participants → `404`.

---

## Admin media

Admin session required (`403` otherwise).

### `GET /api/v1/admin/media`

Unreviewed avatars and offers (`reviewedAt` null), paginated. Flagged offers
(`flaggedAt` set) sort first; then remaining unreviewed rows by `createdAt`
desc. Each row has `kind` (`avatar` \| `offer`), absolute `url`/`thumbUrl`
when images exist, owner name, and profile slug when present. Offer rows also
include `title`, `description`, `priceMinCentavos`, `priceMaxCentavos`,
`flaggedAt`, and `images[]`.

### `POST /api/v1/admin/media/:kind/:id/review`

`kind` is `avatar` or `offer`. Body `{ "action": "approve" | "remove" }`.
Approve stamps the reviewed timestamp. Remove deletes the avatar object or the
offer (and its storage objects) and writes a `media_removed` moderation action
with `subjectUserId` set to the owner.

### `GET /api/v1/admin/accounts`

`?q=` matches username, email or full name, minimum two characters, capped at
twenty. A lookup rather than a browsable list: it exists to reach a specific
person after a report.

Returns each account's status, role, and creative profile when there is one.

### `POST /api/v1/admin/accounts/:id/status`

Body `{ "action": "suspend" | "reinstate", "reason"?: string }`. A reason is
**required to suspend** and recorded in the moderation history as
`account_suspended` or `account_reinstated`, with `subjectUserId` set — and
`profileId` null when the account has no creative profile.

Suspending ends the account's session on its next request and removes its
profile, offers and postings from every public surface. Reinstating restores all
of it, because visibility is derived from `users.status` rather than copied onto
each row.

Refused with `400`: suspending **yourself**, which would end your own session
and could leave the queue with no administrator; and suspending another
**administrator**, which stays a deliberate act at the database rather than a
button beside everyone else's. Re-applying the current status is a no-op with
`changed: false`.

### `POST /api/v1/admin/accounts/:id/reset-password`

No body. Issues a temporary password for an account that cannot get in, and
returns it:

```json
{ "data": { "id": "…", "username": "juancruz", "temporaryPassword": "Abcd-efgh-jkmn-pqrt" } }
```

**That response is the only time the password exists outside its hash.** It is
not stored, not logged, and not recoverable — calling again mints a different
one and invalidates this one. Sixteen characters from an alphabet with no
look-alikes, because an administrator reads it down a phone line.

Three things happen in one transaction: the password becomes the temporary one,
**every session that account holds is deleted**, and `must_change_password` is
set. Suspension deliberately does not delete sessions — it is enforced per
request ([ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md)) —
but a reset must, because those sessions are credentials issued against a
password that no longer exists.

A `password_reset` row is written to `moderation_actions` with `reason` null.
There is no password in it.

Refused with `400`: resetting **your own** password, which would delete the
session you are using, and resetting another **administrator**, which stays a
deliberate act at the database. Unknown account → `404`. Rate limited to ten
per administrator per hour; over that, `429 RATE_LIMITED`.

Recovery runs through an administrator rather than an emailed link because
nobody has verified the address or number on their account
([ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md)).
Verify who you are talking to out of band first.

### `PASSWORD_CHANGE_REQUIRED` — every authenticated route

Once an administrator has reset an account's password, **every authenticated
route refuses it** with:

```json
{ "error": { "code": "PASSWORD_CHANGE_REQUIRED", "message": "Set a new password before continuing." } }
```

`403`, not `401`: the session is valid, the account simply may not do anything
else yet. Two routes are exempt, because they are what it needs to recover —
`GET /api/v1/auth/me` and `POST /api/v1/me/password`. The latter takes the
temporary password as `currentPassword` and clears the flag, which is what
makes a temporary password single-use in practice.

`GET /api/v1/auth/me` carries `mustChangePassword` so a client can route
straight to the change form instead of discovering this on the next tap.

### `GET /api/v1/admin/taxonomy`

The full domain tree **including archived items**, each with a
`referenceCount` — how many profile, offer, posting and organisation rows point
at it. The
only surface that sees either; the public
[`GET /api/v1/taxonomy/domains`](#get-apiv1taxonomydomains) serves active items
only (ADR 0049).

### `POST /api/v1/admin/taxonomy/domains`

Body `{ "slug", "name", "description"?, "displayOrder"? }`. `201` with the
created domain. A slug is lowercase letters, digits and single hyphens, and is
**permanent from this moment** — it appears in URLs. A slug already in use
returns `409`.

Adding a tenth domain makes Bilikha's data incompatible with every other
RA 11904 registry (constraint 7). The endpoint exists for a statutory revision,
not for routine use.

### `POST /api/v1/admin/taxonomy/subdomains`

Body `{ "domainSlug", "slug", "name", "singularName", "displayOrder"? }`. `201`
with the created sub-domain. Unknown `domainSlug` → `404`; duplicate `slug` →
`409`. `displayOrder` defaults to the end of that domain's list.
`singularName` is required, 2–120 characters after trimming, like `name`: the
label for one offer, posting or creative in the sub-domain (issue #17).

### `PATCH /api/v1/admin/taxonomy/:kind/:slug`

`kind` is `domains` or `subdomains`. Body may carry `name`, `description` and
`displayOrder`; **an empty body is `400`**, and so is any unrecognised key.
A sub-domain also accepts `singularName`; sending it for a domain returns `400`
with `Only a sub-domain has a singular label.` Each edit records the old and new
`name` and `singularName` in the change log.

Sending `slug` returns `400 VALIDATION_ERROR` with
`Unrecognized key: "slug"`. A slug is a public identifier that has been indexed
and shared, so changing one is a data migration and a redirect, not an edit —
the schema is `.strict()` rather than merely ignoring the field, so a caller is
never told a rename worked when it did not (ADR 0049). A wrong slug is fixed by
archiving the item and creating a replacement.

### `POST /api/v1/admin/taxonomy/:kind/:slug/archive`

Takes the item out of every picker and browse surface while leaving the
profiles, offers, postings and organisations that reference it intact, and
leaving its slug
resolvable. **Archiving a domain archives its sub-domains with it**, in one
transaction, each with its own audit row.

A creative whose sub-domain is archived can still save their own profile with
it; nobody else can add it. See
[`PATCH /api/v1/me/profile`](#patch-apiv1meprofile).

### `POST /api/v1/admin/taxonomy/:kind/:slug/restore`

Clears `archivedAt`. Restoring a sub-domain whose domain is still archived is
refused with `409` — it would be restored into invisibility. Restore the domain
first.

### `DELETE /api/v1/admin/taxonomy/:kind/:slug`

Only for an item nothing references. Anything else returns `409` naming the
number of records that point at it and pointing at archiving instead. The
guard is the `ON DELETE RESTRICT` constraint rather than a count read first, so
there is no window in which a registration can slip in between the check and
the delete.

The item's rows in `taxonomy_changes` survive it: `item_slug` is text, not a
foreign key.

### `GET /api/v1/admin/taxonomy/changes`

Paginated audit trail, newest first. Each entry carries `itemKind`, `itemSlug`,
`action` (`created` \| `updated` \| `archived` \| `restored` \| `deleted`),
the administrator's username (null once that account is deleted), and the
`before`/`after` of the fields that moved.

---

## Postings

Client work requests ([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)).
All routes require a signed-in session. Cap: **5 open** postings per account.
Money is integer centavos. Contact-detail patterns in the description set
`flaggedAt` (advisory — never block).

### `GET /api/v1/postings/mine`

Own postings, any status, newest first. Includes `replyCount` (distinct
conversations that carry the posting on a message).

### `POST /api/v1/postings`

```jsonc
{
  "title": "Need a mobile app for barangay records",
  "subdomainSlug": "mobile-app-developers",
  "municipalitySlug": "naval",
  "description": "optional",
  "budgetMinCentavos": 1000000,
  "budgetMaxCentavos": 5000000,
  "expiresInDays": 30
}
```

`201`. `expiresInDays` 1–60, default 30. Budget max must be ≥ min (`400` with
`field: "budgetMaxCentavos"`). Sixth open posting → `400` naming the limit.
Any active sub-domain is valid (clients have no registered set). An archived
sub-domain, or one under an archived domain, → `400` with
`field: "subdomainSlug"` ([ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)).

### `PATCH /api/v1/postings/:id`

Title, description, sub-domain, municipality, budget while you own it. Another
account's id → `404` (never `403`). A posting may keep the archived sub-domain it
already has; switching to a different archived one → `400`.

### `POST /api/v1/postings/:id/close`

Sets `status` to `closed`. Does not delete. Threads keep their posting cards.

### `DELETE /api/v1/postings/:id`

Only while no message carries the posting. Once someone has replied → `400`
telling you to close instead.

### `GET /api/v1/postings`

Creative feed. Requires a creative profile (`403` otherwise). Open, unexpired
postings excluding the caller's own. Query: `domain`, `subdomain`,
`municipality`, `page`, `limit`. Ordered by the caller's registered sub-domains
first, then municipality match, then newest, then id. Each row includes
sub-domain, municipality, client `{ name, avatarUrl }`, `hasReplied`, and
`replyCount` — the same count as `/postings/mine`, so creatives can see how
many others have already replied.

### `GET /api/v1/postings/:id`

Detail. Owner always; others need a creative profile and an open, unexpired
posting (`404` otherwise).

In every posting response, `subdomain` is `{ slug, name, singularName, domain }`.

---

## Offers

Signed-in creatives manage their own offers. Public listing and detail need no
auth (session-aware for nearby ranking, like creatives). Cap: 6 offers per
profile, 4 images per offer.

### `GET /api/v1/offers/mine`

Own offers in `sortOrder`, with images (`url`, `thumbUrl`), subdomain, and
moderation fields (`flaggedAt`, `reviewedAt`). Requires a creative profile.
The sub-domain is flat: `subdomainSlug`, `subdomainName` and
`subdomainSingularName` (the singular label for this one offer, issue #17).

### `POST /api/v1/offers`

```jsonc
{
  "title": "Wedding photography package",
  "subdomainSlug": "photography",
  "description": "optional",
  "priceMinCentavos": 500000,
  "priceMaxCentavos": 1500000
}
```

`201`. Enforces the six-offer cap. Sub-domain must be registered on the
caller's profile — otherwise `400` — and active: an archived one the profile
still holds → `400`, so a new offer never lands under a category no directory
filter shows ([ADR 0049](../decisions/0049-the-database-is-the-taxonomy-source-of-truth.md)).
Published profiles set `editedSinceReviewAt`.

### `PATCH /api/v1/offers/:id`

Any of title, `subdomainSlug`, description, price. Another creative's id →
`404`. An offer may keep the archived sub-domain it already has; switching to a
different archived one → `400`. Changing title, description, or price clears `reviewedAt` (offer stays
live); subdomain-only edits do not. Contact-detail patterns in the description
set `flaggedAt`.

### `DELETE /api/v1/offers/:id`

Deletes images from storage, then the row. Another creative's id → `404`.

### `PUT /api/v1/offers/order`

```jsonc
{ "ids": ["uuid", "uuid"] }
```

Rewrites `sortOrder`. The list must be exactly the caller's current offers.

### `POST /api/v1/offers/:id/images`

```jsonc
{ "objectKey": "offers/<profileId>/<uuid>.webp", "thumbKey": "…-thumb.webp" }
```

`201`. Enforces the four-image cap. Keys must start with
`offers/<callerProfileId>/` (migrated legacy `portfolio/…` keys are never
re-asserted on upload).

### `DELETE /api/v1/offers/images/:imageId`

Deletes both objects, then the row. Another creative's image → `404`.

### `GET /api/v1/offers`

Public. Session-aware, not session-required. Query: `domain`, `subdomain`,
`municipality` (slugs, optional), `budgetMin` / `budgetMax` (pesos as positive
integers, optional; max must be ≥ min), `page` (default 1), `limit` (default 20,
max 50). Only offers whose profile is `published` appear. A budget filter keeps
offers whose price range overlaps and drops "Price on request" rows. When the
caller is signed in with a municipality, nearby creatives' offers lead the list.

### `GET /api/v1/offers/:id`

Public detail for one published offer, including all images and creative
summary. `404` when missing or the profile is not published.

In both offer responses, `subdomain` is `{ slug, name, singularName, domain }`.

---

## Media

Signed-in only. Image bytes never pass through the API — the backend issues a
signed upload URL and later records the object key. The service role key never
appears in responses.

### `POST /api/v1/media/upload-url`

Rate-limited to 40 requests per user per hour.

```jsonc
{ "kind": "avatar" }        // or "offer"
```

`kind: "avatar"` → `{ data: { kind: "avatar", uploadUrl, objectKey } }`

`kind: "offer"` → `{ data: { kind: "offer", full: { uploadUrl, objectKey }, thumb: { uploadUrl, objectKey } } }`

`401` when signed out. `403` when a client account (no creative profile) asks
for an offer ticket.

The browser `PUT`s the resized image to `uploadUrl`, then confirms the key with
a later media or offers endpoint.

### `PUT /api/v1/media/avatar`

```jsonc
{ "objectKey": "avatars/<userId>/<uuid>.webp" }
```

Records the key, clears `avatarReviewedAt`, deletes any previous object, and
flags a published creative profile as edited. `objectKey` must start with
`avatars/<callerUserId>/` — otherwise `403`.

### `DELETE /api/v1/media/avatar`

Removes the object and nulls the column. Also flags a published profile as
edited.

### `POST /api/v1/media/abandon`

```jsonc
{ "objectKey": "offers/<profileId>/<uuid>.webp" }
```

Deletes an object that was uploaded but never recorded — used when an offer
thumb upload fails after the display upload succeeded. Ownership-checked.

---

## Not yet implemented

Listed so the shape of the eventual surface is visible, and so nobody builds a
parallel version:

- **Organisations** — read, create, membership
- **Search** — Postgres-native full-text plus fuzzy name matching
- **Admin report review UI** — reports are stored; the screen is a follow-up
- **Self-service password reset / phone verification** — deferred until an SMS
  gateway is available (ADR 0013)
