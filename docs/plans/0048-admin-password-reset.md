# 0048. Let an administrator reset a password from the admin area

- **Status:** In progress
- **Owner:** userMarcPaul
- **Related:** [ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [ADR 0035](../decisions/0035-the-admin-area-is-a-layout.md) ·
  [ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md) ·
  [Change the database schema](../guides/change-the-database-schema.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #23](https://github.com/ELITES-ORG/bilikha/issues/23)

## Goal

An administrator recovers a locked-out account from `/admin/accounts` without
database credentials: one action issues a temporary password shown once,
revokes every session that account holds, and leaves it unable to do anything
until it sets a new password. The reset is on the record; the password is not.

## Rules for whoever executes this

- **Read [ADR 0051](../decisions/0051-an-admin-reset-issues-a-one-time-password.md)
  first.** Why there is no email link, why sessions are deleted here when
  suspension deliberately does not, and why the forced change is enforced in
  `requireAuth` rather than in the router.
- **The temporary password is returned exactly once.** Nothing may log it,
  store it, or make the response replayable.
- **Backend relative imports end in `.js`.**
- **Read the generated migration SQL** before applying it.

## Prerequisites

- [x] Branch `feat/admin-password-reset` cut from `main`.
- [x] Database running and current:
      `npm run db:up && npm --prefix backend run db:migrate && npm --prefix backend run db:seed`
      → `domains: 9  subdomains: 81`.
- [ ] ADR 0051 Accepted. It is **Proposed**; only reyxdz accepts. Execution went
      ahead on userMarcPaul's instruction, and nothing is merged, so the
      decision is still reversible by discarding this branch.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema and sessions | 4 / 4 | Done |
| 2. The reset itself | 4 / 4 | Done |
| 3. The forced change | 3 / 3 | Done |
| 4. The admin screen | 3 / 3 | Done — not rendered in a browser |
| 5. Documentation | 3 / 3 | Done |

---

## Phase 1 — Schema and sessions

### Step 1.1 — Add the two user columns and the enum value

- [x] **Action.** In `backend/src/db/schema/users.ts`, after `lastLoginAt`:
      ```ts
          // Set by an administrator's password reset (ADR 0051). While true,
          // requireAuth refuses every request but reading the session and
          // setting a new password.
          mustChangePassword: boolean('must_change_password').notNull().default(false),
      ```
      Import `boolean` from `drizzle-orm/pg-core`.
      In `backend/src/db/schema/profiles.ts`, add `'password_reset'` to the end
      of `moderationActionEnum`, with a comment that no reason is recorded
      because nothing about a reset needs explaining to its subject.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.2 — Give `sessions` a `user_id`

- [x] **Action.** In `backend/src/db/schema/sessions.ts` add:
      ```ts
          // Lifted out of the session blob so "every session for this account"
          // is a query (ADR 0051). Nullable: a session exists before anyone
          // signs in. The cascade also clears a deleted account's sessions,
          // which previously lingered until the pruner reached them.
          userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
      ```
      plus `index('sessions_user_id_idx').on(table.userId)`.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 1.3 — Write it from the session store

- [x] **Action.** In `backend/src/lib/session-store.ts`, `set()` already
      serialises `SessionData`; read `userId` off it and include it in the
      insert and in the `onConflictDoUpdate` set.
- [x] **Verify.** Sign in locally, then
      `select user_id from sessions where user_id is not null` returns a row.

### Step 1.4 — Generate, read and apply the migration

- [x] **Action.** `npm --prefix backend run db:generate` → `backend/drizzle/0027_lying_silver_sable.sql`, read the SQL, then
      `npm --prefix backend run db:migrate`.
- [x] **Verify.** The SQL adds `must_change_password` (default false, not
      null), `sessions.user_id` with its FK and index, and one
      `ALTER TYPE ... ADD VALUE 'password_reset'`. **No `DROP`.**

---

## Phase 2 — The reset itself

### Step 2.1 — The generator

- [x] **Action.** Create `backend/src/lib/temporary-password.ts`: 16 characters
      from an alphabet with no look-alikes, via `crypto.randomInt`. Comment why
      the alphabet is reduced — it gets read aloud over a phone.
- [x] **Verify.** A unit test asserts the length, the alphabet, and that two
      calls differ.

### Step 2.2 — The service

- [x] **Action.** Add `resetAccountPassword({ adminId, userId })` to
      `backend/src/modules/admin/admin.service.ts`, following
      `setAccountStatus` for its guards: refuse self, refuse an administrator
      target, 404 an unknown account. In one transaction: write the argon2 hash
      and `mustChangePassword: true`, delete every `sessions` row for that
      user, and insert a `password_reset` moderation action. Return
      `{ username, temporaryPassword }` and comment that this is the only time
      the password exists outside the hash.
- [x] **Verify.** Tests in step 2.4.

### Step 2.3 — The route and its limiter

- [x] **Action.** Add `adminPasswordResetLimiter` to
      `backend/src/middleware/rate-limit.ts` — 10 per administrator per hour,
      keyed on `req.session.userId`, failures not counted. Add
      `POST /accounts/:id/reset-password` to
      `backend/src/modules/admin/admin.routes.ts`.
- [x] **Verify.** Signed out → `404` (the admin surface does not advertise
      itself); as a non-admin → `404`.

### Step 2.4 — Test it

- [x] **Action.** Add cases to `backend/src/modules/admin/moderation.test.ts`
      or a new `password-reset.test.ts`: the hash changes; the temporary
      password verifies against it; `mustChangePassword` is set; every session
      row for that user is gone and another user's survive; a
      `password_reset` audit row exists with `reason` null and no password
      anywhere in it; resetting yourself throws; resetting an administrator
      throws.
- [x] **Verify.** `npm --prefix backend run test` passes.

---

## Phase 3 — The forced change

### Step 3.1 — Gate it in `requireAuth`

- [x] **Action.** In `backend/src/middleware/require-auth.ts`, select
      `mustChangePassword` alongside `status`. When set, and the request is not
      one of the two the account needs — `/api/v1/auth/me` and
      `/api/v1/me/password` — refuse with
      `AppError.forbidden` carrying code `PASSWORD_CHANGE_REQUIRED`. Keep the
      allowlist next to the check and comment that forgetting to extend it
      shows up as a confusing 403.
- [x] **Verify.** Step 3.3.

### Step 3.2 — Clear it on a successful change, and surface it

- [x] **Action.** In `backend/src/modules/me/me.service.ts`, `changePassword`
      sets `mustChangePassword: false` with the new hash. Add
      `mustChangePassword: boolean` to `PublicUser` in
      `backend/src/contracts/auth.ts` and to `toPublicUser`.
- [x] **Verify.** `npm --prefix backend run typecheck` passes.

### Step 3.3 — Test the lockout end to end

- [x] **Action.** A test that resets an account, then asserts a request to a
      normal endpoint is refused with `PASSWORD_CHANGE_REQUIRED`, that
      `POST /me/password` with the temporary password succeeds, and that the
      same normal endpoint then works.
- [x] **Verify.** `npm --prefix backend run test` passes.

---

## Phase 4 — The admin screen

### Step 4.1 — The data layer

- [x] **Action.** Add `useResetAccountPassword` to
      `frontend/src/features/admin/api.ts`, following `useSetAccountStatus`.
      It must not be a query and must not be retried — it mints a secret.
- [x] **Verify.** `npm --prefix frontend run typecheck` passes.

### Step 4.2 — Show the password once

- [x] **Action.** In `frontend/src/pages/admin/AdminAccountsPage.tsx`, add a
      **Reset password** action to the non-administrator branch of
      `AccountRow`, behind a confirmation naming the account. On success show
      the temporary password in the row with a copy button and a line saying it
      will not be shown again and that the person must change it at next
      sign-in. Tokens only.
- [x] **Verify.** `npm --prefix frontend run lint` and `typecheck` pass.

### Step 4.3 — Send a locked-out account to the change form

- [x] **Action.** Create `frontend/src/pages/account/ForcePasswordChangePage.tsx`
      reusing `frontend/src/features/me/PasswordForm.tsx`, routed at
      `/change-password` in `frontend/src/App.tsx`. In
      `frontend/src/features/auth/RequireAuth.tsx`, redirect there when
      `user.mustChangePassword` and the route is not already that one.
- [x] **Verify.** `npm --prefix frontend run build && npm run check:bundle` —
      the budget is unchanged.

---

## Phase 5 — Documentation

### Step 5.1 — The API reference

- [x] **Action.** Document `POST /api/v1/admin/accounts/:id/reset-password` in
      the `/admin/*` section of `docs/reference/api.md`, including that the
      password appears once, the 400s for self and administrator targets, the
      rate limit, and the new `PASSWORD_CHANGE_REQUIRED` refusal that every
      other authenticated route can now return.
- [x] **Verify.** `npm run docs:check` passes.

### Step 5.2 — The data model

- [x] **Action.** Add `must_change_password` to `users`, `user_id` to
      `sessions`, and `password_reset` to the `moderation_actions` enum in
      `docs/reference/data-model.md`.
- [x] **Verify.** `npm run docs:check` passes.

### Step 5.3 — Point the script at the screen

- [x] **Action.** `backend/src/scripts/reset-password.ts` says it is "the only
      recovery path". Correct it: the admin area is now the path, and the
      script is for the first administrator and for a broken environment.
      Reflect that in `docs/reference/commands.md` too.
- [x] **Verify.** `grep -n "only recovery path" backend/src/scripts/reset-password.ts`
      returns nothing.

---

## Acceptance

- [ ] An administrator resets an account from `/admin/accounts` and is shown a
      temporary password once.
- [ ] That password signs the account in and nothing else works until it is
      changed.
- [ ] Every session the account held is gone; other accounts' sessions are not.
- [ ] A `password_reset` row names the administrator, the account and the time,
      and contains no password.
- [ ] Resetting your own account, or another administrator's, is refused.
- [ ] Non-admins and signed-out callers get `404`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check` and
      `npm run check:bundle` pass, with the bundle budget unchanged.

## Follow-ups

- **No expiry on the temporary password.** An unused one stays valid
  indefinitely. A `temporary_password_expires_at` column is the fix and needs a
  story for what an expired one shows; deliberately out of scope (ADR 0051,
  alternatives).
- **The person is not told.** No notification is sent, so a reset is invisible
  to its subject until they next sign in. Worth revisiting with the
  notification centre.
- **Self-service reset** remains impossible until email or phone is verified.
  That is the real fix for recovery, and ADR 0051 is superseded when it lands.
