# 0011. Bottom navigation, and a history of what you inquired about

- **Status:** Ready
- **Depends on:** [plan 0010](./0010-offers-and-an-offer-directory.md) — offers
  are what History records inquiries against
- **Related:** [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md) ·
  [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md)

---

## Goal

On a phone, a signed-in user gets a bottom tab bar: **Home** (the directory),
**Messages**, **History**, **Profile**. The top bar reduces to the logo and a
decorative bell. Desktop is unchanged.

History answers "what have I tried to hire", which nothing answers today.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Four specific to this plan:

1. **The bar is `sm:hidden`.** Desktop keeps the header exactly as it is. If you
   find yourself editing desktop navigation, you have gone too far.
2. **Anything fixed to the bottom must clear the bar.** That is every scrollable
   page *and* the toast stack in `ToastProvider`. Forgetting it hides the last
   row of every list behind the bar.
3. **The bell is not a button.** A muted icon, `aria-hidden`, no `onClick`, no
   pointer cursor. It must not look or behave like something that works, because
   it does not.
4. **A conversation with no offer is normal**, not an error. Every conversation
   that exists today has a null `offer_id`, and contacting someone from their
   profile will keep producing them.

---

## Scope

**In scope**
- A bottom tab bar on small screens for signed-in users
- A reduced top bar on small screens: logo, decorative bell
- Home routes to the directory when signed in; the landing page stays for
  signed-out visitors
- `conversations.offer_id`, set when a conversation starts from an offer
- A History page listing offers you inquired about and whether they replied
- The Hiring / My creative work switch relocated into the account area

**Out of scope** — do not build these
- Push notifications, or any working bell. [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)
- A notifications table or activity feed
- An Admin tab. Administrators work at a desk; the desktop header keeps the link
- Backfilling `offer_id` on existing conversations. There is nothing to infer it
  from
- Redesigning the desktop header

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Backend — offer on a conversation | 0 / 3 | Not started |
| 2. Backend — the history endpoint | 0 / 2 | Not started |
| 3. The tab bar | 0 / 4 | Not started |
| 4. Top bar and routing | 0 / 3 | Not started |
| 5. The History page | 0 / 2 | Not started |
| 6. Clearing the bar | 0 / 3 | Not started |
| 7. Verification | 0 / 5 | Not started |

---

# Phase 1 — Backend: which offer a conversation is about

### Step 1.1 — Schema

- [ ] **Action.** Add to `conversations` in
  `backend/src/db/schema/conversations.ts`:

```ts
    // Null for every conversation that predates this, and for anyone who
    // contacts a creative from their profile rather than from an offer.
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
```

`set null`, **not cascade**: deleting an offer must not delete the conversation
it started. The messages are the record of an exchange between two people and
outlive the listing.

- [ ] **Action.** Add an index on `offerId`, then `db:generate` and `db:migrate`.
- [ ] **Verify.** The migration only adds a nullable column, a foreign key and an
  index.

### Step 1.2 — Accept it when starting a conversation

- [ ] **Action.** Let the start-conversation endpoint take an optional
  `offerId`. Validate it as a uuid, and confirm the offer exists **and belongs
  to the creative being contacted**.

Without that ownership check a client could attach any offer id to any
conversation, and History would show an inquiry that never happened.

- [ ] **Verify.** An offer belonging to a different creative is a 400. Omitting
  `offerId` still works and stores null.

### Step 1.3 — Send it from the offer page

- [ ] **Action.** `OfferDetailPage` and the offer cards on the profile page pass
  `offerId` into `ContactComposer`; it forwards it when starting the
  conversation. The profile-level Contact button sends nothing, as now.
- [ ] **Verify.** Contacting from an offer stores the id; contacting from a
  profile stores null.

---

# Phase 2 — Backend: the history endpoint

### Step 2.1 — `GET /conversations/history`

- [ ] **Action.** Behind `requireAuth`, return the caller's conversations **as
  the client** — the side that made the inquiry — newest first, each with:
  the offer (title, price, first image) when there is one, the creative
  (slug, display name, municipality, avatar), when it was started, whether the
  creative has replied, and the unread count.

"Replied" is whether any message exists from the other party. That is the one
thing a client actually wants to know at a glance.

- [ ] **Action.** Resolve offers and creatives for the whole page in one query
  each, keyed by id — the pattern `subdomainsForProfiles` already uses.
- [ ] **Verify.** A conversation whose offer was deleted still appears, with no
  offer attached and the creative intact.

### Step 2.2 — Reference

- [ ] **Action.** Document the endpoint in [`api.md`](../reference/api.md) and
  the column in [`data-model.md`](../reference/data-model.md).
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 3 — The tab bar

### Step 3.1 — The component

- [ ] **Action.** Create `frontend/src/components/BottomNav.tsx`. Renders only
  when there is a signed-in user, and only below `sm`.

Four tabs, in this order: **Home** → `/directory`, **Messages** → `/messages`,
**History** → `/history`, **Profile** → `/account`.

Fixed to the bottom, full width, above page content but **below** the toast
stack. Use `useLocation` to mark the active tab, and set `aria-current="page"`
on it.

- [ ] **Verify.** It appears below `sm` when signed in, and nowhere else.

### Step 3.2 — Touch targets and safe area

- [ ] **Action.** Each tab is at least 44px tall and fills an equal quarter of
  the width. Add `pb-[env(safe-area-inset-bottom)]` so the bar is not sliced by
  the home indicator on a notched phone.
- [ ] **Verify.** On a 320px-wide viewport all four labels fit without wrapping
  or truncating.

### Step 3.3 — The unread badge

- [ ] **Action.** Messages carries the unread count from `useUnreadCount`, the
  same source the header uses. Render `99+` above 99.
- [ ] **Verify.** The badge matches the header's on desktop.

### Step 3.4 — Mount it

- [ ] **Action.** Render `<BottomNav />` once, next to `<ToastProvider>` in
  `App.tsx`, rather than per page. Adding it per page guarantees a page is
  eventually missed.
- [ ] **Verify.** It shows on every signed-in route, including offer and
  conversation detail pages.

---

# Phase 4 — Top bar and routing

### Step 4.1 — Reduce the header on phones

- [ ] **Action.** Below `sm`, `SiteHeader` shows only the logo and the bell. The
  links move to the tab bar. Above `sm` it is untouched.
- [ ] **Verify.** At 400px the header holds the logo and the bell and nothing
  else. At 1024px it is exactly as before.

### Step 4.2 — The bell

- [ ] **Action.** A `Bell` icon in muted ink. **A `<span>`, not a `<button>`** —
  no `onClick`, no `role`, `aria-hidden="true"`, and no hover or pointer
  affordance.

[ADR 0023](../decisions/0023-bottom-navigation-on-phones.md) records this as
deliberate debt: it is a promise of a feature that does not exist. Do not add a
tooltip or a "coming soon" toast — that draws attention to the gap rather than
covering it.

- [ ] **Verify.** Tapping it does nothing and shows no affordance. A screen
  reader skips it.

### Step 4.3 — Home

- [ ] **Action.** The Home tab routes to `/directory`. Signed-out visitors keep
  the landing page at `/` and see no tab bar.
- [ ] **Verify.** Signed in, Home opens the directory. Signed out, `/` is the
  landing page.

---

# Phase 5 — The History page

### Step 5.1 — The page

- [ ] **Action.** Create `frontend/src/pages/HistoryPage.tsx` at `/history`,
  behind the auth guard. Each row: the offer's thumbnail and title, price, the
  creative's name and municipality, when you inquired, and whether they replied.
  The row links to the conversation.
- [ ] **Action.** Where a conversation has no offer, show the creative and
  "Contacted from their profile". Rule 4 — this is normal, not a gap.
- [ ] **Verify.** Both shapes render correctly.

### Step 5.2 — The empty state

- [ ] **Action.** Nobody has inquired about anything yet, so this is the common
  case. Say so plainly and link to the directory.
- [ ] **Verify.** A fresh account sees the empty state, not a blank page.

---

# Phase 6 — Clearing the bar

The bar is fixed to the bottom. Anything that was already there is now behind
it.

### Step 6.1 — Page content

- [ ] **Action.** Add bottom padding below `sm` to every scrollable page, sized
  to the bar plus the safe-area inset.
- [ ] **Verify.** On a phone viewport, the last row of the directory, the
  messages list and the history list are all fully visible and tappable.

### Step 6.2 — The toast stack

- [ ] **Action.** `ToastProvider`'s stack is `fixed bottom-0`. Raise it above
  the bar on small screens.
- [ ] **Verify.** Save an offer on a phone viewport: the toast sits above the
  bar, covering neither it nor the page's last row.

### Step 6.3 — The composer

- [ ] **Action.** Check `ConversationPage`'s message input, which sits at the
  bottom of a chat. It must not end up underneath the bar.
- [ ] **Verify.** The input is reachable and usable with the keyboard open.

---

# Phase 7 — Verification

### Step 7.1 — Nothing is unreachable on a phone

| Destination | Route on a 400px viewport |
|---|---|
| Directory | Home tab |
| Messages | Messages tab |
| History | History tab |
| Account | Profile tab |
| Hiring / My creative work | Inside the account area |
| Sign out | Inside the account area |

- [ ] **Verify.** Every row is reachable without typing a URL.

### Step 7.2 — Ownership

- [ ] **Verify.** Starting a conversation with an `offerId` belonging to another
  creative is a 400.
- [ ] **Verify.** `GET /conversations/history` returns only the caller's own
  conversations.

### Step 7.3 — Deleted offers

- [ ] **Verify.** Delete an offer that has a conversation. The conversation and
  its messages survive, and History shows it without an offer.

### Step 7.4 — Desktop is untouched

- [ ] **Verify.** At 1024px there is no bottom bar and the header is unchanged,
  including the mode switch and the Admin link.

### Step 7.5 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] A signed-in user on a phone has Home, Messages, History and Profile one
      tap away
- [ ] The phone header is the logo and a non-interactive bell
- [ ] Desktop navigation is unchanged
- [ ] The mode switch and Sign out are reachable on a phone
- [ ] Conversations started from an offer record it; others store null
- [ ] History lists inquiries with reply status, and survives a deleted offer
- [ ] No page has content or a toast trapped behind the bar
- [ ] `api.md` and `data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| A working notifications feed | The bell is decorative. ADR 0023 records it as debt that should either gain a feed or be removed |
| An Admin route on phones | No tab left. Administrators work at a desk, but one away from it has no route to the queue |
| History for creatives | This is the client's side. A creative's "who has inquired about my offers" is a different list and arguably more valuable |
| Backfilling `offer_id` | Nothing to infer it from on existing conversations |
