# 0015. The account hub

- **Status:** Ready
- **Related:** [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)

---

## Goal

`/account` becomes a list of categories. Each opens its own page, which loads
only what it edits. Nothing is edited on the hub itself.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Four specific to this plan:

1. **Move the editors, do not rewrite them.** `ProfileEditor`, `OfferEditor` and
   `PasswordForm` keep their current forms, validation and saves. This plan is
   about where they live.
2. **Do not split the profile form into per-field pages.**
   [ADR 0027](../decisions/0027-account-is-a-hub.md) explains why: `PUT
   /me/profile` takes the whole profile, so a bio-only page would still load and
   resend all of it. That needs partial updates first, and it is a separate
   decision.
3. **No backend changes.** If you are editing anything under `backend/`, stop —
   you have gone past the plan.
4. **Every new route is guarded.** They are all behind `RequireAuth`, and
   `/account/offers` additionally needs a creative profile.

---

## Scope

**In scope**
- `/account` as a hub with one entry per category
- `/account/profile`, `/account/offers`, `/account/security`
- A one-line state summary on each hub entry
- Bottom-nav clearance and back behaviour on the new pages

**Out of scope** — do not build these
- Splitting the profile form itself. Rule 2
- Partial-update support on `PUT /me/profile`
- Any API change at all
- Redesigning the editors' internals
- Moving `Your postings`; it already has a page at `/postings/mine`

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The pages | 0 / 4 | Not started |
| 2. The hub | 0 / 3 | Not started |
| 3. Loading and guards | 0 / 3 | Not started |
| 4. Verification | 0 / 4 | Not started |

---

# Phase 1 — The pages

### Step 1.1 — Profile

- [ ] **Action.** Create `frontend/src/pages/account/ProfileSettingsPage.tsx` at
  `/account/profile`. It renders `ProfileEditor` exactly as the account page
  does today, with its own `SiteHeader`, heading and `pbBottomNav`.
- [ ] **Action.** For an account with **no** creative profile, this page shows
  what the account page currently shows in that case — the standalone
  `AvatarUploader` and the "Offer your creative work" call to action.
- [ ] **Verify.** Both states render, and saving works exactly as before.

### Step 1.2 — Offers

- [ ] **Action.** `frontend/src/pages/account/OffersSettingsPage.tsx` at
  `/account/offers`, rendering `OfferEditor`.
- [ ] **Action.** An account with no creative profile does not get this page.
  Send them to `/account` rather than showing an empty editor.
- [ ] **Verify.** A client with no profile visiting the URL directly lands on
  the hub.

### Step 1.3 — Security

- [ ] **Action.** `frontend/src/pages/account/SecuritySettingsPage.tsx` at
  `/account/security`, rendering `PasswordForm` and the Sign out block currently
  at the bottom of the account page.
- [ ] **Verify.** Changing a password and signing out both behave as before —
  sign out still lands on the landing page.

### Step 1.4 — Routes

- [ ] **Action.** Register all three in `App.tsx` inside `RequireAuth`, beside
  the existing `/account`.
- [ ] **Verify.** Signed out, each redirects to login.

---

# Phase 2 — The hub

### Step 2.1 — Strip it

- [ ] **Action.** `AccountPage` renders no editors. It keeps its heading and
  becomes a list of entries.
- [ ] **Verify.** `grep -n "ProfileEditor\|OfferEditor\|PasswordForm\|AvatarUploader" AccountPage.tsx`
  returns nothing.

### Step 2.2 — The entries

- [ ] **Action.** One row per entry: label, a one-line summary of current state,
  and a chevron. Rows are at least 44px tall and the whole row is the link.

| Entry | Summary line |
|---|---|
| Profile | Sub-domain count and review status — "4 sub-domains · Published" |
| Offers | "1 of 6 used", or "None yet" |
| Your postings | Open count — "2 open", or "None yet" |
| Security | "Password and sign out" |

An account with no creative profile sees Profile, Your postings and Security,
plus a call to action to add a creative profile — not an Offers row leading
nowhere.

- [ ] **Action.** The summaries are the point of the hub
  ([ADR 0027](../decisions/0027-account-is-a-hub.md)). A list of bare labels
  answers nothing and makes people open pages to find out.
- [ ] **Verify.** Each summary matches what the page behind it shows.

### Step 2.3 — Keep Offers findable

- [ ] **Action.** Offers is a creative's most important surface after their
  profile, and it used to sit in the open. Put it directly under Profile, and
  show the count so an empty portfolio is visible without opening it.
- [ ] **Verify.** With no offers, the hub says so on the row.

---

# Phase 3 — Loading and guards

### Step 3.1 — Load only what is needed

- [ ] **Action.** The hub needs the current user and enough for the summaries.
  It must **not** mount the editors or fetch the taxonomy.

This is half the reason for the change: opening the Profile tab to sign out
currently fetches offers and the full taxonomy.

- [ ] **Verify.** On the hub, the network panel shows no taxonomy request and no
  offers list beyond what a summary needs.

### Step 3.2 — Clearance

- [ ] **Action.** Every new page uses `pbBottomNav`, as
  [plan 0011](./0011-bottom-navigation-and-history.md) requires.
- [ ] **Verify.** On a phone viewport the last control on each page is fully
  visible and tappable, including the Save button.

### Step 3.3 — Back

- [ ] **Action.** Each page offers a way back to the hub that does not rely on
  the browser's back button, since the bottom bar's Profile tab goes to
  `/account` and people will use it.
- [ ] **Verify.** From `/account/offers`, both the in-page back and the Profile
  tab reach the hub.

---

# Phase 4 — Verification

### Step 4.1 — Nothing lost

- [ ] **Verify.** Every control that was on the old account page is reachable:
  avatar, name, display name, bio, sub-domains, location, contact preference,
  offers with images and ordering, password, sign out, your postings.

The old page is being dismantled. A missing control will not fail a build.

### Step 4.2 — Guards

| Attempt | Expected |
|---|---|
| `/account/profile` signed out | redirect to login |
| `/account/offers` signed out | redirect to login |
| `/account/offers` with no creative profile | redirect to `/account` |
| `/account/security` signed out | redirect to login |

- [ ] **Verify.** Every row behaves as stated.

### Step 4.3 — Both account shapes

- [ ] **Verify.** A client with no creative profile, and a published creative,
  both see a coherent hub with no dead entries.

### Step 4.4 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] `/account` edits nothing and mounts no editor
- [ ] Profile, Offers and Security each have their own guarded page
- [ ] Each hub entry carries a summary of its current state
- [ ] The hub does not fetch the taxonomy or the offers list
- [ ] Every control from the old page is still reachable
- [ ] Every new page clears the bottom bar and can get back to the hub
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Splitting the profile form into per-field pages | Needs partial updates on `PUT /me/profile`; today it takes the whole profile ([ADR 0027](../decisions/0027-account-is-a-hub.md)) |
| Partial updates on the profile endpoint | The blocker for the above, and it would also let the profile form save per section rather than from one button at the bottom |
| Grouping the hub into "public" and "private" | Bio and offers are seen by everyone; password is not. Worth a divider once there are more entries |
