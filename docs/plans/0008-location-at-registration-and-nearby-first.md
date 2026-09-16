# 0008. Location at registration, and nearby-first ordering

- **Status:** Ready
- **Depends on:** [plan 0007](./0007-one-account-and-creative-role.md) — the base
  account form this adds to
- **Related:** [ADR 0020](../decisions/0020-location-required-biliran-only.md)

---

## Goal

Every account supplies a Biliran municipality and barangay at registration. The
directory shows creatives from the viewer's own municipality first.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Three specific to this plan:

1. **Location is collected once.** Adding it to registration means removing it
   from creative profile setup. Two places asking for the same thing will drift.
2. **The directory endpoint stays public.** It becomes session-*aware*, not
   session-*required*. An anonymous visitor must still get a full listing.
3. **Do not backfill the 33 existing clients.**
   [ADR 0020](../decisions/0020-location-required-biliran-only.md) leaves them
   null deliberately. Any ordering logic must tolerate a null viewer
   municipality.

---

## Scope

**In scope**
- Municipality and barangay required on the registration form and endpoint
- Removed from creative profile setup, kept in the profile editor
- Directory ordering: same municipality first
- A visible explanation in the directory of why the order looks the way it does

**Out of scope**
- An "outside Biliran" option — declined in
  [ADR 0020](../decisions/0020-location-required-biliran-only.md)
- Backfilling or prompting existing accounts
- Barangay-level proximity. Municipality is the grain
- Distance or travel time. Same municipality or not, nothing finer
- Filtering by municipality, which already exists — this is ordering

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Backend — registration | 3 / 3 | Done |
| 2. Backend — profile setup | 2 / 2 | Done |
| 3. Backend — nearby-first | 3 / 3 | Done |
| 4. Frontend — registration form | 3 / 3 | Done |
| 5. Frontend — setup and directory | 3 / 3 | Done |
| 6. Verification | 0 / 5 | Not started |

---

# Phase 1 — Backend: registration

### Step 1.1 — Require location

- [x] **Action.** In `backend/src/modules/auth/auth.schema.ts`, add to
  `registerSchema`:

```ts
  municipalitySlug: z.string().trim().min(1, 'Select a municipality'),
  barangaySlug: z.string().trim().min(1, 'Select a barangay'),
```

Both required. Barangay is no longer optional — all 132 exist now.

- [x] **Verify.** `npm run typecheck` exits 0; a registration without them is a
  400 naming both fields.

### Step 1.2 — Resolve and store

- [x] **Action.** In `registerUser`, resolve the municipality by slug and the
  barangay by slug **scoped to that municipality**, then store both on the user.

An unknown municipality, an unknown barangay, or a barangay belonging to a
different municipality are each a 400 naming the offending field. The last case
matters: barangay slugs are unique per municipality, not globally, so `looc`
exists in Cabucgayan, Caibiran and Culaba.

- [x] **Verify.** Registering with `municipalitySlug: 'naval'` and
  `barangaySlug: 'looc'` — a Culaba barangay — returns 400, not a silently wrong
  row.

### Step 1.3 — Reference

- [x] **Action.** Update the register endpoint in
  [`api.md`](../reference/api.md).
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 2 — Backend: profile setup

### Step 2.1 — Stop asking twice

- [x] **Action.** Remove `municipalitySlug` and `barangaySlug` from
  `createProfileSchema` in `me.schema.ts`, and stop writing them in
  `createOwnProfile`. The user already has both from registration.

**Leave `updateProfileSchema` alone.** Changing where you live is a legitimate
later edit; supplying it twice at signup is not.

- [x] **Verify.** `POST /me/profile` with no location fields → 201, and the
  user's existing municipality is unchanged.

### Step 2.2 — Guard the ordering input

- [x] **Action.** `createOwnProfile` must not null out a user's municipality.
  Confirm nothing in the create path writes to those columns at all.
- [x] **Verify.** Register, note the municipality, create a profile, confirm it
  is identical.

---

# Phase 3 — Backend: nearby-first

### Step 3.1 — Session-aware public endpoint

- [x] **Action.** In `profiles.routes.ts`, read `req.session.userId` **without**
  requiring it, look up that user's `municipalityId`, and pass it to
  `listPublished` as `viewerMunicipalityId`.

Signed out, or signed in with a null municipality, it is `null` and ordering is
unchanged. **Do not add `requireAuth`** — the directory is public and must stay
so ([ADR 0017](../decisions/0017-sign-in-before-contacting.md)).

- [x] **Verify.** `GET /creatives` signed out still returns 200 with the full
  list.

### Step 3.2 — Order by proximity, then recency

- [x] **Action.** In `listPublished`, when `viewerMunicipalityId` is present,
  order by whether the profile's municipality matches, then by the existing
  `createdAt desc`:

```ts
const nearbyFirst = viewerMunicipalityId
  ? [desc(sql`${users.municipalityId} = ${viewerMunicipalityId}`), desc(creativeProfiles.createdAt)]
  : [desc(creativeProfiles.createdAt)];
```

A boolean sorts false-then-true ascending, so `desc` puts matches on top. Keep
`createdAt` as the tiebreaker — without a stable second key, pagination can
repeat or skip rows.

- [x] **Action.** Return `isNearby` per row so the UI can label it.
- [x] **Verify.** As a Naval client, Naval creatives lead the list; as a Kawayan
  client the Kawayan ones do; signed out the order matches the old behaviour.

### Step 3.3 — Index

- [x] **Action.** Confirm `users_municipality_idx` exists — it does, from plan
  0001. No new migration.
- [x] **Verify.** `EXPLAIN` on the list query shows no sequential scan on
  `users`.

---

# Phase 4 — Frontend: registration form

### Step 4.1 — Add the fields

- [x] **Action.** In `RegisterPage`, add a **Location** section with a
  municipality select from `useMunicipalities()` and a dependent barangay select
  from `useBarangays(selectedMunicipality)`. Both required.

Reset barangay to empty whenever municipality changes. Leaving a stale barangay
selected across a municipality change is how a Culaba `looc` ends up submitted
against Naval.

- [x] **Verify.** Changing municipality clears barangay; submitting without
  either shows field errors.

### Step 4.2 — Barangay is no longer unavailable

- [x] **Action.** Remove the "Barangay list is not yet available" degraded
  state. All 132 exist. If the list ever comes back empty, that is now an error
  worth surfacing rather than a normal condition.
- [x] **Verify.** Every municipality returns a non-empty list.

### Step 4.3 — Keep the draft honest

- [x] **Action.** Include both fields in the localStorage draft, and on restore
  clear barangay if the stored municipality no longer matches.
- [x] **Verify.** Half-fill, reload, values return coherently.

---

# Phase 5 — Frontend: setup and directory

### Step 5.1 — Drop location from setup

- [x] **Action.** Remove municipality and barangay from `ProfileCraftFields` as
  used by `ProfileSetupPage`.

`ProfileEditor` shares that component, and **still needs them**. Either
parameterise the shared component or split the location fields out — do not
delete them outright.

- [x] **Verify.** Setup shows no location fields; the profile editor still does
  and still saves them.

### Step 5.2 — Show why the order is what it is

- [x] **Action.** On `DirectoryPage`, when the viewer has a municipality, show a
  line above the results — *"Showing creatives in <Municipality> first"* — and
  mark nearby rows with a `Badge`.

An unexplained reordering reads as randomness. Say it out loud.

- [x] **Verify.** The line appears for a located account and is absent for an
  anonymous visitor.

### Step 5.3 — Do not break filtering

- [x] **Action.** Confirm the existing municipality filter still works and takes
  precedence — filtering to Kawayan shows only Kawayan, regardless of where the
  viewer is.
- [x] **Verify.** Filter and ordering do not fight.

---

# Phase 6 — Verification

### Step 6.1 — Registration

| Attempt | Expected |
|---|---|
| No municipality or barangay | 400 naming both |
| Unknown municipality slug | 400 |
| Barangay from a different municipality (`naval` + `looc`) | 400 |
| Valid pair | 201, both stored |

### Step 6.2 — Collected once

- [ ] **Verify.** `POST /me/profile` with no location fields → 201, and the
  user's municipality is unchanged from registration.

### Step 6.3 — Ordering

- [ ] **Verify.** Register a Naval client → Naval creatives lead. Register a
  Kawayan client → Kawayan creatives lead.
- [ ] **Verify.** Signed out, the order matches pre-change behaviour.
- [ ] **Verify.** One of the 33 null-municipality clients sees the default order
  and no error.

### Step 6.4 — Pagination is stable

- [ ] **Verify.** Page through the full list as a located viewer; no profile
  appears twice and none is skipped.

### Step 6.5 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] Municipality and barangay required at registration, validated as a pair
- [ ] Profile setup no longer asks; the profile editor still does
- [ ] The directory is still public and still works signed out
- [ ] Nearby-first ordering works, with a stable tiebreaker
- [ ] The reordering is explained in the UI
- [ ] Existing null-municipality accounts are untouched and unbroken
- [ ] `api.md` and `data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| An "outside Biliran" option | Declined in [ADR 0020](../decisions/0020-location-required-biliran-only.md). The first out-of-province enquiry is the signal to revisit |
| PSGC codes on barangays | Blank; needs the PSA publication |
| A local check of the barangay list | Community-sourced. Slugs are permanent once registered against, so corrections are cheapest now |
| Barangay-level proximity | Municipality is the right grain on an island this size |
