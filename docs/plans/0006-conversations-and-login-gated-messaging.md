# 0006. Conversations and login-gated messaging

- **Status:** Ready
- **Depends on:** [plan 0004](./0004-client-accounts-and-inquiries.md) — the
  `inquiries` rows this plan migrates — and
  [plan 0007](./0007-one-account-and-creative-role.md), which owns registration
  and **must run first**
- **Related:** [ADR 0017](../decisions/0017-sign-in-before-contacting.md) ·
  [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md)

---

## Goal

Contacting a creative requires a session. Messaging becomes a two-party
conversation with back-and-forth replies, unread counts, and the ability to
report or block. Existing inquiries migrate into conversations without data
loss.

---

## What changes from plan 0004

| | Before | After |
|---|---|---|
| Contacting | Compose, then register in place | **Sign in first**, then compose |
| Messaging | One message, one response | **Conversation**, unbounded replies |
| Delivery | — | Polling while a thread is open |
| Safety | None | **Report and block** |
| `inquiries` table | The whole model | Migrated into `conversations` + `messages`, then dropped |

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Four specific to this plan:

1. **Authorisation is by participation, never by id in the request.** Every
   read and write resolves the caller from `req.session.userId` and confirms
   they are one of the two participants. A conversation id in a URL proves
   nothing.
2. **Migrate, do not drop.** Existing inquiries carry real content. The
   migration converts them; it never deletes them. Verify counts before and
   after.
3. **Report and block ship in this plan.** Do not defer them to a follow-up.
   Private messaging without them is the thing
   [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md)
   explicitly refuses to ship.
4. **Be honest in the copy.** There are no notifications. Tell the sender the
   recipient will see it next time they sign in. Do not write "sent" in a way
   that implies delivery to a phone.

---

## Scope

**In scope**
- Sign-in gate on Contact, with a return path and draft preservation
- `conversations`, `messages`, `conversation_participants` read state
- Send, list threads, read thread, mark read, unread counts
- Report a conversation; block a user
- Polling while a thread is open
- Migration of `inquiries` into the new tables

**Out of scope**
- Notifications of any kind. [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md)
  records this as the main risk
- WebSockets. Polling only — Render's free instance sleeps
- Attachments, images, typing indicators, read receipts per message
- Editing or deleting a sent message
- Group conversations. Exactly two participants
- Admin moderation UI for reports. Reports are stored and queryable; the review
  screen is a follow-up

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 0 / 4 | Not started |
| 2. Migration and backfill | 0 / 3 | Not started |
| 3. Backend — conversations | 0 / 4 | Not started |
| 4. Backend — safety | 0 / 3 | Not started |
| 5. Frontend — sign-in gate | 0 / 5 | Not started |
| 6. Frontend — thread UI | 0 / 4 | Not started |
| 7. Frontend — unread and safety | 0 / 3 | Not started |
| 8. Retire the inquiries model | 0 / 3 | Not started |
| 9. Verification | 0 / 6 | Not started |

---

# Phase 1 — Schema

### Step 1.1 — Conversations

- [ ] **Action.** Create `backend/src/db/schema/conversations.ts`:

```ts
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { creativeProfiles } from './profiles.js';

/**
 * Exactly two parties: the client who started it and the creative whose profile
 * they contacted. Modelled as explicit columns rather than a participants table
 * because "two" is a product rule, not a limitation — see ADR 0018.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    // Denormalised from the profile so a participation check is one query.
    creativeUserId: uuid('creative_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientUserId: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    subject: text('subject').notNull(),

    // Denormalised for the thread list, which would otherwise need a correlated
    // subquery per row to sort by recency.
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),

    clientLastReadAt: timestamp('client_last_read_at', { withTimezone: true }),
    creativeLastReadAt: timestamp('creative_last_read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One thread per client per profile. A second "inquiry" continues the
    // existing conversation rather than starting a parallel one.
    uniqueIndex('conversations_profile_client_idx').on(table.profileId, table.clientUserId),
    index('conversations_creative_recent_idx').on(table.creativeUserId, table.lastMessageAt),
    index('conversations_client_recent_idx').on(table.clientUserId, table.lastMessageAt),
  ],
);
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 1.2 — Messages

- [ ] **Action.** Append to the same file:

```ts
/** Append-only. Messages are never edited or deleted in this plan. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The thread query, and the polling query filtered by createdAt.
    index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  ],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  profile: one(creativeProfiles, {
    fields: [conversations.profileId],
    references: [creativeProfiles.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
}));

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 1.3 — Reports and blocks

- [ ] **Action.** Create `backend/src/db/schema/safety.ts`:

```ts
import { pgTable, pgEnum, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { conversations } from './conversations.js';

export const reportStatusEnum = pgEnum('report_status', ['open', 'reviewed', 'dismissed']);

export const conversationReports = pgTable(
  'conversation_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: reportStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('conversation_reports_status_idx').on(table.status, table.createdAt)],
);

/**
 * Directional. A blocks B stops B starting or continuing a conversation with A;
 * it does not stop A contacting B. Mutual blocking is two rows.
 */
export const userBlocks = pgTable(
  'user_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('user_blocks_pair_idx').on(table.blockerUserId, table.blockedUserId)],
);
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 1.4 — Export

- [ ] **Action.** Add both files to `backend/src/db/schema/index.ts`.
- [ ] **Verify.** `npm run typecheck` exits 0.

---

# Phase 2 — Migration and backfill

**Do not drop `inquiries` in this phase.** It is dropped in Phase 8, after the
new model is proven.

### Step 2.1 — Generate

- [ ] **Action.** `npm --prefix backend run db:generate`, then read the file.
- [ ] **Verify.** Four `CREATE TABLE`, one `CREATE TYPE`, the indexes above, and
  **no `DROP TABLE`**. If a drop of `inquiries` appears, delete that statement —
  it belongs in Phase 8.

### Step 2.2 — Backfill script

- [ ] **Action.** Create `backend/src/scripts/migrate-inquiries.ts`.

For each `inquiries` row, inside one transaction:

1. Upsert a conversation keyed on `(profile_id, sender_user_id)`, carrying the
   inquiry's `subject` and `created_at`
2. Insert the inquiry's `message` as the first message, from the sender, at the
   inquiry's `created_at`
3. If `response` is non-null, insert it as a second message from the creative,
   at `responded_at`
4. Set `last_message_at` to the newest of the two
5. Map read state: `read_at` on the inquiry becomes `creative_last_read_at`

Idempotent — safe to re-run. Log counts in and out.

- [ ] **Action.** Add `"migrate:inquiries": "tsx src/scripts/migrate-inquiries.ts"`
  to `backend/package.json`.
- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 2.3 — Apply and verify counts

- [ ] **Action.** `npm run db:migrate`, then
  `npm --prefix backend run migrate:inquiries`
- [ ] **Verify.** Counts reconcile:

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "
SELECT (SELECT count(*) FROM inquiries) AS inquiries,
       (SELECT count(*) FROM conversations) AS conversations,
       (SELECT count(*) FROM inquiries WHERE response IS NOT NULL) AS with_response,
       (SELECT count(*) FROM messages) AS messages;"
```

`conversations` equals `inquiries`; `messages` equals `inquiries + with_response`.

---

# Phase 3 — Backend: conversations

### Step 3.1 — Validation

- [ ] **Action.** Create `backend/src/modules/conversations/conversations.schema.ts`:

```ts
export const startConversationSchema = z.object({
  profileSlug: z.string().trim().min(1),
  subject: z.string().trim().min(3, 'Too short').max(120),
  body: z.string().trim().min(20, 'Give a little more detail').max(2000),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(2000),
});

export const listMessagesSchema = z.object({
  // Polling passes the newest message it already has.
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reportSchema = z.object({
  reason: z.string().trim().min(10, 'Tell us what is wrong').max(500),
});
```

The 20-character minimum applies to the **opening** message only. A reply may be
short — "Yes, Tuesday works" is a legitimate message.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 3.2 — Participation guard

- [ ] **Action.** In `conversations.service.ts`, write one helper every other
  function calls first:

```ts
/**
 * Resolves a conversation the caller actually participates in. Returns 404 for
 * both "no such conversation" and "not yours" — distinguishing them leaks the
 * existence of other people's threads.
 */
async function requireParticipant(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.clientUserId, userId), eq(conversations.creativeUserId, userId)),
      ),
    )
    .limit(1);

  if (!row) throw AppError.notFound('No such conversation.');
  return row;
}
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 3.3 — Service

- [ ] **Action.** Implement, each taking the caller's user id:

- `startOrContinue({ userId, profileSlug, subject, body })` — the profile must be
  `published`; reject self-contact; reject if either party has blocked the other.
  Upserts on `(profileId, clientUserId)`, so a second contact **continues** the
  existing thread rather than creating a parallel one
- `listThreads(userId, { page, limit })` — threads where the caller is either
  party, newest activity first, each with the other party's name, the last
  message preview, and an unread count
- `getThread(conversationId, userId, { after, limit })` — messages, ascending
- `sendMessage(conversationId, userId, body)` — blocked either direction is 403;
  updates `lastMessageAt`
- `markRead(conversationId, userId)` — sets the caller's own `*_last_read_at`

Unread count for a participant is messages from the **other** party newer than
that participant's `*_last_read_at`.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 3.4 — Routes

- [ ] **Action.** Create `conversations.routes.ts`, all behind `requireAuth`,
  mounted at `/conversations`:

```
POST   /conversations                 start or continue  (messageLimiter)
GET    /conversations                 thread list
GET    /conversations/unread-count    badge
GET    /conversations/:id             thread + messages
POST   /conversations/:id/messages    reply             (messageLimiter)
POST   /conversations/:id/read        mark read
POST   /conversations/:id/report      report
```

`/unread-count` must be declared **before** `/:id`, or it is captured as an id.
Validate `:id` as a UUID — a malformed id must be a 400, not a 500.

- [ ] **Action.** Add `messageLimiter` to `rate-limit.ts`: 60 messages per user
  per hour, keyed on `req.session.userId`, `skipFailedRequests: true`.
- [ ] **Verify.** Signed out, every route returns `UNAUTHORIZED`.

---

# Phase 4 — Backend: safety

### Step 4.1 — Block and unblock

- [ ] **Action.** Add to `me.routes.ts`: `POST /me/blocks` and
  `DELETE /me/blocks/:userId`, plus `GET /me/blocks`.
- [ ] **Verify.** Blocking is idempotent; blocking yourself is a 400.

### Step 4.2 — Enforce blocks

- [ ] **Action.** `startOrContinue` and `sendMessage` both check **both
  directions** and return 403 with a neutral message.

Do not tell the sender they have been blocked — say the message cannot be
delivered. Confirming a block invites retaliation through other channels.

- [ ] **Verify.** A blocked user gets 403 on both start and reply.

### Step 4.3 — Reference docs

- [ ] **Action.** Update [`api.md`](../reference/api.md) and
  [`data-model.md`](../reference/data-model.md).
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 5 — Frontend: the sign-in gate

### Step 5.1 — Gate the Contact button

- [ ] **Action.** On `CreativeProfilePage`, when `useCurrentUser()` returns null,
  Contact links to `/login?next=/creatives/<slug>` instead of opening the
  composer.

Label it plainly — **Sign in to contact** — so the requirement is visible before
the click, not after.

- [ ] **Verify.** Signed out, Contact navigates to login; signed in, it opens
  the composer.

### Step 5.2 — Return path

- [ ] **Action.** `LoginPage` and `RegisterPage` read `?next=` and redirect
  there on success. **Only accept same-origin relative paths** beginning with a
  single `/` — an open redirect is a phishing vector.
- [ ] **Verify.** `?next=https://evil.example.com` is ignored and lands on `/`.

### Step 5.3 — Wire the return path through registration

[Plan 0007](./0007-one-account-and-creative-role.md) replaces registration with
a single short form and owns the client/creative split, so this plan no longer
needs a chooser. **Run 0007 first.**

- [ ] **Action.** Confirm `/register` is the short base-account form from
  [plan 0007](./0007-one-account-and-creative-role.md). It is — no change needed
  there.

- [ ] **Action.** **Make `IntentPage` propagate `?next=`.** Plan 0007 built the
  intent step before this gate existed, so it does not know about the parameter
  at all. Both choices must carry it: **I'm looking to hire** returns to `next`
  when present and falls back to `/directory`; **offer my work** appends it to
  `/welcome/profile`, and the submitted step returns there too.

  Without this the parameter is silently dropped between registration and the
  intent question, and a new client lands on the directory having forgotten
  which creative they were trying to contact.

A signed-out visitor pressing Contact registers, answers the intent question,
and returns to the profile they came from — the `next` parameter must not be
lost at the intent step.

- [ ] **Verify.** From a profile, signed out: Contact → register → intent →
  back on that profile with the draft intact.

### Step 5.4 — Strip inline registration

- [ ] **Action.** Remove the register and login phases from `InquiryComposer`.
  It becomes compose-and-send only, for signed-in users.

This deletes the stale-`user` bounce that sent a newly registered user back to
the account form — see [ADR 0017](../decisions/0017-sign-in-before-contacting.md).

- [ ] **Verify.** The component no longer imports `useRegister` or `useLogin`.

---

# Phase 6 — Frontend: the thread UI

### Step 6.1 — Data layer

- [ ] **Action.** Create `frontend/src/features/conversations/` with `types.ts`
  and `api.ts`. Sending must invalidate the thread, the thread list, and the
  unread count.
- [ ] **Verify.** Typecheck exits 0.

### Step 6.2 — Thread list

- [ ] **Action.** Create `frontend/src/pages/MessagesPage.tsx` at `/messages`,
  behind `RequireAuth`. Replaces `/inbox` and `/inquiries`.

Other party's name, subject, last message preview, relative time, unread count
badge. Newest activity first. `EmptyState` when there are none.

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 6.3 — Thread view

- [ ] **Action.** Create `ConversationPage.tsx` at `/messages/:id`.

Messages in order, own messages visually distinguished from the other party's,
a reply box at the bottom, and marking read on open. Scroll to the newest
message on load.

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 6.4 — Polling

- [ ] **Action.** While a thread is open, refetch every **10 seconds**, and only
  while the tab is visible — use `refetchInterval` with
  `refetchIntervalInBackground: false`.

Ten seconds is a deliberate compromise: fast enough to feel live during an
active exchange, slow enough not to wake a sleeping Render instance
continuously. Do not poll the thread list.

- [ ] **Verify.** Two browsers, two accounts: a message appears within ~10s
  without a manual refresh.

---

# Phase 7 — Frontend: unread and safety

### Step 7.1 — Header badge

- [ ] **Action.** In `SiteHeader`, show a **Messages** link with an unread count
  for any signed-in user, polling `/conversations/unread-count` every 60
  seconds.

This badge is the **only** way anyone learns a message arrived
([ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md)). It
must be visible on every page, not only inside the messages area.

- [ ] **Verify.** The count appears, and clears after reading the thread.

### Step 7.2 — Honest send confirmation

- [ ] **Action.** After starting a conversation, state plainly that the creative
  will see it **next time they sign in**, and that there is no email or SMS
  notification.
- [ ] **Verify.** The copy does not imply delivery to a phone.

### Step 7.3 — Report and block

- [ ] **Action.** In the thread view, an overflow menu with **Report
  conversation** (reason required) and **Block this person** (confirm first,
  explain it stops further messages).
- [ ] **Verify.** After blocking, the reply box is replaced with an explanation
  and sending is refused server-side too.

---

# Phase 8 — Retire the inquiries model

Only after Phase 9 passes on the new model.

### Step 8.1 — Remove the old surface

- [ ] **Action.** Delete `modules/inquiries/`, `features/inquiries/`,
  `InboxPage`, `SentInquiriesPage`, and their routes. Redirect `/inbox` and
  `/inquiries` to `/messages`.
- [ ] **Verify.** No import of `inquiries` remains outside the schema and the
  migration script.

### Step 8.2 — Drop the table

- [ ] **Action.** Remove `inquiries` from the schema, generate a migration, read
  it, apply it.

**Re-run the count check from Step 2.3 immediately before applying.** Once this
runs the originals are gone.

- [ ] **Verify.** `inquiries` no longer exists; conversation and message counts
  are unchanged.

### Step 8.3 — Update the record

- [ ] **Action.** Mark plan 0004's messaging sections superseded, pointing at
  [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md).
  Update `api.md` and `data-model.md`.
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 9 — Verification

### Step 9.1 — The gate

| Attempt | Expected |
|---|---|
| Contact while signed out | Navigates to login, no composer |
| `?next=` with an external URL | Ignored |
| Sign in via the gate | Returns to the profile |

### Step 9.2 — Conversation rules

| Attempt | Expected |
|---|---|
| Start with an unpublished profile | 404 |
| Contact your own profile | 400 |
| Contact the same creative twice | **Continues** the same thread, no duplicate |
| Opening message under 20 chars | 400 |
| One-word **reply** | 200 — replies may be short |

### Step 9.3 — Authorisation

| Attempt | Expected |
|---|---|
| Read a thread you are not in | 404, never content |
| Reply to a thread you are not in | 404 |
| Mark someone else's thread read | 404 |
| Malformed conversation id | 400, not 500 |

### Step 9.4 — Blocks

- [ ] **Verify.** A blocks B → B cannot start or reply, gets a neutral 403 that
  does not say "blocked". A can still message B. Unblocking restores it.

### Step 9.5 — Unread and polling

- [ ] **Verify.** Two accounts in two browsers: sending raises the other's badge
  within 60s and appears in the open thread within ~10s. Reading clears it.

### Step 9.6 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] All 9 phases complete
- [ ] Every inquiry migrated, counts reconciled before `inquiries` was dropped
- [ ] Contacting requires a session; the draft survives the detour
- [ ] A second contact continues one thread rather than forking
- [ ] Non-participants get 404 on every conversation route
- [ ] Report and block both work, and block is enforced server-side
- [ ] The unread badge is visible on every page
- [ ] Send copy states there is no notification
- [ ] `api.md` and `data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| **Email notifications** | The main risk in [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md). Without them a creative who checks weekly replies weekly |
| Admin review screen for reports | Reports are stored and queryable; the UI is a follow-up |
| Message retention, export, deletion | RA 10173. Conversations make this obligation larger |
| Attachments and images | Needs the image pipeline |
| WebSockets | Only worth it off the free tier |
