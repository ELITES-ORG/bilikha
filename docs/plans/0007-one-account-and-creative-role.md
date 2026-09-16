# 0007. One account, creative as an added role

- **Status:** Complete
- **Run before:** [plan 0006](./0006-conversations-and-login-gated-messaging.md)
  — that plan's sign-in gate sends people to registration, and this plan is what
  registration becomes
- **Depends on:** [plan 0005](./0005-profile-editing-and-account.md) — the
  account area and the profile editor this reuses
- **Related:** [ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md) ·
  [ADR 0004](../decisions/0004-unified-account-model.md)

---

## Goal

Everyone registers the same short way. Immediately afterwards they say whether
they want to hire or to offer their work; choosing to offer work continues
straight into profile setup. An existing account can add a creative profile
later, and anyone with one gets a mode switch.

---

## The requirement that matters most

**Profile setup must flow directly out of registration.** Not a link, not a
banner, not something on a dashboard.

[ADR 0004](../decisions/0004-unified-account-model.md) warned that *sign up →
land on empty dashboard → hunt for "become a creative" → fill twelve fields*
bleeds registrants at every seam, and supply is the bottleneck. This plan is
only safe because the creative path is continuous. If an implementation detail
breaks that continuity, it has reintroduced exactly the failure
[ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md) accepted
the risk of.

A creative should experience **one journey in two screens**, not two tasks.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Three specific to this plan:

1. **No dashboard between registration and profile setup.** See above.
2. **Reuse, do not rewrite.** The creative field set, `SubdomainPicker`, and the
   profile editor from [plan 0005](./0005-profile-editing-and-account.md) already
   exist and are correct. This plan moves them; it does not reimplement them.
3. **A base account is never moderated.** Only the creative profile enters
   `pending_review`. Registering must not put anyone in the admin queue.

---

## Scope

**In scope**
- `/register` becomes one short form creating a base account
- An intent step immediately after, continuing into profile setup
- `POST /me/profile` — create a creative profile for an existing account
- Mode switch for accounts that have a profile
- Retire `kind` from the register endpoint

**Out of scope**
- Changing what a creative profile contains
- Organisation accounts
- Removing a creative profile once created. Needs a policy on published
  profiles and inquiry history; own plan
- Anything in [plan 0006](./0006-conversations-and-login-gated-messaging.md)

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Backend — simplify registration | 3 / 3 | Done |
| 2. Backend — create a profile later | 3 / 3 | Done |
| 3. Frontend — registration | 3 / 3 | Done |
| 4. Frontend — intent and continuation | 3 / 3 | Done |
| 5. Frontend — add the role later | 2 / 2 | Done |
| 6. Frontend — mode switch | 2 / 2 | Done |
| 7. Verification | 5 / 5 | Done |

---

# Phase 1 — Backend: simplify registration

### Step 1.1 — Collapse the discriminated union

- [x] **Action.** In `backend/src/modules/auth/auth.schema.ts`, replace the
  `kind` union with a single `registerSchema` — the current **client** shape:
  first name, middle name, last name, suffix, username, email, phone, birth
  date, password, confirm, both consent flags.

Drop `municipalitySlug`, `barangaySlug`, `subdomainSlugs`, `primarySubdomainSlug`
and the `kind` discriminator entirely. Keep every shared validator as-is —
`nameField`, `usernameField`, `passwordField`, the 18+ refinement.

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.2 — Registration creates a user only

- [x] **Action.** In `auth.service.ts`, strip profile creation from
  `registerUser`. It inserts a `users` row and nothing else — no
  `creative_profiles`, no `creative_profile_subdomains`, no municipality lookup.

`users.municipalityId` is already nullable (plan 0004). Leave it null at
registration; it is collected during profile setup.

- [x] **Verify.** Register, then:

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -t -A -c \
  "SELECT count(*) FROM creative_profiles p JOIN users u ON u.id=p.user_id WHERE u.username='<new username>';"
```

Returns `0`. The admin queue shows no new entry under any status.

### Step 1.3 — Update the reference

- [x] **Action.** Update the register endpoint in
  [`api.md`](../reference/api.md): one body shape, no `kind`, response has
  `profileSlug: null`.
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 2 — Backend: create a profile later

### Step 2.1 — Validation

- [x] **Action.** In `backend/src/modules/me/me.schema.ts`, add
  `createProfileSchema` — the creative-only fields: municipality, barangay,
  sub-domains (1–5), primary, display name, bio, contact preference.

This is `updateProfileSchema` minus the name fields, which already live on the
user. Derive one from the other rather than writing the sub-domain rules twice.

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 2.2 — Service

- [x] **Action.** Add `createOwnProfile(userId, input)` to `me.service.ts`, in
  one transaction:

1. **409 if the user already has a profile.** This is a create, not an upsert
2. Resolve municipality, barangay and sub-domain slugs; unknown slugs are 400
3. Update the user's `municipalityId` and `barangayId`
4. Insert the profile with `status: 'pending_review'` and `slug` from
   `usernameNormalized`
5. Insert sub-domain rows with exactly one primary — the partial unique index is
   the guarantee, not application code
6. Write a `moderation_actions` row? **No.** Nothing has been moderated yet;
   the profile simply enters the queue as a new registration does

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 2.3 — Route

- [x] **Action.** Add `POST /profile` to `me.routes.ts`, behind `requireAuth`.
- [x] **Verify.** As an account with no profile → 201, profile is
  `pending_review` and appears in the admin Pending tab. Calling it twice → 409.

---

# Phase 3 — Frontend: registration

### Step 3.1 — Shorten the form

- [x] **Action.** Rewrite `RegisterPage` as the short form only. Remove the
  municipality and barangay selects, the `SubdomainPicker`, and everything
  posting creative fields.

Keep the draft autosave, the password exclusion, and the field-error handling —
all of it still applies.

- [x] **Verify.** Typecheck and lint exit 0. Registering creates an account with
  no profile.

### Step 3.2 — Honest heading

- [x] **Action.** The page no longer says "Register as a creative". It is
  **Create your account**, with a line stating you can list your creative work
  in the next step or later.
- [x] **Verify.** Nothing on the page implies the account is creative-only.

### Step 3.3 — Retire the inline client form

- [x] **Action.** Remove the registration and login phases from
  `InquiryComposer`, and delete `RegisterPayload`'s `kind` field.
- [x] **Verify.** No `kind: 'client'` remains anywhere in `frontend/src`.

---

# Phase 4 — Frontend: intent and continuation

**The heart of the plan.** Read the requirement section again before starting.

### Step 4.1 — The intent step

- [x] **Action.** Create `frontend/src/pages/onboarding/IntentPage.tsx` at
  `/welcome`, behind `RequireAuth`. Registration redirects here on success.

Two large choices:

- **I'm looking to hire** → `/directory`
- **I want to offer my creative work** → `/welcome/profile`

One question, no other UI. No stats, no dashboard, no navigation that invites
wandering off.

- [x] **Verify.** Registering lands here, not on `/` and not on `/account`.

### Step 4.2 — Profile setup as a continuation

- [x] **Action.** Create `frontend/src/pages/onboarding/ProfileSetupPage.tsx` at
  `/welcome/profile`, reusing the profile editor's field components from
  [plan 0005](./0005-profile-editing-and-account.md). Posts to
  `POST /me/profile`.

It must read as **step 2 of signing up**, not as a settings screen: a heading
that continues the flow, a progress indication, and a single primary action.

- [x] **Verify.** A creative goes register → intent → profile setup → submitted
  without ever seeing a dashboard or a link they must find.

### Step 4.3 — Confirmation

- [x] **Action.** On submit, land on a confirmation stating the profile is being
  reviewed and will appear in the directory once approved. The status banner
  from [plan 0005](./0005-profile-editing-and-account.md) takes over from there.
- [x] **Verify.** The banner shows `pending_review` on every page afterwards.

---

# Phase 5 — Frontend: adding the role later

### Step 5.1 — Offer your work

- [x] **Action.** In the account area, when the user has **no** creative
  profile, show an **Offer your creative work** section explaining that a
  profile is reviewed before appearing, linking to `/welcome/profile`.

This one mechanism covers both people: someone who chose "hire" and later
changed their mind, and someone who dropped out of setup. That is why
[ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md) stores
no intent flag.

- [x] **Verify.** Visible for an account with no profile; absent once one
  exists.

### Step 5.2 — Reuse the setup page

- [x] **Action.** `/welcome/profile` serves both entry points. When reached
  from the account area rather than registration, the copy reads as adding a
  profile rather than continuing signup.
- [x] **Verify.** Both routes produce an identical `pending_review` profile.

---

# Phase 6 — Frontend: mode switch

### Step 6.1 — The switch

- [x] **Action.** In `SiteHeader`, for users **with** a creative profile, show a
  switch between **Hiring** and **My creative work**. It changes which
  navigation is emphasised — directory and messages, versus profile, inbox and
  status — and persists the choice in `localStorage`, wrapped in `try`/`catch`.

It is a view preference, never a permission. Every route stays reachable in
either mode; a creative can hire, per
[ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md).

- [x] **Verify.** The switch appears only with a profile, survives a reload, and
  blocks nothing.

### Step 6.2 — Sensible default

- [x] **Action.** Default to **My creative work** for an account that has a
  profile, since that is the side with something to manage. No stored preference
  means the default applies.
- [x] **Verify.** A fresh browser lands on the creative view.

---

# Phase 7 — Verification

### Step 7.1 — Registration is a base account

| Check | Expected |
|---|---|
| Register | 201, `profileSlug: null` |
| `creative_profiles` rows | 0 |
| Admin queue, all tabs | New account absent |
| `users.municipality_id` | null |

### Step 7.2 — The continuous creative path

- [x] **Verify** in a private window: register → intent → profile setup →
  confirmation, **without a dashboard and without hunting for a link**.
- [x] **Verify** the profile is `pending_review` and appears in the admin
  Pending tab.

### Step 7.3 — Adding the role later

- [x] **Verify.** Register, choose hire, go to the account area, use *Offer your
  creative work*, complete setup. Result is identical to the continuous path.
- [x] **Verify.** `POST /me/profile` a second time → 409.

### Step 7.4 — Roles are not exclusive

- [x] **Verify.** An account with a published profile can still open another
  creative's profile and contact them.
- [x] **Verify.** The mode switch changes emphasis only; every route stays
  reachable in both modes.

### Step 7.5 — Full pass

- [x] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run docs:check` all exit 0.

---

## Acceptance

- [x] One registration form; `kind` is gone from schema, service, and frontend
- [x] Registering creates no creative profile and no moderation entry
- [x] The creative path runs register → intent → setup with no dashboard between
- [x] An existing account can add a creative profile and reach the same result
- [x] A creative can contact other creatives
- [x] The mode switch is a view preference, not a permission
- [x] `api.md` and `data-model.md` updated
- [x] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Removing a creative profile | Needs a policy for published profiles and existing conversations |
| Organisation accounts | [ADR 0005](../decisions/0005-organization-pages.md); own plan |
| Prompting dormant accounts with no profile | Worth doing once there is data showing the seam leaks |
