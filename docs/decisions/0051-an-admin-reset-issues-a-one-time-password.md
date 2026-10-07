# 0051. An admin reset issues a one-time password, revokes every session, and forces a change

- **Status:** Proposed
- **Date:** 2026-10-08
- **Related:** [0013](./0013-username-password-auth-sprint-1.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0007](./0007-phone-as-primary-identity.md) ·
  [operating constraints §7](../explanation/constraints.md) ·
  [issue #23](https://github.com/ELITES-ORG/bilikha/issues/23)

## Context

There is no password recovery. The only path is a developer running
`npm --prefix backend run admin:reset-password -- <username> <password>` with
production database credentials in their shell. Issue #23 calls that insecure
and unscalable, and it is both: it needs a credential nobody should be handing
out to recover one account, and it leaves no record that it happened.

The obvious fix — email a reset link — is not available here, and the reason is
written into the schema:

```ts
// Unverified in sprint 1 (ADR 0013). Contact details only — never use these
// for password reset or identity matching until a verification flow exists.
email: text('email').notNull(),
```

Nobody has proved they own the address or the number on their account. A reset
link sent to an unverified address is an account takeover primitive: register
with someone else's email, wait, then recover "your" password. SMS is worse —
there is no provider wired up, and [ADR 0007](./0007-phone-as-primary-identity.md)
already treats the phone number as an identifier rather than a verified
channel.

So recovery has to run through a human who can verify identity out of band,
which in a province of 180,000 people is realistic: the administrator knows the
registrant, or knows someone who does. That is what the existing script assumes
too. The question this ADR settles is what that administrator's action actually
does.

Two further things are not obvious:

1. **Suspension deliberately does not delete sessions.**
   [ADR 0028](./0028-suspension-is-enforced-per-request.md) enforces it per
   request instead, re-reading `users.status` on every call. A password reset
   cannot borrow that: the credential itself has changed, and a live session is
   a credential that outlives it.
2. **`sessions` has no `user_id`.** It stores the express-session blob as text,
   so "every session for this account" is not currently a query anyone can
   write.

## Decision

**A reset issues a single-use temporary password, shown once to the
administrator, which revokes every session and cannot be used for anything but
setting a new one.**

Five parts.

### 1. The temporary password is generated, shown once, and never stored

The server generates it with `crypto.randomInt` from an alphabet with no
look-alike characters (no `0`/`O`, no `1`/`l`/`I`), because it will be read
aloud over a phone or copied onto paper. It is returned in the response body
exactly once and never again: only the argon2 hash is written, by the same
`hashPassword` the registration path uses.

The administrator is not asked to invent one. A human-chosen password gets
reused across the accounts an administrator resets, and "the one I always use
for resets" is a standing credential for every account they have ever touched.

### 2. Every session for that account is deleted

`sessions` gains `user_id uuid references users(id) on delete cascade`,
indexed, written by `DrizzleSessionStore` from the session data it already
serialises. Revocation becomes one delete.

The cascade is worth having on its own: a deleted account's sessions currently
linger until they expire or the pruner reaches them.

### 3. The account must change its password before it can do anything else

`users.must_change_password` is set. `requireAuth` then refuses every
authenticated request with `403 PASSWORD_CHANGE_REQUIRED` except the two it
needs — reading its own session and setting a new password — and the flag is
cleared by the existing `POST /api/v1/me/password`.

**Enforced on the server, not in the router.** A frontend redirect is a
courtesy; a person holding a temporary password and `curl` is the case that
matters. The existing change-password endpoint takes the current password, so
the temporary one is what unlocks it, which is what makes it single-use in
practice: it stops working the moment it is used for its only purpose.

### 4. It is recorded, without the password

A `password_reset` row in `moderation_actions` — administrator, subject
account, timestamp. The table is already append-only and already the answer to
"who did this to this account". No `reason` is required: unlike a suspension,
nothing about a reset needs explaining to the person it happened to.

### 5. The same guards as suspension

Refused for your own account — it would revoke the session you are using
mid-action — and for another administrator's, which stays a deliberate act at
the database rather than a button next to everyone else's.
`requireAdmin` already refuses a suspended administrator, which is the rest of
what #23 asks for.

Rate limited to ten resets per administrator per hour, keyed on the
administrator, following `passwordChangeLimiter`.

## Alternatives considered

**Email a reset link.** The standard answer, and unavailable until addresses
are verified — see the schema comment above. Revisit when a verification flow
exists; this ADR is then superseded, not patched.

**Let the administrator type the new password.** Simpler, one less generator,
and it fails the thing the feature exists for: the administrator ends up
reusing a password, and the registrant is handed one they did not choose and
may keep.

**Show the password hashed, or email it to the registrant.** Both defeat the
point. The administrator has to be able to read it to the person, and the
address it would go to is the unverified one.

**Leave the sessions alone and rely on per-request checks like ADR 0028.**
Cheaper, no `user_id` column. Rejected: suspension's state is a column that
every request re-reads, so per-request enforcement is *sufficient* there. A
password is not that — the old sessions are valid credentials issued against a
password that no longer exists, and nothing in a request would notice.

**A dedicated "set your first password" endpoint** that takes no current
password, instead of reusing `POST /me/password`. Rejected: it is a second
endpoint that sets a password with weaker proof, reachable by anyone who is
signed in. Reusing the existing one means the temporary password is the proof.

**A `temporary_password_expires_at` column**, so an unused temporary password
dies after a day. Genuinely better, and left out deliberately: it needs a
story for what the person sees when it has expired, and the administrator can
simply reset again. Noted as a follow-up in
[plan 0048](../plans/0048-admin-password-reset.md).

## Consequences

**Easier.** An administrator recovers an account from the admin area in
seconds, without database credentials, and it is on the record. The developer
script stops being the recovery path — it stays for the first administrator and
for a broken environment, which is what it is actually for.

**Harder.** `requireAuth` now has an allowlist, and an allowlist is a thing
that rots: a future endpoint that a locked-out account legitimately needs will
have to be added to it, and the symptom of forgetting is a confusing 403. The
list is two entries and sits next to the check, which is the best available
mitigation.

**A live risk this accepts.** Between the reset and the change, a temporary
password exists that an administrator has seen and the registrant has not yet
used. That window is unbounded, because there is no expiry (see alternatives).
It is bounded in blast radius — the account can do nothing but change its own
password — but an administrator who resets an account and tells nobody holds
usable access to it. The audit row is what makes that detectable rather than
invisible, and is the reason the row is not optional.

**Cost.** Two columns, one enum value, one migration, one endpoint, one
generator, an allowlist in `requireAuth`, and a screen that shows a secret
once. The "once" is the part most likely to be got wrong later by making the
response idempotent or cacheable; it is commented where it is returned.
