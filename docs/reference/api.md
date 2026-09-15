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

Creates a user, a creative profile in `pending_review`, and the selected
sub-domain links (1–5, one primary). Signs the new user in. Rate limited to
5 attempts per IP per hour.

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
  "barangaySlug": "poblacion",  // optional; omit while the list is empty
  "password": "correct horse battery",
  "confirmPassword": "correct horse battery",
  "subdomainSlugs": ["photographers", "filmmakers"],
  "primarySubdomainSlug": "photographers",
  "privacyConsent": true,
  "termsAccepted": true
}
```

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
    "profileSlug": "juancruz",
    "profileStatus": "pending_review",
    "rejectionReason": null
  }
}
```

| Status | When |
|---|---|
| `400` | Validation failed, or unknown municipality / sub-domain |
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
`role`, `profileStatus`, and `rejectionReason` (set when a registration was
rejected).

`401` when unsigned-in or the session points at a deleted user.

---

## Admin

All `/admin/*` routes require an administrator session. Non-admins and signed-out
callers receive `404 NOT_FOUND` — the surface is default-deny and does not
advertise itself.

### `GET /api/v1/admin/profiles`

Paginated review queue. Default `status=pending_review`, oldest first.

Query: `status`, `page`, `limit` (max 50).

```jsonc
{
  "data": [
    {
      "id": "…",
      "slug": "juancruz",
      "status": "pending_review",
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

Counts per status for the queue tabs.

```jsonc
{ "data": { "pending_review": 3, "published": 1, "suspended": 0 } }
```

### `GET /api/v1/admin/profiles/:id`

Full registration for review: name, contact details, crafts, and moderation
history (newest first). Contact fields are admin-only.

### `POST /api/v1/admin/profiles/:id/moderate`

```jsonc
{ "action": "approved" }
{ "action": "rejected", "reason": "Please use your real name." }
{ "action": "returned_to_pending" }
```

Rejection requires a non-empty `reason`. Each decision writes a
`moderation_actions` row in the same transaction. Rejection sets profile status
to `suspended` and stores the reason for the registrant banner.

---

## Not yet implemented

Listed so the shape of the eventual surface is visible, and so nobody builds a
parallel version:

- **Creative profiles** — list with filters and pagination, read by slug, create,
  update, claim
- **Organisations** — read, create, membership
- **Inquiries** — send, list for a recipient, respond
- **Search** — Postgres-native full-text plus fuzzy name matching
- **Media** — portfolio upload, moderation queue
- **Self-service password reset / phone verification** — deferred until an SMS
  gateway is available (ADR 0013)
