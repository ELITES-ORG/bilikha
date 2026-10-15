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
| `VERIFICATION_PENDING` | 403 | The account may only browse until its ID is verified — see [ID verification](#id-verification) |
| `ID_DECLINED` | 401 / 403 | The account's ID was declined. `details` is `{ kind, reason, appealUntil? }` — see [ID verification](#id-verification) |
| `ID_STORAGE_UNAVAILABLE` | 503 | The private ID bucket is missing, public, or has no limits, so ID uploads are refused |
| `ID_NUMBER_MATCH` | 409 | The ID number an administrator typed is already on another account. `details.matches` lists `{ username, status, decidedAt }` |
| `ID_HASH_UNAVAILABLE` | 503 | `ID_HASH_SECRET` is not set, so an ID number cannot be recorded |
| `ID_APPEAL_CLOSED` | 409 | The right password, but nothing to appeal: no *not from Biliran* decline, an appeal already open or answered, the photos gone, or the 7 days over — see [the appeal](#post-apiv1authid-appeal) |
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
IP per 15 minutes (`skipSuccessfulRequests`), shared with
[`POST /auth/id-appeal`](#post-apiv1authid-appeal). An `ID_DECLINED` refusal
answers the right password, so it is not counted as a failure.

| Status | When |
|---|---|
| `401` | Incorrect username or password |
| `403` | Account suspended |
| `403` | `ID_DECLINED`: the latest ID verification is `declined_final` (`details: { kind: 'final', reason, appealUntil? }`) or `appealed` (`details: { kind: 'appealed', reason }`). Checked only after the right password, and before `lastLoginAt` is written. `appealUntil` is present while the decline can still be appealed: never appealed, its photos kept, and within 7 days of the decision. A `declined_retry` account signs in normally, to resubmit |
| `429` | Rate limited |

### `POST /api/v1/auth/id-appeal`

A person's one appeal against a *not from Biliran* decline
([ADR 0057](../decisions/0057-new-accounts-are-verified-with-a-biliran-id.md),
plan 0053 Step 4.2). Not behind a session: a declined account cannot sign in, so
the appeal brings its credentials, checked exactly as sign-in checks them.

```jsonc
{ "username": "juancruz", "password": "correct horse battery", "message": "…" } // message 20–1000 characters, trimmed
```

`200` — `{ data: { status: 'appealed' } }`. The row becomes `appealed` with the
message; **no session is made**, and signing in answers `403 ID_DECLINED` with
`kind: 'appealed'` until an administrator answers. Rate limited with
`/auth/login`, sharing its count; `ID_APPEAL_CLOSED` is not counted, since it
answers the right password.

| Status | When |
|---|---|
| `400` | Validation, including a message under 20 or over 1000 characters |
| `401` | Incorrect username or password |
| `403` | Account suspended |
| `409` | `ID_APPEAL_CLOSED`: the latest ID verification is not a *not from Biliran* decline, or it was already appealed, or its appeal was answered, or its photos are gone, or its 7 days are over |
| `429` | Rate limited |

### `POST /api/v1/auth/logout`

Destroys the session and clears the cookie. `204` with an empty body.

### `GET /api/v1/auth/me`

Requires a valid session. Returns the same public user shape as login, including
`role`, `viewMode` (`hiring` \| `creative`), `municipalitySlug`,
`municipalityName` (null for legacy accounts that never set a location),
`profileStatus`, and `rejectionReason` (set when a registration was rejected).
`avatarUrl` is the approved photo. `pendingAvatarUrl` is a new photo waiting
for review, which only its owner sees. `avatarRejectionReason` is set when the
last new photo was not approved
([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)).
`idVerification` is `{ status, submitted, reason, decidedAt }`, or `null` for
an account that needs no ID — every account that existed before ID
verification. `reason` is set only when declined. `decidedAt` is when the latest
decision was made, or `null` while waiting; the app says "your ID is verified"
for 7 days after it. Never an object key or a URL.

`401` when unsigned-in or the session points at a deleted user. `401
ID_DECLINED` when the account's ID was declined — the session ends with it.

---

## ID verification

New accounts verify with a photo of a Biliran ID
([ADR 0057](../decisions/0057-new-accounts-are-verified-with-a-biliran-id.md),
[plan 0053](../plans/0053-id-verification-for-new-accounts.md)). An account's
state is its **latest** `id_verifications` row; **no row means not required**.
Nothing writes a row yet: registration starts doing so in plan 0053 Phase 5.

### Browse only — every authenticated route

While the latest row is `pending` or `declined_retry`, every authenticated route
that is not `GET`, `HEAD` or `OPTIONS` answers:

```json
{ "error": { "code": "VERIFICATION_PENDING", "message": "You can browse, but not do this until your ID is verified." } }
```

These are exempt, matched exactly (query strings and trailing slashes do not
change the match): `POST /api/v1/me/password`,
`POST /api/v1/verification/upload-url` and `POST /api/v1/verification/submission`,
which are how an account leaves browse-only; and `PATCH /api/v1/me/view-mode`,
`POST /api/v1/notifications/read-all` and `POST /api/v1/notifications/:id/read`,
which are private to the account and change nothing anyone else sees.

While the latest row is `declined_final` or `appealed`, every authenticated
route ends the session and answers `401 ID_DECLINED` with `details: { kind,
reason }`; the next request is an ordinary `401`. A session that a decline
rewrote (Phase 3) answers the same once, before anything else.

### `POST /api/v1/verification/upload-url`

Signed in. `uploadLimiter` (30 per hour, shared with media).

```jsonc
{ "side": "front", "contentType": "image/webp" } // or "back"; or "image/jpeg"
```

`200` — `{ data: { uploadUrl, objectKey } }`: a signed upload URL in the
**private** ID bucket, under `ids/<userId>/`, with a key ending
`-front.webp` or `-back.jpg` to match. The browser `PUT`s the resized photo to
`uploadUrl`; the bucket enforces 10 MB and WebP or JPEG.

| Status | When |
|---|---|
| `409` | No ID is required, or it is already submitted, verified or finally declined. Allowed only while the latest row is `pending` and unsubmitted, or `declined_retry` |
| `503` | `ID_STORAGE_UNAVAILABLE` |

### `POST /api/v1/verification/submission`

```jsonc
{
  "idType": "drivers_license",          // a slug from IdType (contracts/verification.ts)
  "frontKey": "ids/<userId>/<uuid>-front.webp",
  "backKey": "ids/<userId>/<uuid>-back.webp", // exactly when the ID type has a back
  "idConsent": true
}
```

Fills the open `pending` row, or after `declined_retry` starts a new one
(the declined row keeps its decision), stamping `id_consent_at` and
`submitted_at`. `200` — `{ data: { status: 'pending', submitted: true, reason: null } }`.

| Status | When |
|---|---|
| `400` | Validation; a key not issued by upload-url, or for the wrong side; a card without its back, or a single-page document with one; a photo already on an earlier submission; an object not in the bucket, over 10 MB, or not the type its name says |
| `403` | A key under another account's `ids/` prefix |
| `409` | Nothing open to submit, or a second submission of the same ID racing the first |
| `503` | `ID_STORAGE_UNAVAILABLE` |

### Admin: `GET /api/v1/admin/id-verifications`

Administrators only (404 for anyone else). Query: `view` (`pending` default,
`appeals` or `decided`), `page`, `limit` (max 50).

- `pending` — submitted IDs waiting for a decision, **oldest first**. There is no
  deadline for a review.
- `appeals` — open appeals (`status = 'appealed'`), oldest `appealedAt` first.
- `decided` — decided in the last 7 days, newest first. An open appeal is under
  `appeals`, not here.

`200` — `{ data: AdminIdVerificationRow[], meta: { page, limit, total } }`: id,
account (username, registered full name, municipality, `accountSuspended`), ID
type, status, `submittedAt`, `decidedAt`, `appealedAt`. **No object keys or
URLs.**

### Admin: `GET /api/v1/admin/id-verifications/:id`

Administrators only. Rate limited to 60 per administrator per hour. Answered
with `Cache-Control: no-store`.

`200` — `{ data: AdminIdVerificationDetail }`: the registered name, birth date and
age, municipality, barangay, ID type, status, the decision (who, when, reason,
`windowEndsAt`), any appeal, whether an ID number was recorded or is absent
(never the hash), `frontUrl`/`backUrl`/`urlsExpireAt`, and `changeableUntil`:
until when the decision can be changed (a decided row that is the account's
latest, not under appeal, with its photos, within its 7 days), else `null`.

**The URLs are signed for at most 300 seconds, and never past the 7 days after
the latest decision.** They are issued only while the row is `pending` or
`appealed`, or its decision is under 7 days old, and its images are not
deleted; otherwise they are `null` and storage is not asked. Each side is signed
on its own: a side storage cannot sign is `null`, and the record still loads so
the ID can be decided. Every response that carries a URL writes an `id_viewed`
row to `moderation_actions` naming the administrator. `503 ID_STORAGE_UNAVAILABLE` when URLs are due and the ID bucket
is not ready.

### Admin: `POST /api/v1/admin/id-verifications/:id/decision`

```jsonc
{
  "decision": "verify",          // or "retry" (try again), "final" (not from Biliran)
  "reason": "…",                 // ≤ 500; required to decline; the person sees it as written
  "idNumber": "N01-23-456789",   // typed from the photo; stored only as a keyed hash
  "noIdNumber": false,           // the document has no number
  "acknowledgeMatch": false,     // after seeing ID_NUMBER_MATCH
  "expectedDecidedAt": null      // required: the decision the page showed
}
```

- `expectedDecidedAt` is `null` for a first decision and the shown
  `decision.decidedAt` for a change. If the row has moved on — decided, or
  changed, since the page loaded — `409` asking to reload, and nothing is
  written. Without it, a *try again* sent from a page opened before
  another administrator's decision would land as a change to that decision.
- `verify` and `final` are refused (`409`) unless this administrator was shown
  the photos: an `id_viewed` row by them on this row, written only when a photo
  was signed. `retry` is not, so an ID whose photos will not load can still be
  sent back.
- `verify` and `final` need `idNumber` or `noIdNumber: true`; `retry` needs
  neither.
- The number is hashed (HMAC-SHA256 with `ID_HASH_SECRET`). If **another
  account** has the same hash and `acknowledgeMatch` is not `true`: `409
  ID_NUMBER_MATCH` with `details.matches: [{ username, status, decidedAt }]` —
  never the number or the hash. Verifying despite a match needs a `reason`,
  recorded as "Verified despite N matching account(s): …".
- One transaction: the row's status, `reviewed_by`, `decided_at`, reason and hash,
  an audit row, and for a decline **every session of the account rewritten** to
  carry `declineNotice` (the next request answers `401 ID_DECLINED` with the
  reason). After *verify*, an `id_verified` notification.

**Changing a decision** (plan 0053 Step 4.1). The same route also takes a row
already decided — `verified`, `declined_retry` or `declined_final` — while
`changeableUntil` is set, and changes it to any other decision:

- `reason` is required, whatever the new decision: for a decline it is what the
  person sees, for a verify it goes on the record only.
- `verify` and `final` need a look at the photos **since the decision being
  changed**. `retry` does not.
- A number already recorded on the row stands; `idNumber` or `noIdNumber` is
  needed only when the row has neither. A number in play is checked for matches
  as above.
- One transaction, as above, with an `id_decision_reversed` audit row reading
  "Changed from <old> to <new>: <reason>". `decided_at` becomes now, so the 7
  days start again. A change to a decline rewrites the sessions; a change to
  `final` carries `appealUntil` in the notice. A change to `verify` sends
  `id_verified`.

`200` — `{ data: AdminIdVerificationDetail }` (no URLs).

| Status | When |
|---|---|
| `400` | Validation; a decline without a reason; a change without a reason, or to the decision it already is; a number missing, or given with `noIdNumber`; a number too short or not in Latin letters and digits; verifying despite a match without a reason |
| `404` | No such row, or not an administrator |
| `409` | Your own ID; a suspended account; not waiting for a decision (including a second decision racing the first); under appeal; a change after the 7 days, after the photos were deleted, or after the person sent a new ID; `verify` or `final` without having been shown the photos; `ID_NUMBER_MATCH` |
| `503` | `ID_HASH_UNAVAILABLE` — `ID_HASH_SECRET` is not set |

### Admin: `POST /api/v1/admin/id-verifications/:id/appeal`

The answer to a person's appeal (plan 0053 Step 4.3).

```jsonc
{
  "outcome": "grant",            // or "uphold"
  "reason": "…",                 // 1–500, required either way; shown at sign-in on uphold
  "acknowledgeMatch": false      // a grant, after seeing ID_NUMBER_MATCH
}
```

- Needs a look at the photos **since the appeal**, so it is answered on the
  photos with the person's message beside them.
- A grant checks the row's recorded number for matches, as a verify does.
- One transaction: *grant* sets `verified`; *uphold* keeps `declined_final` with
  the new reason. Either way `appeal_decided_at` and `decided_at` are now — the
  7 days start again and no second appeal is possible — with an
  `id_appeal_granted` or `id_appeal_upheld` audit row. A grant sends
  `id_verified`.

`200` — `{ data: AdminIdVerificationDetail }` (no URLs).

| Status | When |
|---|---|
| `400` | Validation, including no reason or one over 500 characters |
| `404` | No such row, or not an administrator |
| `409` | Your own ID; a suspended account; no open appeal (including a second answer racing the first); no look at the photos since the appeal; `ID_NUMBER_MATCH` |

**Images are deleted 7 days after the latest decision** by an hourly pass in the
API (and `npm run ids:purge`), except while an appeal is open; ID objects older
than a day that no row references are deleted too. The record — outcome, ID
type, who decided and when, the hash — stays. The pass claims a row before
deleting its objects, guarded on it still being due, so an appeal or a changed
decision that lands in between keeps the photos.

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
  `image` is `{ url, thumbUrl }` for the first image by `sortOrder`, else the
  first video's poster, or `null`
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

### `GET /api/v1/admin/organizations`

The organisation review queue ([ADR 0054](../decisions/0054-organisations-are-teams-of-creatives.md)),
shaped like the profile queue: oldest first, and `status=edited` for published
pages with an unacknowledged edit.

Query: `status` (`pending_review`, `published`, `rejected`, `suspended`, or
`edited`), `page`, `limit` (max 50).

`200` — `{ data: AdminOrganizationRow[], meta: { page, limit, total } }`.
A row carries `id`, `slug`, `name`, `bio`, `crafts` (names, primary first),
`status`, `founderUsername`, `municipality`, `memberCount`, `createdAt` and
`editedSinceReviewAt` — everything the decision needs, so there is no detail
endpoint.

### `GET /api/v1/admin/organizations/counts`

Counts per status for the tabs, plus `edited`.

### `POST /api/v1/admin/organizations/:id/moderate`

```jsonc
{ "action": "approved" }
{ "action": "rejected", "reason": "The name copies a real company." }
{ "action": "acknowledged_edit" }
```

Rejection requires a non-empty `reason`. Unlike a profile, a rejected
organisation gets the real status `rejected`, which stops it counting toward
its founder's five-organisation cap. Each decision writes a
`moderation_actions` row with `organization_id` set and the founder as
`subject_user_id`. Approving and rejecting notify the founder; acknowledging an
edit does not. `409` on a `suspended` organisation, which review never changes,
and for `acknowledged_edit` unless the page is published with an edit waiting.

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

Public. Session-aware, not session-required. Query: `q` (search text,
optional — see [Directory search](#directory-search)), `domain`, `subdomain`,
`municipality` (slugs, optional), `page` (default 1), `limit` (default 20,
max 50).

`q` matches a creative's display name, full name (middle name included), bio,
any of their sub-domains (plural name, singular label or an everyday-word
alias) and those sub-domains' domains, and their town.

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
`id` / `url` / `thumbUrl` / `sortOrder`, optional `mediaBadge` as on
`GET /offers`, and optional `poster`, the first video's poster in the same shape
as an image, or `null`), `memberSince`. Directory cards from
`GET /creatives` omit `offers` — the offer listing is `GET /offers`.

---

## Organisations

Teams of creatives with one public page
([ADR 0054](../decisions/0054-organisations-are-teams-of-creatives.md)). Nobody
signs in as an organisation: every write is made by a creative, as themselves.
Shapes are in `backend/src/contracts/organizations.ts`.

Three roles: `founder` (exactly one), `co_founder`, `member`. The founder and
co-founders edit the page and invite; only the founder invites a co-founder,
removes a co-founder, changes the crafts or hands over the founder role.

### `GET /api/v1/organizations`

Public. Published organisations for the directory, by name, while their
founder could be seen in public too (see below). Query:
`domain`, `subdomain`, `municipality` (slugs, optional), `limit` (default 12,
max 50).

`200` — `{ data: OrganizationCard[] }` — `slug`, `name`, `logoUrl`,
`municipality`, `primaryCraft`, `memberCount`. A craft carries `name` (the
official plural) and `singularName` (the label cards show).

The directory hides this list while a search (`q` on the creatives listing) is
active: search does not cover organisations yet.

### `GET /api/v1/organizations/:slug`

Public. `200` — `{ data: PublicOrganization }`. `404` unless published, and
while the founder's own account is suspended or their creative profile is not
published: the founder is the one person a visitor's message reaches, so a page
with no visible founder would list a team nobody can contact. It returns when
the founder does, or when the role is handed over.
`members[]` lists only people whose account is active and whose own creative
profile is published; it carries `displayName`, `profileSlug`, `avatarUrl`,
`role` and `title`, and never a user id.

### `POST /api/v1/organizations`

Signed in. Founds an organisation, which starts at `pending_review`.

```jsonc
{
  "name": "Naval Light Studio",
  "bio": "Optional, up to 1000 characters.",
  "municipalitySlug": "naval",
  "subdomainSlugs": ["filmmakers", "animators"],
  "primarySubdomainSlug": "filmmakers"
}
```

One to five sub-domains from at most two domains, none archived. The slug is
made from the name once and never changes, and is never reused: a closed
organisation's slug stays reserved, so the next one of the same name gets
`<slug>-2`.

`201` — `{ data: { slug, status } }`. `403` without a published creative
profile. `409` at the cap: five organisations, counting memberships and not
counting `rejected` ones. The cap is checked under a per-person lock in the
same transaction as the insert, so two requests at once cannot both pass it.
Two foundings of one name at once each get their own slug.

### `PATCH /api/v1/organizations/:slug`

Founder or co-founder. Any of `name`, `bio` (`null` clears it),
`municipalitySlug`, and `subdomainSlugs` with `primarySubdomainSlug` (founder
only, always together). Unknown keys are refused, so the slug cannot be sent.

Editing a published page keeps it public and sets `editedSinceReviewAt`
([ADR 0016](../decisions/0016-edits-never-unpublish.md)). Editing a `rejected`
page sends it back to `pending_review` — `409` if that would take anyone in the
team past five organisations, since a `rejected` page stops counting and its
team may have filled the gap elsewhere. A `suspended` page cannot be edited.

### `GET /api/v1/organizations/:slug/manage`

Any member. `200` — `{ data: ManagedOrganization }`: any status, every member
with `userId` and `username`, the rejection reason, `myRole`, and — for the
founder and co-founders — `invitations[]`, each with a computed `expired`.
`logoUrl` is the approved logo. `pendingLogoUrl` is a new logo waiting for
review, and `logoRejectionReason` is set when the last new logo was not
approved. `404` for anyone not in it.

### `GET /api/v1/organizations/mine`

Signed in. The organisations the caller belongs to: `slug`, `name`, `status`,
`role`.

### `POST /api/v1/organizations/:slug/invitations`

Founder or co-founder. Rate-limited per inviter.

```jsonc
{ "username": "carla", "role": "member", "title": "Composer" }
```

`role` is `member` (default) or `co_founder`. The invitation expires seven days
later; expiry is computed when read, with no scheduled job. One `404` message
covers an unknown username, a suspended account and an account with no published
creative profile, so the endpoint cannot be used to discover accounts. `409` if
they are already in the team or already have an open invitation, including one
sent a moment earlier by someone else in the team — and for 30 days after they
decline one from this organisation, with the date they can be asked again. One
query decides the 404 whichever account it is, so the time it takes does not
tell a suspended account from an unpublished one.

`201` — `{ data: { id, expiresAt, refreshed: false } }`. Re-inviting someone
whose invitation expired renews the same invitation: `200` with
`refreshed: true`. The invitee is notified.

### `GET /api/v1/organizations/invitations`

Signed in. Open, unexpired invitations to the caller: `id`, `organization`
(`slug`, `name`), `role`, `title`, `invitedBy` (a name), `expiresAt`.

### `POST /api/v1/organizations/invitations/:id/accept`

The invitee. Creates the membership — **nobody is on a page without
accepting**. `409` once expired, at the cap (checked under the same lock as
founding), or if the same invitation was just accepted. `403` without a
published creative profile. The inviter is notified. `200` — `{ data: { slug } }`.

### `POST /api/v1/organizations/invitations/:id/decline`

The invitee. `200` — `{ data: { declined: true } }`.

### `POST /api/v1/organizations/:slug/leave`

Any member. A founder with anyone else in the team is refused (`409`) and told
to hand over first. A founder alone closes the organisation: it is deleted —
except a `suspended` one (`403`), which only an administrator can resolve.
Its slug is retired, never to be handed out again.
Leaving withdraws any unanswered invitations the person sent.
`200` — `{ data: { closed } }`.

### `DELETE /api/v1/organizations/:slug/members/:userId`

Founder, or a co-founder removing a plain member. Nobody removes the founder,
and nobody removes themselves (leave instead). Unanswered invitations the
removed person sent are withdrawn. `200` — `{ data: { removed: true } }`.

### `POST /api/v1/organizations/:slug/logo/upload-url`

Founder or co-founder; not on a suspended organisation. Rate-limited like other
uploads. `200` — `{ data: { uploadUrl, objectKey } }`: the browser resizes the
image and PUTs it straight to `uploadUrl`, as for an avatar. `503` when image
storage is not configured.

### `PUT /api/v1/organizations/:slug/logo`

Founder or co-founder. `{ "objectKey": "organizations/<id>/…" }` — only a key
under this organisation's own folder is accepted (`403` otherwise, `400` for a
malformed key). The logo waits for review in a pending slot and clears any
earlier rejection reason. Everyone else sees the approved logo, or initials,
until an administrator approves it
([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)).
If another logo was already waiting, it is deleted. `200` —
`{ data: { objectKey } }`.

### `DELETE /api/v1/organizations/:slug/logo`

Founder or co-founder. If a logo is waiting for review, it is withdrawn and
the approved logo stays. Otherwise the approved logo is removed. `200` —
`{ data: { removed } }`. Closing an organisation also deletes its logo and any
waiting one.

### `POST /api/v1/organizations/:slug/founder`

Founder only. `{ "userId": "…" }` — someone already in the team whose account
is active and whose creative profile is published (`400` otherwise), since the
page is public only while its founder is. In one transaction the old founder
becomes a co-founder, the new one the founder, and the old founder's unanswered
co-founder invitations are withdrawn: inviting a co-founder is the founder's
power. `409` if another hand-over got there first.
`200` — `{ data: { handedOver: true } }`.

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
priceMaxCentavos, image, available }` (`image` is `{ url, thumbUrl }` for the
first photo, else the first video's poster, or `null`;
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

### `GET /api/v1/admin/summary`

How many items wait for a decision under each admin section
([ADR 0059](../decisions/0059-the-admin-area-is-organised-by-subject.md)):

```jsonc
{
  "data": {
    "creatives": { "pending": 2, "edited": 1 },
    "offers": { "new": 3, "changes": 1 },
    "organizations": { "pending": 0, "edited": 1, "logos": 1 },
    "people": { "photos": 4, "ids": 2, "appeals": 1 },
    "reports": { "open": 0 }
  }
}
```

Published and suspended rows are not waiting, so they are not counted. `people.ids`
is submitted IDs waiting for a decision, and `people.appeals` open appeals
against a decline ([ADR 0057](../decisions/0057-new-accounts-are-verified-with-a-biliran-id.md)).

### `GET /api/v1/admin/media`

Everything waiting for a decision
([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)),
paginated. Optional filters return one admin section's part of the queue
([ADR 0059](../decisions/0059-the-admin-area-is-organised-by-subject.md)):

- `kind`: `offer`, `avatar` or `logo`.
- `change`: `new` or `edit`, for new offers or changes to published ones.
  It implies `kind=offer`.

Without either, the whole queue comes back:

- **Offers.** A new offer in `pending_review`, and a published offer with a
  waiting change: a revision, or photos added or removed.
- **Avatars and logos.** A new profile photo or organisation logo in its
  pending slot.

Flagged items (`flaggedAt` set) sort first, then the rest by the longest
waiting.

Each row has:

- `kind` (`avatar` \| `offer` \| `logo`)
- absolute `url`/`thumbUrl` for the waiting image
- the owner's name (the organisation's name for a logo)
- the profile slug, when there is one

A logo row carries `organizationSlug` when the page is published. An avatar or
logo row carries `currentUrl` when it would replace an approved image. Every
row carries a `version`: a token for exactly what the row shows.

Offer rows also include:

- `change`: `new` or `edit`
- the proposed `title`, `description`, `priceMinCentavos`,
  `priceMaxCentavos`, `subdomain` and `flaggedAt`
- `images[]`: every item on the offer, of every `kind` (`image`, `audio`,
  `video`, `document`), each with a `state`: `live`, `pending_add` or
  `pending_remove`. `url` is the file in its own bucket; `thumbUrl` is an
  image's thumbnail or a video's poster, else `null`. Optional `title`,
  `mimeType`, `sizeBytes` and `durationSeconds` describe audio, video and PDFs.
  The row's own `url`/`thumbUrl` are always a photo's, never another kind's
- for an `edit`, `published`: the public version's `title`, prices and
  `subdomain`

### `POST /api/v1/admin/media/:kind/:id/review`

`kind` is `avatar`, `offer` or `logo`. For a logo, `id` is the organisation's.

Body: `{ "action": "approve" | "reject", "reason"?: string, "version": string }`.
A reject needs a `reason` of up to 500 characters, else `400`. The owner sees
the reason. `version` is the queue row's: if the owner has changed the item
since — edited the offer, added or removed a photo, uploaded another photo or
logo — the decision is refused with `409`, so nothing is approved unseen.
Reload the queue and decide on what is there now.

**Approve:**

- A new offer is published.
- An offer change replaces the public version. Added photos go live, and
  removed photos are deleted.
- A photo or logo replaces the approved one, which is then deleted.

**Reject:**

- A new offer becomes `rejected`, with the reason, and stays hidden until its
  creative edits it.
- An offer change is dropped. Photos it added are deleted, photos it removed
  are kept, and the public version is unchanged. The reason is stored as the
  offer's `revisionRejectionReason`.
- A waiting photo or logo is deleted, and the reason is stored on the account
  or organisation.

Every decision writes a moderation action and notifies the owner. For a logo,
the founder is notified. An approved photo or logo does not send a
notification.

If nothing is waiting, or the offer is already rejected, the response is
`409`. If the item does not exist, it is `404`.

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

### `POST /api/v1/admin/taxonomy/subdomains/:slug/aliases`

Adds an everyday word that search also finds the sub-domain by (issue #24).
Body: `{ "term": "Videographer" }`, 1–60 characters. Stored folded — lowercase,
accents removed, single spaces — and returned as `201` with
`{ data: { id, term } }`. A term that folds to nothing is `400`; one the
sub-domain already has, however accented, is `409`. The same term may sit on
two sub-domains. Recorded in the change log as the sub-domain's `updated`, with
`before`/`after` `{ aliases: [...] }`.

`GET /api/v1/admin/taxonomy` lists each sub-domain's `aliases` as `{ id, term }`.

### `DELETE /api/v1/admin/taxonomy/subdomains/:slug/aliases/:id`

Removes one alias of that sub-domain; `404` if the id belongs to another one.
Recorded like an addition.

### `GET /api/v1/admin/search-misses`

The most common searches that found nothing, summed over the last `days` days
(1–90, default 30), most frequent first, at most 50:
`{ data: [{ term, listing, count }] }`, where `listing` is `offers` or
`creatives`. Counted per day with nothing that identifies who searched; rows
older than 90 days are removed as new ones are written.

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
profile; per offer, 10 images, 5 audio, 2 videos and 3 PDFs (see
[`GET /media/limits`](#get-apiv1medialimits)).

### `GET /api/v1/offers/mine`

Own offers in `sortOrder`, with images (`url`, `thumbUrl`, `state`), `media`
(audio, video and PDF items, each as on the offer page plus `state`),
subdomain, and moderation fields (`flaggedAt`, `reviewedAt`). Requires a
creative profile.

Review fields
([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)):

- `status`: `pending_review`, `published` or `rejected`
- `rejectionReason`: for a rejected offer
- `revisionRejectionReason`: when the last change to a published offer was not
  approved
- `pendingChanges`: the waiting version of a published offer (`title`,
  `description`, prices, sub-domain and `submittedAt`), or `null`

A published offer's images and media include items that are waiting to be
added (`pending_add`) or removed (`pending_remove`). Any item not `live` makes
`pendingChanges` non-null.
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
A new offer is `pending_review`. Nobody else sees it until an administrator
approves it.

### `PATCH /api/v1/offers/:id`

Any of title, `subdomainSlug`, description, price. Another creative's id →
`404`. An offer may keep the archived sub-domain it already has; switching to a
different archived one → `400`.

- **A published offer** stays as it is. The edit waits beside it as a
  revision until an administrator approves it. Editing again updates the
  revision. An edit that matches the published values withdraws it.
- **An offer that is not published** is changed directly. If it was
  `rejected`, it goes back to `pending_review` and its reason is cleared.

Contact-detail patterns in the description set `flaggedAt`.

### `DELETE /api/v1/offers/:id`

Deletes the row, then each file from its own bucket, with any thumbnail or
poster from the image bucket. A file storage fails to delete is left for
`media:prune`. Another creative's id → `404`.

### `PUT /api/v1/offers/order`

```jsonc
{ "ids": ["uuid", "uuid"] }
```

Rewrites `sortOrder`. The list must be exactly the caller's current offers.

### `POST /api/v1/offers/:id/images`

```jsonc
{ "objectKey": "offers/<profileId>/<uuid>.webp", "thumbKey": "…-thumb.webp" }
```

`201`. Enforces the ten-image cap; photos waiting to be removed do not count.
Over it → `400 BAD_REQUEST` ("An offer can have at most 10 images").
On a published offer, the new photo is `pending_add` until approved. On a
rejected offer, it sends the offer back to `pending_review`. Keys must start with
`offers/<callerProfileId>/` (migrated legacy `portfolio/…` keys are never
re-asserted on upload).

### `POST /api/v1/offers/:id/media`

Attaches an upload made with a ticket from
[`POST /media/uploads`](#post-apiv1mediauploads): an image, audio, video or PDF.

```jsonc
{ "reservationId": "uuid", "title": "optional, 1–120 characters" }
```

`201` `{ "data": { "id": "uuid", "kind": "audio" } }`. The stored file is
verified first. The item counts against the offer's per-kind limit again, since
the offer may have filled up since the ticket. On a published offer it is
`pending_add` until approved; on a rejected offer it sends the offer back to
`pending_review`.

| Status | Code | When |
|---|---|---|
| `404` | `NOT_FOUND` | No such offer, or another creative's |
| `410` | `MEDIA_UPLOAD_EXPIRED` | The reservation expired, was already attached, or is another user's |
| `422` | `MEDIA_VERIFICATION_FAILED` | The stored file is missing or is not what the ticket allowed |
| `409` | `CONFLICT` | The reservation is for a different offer |
| `409` | `MEDIA_LIMIT_REACHED` | The offer already holds as many of this kind as it can |

### `DELETE /api/v1/offers/images/:imageId`

Removes a photo, audio, video or PDF item. On a published offer:

- a live item becomes `pending_remove` and stays public until the change is
  approved
- an item waiting to be added is deleted straight away

On any other offer, it deletes the row, then the file from its own bucket and
any thumbnail or poster. Another creative's item → `404`.

### `GET /api/v1/offers`

Public. Session-aware, not session-required. Query: `q` (search text,
optional — see [Directory search](#directory-search)), `domain`, `subdomain`,
`municipality` (slugs, optional), `budgetMin` / `budgetMax` (pesos as positive
integers, optional; max must be ≥ min), `page` (default 1), `limit` (default 20,
max 50). Only `published` offers whose profile is `published` appear. A
photo waiting to be added is left out. A budget filter keeps
offers whose price range overlaps and drops "Price on request" rows. When the
caller is signed in with a municipality, nearby creatives' offers lead the list.

Each card's `image` is the first photo, or the first video's poster when the
offer has no photo. `mediaBadge` is `{ kind, count, durationSeconds }` for the
first audio, video or PDF item in the offer's order: its kind, how many items of
that kind, and the first one's length; `null` when the offer has none. An item
waiting to be added is left out of both. `mediaBadge` is optional, so a client
must treat it as absent on an older API
([ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md)).

`q` matches an offer's title, description, sub-domain (plural name, singular
label or an everyday-word alias) and domain, and its creative's display name
and town.

#### Directory search

`q` on `GET /offers` and `GET /creatives`
([ADR 0003](../decisions/0003-postgres-native-search.md), issue #22):

- **Input.** Trimmed. Blank is the same as absent. 2–100 characters, else
  `400 VALIDATION_ERROR`. It is split into words on anything that is not a
  letter or digit, so query syntax (`& | ! ( ) : *`, quotes) is never
  interpreted; a `q` with no letters or digits matches nothing. Words past the
  eighth are ignored.
- **Matching.** Every word must match some field of the row, either as a word
  prefix (`photo` finds "Photographers"; no stemming, so English, Filipino and
  Waray behave alike) or, for words of three characters or more, by trigram
  similarity on name-like fields (`fotographer` finds "Photographer"; a word of
  six letters or more is allowed a looser match, so `develper` finds
  "Developer"). Words
  may match different fields: `photographer naval` finds a photographer in
  Naval.
- **Aliases** (issue #24). A sub-domain also matches by the everyday words
  administrators attach to it, by prefix and by typo like its own name, with
  accents folded on both sides: an alias `videographer` on Filmmakers lets
  `videografer` and `VIDEÓ` find filmmakers.
- **Unmatched searches.** When page 1 of a search matches nothing, the words
  are counted in `search_misses` for that listing and day — never who searched
  — without delaying the response. See
  [`GET /api/v1/admin/search-misses`](#get-apiv1adminsearch-misses).
- **Visibility** is the listing's own: published profiles of active accounts
  only. `q` combines with every other filter, and `meta.total` counts the
  matches.
- **Order.** Nearby-first still leads. Then rows where every word matched as
  typed come before typo-only matches, then the closest name (offer title, or
  the creative's display name, else full name), then newest.

### `GET /api/v1/offers/:id`

Public detail for one published offer, including all images and creative
summary. `404` when missing or the profile is not published.

`media` lists its audio, video and PDF items in order: `id`, `kind`, `url`
(public, in the kind's bucket), `posterUrl` (a video's poster, else `null`),
`title`, `mimeType`, `sizeBytes`, `durationSeconds` and `sortOrder`. An item
waiting to be added is left out. Optional, so a client must treat it as absent
on an older API ([ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md)).

In both offer responses, `subdomain` is `{ slug, name, singularName, domain }`.

---

## Media

Signed-in only, except `GET /media/limits`. File bytes never pass through the
API — the backend issues a ticket to upload straight to storage and later
records the object key. The service role key never appears in responses
([ADR 0046](../decisions/0046-offers-and-profiles-carry-audio-video-and-pdf.md)).

The legacy POST /media/upload-url and POST /offers/:id/images keep working for open tabs until the follow-up that retires them.

### `GET /api/v1/media/limits`

Public. Every upload limit, so the browser checks a file before sending a byte
and never keeps its own copy. MB is 1,000,000 bytes.

```jsonc
{
  "data": {
    "quotaBytes": 1000000000,
    "destinations": {
      "offer": {
        "image":    { "enabled": true,  "maxBytes": 2000000,   "maxPickedBytes": 20000000, "maxDurationSeconds": null, "mimeTypes": ["image/webp", "image/jpeg"], "perTarget": 10, "transport": "put" },
        "audio":    { "enabled": false, "maxBytes": 15000000,  "maxPickedBytes": null, "maxDurationSeconds": 600, "mimeTypes": ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg"], "perTarget": 5, "transport": "tus" },
        "video":    { "enabled": false, "maxBytes": 300000000, "maxPickedBytes": null, "maxDurationSeconds": 300, "mimeTypes": ["video/mp4", "video/webm"], "perTarget": 2, "transport": "tus" },
        "document": { "enabled": false, "maxBytes": 10000000,  "maxPickedBytes": null, "maxDurationSeconds": null, "mimeTypes": ["application/pdf"], "perTarget": 3, "transport": "tus" }
      }
    }
  }
}
```

Images are always enabled; the other kinds as `MEDIA_UPLOAD_KINDS` says
([environment](./environment.md)).

### `GET /api/v1/media/usage`

`{ data: { usedBytes, reservedBytes, quotaBytes } }`. `usedBytes` sums the sizes
recorded on the creative's offers (images from before the pipeline count as 0);
`reservedBytes` sums the caller's unexpired reservations. Zeros for an account
with no creative profile.

### `POST /api/v1/media/uploads`

Reserves room for one upload and returns where to send it. `uploadLimiter` (30
per user per hour, shared with avatars, organisation logos and ID photos).

```jsonc
{
  "destination": "offer",
  "offerId": "<uuid>",
  "kind": "audio",              // image | audio | video | document
  "mimeType": "audio/mpeg",     // browser aliases such as audio/x-m4a are normalised
  "sizeBytes": 4200000,         // the main file; for an image, the display image
  "thumbSizeBytes": 38000,      // an image's thumbnail (required) or a video's poster (optional)
  "durationSeconds": 245.3      // required for audio and video
}
```

`201`. An image answers with two signed `PUT` URLs:

```jsonc
{ "data": { "reservationId", "expiresAt", "kind": "image", "transport": "put",
            "file": { "uploadUrl", "objectKey" }, "thumb": { "uploadUrl", "objectKey" } } }
```

Audio, video and PDF answer with a resumable (TUS) upload, sent in 6 MiB chunks
with the token as `x-signature`, plus a signed `PUT` for a video's poster when
its size was declared:

```jsonc
{ "data": { "reservationId", "expiresAt", "kind": "video", "transport": "tus",
            "tus": { "endpoint", "token", "bucket", "objectKey" },
            "poster": { "uploadUrl", "objectKey" } } }
```

The reservation counts toward the quota and the offer's per-kind limit until it
is attached, abandoned, or expires after 24 hours. Checks run in this order; the
first failure answers:

| Code | Status | Message | `details` |
|---|---|---|---|
| `FORBIDDEN` | 403 | A creative profile is required to manage offers | — |
| `NOT_FOUND` | 404 | No such offer. | — |
| `MEDIA_KIND_DISABLED` | 403 | This kind of file can't be uploaded yet. | `{ enabledKinds }` |
| `MEDIA_TYPE_NOT_ALLOWED` | 422 | This file type isn't allowed. | `{ mimeTypes }` |
| `MEDIA_TOO_LARGE` | 422 | This file is too large. | `{ maxBytes }` |
| `MEDIA_TOO_LONG` | 422 | This recording is too long. | `{ maxDurationSeconds }` |
| `MEDIA_LIMIT_REACHED` | 409 | This offer already has as many of these as it can hold. | `{ perTarget }` |
| `MEDIA_QUOTA_EXCEEDED` | 409 | Your storage is full. Remove something first. | `{ quotaBytes }` |
| `RATE_LIMITED` | 429 | — | — |

Attaching an upload checks what storage holds against the ticket, and answers
`410 MEDIA_UPLOAD_EXPIRED` ("This upload expired. Start it again.", `details:
{ expiresAfterSeconds: 86400 }`) for a reservation that is gone or expired, or
`422 MEDIA_VERIFICATION_FAILED` ("This file didn't upload correctly. Try
again.", `details: { reason }`, one of `missing`, `size`, `type`, `signature`).
A failed check deletes the reservation and what was stored with it.

### `DELETE /api/v1/media/uploads/:id`

Cancels an upload: the reservation goes, and anything already stored with it.
`{ data: { ok: true } }`. `404` ("No such upload.") for an unknown id or another
account's reservation.

### `POST /api/v1/media/upload-url`

Rate-limited to 30 requests per user per hour, shared with `POST /media/uploads`.

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

Records the key in the pending slot and clears any earlier rejection reason.
Everyone else sees the approved photo, or initials, until an administrator
approves it
([ADR 0058](../decisions/0058-content-waits-for-approval-beside-what-is-public.md)).
If another photo was already waiting, it is deleted. `objectKey` must start
with `avatars/<callerUserId>/` — otherwise `403`.

### `DELETE /api/v1/media/avatar`

If a photo is waiting for review, it is withdrawn and the approved photo stays.
Otherwise the approved photo is removed. Removing a photo needs no review.
`{ data: { ok, removed: "pending" | "approved" } }`.

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
- **Admin report review UI** — reports are stored; the screen is a follow-up
- **Self-service password reset / phone verification** — deferred until an SMS
  gateway is available (ADR 0013)
