# 0013. Client postings, and mode-mirrored surfaces

- **Status:** Complete
- **Depends on:** [plan 0012](./0012-inquire-from-an-offer-and-saved-offers.md) â??
  replying to a posting reuses the attach-to-message pattern it built
- **Related:** [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md) Â·
  [ADR 0024](../decisions/0024-offers-attach-to-messages.md) Â·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md)

---

## Goal

A client publishes a posting â?? work they want done. A creative's Home is a feed
of those postings, their own sub-domains first. Home, Messages and History all
mirror: each mode shows the other side of the market.

Replying to a posting attaches it to a message, exactly as inquiring about an
offer does.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Five specific to this plan:

1. **Nobody browses their own side.** Creative mode never shows offers or
   creative profiles; hiring mode never shows postings. If you are writing a
   filter to exclude your own rows, you have the wrong shape.
2. **Every empty state names the mode and offers the way out.**
   [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md) calls this
   the difference between the feature working and the app looking broken. An
   empty list with no explanation is not acceptable here.
3. **The mode control goes on every mirrored surface** â?? Home, Messages,
   History. Not only Home. A list that can be emptied by mode must carry its own
   escape.
4. **Money is integer centavos**, as in plan 0010. Reuse `lib/money.ts` and
   `PesoInput`; write no new formatting.
5. **Mirror, do not duplicate.** Replying to a posting is a message with a
   posting attached, the same grain as
   [ADR 0024](../decisions/0024-offers-attach-to-messages.md). Do not invent a
   second messaging path.

---

## Scope

**In scope**
- `postings`, with expiry and status
- `messages.posting_id`, mirroring `offer_id`
- `users.view_mode`, replacing the `localStorage` preference
- A creative Home feed ordered by their sub-domains, then municipality, then
  recency
- Posting compose, edit, close, and a list of your own
- Replying to a posting from the creative side
- Home, Messages and History mirrored by mode, each carrying the mode control
- Contact-details flagging on posting descriptions, as plan 0012 does for offers

**Out of scope** â?? do not build these
- Making postings the primary direction, or demoting offers. They sit beside each
  other ([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md))
- Notifying a creative that a matching posting appeared. Needs the notifications
  feature the bell is still waiting on
- Applications, quotes, or any structured bid. A reply is a message
- Saved postings. Saving exists for offers only until someone asks
- Letting a creative post, or a client reply to a posting, while in the other
  mode. Mode decides

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 3 / 3 | Complete |
| 2. Backend ? postings | 4 / 4 | Complete |
| 3. Backend ? the creative feed | 3 / 3 | Complete |
| 4. Backend ? replying, and mirrored lists | 3 / 3 | Complete |
| 5. Frontend ? mode | 3 / 3 | Complete |
| 6. Frontend ? the creative side | 3 / 3 | Complete |
| 7. Frontend ? the client side | 2 / 2 | Complete |
| 8. Frontend ? mirrored Messages and History | 2 / 2 | Complete |
| 9. Verification | 6 / 6 | Complete |

---

# Phase 1 â?? Schema

### Step 1.1 â?? `postings`

- [x] **Action.** Add to `backend/src/db/schema/`:

```ts
export const postingStatusEnum = pgEnum('posting_status', ['open', 'closed', 'expired']);

export const postings = pgTable(
  'postings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The client. Not a profile: anyone with an account can post.
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    // Where the work is, which is not always where the client lives.
    municipalityId: uuid('municipality_id')
      .notNull()
      .references(() => municipalities.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    budgetMinCentavos: integer('budget_min_centavos'),
    budgetMaxCentavos: integer('budget_max_centavos'),
    status: postingStatusEnum('status').notNull().default('open'),
    // A board of stale postings teaches creatives nothing there is real.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('postings_user_created_idx').on(table.userId, table.createdAt),
    // The feed query runs on this.
    index('postings_subdomain_status_idx').on(table.subdomainId, table.status, table.expiresAt),
    index('postings_reviewed_idx').on(table.reviewedAt),
  ],
);
```

Unlike an offer, a posting's sub-domain is **not** constrained to anything the
poster registered â?? a client is not a creative and has no sub-domains. Any of
the 81 is valid.

- [x] **Action.** Add `postingId` to `messages`, nullable,
  `onDelete: 'set null'`, with an index â?? mirroring `offerId`.
- [x] **Verify.** `db:generate` produces additions only.

### Step 1.2 â?? Mode on the account

- [x] **Action.** Add `viewMode` to `users`: `'hiring' | 'creative'`, defaulting
  to `'hiring'`.

Default `hiring`, not `creative`: every account starts without a profile
([ADR 0019](../decisions/0019-one-account-creative-as-attachable-role.md)), and
a creative Home for someone who is not a creative is an empty page.

- [x] **Action.** Set it to `creative` when a creative profile is created, so
  finishing profile setup lands you where your new work is.
- [x] **Verify.** A fresh client account is `hiring`. Completing profile setup
  flips it once.

### Step 1.3 â?? Reference

- [x] **Action.** Update [`data-model.md`](../reference/data-model.md).
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 2 â?? Backend: postings

### Step 2.1 â?? Validation

- [x] **Action.** Create `backend/src/modules/postings/`. Body: `title` 3â??80,
  `description` up to 2000, `subdomainSlug`, `municipalitySlug`, optional
  `budgetMinCentavos` / `budgetMaxCentavos` with the same max-at-least-min refine
  and â?±1,000,000 ceiling as `offers.schema.ts`, and `expiresInDays` 1â??60
  defaulting to 30.
- [x] **Verify.** A max below the min is a 400 naming `budgetMaxCentavos`.

### Step 2.2 â?? CRUD

- [x] **Action.** Behind `requireAuth`, all resolving the caller:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/postings/mine` | Your own, any status, newest first |
| `POST` | `/postings` | Caps open postings per account under an advisory lock |
| `PATCH` | `/postings/:id` | Title, description, sub-domain, municipality, budget |
| `POST` | `/postings/:id/close` | Sets `closed`. Does not delete |
| `DELETE` | `/postings/:id` | Only while nobody has replied |

Each one validates `:id` as a uuid and **404s on another account's posting** â??
never 403.

- [x] **Action.** Cap open postings at **5 per account**, counted under
  `pg_advisory_xact_lock(hashtext(userId))` inside the insert transaction. A
  count in a transaction is not atomic on its own â?? the same trap as the offer
  cap in plan 0010.
- [x] **Action.** `DELETE` refuses once a message carries the posting: the
  conversation would be left referring to something that never existed. Close it
  instead.
- [x] **Verify.** The sixth open posting is a 400. Deleting a replied-to posting
  is a 400 naming why. Closing always works.

### Step 2.3 â?? Flag contact details

- [x] **Action.** Reuse `detectContactDetails` from the offers service on the
  description. Advisory only â?? never block, never hide.
- [x] **Verify.** A description with a phone number saves, appears, and is
  flagged.

### Step 2.4 â?? Reference

- [x] **Action.** Document the endpoints in [`api.md`](../reference/api.md).
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 3 â?? Backend: the creative feed

### Step 3.1 â?? `GET /postings`

- [x] **Action.** Behind `requireAuth` **and a creative profile** â?? this is the
  creative side. Returns open, unexpired postings, excluding the caller's own.
- [x] **Action.** Filters: `subdomain`, `domain`, `municipality`, page, limit.
- [x] **Verify.** A caller with no creative profile gets 403. Your own postings
  never appear in your feed.

### Step 3.2 â?? Ordering

- [x] **Action.** Matching the caller's registered sub-domains first, then
  municipality, then newest, then id:

```ts
const order = [
  desc(sql`${postings.subdomainId} in ${registeredSubdomainIds}`),
  desc(sql`${postings.municipalityId} = ${viewerMunicipalityId}`),
  desc(postings.createdAt),
  asc(postings.id),
];
```

The id is the stable tiebreaker, as in plan 0010 â?? without it pagination can
repeat or skip.

- [x] **Action.** Expired postings are excluded by `expiresAt > now()`, not by a
  background job. Nothing has to run for the board to stay honest.
- [x] **Verify.** A mobile app developer sees mobile app postings above others. A
  posting one second past expiry is gone.

### Step 3.3 â?? Payload

- [x] **Action.** Each row: the posting, its sub-domain and municipality, the
  client's name and avatar, whether **you** have already replied.

"Already replied" is what stops a creative answering the same posting twice
without realising.

- [x] **Action.** Resolve clients and reply-state for the page in one query each.
- [x] **Verify.** A 20-row page issues a fixed number of queries.

---

# Phase 4 â?? Backend: replying, and mirrored lists

### Step 4.1 â?? Reply to a posting

- [x] **Action.** Extend the existing message endpoints with an optional
  `postingId`, exactly as `offerId` works. A conversation between a creative and
  a posting's author is **the same one-per-pair conversation** â?? do not add a
  second kind.
- [x] **Action.** Validate that the posting is open and unexpired, and that the
  caller is not its author.
- [x] **Verify.** Replying twice adds two messages to one thread. Replying to
  your own posting is a 400.

### Step 4.2 â?? Mirrored Messages

- [x] **Action.** `GET /conversations` takes `mode`. In `creative` it returns
  threads where you are the creative; in `hiring`, where you are the client. The
  `role` field already computed per thread is the discriminator.
- [x] **Verify.** A user who is both sees different lists in each mode, and every
  thread appears in exactly one.

### Step 4.3 â?? Mirrored History

- [x] **Action.** `hiring` keeps the existing Inquired and Saved. `creative`
  returns postings you replied to, grouped by posting, newest first â?? the mirror
  of plan 0012's grouping.
- [x] **Verify.** Replying to one posting twice is one row.

---

# Phase 5 â?? Frontend: mode

### Step 5.1 â?? Mode from the account

- [x] **Action.** Read mode from the current-user payload and change it through
  the API. **Delete `features/me/view-mode.ts`** and its `localStorage` use.
- [x] **Verify.** Switching on one device and reloading on another shows the same
  mode.

### Step 5.2 â?? The control

- [x] **Action.** A `ModeSwitch` segment control â?? Hiring / My creative work â??
  rendered at the top of **Home, Messages and History**. Only for accounts with a
  creative profile; everyone else has one side and needs no control.
- [x] **Verify.** A client with no profile never sees it. Switching on Messages
  changes Messages in place.

### Step 5.3 â?? Empty states name the mode

- [x] **Action.** Every mirrored surface's empty state says which mode it is and
  how to leave: *"You are viewing your creative work. No postings match your
  sub-domains yet â?? switch to Hiring to browse creatives."*

Rule 2. This is the difference between a young registry and a broken app, and
with today's data **empty is the common case on both sides**.

- [x] **Verify.** All six empty states â?? three surfaces Ã? two modes â?? name the
  mode and offer the switch.

---

# Phase 6 â?? Frontend: the creative side

### Step 6.1 â?? Home

- [x] **Action.** In creative mode, Home is the postings feed: title, budget,
  sub-domain, municipality, how long it has left, the client, and whether you
  replied.
- [x] **Verify.** Offers and creative profiles appear nowhere in creative mode.

### Step 6.2 â?? Posting detail

- [x] **Action.** A posting page with the full description and a **Reply**
  button, mirroring the offer page's Inquire. It attaches the posting to the
  composer; the creative types once and sends once.
- [x] **Verify.** Replying lands in one thread with the posting card attached.

### Step 6.3 â?? The card in a thread

- [x] **Action.** Render a message's posting as a card, reusing `OfferCard`'s
  shape. A closed, expired or deleted posting still renders, saying so.
- [x] **Verify.** Closing a posting leaves its messages readable.

---

# Phase 7 â?? Frontend: the client side

### Step 7.1 â?? Compose

- [x] **Action.** In hiring mode, a Post work action opening a form: title,
  sub-domain (grouped by domain, all 81 available), municipality, description,
  optional budget using `PesoInput`, and how long to run.
- [x] **Verify.** A posting appears in your own list immediately and in a
  matching creative's feed.

### Step 7.2 â?? Manage

- [x] **Action.** Your postings with status, replies received, time left, and
  Close. Edit while open.
- [x] **Verify.** Closing removes it from every feed and keeps the threads.

---

# Phase 8 â?? Frontend: mirrored Messages and History

### Step 8.1 â?? Messages

- [x] **Action.** Pass the mode; render the mode control above the list.
- [x] **Verify.** A dual-role user sees each thread in exactly one mode.

### Step 8.2 â?? History

- [x] **Action.** Hiring keeps Inquired and Saved. Creative shows postings you
  replied to.
- [x] **Verify.** Both render, with their own empty states.

---

# Phase 9 â?? Verification

### Step 9.1 â?? Nobody browses their own side

- [x] **Verify.** Creative mode shows no offers and no creative profiles.
- [x] **Verify.** Hiring mode shows no postings feed.
- [x] **Verify.** Your own postings never appear in your own creative feed.

### Step 9.2 â?? Ownership and limits

| Attempt | Expected |
|---|---|
| `PATCH` another account's posting | 404 |
| Reply to your own posting | 400 |
| Reply to a closed or expired posting | 400 |
| Sixth open posting | 400 naming the limit |
| Delete a posting that has replies | 400 |
| `GET /postings` with no creative profile | 403 |

- [x] **Verify.** Every row behaves as stated.

### Step 9.3 â?? Expiry

- [x] **Verify.** A posting one second past `expiresAt` is absent from the feed
  with nothing scheduled having run.
- [x] **Verify.** Its existing threads still render it.

### Step 9.4 â?? Mode is not a trap

- [x] **Verify.** Every mirrored surface carries the control in both modes.
- [x] **Verify.** All six empty states name the mode and offer the switch.
- [x] **Verify.** Mode survives a reload and matches on a second device.

### Step 9.5 â?? Money

- [x] **Verify.** Budgets round-trip as integer centavos, and no float holds
  money anywhere.

### Step 9.6 â?? Full pass

- [x] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0.

---

## Acceptance

- [x] A client can post work, edit it, close it, and see replies
- [x] A creative's Home is postings, their sub-domains first
- [x] Neither side ever sees its own side of the market
- [x] Replying attaches the posting to a message in the existing thread
- [x] Home, Messages and History all mirror, and each carries the mode control
- [x] Every empty state names the mode and offers the way out
- [x] Mode lives on the account and follows the person between devices
- [x] Postings expire without anything being scheduled
- [x] `api.md` and `data-model.md` updated
- [x] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Telling a creative a matching posting appeared | The whole value of a board is timeliness, and there is still no notification of any kind. This is the first thing to build after it |
| Saved postings | Saving exists for offers. Mirror it once someone asks |
| Structured quotes | A reply is a message. Budgets and scope negotiated in the thread |
| Postings from organisations | [ADR 0005](../decisions/0005-organization-pages.md) is still proposed; institutional buyers are the likeliest source of real budgets |
| Reporting a posting | Same gap as offers: no public report button, so an administrator has to notice |
