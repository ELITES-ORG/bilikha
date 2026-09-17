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
`role`, `municipalitySlug`, `municipalityName` (null for legacy accounts that
never set a location), `profileStatus`, and `rejectionReason` (set when a
registration was rejected).

`401` when unsigned-in or the session points at a deleted user.

---

## Account

All `/me/*` routes require a signed-in session. They derive ownership from the
session user id; no profile or user id is accepted from the request.

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
written at create — nothing has been moderated yet.

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
`municipality`, optional `isNearby`, `subdomains[]` (`slug`, `name`, `domain`,
`isPrimary`), `offers[]` (`id`, `title`, `description`, `priceMinCentavos`,
`priceMaxCentavos`, `subdomainSlug`, `subdomainName`, `images[]` with
`id` / `url` / `thumbUrl` / `sortOrder`), `memberSince`. Directory cards from
`GET /creatives` omit `offers` — the offer listing is `GET /offers`.

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
```

Get or create the client↔profile thread **without** sending a message. Same
published / self / block checks as `POST /`. Returns `{ data: { id } }`. Used by
Inquire so the composer can attach an offer before the client types.

### `GET /api/v1/conversations`

Thread list for the caller (as client or creative). Newest `lastMessageAt`
first. Query: `page`, `limit`. Each row: `id`, `profileSlug`, `otherPartyName`,
`avatarUrl`, `role` (`client` \| `creative`), `lastMessage`, `unreadCount`,
`lastMessageAt`. No subject.

### `GET /api/v1/conversations/unread-count`

`{ data: { count } }` — messages from the other party newer than the caller's
last-read timestamp.

### `GET /api/v1/conversations/history`

Inquiry history for the caller **as client**: their own sent messages that carry
an `offer_id`, **grouped by offer** (asking thrice → one row), newest
`lastAskedAt` first. Each row:

- `conversationId`, `lastAskedAt`
- `replied` — true if the creative sent any message in that thread after the
  client's last ask about this offer
- `offer` — card shape as above, or `null` if the offer was deleted between
  grouping and load (deleted offers normally vanish because `offer_id` is
  `SET NULL`)
- `creative` — `{ slug, displayName, municipality, avatarUrl }`

### `GET /api/v1/conversations/:id`

Thread + messages. Includes `otherPartyUserId` and `otherPartyName`. Each
message may include `offer` (card or `null`). Query: `after` (message uuid, for
polling), `limit`. Non-participants → `404`. No subject.

### `POST /api/v1/conversations/:id/messages`

```jsonc
{
  "body": "Happy to discuss rates this week.",
  "offerId": "optional-uuid-for-a-second-inquiry-in-the-same-thread"
}
```

`201`. Optional `offerId` must belong to the conversation's creative profile
(`400` with `field: "offerId"` otherwise). Attached only on this message; never
rewrites earlier messages. If the other party has blocked the caller → neutral
`403`. Non-participants → `404`.

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

---

## Offers

Signed-in creatives manage their own offers. Public listing and detail need no
auth (session-aware for nearby ranking, like creatives). Cap: 6 offers per
profile, 4 images per offer.

### `GET /api/v1/offers/mine`

Own offers in `sortOrder`, with images (`url`, `thumbUrl`), subdomain, and
moderation fields (`flaggedAt`, `reviewedAt`). Requires a creative profile.

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
caller's profile — otherwise `400`. Published profiles set
`editedSinceReviewAt`.

### `PATCH /api/v1/offers/:id`

Any of title, `subdomainSlug`, description, price. Another creative's id →
`404`. Changing title, description, or price clears `reviewedAt` (offer stays
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
