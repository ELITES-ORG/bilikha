# 0005. Profile editing and the account area

- **Status:** Ready
- **Depends on:** [plan 0003](./0003-admin-moderation.md) (moderation queue) and
  [plan 0004](./0004-client-accounts-and-inquiries.md) (`contactPreference`)
- **Related:** [ADR 0016](../decisions/0016-edits-never-unpublish.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md) ·
  [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md)

---

## Goal

A creative can edit their own profile, resubmit after a rejection, and change
their password. An administrator can see which published profiles have been
edited since they were last reviewed.

---

## Why this before search or images

Three columns exist today that nothing can ever write after registration:
`displayName`, `bio`, and `contactPreference`. The only code path that updates a
`creative_profile` is admin moderation.

So every published profile is name, municipality, and sub-domains — and there is
nothing to read. Search over empty profiles finds the same empty cards faster,
and portfolio images need an editor to upload into. This plan is the
prerequisite for both.

It also closes the dead end recorded in
[plan 0003](./0003-admin-moderation.md#known-dead-end): a rejected registrant
currently has nothing to fix and no way to resubmit.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Three specific to this plan:

1. **Status transitions on edit follow
   [ADR 0016](../decisions/0016-edits-never-unpublish.md) exactly.** Published
   stays published and gets flagged. Suspended returns to `pending_review`.
   Nothing else changes status. Do not invent a fourth case.
2. **Only publicly visible changes set the flag.** Changing
   `contactPreference` or a password is not a moderation event and must not
   appear in the Edited queue.
3. **A user edits only their own profile.** Ownership comes from
   `req.session.userId`, never from anything in the request.

---

## Scope

**In scope**
- Read and update your own profile: display name, bio, sub-domains,
  municipality, barangay, contact preference
- Edit your own name fields
- Resubmit after rejection
- Change password while signed in
- An account area the signed-in user actually lands on
- Admin: an **Edited** queue tab and an acknowledge action

**Out of scope**
- Portfolio images — its own plan, built on this editor
- Changing username or email. Both are identity anchors; a change flow needs
  verification that does not exist ([ADR 0013](../decisions/0013-username-password-auth-sprint-1.md))
- Deleting an account. Needed for RA 10173 eventually; own plan
- Client-side profile editing beyond name and password. Clients have no profile
- A report button. [ADR 0016](../decisions/0016-edits-never-unpublish.md) notes
  its absence is the main cost of this decision

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 3 / 3 | Complete |
| 2. Migration | 0 / 2 | Not started |
| 3. Backend — read own profile | 0 / 2 | Not started |
| 4. Backend — update profile | 0 / 4 | Not started |
| 5. Backend — change password | 0 / 2 | Not started |
| 6. Backend — admin edited queue | 0 / 3 | Not started |
| 7. Frontend — account area | 0 / 4 | Not started |
| 8. Frontend — resubmit and password | 0 / 3 | Not started |
| 9. Verification | 0 / 5 | Not started |

---

# Phase 1 — Schema

### Step 1.1 — Flag column

- [x] **Action.** In `backend/src/db/schema/profiles.ts`, add to
  `creativeProfiles`:

```ts
    // Set when a publicly visible field changes on an already-published
    // profile. The profile stays live; this is what puts it in the admin
    // Edited queue. Cleared when an admin acknowledges it.
    // See ADR 0016.
    editedSinceReviewAt: timestamp('edited_since_review_at', { withTimezone: true }),
```

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.2 — Moderation action for acknowledging

- [x] **Action.** Add `'acknowledged_edit'` to `moderationActionEnum` in the
  same file.

Acknowledging is a moderation decision and belongs in the same audit trail —
"who looked at this edit and when" needs an answer for the same reason
"who approved this" does.

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.3 — Index the edited queue

- [x] **Action.** Add to `creativeProfiles`:

```ts
    index('creative_profiles_edited_idx').on(table.editedSinceReviewAt),
```

- [x] **Verify.** `npm run typecheck` exits 0.

---

# Phase 2 — Migration

### Step 2.1 — Generate and read

- [ ] **Action.** `npm --prefix backend run db:generate`, then read the file.
- [ ] **Verify.** One added column, one index, and an `ALTER TYPE …  ADD VALUE
  'acknowledged_edit'`. **Stop if any `DROP` appears.**

> Postgres cannot add an enum value inside a transaction in older versions. If
> the migration fails with `ALTER TYPE ... cannot run inside a transaction
> block`, split the enum change into its own migration file.

### Step 2.2 — Apply

- [ ] **Action.** `npm run db:migrate`
- [ ] **Verify.**

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "\d creative_profiles" | grep edited_since_review_at
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "SELECT unnest(enum_range(NULL::moderation_action));"
```

Column present; enum lists four values.

---

# Phase 3 — Backend: read your own profile

### Step 3.1 — Service

- [ ] **Action.** Create `backend/src/modules/me/me.service.ts` with
  `getOwnProfile(userId)`.

Returns the editable shape — which, unlike the public one, **does** include the
user's own contact details and `contactPreference`, because they are looking at
their own record:

```ts
export interface OwnProfile {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  displayName: string | null;
  bio: string | null;
  municipalitySlug: string | null;
  barangaySlug: string | null;
  contactPreference: string;
  email: string;
  phone: string;
  status: string;
  rejectionReason: string | null;
  editedSinceReviewAt: string | null;
  subdomainSlugs: string[];
  primarySubdomainSlug: string | null;
}
```

Returns `null` when the user has no creative profile — clients are not an error
case.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 3.2 — Route

- [ ] **Action.** Create `backend/src/modules/me/me.routes.ts`, mount at `/me`
  behind `requireAuth`, with `GET /profile`.
- [ ] **Verify.** As a creative it returns the profile; as a client it returns
  `{ "data": null }`, not a 404.

---

# Phase 4 — Backend: update your profile

The core of the plan. Get the status rules exactly right.

### Step 4.1 — Validation

- [ ] **Action.** Create `backend/src/modules/me/me.schema.ts`:

```ts
export const updateProfileSchema = z.object({
  firstName: nameField,
  middleName: optionalNameField,
  lastName: nameField,
  suffix: z.string().trim().max(12).optional().or(z.literal('').transform(() => undefined)),
  displayName: z.string().trim().max(80).optional().or(z.literal('').transform(() => undefined)),
  bio: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
  municipalitySlug: z.string().trim().min(1, 'Select a municipality'),
  barangaySlug: z.string().trim().optional().or(z.literal('').transform(() => undefined)),
  subdomainSlugs: z.array(z.string().trim().min(1)).min(1).max(5),
  primarySubdomainSlug: z.string().trim().min(1),
  contactPreference: z.enum(['phone', 'email']),
}).refine((d) => d.subdomainSlugs.includes(d.primarySubdomainSlug), {
  path: ['primarySubdomainSlug'],
  message: 'The primary must be one of your selected sub-domains',
});
```

Reuse `nameField` and `optionalNameField` from `auth.schema.ts` — export them
rather than redefining. Two copies of the Filipino-name regex will drift.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.2 — Decide the status transition

- [ ] **Action.** In `me.service.ts`, write a pure helper and unit-test it by
  reasoning, not by running the app:

```ts
/** ADR 0016. The only three outcomes. */
export function nextStatusAfterEdit(
  current: ProfileStatus,
  publicFieldsChanged: boolean,
): { status: ProfileStatus; flagEdited: boolean } {
  if (current === 'suspended') return { status: 'pending_review', flagEdited: false };
  if (current === 'published' && publicFieldsChanged) {
    return { status: 'published', flagEdited: true };
  }
  return { status: current, flagEdited: false };
}
```

`publicFieldsChanged` is true when any of name, display name, bio, sub-domains,
municipality or barangay differs from what is stored. It is **false** when only
`contactPreference` changed.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.3 — Apply the update

- [ ] **Action.** Write `updateOwnProfile(userId, input)` in one transaction:

1. Load the current profile; 404 if the user has none
2. Resolve municipality, barangay, and sub-domain slugs — unknown slugs are 400,
   exactly as registration does
3. Compute `publicFieldsChanged` by comparing against stored values
4. Update `users` name fields and `creative_profiles` fields
5. Replace the sub-domain rows: delete all for this profile, insert the new set
   with one primary. **The partial unique index will reject two primaries** —
   rely on it rather than trusting application code
6. Apply `nextStatusAfterEdit`. When it returns `pending_review`, clear
   `rejectionReason` — the rejection no longer describes the current profile
7. When the status changes, write a `moderation_actions` row with action
   `returned_to_pending` and `adminId: null` — the registrant did this, not an
   admin

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.4 — Route

- [ ] **Action.** Add `PUT /profile` to `me.routes.ts`.
- [ ] **Verify.** Signed out → 401. As a client → 404. As a creative → 200.

---

# Phase 5 — Backend: change password

### Step 5.1 — Service and schema

- [ ] **Action.** Add to `me.schema.ts`:

```ts
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: passwordField,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
}).refine((d) => d.newPassword !== d.currentPassword, {
  path: ['newPassword'], message: 'Choose a different password',
});
```

- [ ] **Action.** `changePassword(userId, input)` verifies the current password
  with `verifyPassword` before hashing the new one. A wrong current password is
  a 401, not a 400.

**Regenerate the session after a successful change** and keep the user signed
in. A password change is the moment to invalidate a session id that may have
been captured.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.2 — Route and rate limit

- [ ] **Action.** Add `POST /password` to `me.routes.ts`, behind a limiter of 5
  attempts per user per hour with `skipSuccessfulRequests: true`. Without it,
  the endpoint is an oracle for guessing the current password.
- [ ] **Verify.** Six wrong attempts: the sixth is 429.

---

# Phase 6 — Backend: the Edited queue

### Step 6.1 — Extend the admin list

- [ ] **Action.** In `admin.service.ts`, allow `status=edited` in
  `listProfiles`, meaning `status = 'published' AND edited_since_review_at IS
  NOT NULL`, ordered oldest-edit first.
- [ ] **Action.** Include the same count in `statusCounts`.
- [ ] **Verify.** `GET /admin/profiles?status=edited` returns only flagged,
  published profiles.

### Step 6.2 — Acknowledge

- [ ] **Action.** Add `'acknowledged_edit'` to the `moderateSchema` action enum
  and handle it in `moderate()`: clears `editedSinceReviewAt`, leaves `status`
  untouched, writes the audit row.
- [ ] **Verify.** Acknowledging removes the profile from the Edited tab and
  leaves it published.

### Step 6.3 — Reference docs

- [ ] **Action.** Update [`api.md`](../reference/api.md) and
  [`data-model.md`](../reference/data-model.md).
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 7 — Frontend: the account area

### Step 7.1 — Data layer

- [ ] **Action.** Create `frontend/src/features/me/` with `types.ts` and
  `api.ts`. The update mutation must invalidate both the `me` profile query and
  `authKeys.me`, since status may have changed.
- [ ] **Verify.** Typecheck exits 0.

### Step 7.2 — Account shell

- [ ] **Action.** Create `frontend/src/pages/account/AccountPage.tsx` at
  `/account`, behind `RequireAuth`, with sections for **Profile** and
  **Security**. Show Profile only when the user has a creative profile.
- [ ] **Verify.** A client sees Security only, and no empty Profile section.

### Step 7.3 — Profile editor

- [ ] **Action.** Build the form: name fields, display name, bio with a
  character counter, `SubdomainPicker` (reuse it), municipality and barangay
  selects, contact preference as a radio pair.

Requirements:

- Pre-filled from `GET /me/profile`
- **Warn before saving when the profile is published**: a line stating the
  profile stays visible and the change will be reviewed. Do not imply it will be
  taken down — [ADR 0016](../decisions/0016-edits-never-unpublish.md) guarantees
  it will not
- Disable save while unchanged
- Field errors from `toFieldErrors`

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 7.4 — Route and navigation

- [ ] **Action.** Add the route and an **Account** link in `SiteHeader` for any
  signed-in user.
- [ ] **Verify.** Present for both client and creative accounts.

---

# Phase 8 — Frontend: resubmit and password

### Step 8.1 — Resubmit path

- [ ] **Action.** When `profileStatus === 'suspended'`, the status banner gains
  a link to `/account` reading **Edit and resubmit**. On the editor, show the
  rejection reason above the form so they can see what to fix.
- [ ] **Verify.** As a rejected user: the banner links through, the reason is
  visible, saving returns the profile to `pending_review`, and the banner
  changes to "being reviewed".

### Step 8.2 — Password form

- [ ] **Action.** Build the Security section: current password, new, confirm.
  `autoComplete="current-password"` and `"new-password"`. On success, clear the
  fields and confirm plainly.
- [ ] **Verify.** Wrong current password shows an error on that field, not a
  banner.

### Step 8.3 — Admin Edited tab

- [ ] **Action.** Add the **Edited** tab to the queue with its count, and an
  **Acknowledge** action on the detail view for flagged profiles.
- [ ] **Verify.** Editing a published profile as a creative makes it appear
  there; acknowledging removes it.

---

# Phase 9 — Verification

### Step 9.1 — The three transitions

| Start | Edit | Expected |
|---|---|---|
| `published` | bio changed | stays `published`, `edited_since_review_at` set |
| `published` | only `contactPreference` | stays `published`, **flag not set** |
| `suspended` | anything | `pending_review`, `rejection_reason` cleared |
| `pending_review` | anything | stays `pending_review`, flag not set |

### Step 9.2 — Ownership

| Attempt | Expected |
|---|---|
| `PUT /me/profile` signed out | 401 |
| Same as a client | 404 |
| Editing while suspended | Allowed — this is the resubmit path |
| Two primary sub-domains in one payload | Rejected by the partial unique index |

### Step 9.3 — Password

- [ ] **Verify.** Wrong current password → 401. Correct → 200, old password no
  longer works, new one does, and the session survives.
- [ ] **Verify.** Six wrong attempts → 429.

### Step 9.4 — Audit trail

- [ ] **Verify.** A resubmit writes a `moderation_actions` row with
  `returned_to_pending` and a null `admin_id`. An acknowledge writes
  `acknowledged_edit` with the admin's id.

### Step 9.5 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] All 9 phases complete
- [ ] The four transitions in 9.1 behave exactly as stated
- [ ] No edit ever removes a profile from the directory
- [ ] A rejected registrant can fix and resubmit without an administrator
- [ ] Password change works and rate limits
- [ ] Every status change still has a matching audit row
- [ ] `api.md` and `data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Portfolio images | Built on this editor. Its own plan, and the biggest performance risk in the product |
| Report button | The main cost of [ADR 0016](../decisions/0016-edits-never-unpublish.md). Until it exists, defacement is found only by an admin checking the Edited tab |
| Changing username or email | Identity anchors; needs verification that does not exist |
| Account deletion and data export | RA 10173 obligations. Own plan |
| Search and the alias table | Now unblocked — profiles will finally have text to search |
