# 0012. Inquire from an offer, and saved offers

- **Status:** Ready
- **Depends on:** [plan 0011](./0011-bottom-navigation-and-history.md) — this
  replaces the `conversations.offer_id` it added
- **Related:** [ADR 0024](../decisions/0024-offers-attach-to-messages.md) ·
  [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md) ·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)

---

## Goal

An offer page ends with **Save** and **Inquire**. Inquire opens the thread with
that creative, with the offer card attached to the composer; the client types
once and sends once. Asking about a second offer leaves a second card in the
same thread rather than overwriting the first.

Subject is gone. History gains a **Saved** segment beside **Inquired**.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Four specific to this plan:

1. **Migrate before you drop.** `conversations.offer_id` holds real data from
   plan 0011. It moves onto a message first, in the same migration, and the drop
   is refused if anything would be left behind — the pattern migration 0013
   already uses.
2. **A message with no offer is the normal case.** Every existing message has
   none, and contacting someone from their profile keeps producing them.
3. **Never rewrite a message.** The offer reference is set when the message is
   created and only ever nulled by the offer being deleted. Rewriting is what
   made the conversation-level column lossy.
4. **Group History by offer.** A client who asks about the same offer three
   times is one row, showing the most recent.

---

## Scope

**In scope**
- `messages.offer_id`; `conversations.offer_id` and `conversations.subject`
  removed
- Save and Inquire on the offer page, and an offer card in the thread
- `saved_offers`, with save and unsave
- History as two segments, Inquired and Saved
- The messages list identified by person and last message instead of subject

**Out of scope** — do not build these
- Notifying anyone when a saved offer changes price or is removed
- Saving a creative rather than an offer
- One conversation per offer. [ADR 0024](../decisions/0024-offers-attach-to-messages.md)
- Restoring subjects. They are dropped deliberately
- Attaching anything other than an offer to a message

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema and migration | 0 / 4 | Not started |
| 2. Backend — messaging | 0 / 3 | Not started |
| 3. Backend — saved offers and history | 0 / 3 | Not started |
| 4. Frontend — the offer page | 0 / 3 | Not started |
| 5. Frontend — the thread | 0 / 3 | Not started |
| 6. Frontend — History | 0 / 2 | Not started |
| 7. Verification | 0 / 5 | Not started |

---

# Phase 1 — Schema and migration

### Step 1.1 — The new columns and table

- [ ] **Action.** Add `offerId` to `messages`, nullable,
  `references(() => offers.id, { onDelete: 'set null' })`, with an index. A
  deleted offer must not delete the message.
- [ ] **Action.** Add `saved_offers`: `userId` and `offerId`, both cascading,
  `createdAt`, and a **unique index on `(userId, offerId)`** so saving twice
  cannot duplicate.
- [ ] **Verify.** `db:generate` produces additions only.

### Step 1.2 — Move the data, then drop

- [ ] **Action.** Hand-write the migration that follows the generated one, in
  the shape of `0013_red_stellaris.sql`:
  - for every conversation with an `offer_id`, set it on that conversation's
    **earliest message from the client**
  - raise if any conversation with an `offer_id` has no message carrying it
  - only then drop `conversations.offer_id` and `conversations.subject`

The raise is the point. Failing the deploy is recoverable; dropping the column
after a partial move is not.

- [ ] **Verify.** Seed a conversation with an offer and two messages. After the
  migration the earliest client message carries the offer, the later one does
  not, and both columns are gone.

### Step 1.3 — Subjects are not migrated

- [ ] **Action.** Nothing preserves them.
  [ADR 0024](../decisions/0024-offers-attach-to-messages.md) records this as the
  product owner's decision, not an oversight.
- [ ] **Verify.** `grep -rn "subject" backend/src frontend/src` returns nothing
  outside this plan and the ADRs.

### Step 1.4 — Reference

- [ ] **Action.** Update [`data-model.md`](../reference/data-model.md).
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 2 — Backend: messaging

### Step 2.1 — Starting a conversation

- [ ] **Action.** Drop `subject` from the start-conversation body. Accept an
  optional `offerId` and **store it on the message, not the conversation**.
- [ ] **Action.** Keep the ownership check from plan 0011: the offer must belong
  to the creative being contacted, or 400. Without it, a card could be attached
  claiming an inquiry that never happened.
- [ ] **Verify.** Starting without an offer works. An offer belonging to someone
  else is 400.

### Step 2.2 — Continuing one

- [ ] **Action.** `POST /conversations/:id/messages` also takes an optional
  `offerId`, with the same ownership check against that conversation's creative.

This is what makes a second inquiry work: same thread, new message, new card.

- [ ] **Verify.** Two messages in one thread can carry two different offers, and
  both survive.

### Step 2.3 — Serving the card

- [ ] **Action.** Message payloads include the offer when present: id, title,
  price, first image, and whether it still exists.
- [ ] **Action.** Resolve offers for a page of messages in **one** query keyed
  by id. Never per message.
- [ ] **Verify.** A thread of 50 messages issues a fixed number of queries.

---

# Phase 3 — Backend: saved offers and history

### Step 3.1 — Save and unsave

- [ ] **Action.** `POST /me/saved-offers` with `{ offerId }`, and
  `DELETE /me/saved-offers/:offerId`. Saving something already saved is a 200,
  not a 409 — the client is expressing a state, not an event.
- [ ] **Action.** Only published offers can be saved.
- [ ] **Verify.** Saving twice leaves one row. Unsaving something not saved is a
  204, not an error.

### Step 3.2 — History

- [ ] **Action.** Rewrite `GET /conversations/history` to read from messages:
  the caller's own sent messages that carry an offer, **grouped by offer**,
  newest first, each with the offer, the creative, when it was last asked, and
  whether that creative has replied since.
- [ ] **Action.** Add `GET /me/saved-offers` returning saved offers with the
  creative, newest first.
- [ ] **Verify.** Asking about one offer three times is one row. Asking about
  two offers from the same creative is two rows — the case the old column could
  not represent.

### Step 3.3 — Reference

- [ ] **Action.** Update [`api.md`](../reference/api.md): the removed `subject`,
  the new `offerId` on both message endpoints, and the saved-offer routes.
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 4 — Frontend: the offer page

### Step 4.1 — The two actions

- [ ] **Action.** At the bottom of `OfferDetailPage`: **Inquire** (primary) and
  **Save** (secondary). Signed out, both route to
  `/login?next=` the offer, as Contact already does
  ([ADR 0017](../decisions/0017-sign-in-before-contacting.md)).
- [ ] **Verify.** Signed out, both go to login and return to the offer.

### Step 4.2 — Save is a toggle

- [ ] **Action.** Save reflects current state — "Save" or "Saved" — and toggles.
  Use the toast helper so it reports pending, done and failed like every other
  action.
- [ ] **Verify.** Saving, reloading, and unsaving all hold.

### Step 4.3 — Inquire

- [ ] **Action.** Inquire opens the thread with that creative — existing or new
  — with the offer attached to the composer. It does **not** send anything on
  its own.
- [ ] **Verify.** A client with an existing thread lands in it with the card
  attached, not in a second thread.

---

# Phase 5 — Frontend: the thread

### Step 5.1 — The attachment

- [ ] **Action.** The composer shows the attached offer above the input, with a
  way to detach it before sending.
- [ ] **Verify.** Detaching sends a plain message.

### Step 5.2 — The card

- [ ] **Action.** Render a message's offer as a card above its body: thumbnail,
  title, price, linking to the offer. Where the offer is gone, show "This offer
  is no longer listed" and keep the body.
- [ ] **Verify.** Delete an offer with a card in a thread. The message survives
  and reads sensibly.

### Step 5.3 — No more subject

- [ ] **Action.** `MessagesPage` shows the other person's name, their avatar,
  and the last message. Remove the subject from `ConversationPage` too.
- [ ] **Verify.** Threads are still distinguishable at a glance.

---

# Phase 6 — Frontend: History

### Step 6.1 — Two segments

- [ ] **Action.** `HistoryPage` gets **Inquired** and **Saved**. Inquired is the
  default. Put the selected segment in the URL so a reload keeps it.
- [ ] **Verify.** Switching segments and reloading holds the choice.

### Step 6.2 — Empty states

- [ ] **Action.** Each segment gets its own, both linking to the directory.
  Nobody has saved or inquired about anything yet, so these are the common case.
- [ ] **Verify.** A fresh account sees both, not a blank page.

---

# Phase 7 — Verification

### Step 7.1 — The case the old model could not hold

- [ ] **Verify.** As a client, inquire about offer A from a creative, then offer
  B from the same creative. One thread, two cards, **two rows in History**, and
  A is still there.

### Step 7.2 — Migration

- [ ] **Verify.** Every conversation that had an `offer_id` has it on its
  earliest client message.
- [ ] **Verify.** `conversations.offer_id` and `conversations.subject` are gone.
- [ ] **Verify.** A deliberately broken move aborts the migration rather than
  dropping the columns.

### Step 7.3 — Ownership

| Attempt | Expected |
|---|---|
| Attach another creative's offer when starting | 400 |
| Attach another creative's offer to an existing thread | 400 |
| Save an unpublished offer | 400 |
| Unsave something never saved | 204 |
| `GET /me/saved-offers` as another user | only your own |

- [ ] **Verify.** Every row behaves as stated.

### Step 7.4 — Deleted offers

- [ ] **Verify.** Deleting an offer leaves its messages intact, removes it from
  Saved, and History stops listing it or shows it as unavailable.

### Step 7.5 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] Inquiring about two offers from one creative preserves both
- [ ] Inquire attaches the card to the client's own message; nothing auto-sends
- [ ] Subject is gone from the schema, the API and the UI
- [ ] Offers can be saved and unsaved, and saving twice does not duplicate
- [ ] History has Inquired and Saved, grouped by offer
- [ ] A deleted offer leaves its messages readable
- [ ] The migration moves data before dropping, and refuses to drop otherwise
- [ ] `api.md` and `data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Telling someone a saved offer changed or was removed | Needs the notifications feature the bell is waiting on ([ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)) |
| Saving a creative rather than an offer | Offers are the unit people browse now ([ADR 0022](../decisions/0022-offers-replace-portfolio.md)); revisit if people ask |
| A creative's view of who inquired about what | This is the client's side. The creative's equivalent is arguably more valuable and is its own plan |
| Attachments generally | The message carries exactly one optional offer. Images or files in chat are a different feature with a different moderation surface |
