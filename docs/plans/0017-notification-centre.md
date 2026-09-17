# 0017. The notification centre

- **Status:** Ready
- **Related:** [ADR 0030](../decisions/0030-notifications.md) ·
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md) ·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)

---

## Goal

The bell becomes real: a button with an unread count, opening a list of things
that happened to you. It covers events that have no other home — agreements,
moderation outcomes, posting replies — and leaves messages to the badge they
already have.

Runs **before** [plan 0016](./0016-work-agreements.md), so the agreement
lifecycle ships into a product that can already tell people things.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Six specific to this plan:

1. **Never copy a target's text into a notification row.** Store the type and
   the target id; resolve the title when the centre is read.
   [ADR 0030](../decisions/0030-notifications.md) explains why — a copied title
   outlives the suspension that was supposed to hide it.
2. **No notifications for messages.** The Messages tab already badges unread.
   Adding a second count for the same fact is how the bell becomes noise.
3. **Never notify someone of their own action.** Every emit site filters the
   actor out. This is easy to forget on the paths where both parties are told.
4. **Emitting a notification never fails the thing that caused it.** If the
   insert throws, log it and let the agreement, the moderation decision or the
   reply succeed. A notification is a side effect, not part of the transaction's
   purpose.
5. **Poll only while the tab is visible.** [Constraint 3](../explanation/constraints.md).
   An interval that runs in a background tab bills a metered connection for
   nothing.
6. **No service worker, no manifest, no push in this plan.** That is
   [plan 0018](./0018-web-push.md). If you are adding a `.sw.ts`, stop.

---

## Scope

**In scope**
- A `notifications` table, and the emit points for the event list in ADR 0030
- `GET /notifications`, `GET /notifications/unread-count`, mark read, mark all read
- A real bell in `SiteHeader`, with a count, on all breakpoints
- `/notifications` — the centre
- Targets resolved at read time, with a tombstone when they no longer resolve
- A prune script for old read notifications
- Correcting the copy that promises there are no alerts

**Out of scope** — do not build these
- Web push, service workers, manifests. Rule 6, and [plan 0018](./0018-web-push.md)
- Email or SMS of any kind
- Per-message notifications. Rule 2
- Per-user notification preferences or mute settings
- Agreement notifications — those event types ship with
  [plan 0016](./0016-work-agreements.md), which runs after this
- WebSockets or SSE

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 2 / 2 | Not started |
| 2. Service | 4 / 4 | Not started |
| 3. Emit points | 2 / 2 | Not started |
| 4. API | 1 / 1 | Not started |
| 5. The bell and the centre | 4 / 4 | Not started |
| 6. Copy | 1 / 1 | Not started |
| 7. Verification | 6 / 6 | Not started |

---

# Phase 1 — Schema

### Step 1.1 — The table

- [ ] **Action.** `backend/src/db/schema/notifications.ts`:

  `notificationTypeEnum` — start with the types this plan can actually emit:
  `profile_approved`, `profile_rejected`, `profile_edit_acknowledged`,
  `posting_replied`. Plan 0016 adds the agreement types.

  `notifications`:
  - `id` uuid pk
  - `userId` → `users.id`, cascade — the recipient
  - `actorUserId` → `users.id`, set null — who caused it, null for system
  - `type` enum
  - `targetId` uuid — the conversation, profile or posting it points at. No
    foreign key: the target table varies by type, and a dangling id must render
    as a tombstone rather than block the insert
  - `readAt` timestamptz nullable
  - `createdAt` timestamptz not null default now

  Indexes: `notifications(user_id, created_at desc)`, and a partial index on
  `(user_id) where read_at is null` for the count.

- [ ] **Why.** The partial index is what keeps the polled count cheap. Without
  it, every poll from every signed-in user scans that user's whole history.
- [ ] **Note.** There is no `title` or `body` column. Rule 1.

### Step 1.2 — Migration

- [ ] **Action.** `npm run db:generate`, read the SQL, commit the snapshot with
  it. Then `db:generate` again and confirm it emits nothing.

---

# Phase 2 — Service

New module: `backend/src/modules/notifications/`.

### Step 2.1 — Emitting

- [ ] **Action.** `notify({ userId, actorUserId, type, targetId })`. Returns
  nothing useful and never throws: wrap the insert, log a failure, carry on.
  Rule 4.
- [ ] **Action.** It refuses silently when `userId === actorUserId`. Rule 3 —
  enforce it in one place rather than at every call site.

### Step 2.2 — Resolving targets

- [ ] **Action.** `resolveTargets(rows)` batches one lookup per target type and
  returns a title and a link for each notification. Never one query per row.
- [ ] **Action.** Anything that does not resolve — deleted, or owned by a
  suspended account — returns a tombstone: "This is no longer available." It
  stays in the list, it is not silently dropped.
- [ ] **Action.** Every lookup that reaches another user's content filters
  `users.status = 'active'`, per
  [ADR 0028](../decisions/0028-suspension-is-enforced-per-request.md).
- [ ] **Verify.** Suspend an account that is the actor on a notification and
  confirm the recipient sees a tombstone, not their name or their text.

### Step 2.3 — Reading

- [ ] **Action.** `listNotifications(userId, { page, limit })`, newest first.
  `unreadCount(userId)` using the partial index. `markRead(userId, id)` and
  `markAllRead(userId)`, both scoped to the caller — a notification id belonging
  to someone else must not be markable.

### Step 2.4 — Pruning

- [ ] **Action.** `backend/src/scripts/prune-notifications.ts` plus a
  `notifications:prune` package script, modelled on `media:prune`. Deletes read
  notifications older than 90 days. Prints what it would delete unless given
  `--commit`.
- [ ] **Why.** ADR 0030 names unbounded growth as a known cost. A script that
  exists is not a solved problem, but a table with no prune path at all is worse.

---

# Phase 3 — Emit points

### Step 3.1 — Moderation

- [ ] **Action.** In `admin.service.ts`, `moderate()` emits
  `profile_approved`, `profile_rejected` or `profile_edit_acknowledged` to the
  profile's owner, with the acting admin as actor and the profile as target.
- [ ] **Action.** Do not emit for `account_suspended` or `account_reinstated`. A
  suspended account cannot sign in to read it, and a reinstated one has no
  notification explaining an absence it never saw.

### Step 3.2 — Posting replies

- [ ] **Action.** Where a creative's reply to a posting creates or continues a
  conversation, emit `posting_replied` to the client who posted, targeting the
  conversation.
- [ ] **Action.** Emit once per conversation, not once per reply. Check for an
  existing unread `posting_replied` for the same target first.

---

# Phase 4 — API

### Step 4.1 — Routes

- [ ] **Action.** Mount at `/api/v1/notifications` behind `requireAuth`:
  - `GET /` — paginated list, resolved
  - `GET /unread-count` — `{ count }`, nothing else
  - `POST /:id/read`
  - `POST /read-all`
- [ ] **Action.** `/unread-count` does the least work of any endpoint in the
  codebase. No joins, no resolution. It is polled by every signed-in page.

---

# Phase 5 — The bell and the centre

### Step 5.1 — A real bell

- [ ] **Action.** In `SiteHeader`, replace the `aria-hidden` `<span>` with a
  `Link` to `/notifications`, labelled "Notifications", showing the unread count
  as a `Badge` when non-zero.
- [ ] **Action.** Remove the `sm:hidden`. The bell belongs on every breakpoint —
  it is currently hidden on desktop, where there is no other route to it.
- [ ] **Verify.** It is reachable by keyboard and announces its count.

### Step 5.2 — The query

- [ ] **Action.** `useNotificationCount()`, following `useUnreadCount`:
  `refetchOnWindowFocus`, and an interval of about 60s that is disabled when
  `document.visibilityState !== 'visible'`. Rule 5.
- [ ] **Action.** Do not add a second poller. If both counts end up polling,
  fetch them in one request rather than two.

### Step 5.3 — The centre

- [ ] **Action.** `/notifications`, guarded. Rows: actor's avatar where there is
  an actor, the resolved title, relative time, and an unread dot. Tapping marks
  it read and follows its link.
- [ ] **Action.** "Mark all as read" in the header. `toast.run`, like every
  other action.
- [ ] **Action.** An empty state in the voice of the existing ones.
- [ ] **Action.** `pbBottomNav` for tab-bar clearance.

### Step 5.4 — Tombstones

- [ ] **Action.** An unresolved target renders greyed, is not a link, and says
  it is no longer available. It still marks read.

---

# Phase 6 — Copy

### Step 6.1 — Stop saying there are no alerts

- [ ] **Action.** `MessagesPage` currently reads "Threads with creatives and
  clients. There are no email or SMS alerts — check here." Both halves need
  revisiting: there is now a bell, and it is still true that nothing leaves the
  app. Say that plainly instead — something a person can act on, not a
  contradiction.
- [ ] **Action.** Grep the whole frontend for other copy promising no alerts or
  no notifications before deciding this step is done.

---

# Phase 7 — Verification

Against a database that is up. Plan 0013 was marked verified with Docker
stopped, and shipped a broken feed.

### Step 7.1 — It arrives

- [ ] Approve a profile as an admin; its owner's bell shows 1 and the centre
  names the profile. Reject another; same.

### Step 7.2 — It is not yours

- [ ] The acting admin gets nothing. Rule 3.
- [ ] `POST /notifications/:id/read` with another user's notification id: refused,
  and their notification stays unread.

### Step 7.3 — Suspension

- [ ] Suspend an actor and confirm the recipient's row becomes a tombstone with
  no name and no content. Reinstate and confirm it comes back. ADR 0028.

### Step 7.4 — It does not break its cause

- [ ] Make `notify` throw deliberately. The moderation decision still commits and
  the admin sees success. Rule 4.

### Step 7.5 — Polling behaviour

- [ ] With the tab hidden, confirm in the network panel that no count requests
  are made. Bring it forward and confirm it refetches. Rule 5.

### Step 7.6 — Full pass

- [ ] `npm run typecheck`, `lint`, `build`, `docs:check` all exit 0. Grep the
  diff for any notification row carrying text, and for any service worker. Run
  the prune script in dry-run mode. Delete every test row created here.

---

## Acceptance

- The bell is a real control on every breakpoint, with an accurate unread count.
- Approvals, rejections, edit acknowledgements and posting replies arrive.
- No notification exists for a message; the Messages badge still does that job.
- No notification row stores a title or body; a suspended actor's rows tombstone.
- A failed notification never fails the action that caused it.
- The count is not polled while the tab is hidden.
- No copy anywhere still promises there are no notifications.

---

## Follow-ups

Not in this plan:

- [Plan 0018](./0018-web-push.md) — delivery outside the app.
- The agreement notification types, which ship with
  [plan 0016](./0016-work-agreements.md).
- Per-user preferences, once there is evidence anyone wants fewer.
- Running the prune script on a schedule rather than by hand.
