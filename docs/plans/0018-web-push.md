# 0018. Web push

- **Status:** Ready
- **Related:** [ADR 0030](../decisions/0030-notifications.md) ·
  [plan 0017](./0017-notification-centre.md) ·
  [operating constraints §3](../explanation/constraints.md)

---

## Goal

Notifications reach people who have closed the tab. The same records
[plan 0017](./0017-notification-centre.md) already stores gain a second, best-
effort delivery path through the browser's push service.

Runs after 0017, and after [plan 0016](./0016-work-agreements.md) if that lands
first — the agreement events are the ones most worth delivering.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Six specific to this plan:

1. **The centre is the truth; push is best-effort.** Every failure path ends in
   "the notification is already stored, and they will see it when they open the
   app". Nothing is ever delivered by push alone.
2. **A push payload carries a title and a link, never content.** It passes
   through Google's infrastructure. What the notification is *about* is
   acceptable there; what it *said* is not.
3. **Never ask for permission on load.** Ask after an action that earns it, once.
   A denial is permanent and unrecoverable from inside the page.
4. **The service worker does not cache the application.** Its only job is
   receiving pushes. A caching service worker can serve a stale build to someone
   with no way to understand why, and this codebase has never had one.
5. **A dead subscription is deleted, not retried.** A 404 or 410 from the push
   service means that browser is gone. Remove the row.
6. **VAPID keys are configuration, never committed.** They go through the
   existing env validation, and the feature stays off when they are absent.

---

## Scope

**In scope**
- A `push_subscriptions` table
- VAPID keys through env config, with the feature disabled when unset
- A minimal service worker that handles `push` and `notificationclick` only
- A web app manifest, the minimum push requires
- Contextual permission request, once, after a qualifying action
- Fan-out from `notify()` to a user's subscriptions
- Pruning dead subscriptions on send failure
- A way to turn it off — in `/account/security`

**Out of scope** — do not build these
- Caching, offline support, or install prompts beyond what push requires. Rule 4
- Email or SMS
- Notification types beyond those 0017 and 0016 already store
- Per-type push preferences. One switch, on or off
- iOS-specific install coaching

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Keys and schema | 2 / 2 | Not started |
| 2. The worker | 2 / 2 | Not started |
| 3. Subscribing | 3 / 3 | Not started |
| 4. Sending | 3 / 3 | Not started |
| 5. Turning it off | 1 / 1 | Not started |
| 6. Verification | 6 / 6 | Not started |

---

# Phase 1 — Keys and schema

### Step 1.1 — Configuration

- [ ] **Action.** Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` to the backend env schema, all optional. Add a
  `isPushConfigured()` helper matching `isStorageConfigured()`.
- [ ] **Action.** Expose the public key through an existing config endpoint or
  the app's bootstrap payload. The private key never leaves the server.
- [ ] **Action.** Document generating them in `docs/how-to/`, alongside the
  Supabase setup.

### Step 1.2 — The table

- [ ] **Action.** `pushSubscriptions`: `id`, `userId` → `users.id` cascade,
  `endpoint` text **unique**, `p256dh` text, `auth` text, `createdAt`,
  `lastSeenAt`. Index on `userId`.
- [ ] **Why.** `endpoint` is unique because the browser reissues the same one; a
  re-subscribe must update a row rather than accumulate duplicates that all
  deliver the same push.
- [ ] **Action.** Migrate, commit the snapshot, confirm a second `db:generate`
  is empty.

---

# Phase 2 — The worker

### Step 2.1 — The service worker

- [ ] **Action.** `frontend/public/sw.js`, hand-written, no build step, no
  framework. Two handlers: `push` shows a notification from the payload;
  `notificationclick` focuses an existing tab if there is one, otherwise opens
  the link.
- [ ] **Action.** No `fetch` handler at all. Rule 4 — a service worker without a
  `fetch` handler cannot serve a stale application.
- [ ] **Action.** Register it only when push is configured and the user has
  already granted permission. An unregistered worker is the correct state for
  everyone else.

### Step 2.2 — The manifest

- [ ] **Action.** The minimum `manifest.webmanifest` push requires: name, short
  name, icons, `start_url`, `display`. Reuse the existing brand assets in
  `frontend/public/brand`.
- [ ] **Note.** This makes the site installable as a side effect. That is fine.
  Do not add an install prompt.

---

# Phase 3 — Subscribing

### Step 3.1 — When to ask

- [ ] **Action.** Ask once, immediately after an action that shows the person
  expects a reply: sending an agreement, accepting one, or sending a first
  message. Never on load, never on the account page, never twice. Rule 3.
- [ ] **Action.** Record locally that the ask happened so a reload does not
  repeat it, and check `Notification.permission` first — `denied` means never
  ask again.

### Step 3.2 — The prompt

- [ ] **Action.** Explain before the browser does. A short line saying what will
  be sent and that it can be turned off in Security, then the browser prompt on
  confirm. The browser's own dialog explains nothing and is the one that
  permanently denies.

### Step 3.3 — Storing it

- [ ] **Action.** `POST /notifications/push/subscribe` upserts on `endpoint`,
  binding it to the caller. `POST /notifications/push/unsubscribe` deletes it.
- [ ] **Verify.** Subscribing twice from the same browser leaves one row.

---

# Phase 4 — Sending

### Step 4.1 — Fan-out

- [ ] **Action.** `notify()` — already the single choke point from plan 0017 —
  also sends to that user's subscriptions when push is configured. It still
  never throws. Rule 1 and plan 0017 rule 4.
- [ ] **Action.** Send after the notification row is committed, never before. A
  push arriving for a record that failed to save is a notification that leads
  nowhere.

### Step 4.2 — The payload

- [ ] **Action.** Title, a short generic line, and the target link. No message
  text, no client name, no agreement terms, no prices. Rule 2.
- [ ] **Action.** Resolve the title through the same
  `resolveTargets` used by the centre, so a suspended actor tombstones here too
  rather than being pushed to someone's lock screen.

### Step 4.3 — Failures

- [ ] **Action.** On 404 or 410, delete the subscription. On anything else, log
  and move on. Rule 5.
- [ ] **Action.** One user's failure never stops the others.

---

# Phase 5 — Turning it off

### Step 5.1 — The switch

- [ ] **Action.** A single toggle in `/account/security`: push on this device.
  Off unsubscribes and deletes the row.
- [ ] **Action.** When the browser has denied permission, show that plainly and
  say it has to be changed in browser settings — the page cannot reopen that
  door.

---

# Phase 6 — Verification

### Step 6.1 — End to end

- [ ] Grant permission in Chrome, close the tab entirely, trigger a notification
  from another account, and confirm it arrives. Click it: the right page opens.

### Step 6.2 — Not configured

- [ ] Unset the VAPID keys. Nothing registers, nothing is asked, no errors
  appear, and the centre still works exactly as before.

### Step 6.3 — Denied

- [ ] Deny permission. Confirm nothing asks again on reload, and Security shows
  the browser-settings explanation rather than a toggle that cannot work.

### Step 6.4 — Dead subscriptions

- [ ] Revoke permission in browser settings, then trigger a notification. The
  send fails, the row is deleted, and the stored notification is still in the
  centre. Rule 1.

### Step 6.5 — No content leaks

- [ ] Read an actual delivered push on a locked phone screen. Confirm it names
  no client, no price and no message text. Rule 2.

### Step 6.6 — Full pass

- [ ] `npm run typecheck`, `lint`, `build`, `docs:check` all exit 0. Confirm
  `sw.js` has no `fetch` handler. Confirm no VAPID key is in the diff. Delete
  every test row and subscription created here.

---

## Acceptance

- A notification reaches a closed tab on Android Chrome, and opens the right page.
- With VAPID unset, the whole feature is inert and nothing breaks.
- Push payloads carry no message text, names, or prices.
- Dead subscriptions are deleted on failure, not retried.
- A push failure never affects the stored notification or the action behind it.
- The service worker has no `fetch` handler.
- Push can be turned off from Security.

---

## Follow-ups

Not in this plan:

- iOS, which needs the site installed to the home screen first. The centre is
  all those users have until someone decides whether to coach the install.
- Quiet hours, or any per-type preference.
- Email or SMS, which ADR 0030 rules out for now on distinct grounds.
