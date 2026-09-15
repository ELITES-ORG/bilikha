# 0004. Client accounts and inquiries

- **Status:** Ready
- **Depends on:** [plan 0001](./0001-registration-and-auth.md) (auth) and
  [plan 0003](./0003-admin-moderation.md) — nothing is `published` until
  moderation exists, and only published profiles are publicly visible
- **Related:** [ADR 0015](../decisions/0015-clients-register-through-the-inquiry-flow.md) ·
  [ADR 0005](../decisions/0005-organization-pages.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md)

---

## Goal

An anonymous visitor can browse published creatives and open a profile. When
they choose to make contact, they register in place — a short form — and send an
inquiry. The creative receives it in an inbox and can respond or decline.

This is the first point at which the registry does something for anyone other
than the person registering.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Three specific to this plan:

1. **A public endpoint returns only `published` profiles.** Anything else is a
   404, including `pending_review`. A profile awaiting review must not be
   reachable by guessing its slug.
2. **Public responses never include `email`, `phone`, or `birthDate`.** Select
   columns explicitly; never `select()` a whole user row into a public payload.
3. **The composed message survives registration.** A first-time inquirer writes
   their message, registers, and the message is still there. Losing it makes the
   flow worse than a plain contact form.

---

## Scope

**In scope**
- `inquiries` table
- Public endpoints: list published profiles, read one by slug
- Client registration via a `kind` discriminator on the existing register endpoint
- Send an inquiry; creative's inbox; respond or decline; client's sent list
- A minimal directory page and public profile page

**Out of scope**
- **Search, ranking, and rich filtering.** This plan lists and filters by domain,
  sub-domain, and municipality only. Postgres full-text search and the alias
  table are their own plan
- Threaded messaging. One message, one response — see Why below
- Organisation accounts ([ADR 0005](../decisions/0005-organization-pages.md))
- Notifications of any kind. Inquiries are seen in-app
- Portfolio images. Profiles show text only for now
- Reviews and reputation ([ADR 0006](../decisions/0006-asymmetric-reviews.md))

---

## Why one message and one response, not a chat

[Operating constraints](../explanation/constraints.md) records that deals here
will close on Messenger and GCash regardless of what we build. An inquiry is
therefore **first contact**, not a conversation: the client explains what they
need, the creative accepts and shares contact details, and the rest happens
elsewhere.

Building threaded messaging would be a large feature competing with tools people
already prefer. Tracking status instead gives us the response-rate signal that
[ADR 0005](../decisions/0005-organization-pages.md) needs for the client trust
card, at a fraction of the cost.

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 3 / 3 | Complete |
| 2. Migration | 2 / 2 | Complete |
| 3. Backend — public profiles | 3 / 3 | Complete |
| 4. Backend — client registration | 3 / 3 | Complete |
| 5. Backend — inquiries | 0 / 4 | Not started |
| 6. Frontend — directory and profile | 0 / 3 | Not started |
| 7. Frontend — inquiry flow | 0 / 4 | Not started |
| 8. Frontend — inbox and sent | 0 / 3 | Not started |
| 9. Verification | 0 / 5 | Not started |

---

# Phase 1 — Schema

### Step 1.1 — Inquiries table

- [x] **Action.** Create `backend/src/db/schema/inquiries.ts`:

```ts
import { pgTable, pgEnum, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { creativeProfiles } from './profiles.js';

/**
 * `declined` is a real outcome, not a failure — a creative who is unavailable
 * should be able to say so in one click. Both `responded` and `declined` count
 * as answered when computing a response rate; only `sent` and `read` do not.
 */
export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'sent',
  'read',
  'responded',
  'declined',
]);

export const inquiries = pgTable(
  'inquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Addressed to the profile, not the user: the profile is the public entity
    // and the thing the sender actually saw.
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    subject: text('subject').notNull(),
    message: text('message').notNull(),

    status: inquiryStatusEnum('status').notNull().default('sent'),
    // The creative's reply. One round trip by design — see the plan preamble.
    response: text('response'),

    readAt: timestamp('read_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The inbox query: one profile's inquiries, newest first.
    index('inquiries_profile_created_idx').on(table.profileId, table.createdAt),
    // The sent list.
    index('inquiries_sender_created_idx').on(table.senderUserId, table.createdAt),
    index('inquiries_status_idx').on(table.status),
  ],
);

export const inquiriesRelations = relations(inquiries, ({ one }) => ({
  profile: one(creativeProfiles, {
    fields: [inquiries.profileId],
    references: [creativeProfiles.id],
  }),
  sender: one(users, { fields: [inquiries.senderUserId], references: [users.id] }),
}));

export type Inquiry = typeof inquiries.$inferSelect;
```

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.2 — Export it

- [x] **Action.** Add `export * from './inquiries.js';` to
  `backend/src/db/schema/index.ts`.
- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.3 — Contact visibility on profiles

A creative's contact details stay private until they respond to an inquiry.

- [x] **Action.** In `backend/src/db/schema/profiles.ts`, add to
  `creativeProfiles`:

```ts
    // Which channel is revealed to a client when this creative responds to
    // their inquiry. Nothing is ever shown on the public profile itself.
    contactPreference: text('contact_preference').notNull().default('phone'),
```

- [x] **Verify.** `npm run typecheck` exits 0.

---

# Phase 2 — Migration

### Step 2.1 — Generate and read

- [x] **Action.** `npm --prefix backend run db:generate`, then open the file and
  read every line.
- [x] **Verify.** `CREATE TYPE inquiry_status`, `CREATE TABLE inquiries`, three
  indexes, and one added column on `creative_profiles`. **Stop if any `DROP`
  appears.**

### Step 2.2 — Apply

- [x] **Action.** `npm run db:migrate`
- [x] **Verify.**

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "\d inquiries"
```

Table exists with the three indexes.

---

# Phase 3 — Backend: public profiles

### Step 3.1 — Public profile service

- [x] **Action.** Create `backend/src/modules/profiles/profiles.service.ts`.

It exports two functions. **Both select columns explicitly** — never a whole
user row.

```ts
// Public shape. Note what is absent: email, phone, birthDate, barangay.
export interface PublicProfile {
  slug: string;
  displayName: string | null;
  fullName: string;
  bio: string | null;
  municipality: string;
  subdomains: { slug: string; name: string; domain: string; isPrimary: boolean }[];
  memberSince: string;
}
```

- `listPublished({ domain?, subdomain?, municipality?, page, limit })` — joins
  `creative_profiles` → `users` → `municipalities`, filtered to
  `status = 'published'`, ordered by `createdAt` descending, with a total count.
- `getPublishedBySlug(slug)` — the same shape plus sub-domains, throwing
  `AppError.notFound` when the profile does not exist **or is not published**.
  One error for both cases: a 404 that differs from "exists but unpublished"
  leaks the existence of pending profiles.

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 3.2 — Public routes

- [x] **Action.** Create `backend/src/modules/profiles/profiles.routes.ts` with
  `GET /` and `GET /:slug`, validating query params with zod (`limit` capped at
  50). **No auth guard** — these are public.
- [x] **Action.** Mount at `/creatives` in `backend/src/routes/index.ts`.
- [x] **Verify.**

```bash
curl -s http://localhost:4000/api/v1/creatives | head -c 200
curl -s http://localhost:4000/api/v1/creatives/<a-pending-profile-slug>
```

The list returns only published profiles. The pending slug returns 404.

### Step 3.3 — Prove no contact leaks

- [x] **Verify.** Publish a profile, then:

```bash
curl -s http://localhost:4000/api/v1/creatives/<published-slug> | grep -iE "email|phone|birth" && echo "LEAK" || echo "clean"
```

Must print `clean`. If it prints `LEAK`, the service is selecting whole rows.

---

# Phase 4 — Backend: client registration

### Step 4.1 — Discriminate on `kind`

- [x] **Action.** In `backend/src/modules/auth/auth.schema.ts`, restructure
  `registerSchema` as a discriminated union on `kind`.

- `kind: 'creative'` — the existing shape, unchanged. **Default when `kind` is
  absent**, so the existing frontend keeps working.
- `kind: 'client'` — first name, last name, username, email, phone, birth date,
  password, confirm password, consent flags. **No** municipality, barangay,
  sub-domains, or suffix. (Birth date is required — age gate applies to both
  kinds.)

Shared field definitions stay shared; do not duplicate the name or password
rules.

- [x] **Verify.** `npm run typecheck` exits 0, and an existing creative
  registration payload with no `kind` still validates.

### Step 4.2 — Register without a profile

- [x] **Action.** In `auth.service.ts`, branch `registerUser` on `input.kind`.

For `'client'`: insert the user with `municipalityId: null` and **do not insert
a `creative_profile` or any sub-domain rows**.

> `users.municipalityId` is currently `NOT NULL`. Make it nullable in this
> phase's migration — a client need not be in Biliran
> ([ADR 0015](../decisions/0015-clients-register-through-the-inquiry-flow.md)).
> Generate and apply that change before continuing.

- [x] **Verify.** Register with `{"kind":"client", …}`. The response has
  `profileSlug: null` and `profileStatus: null`, and:

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -t -c \
  "SELECT count(*) FROM creative_profiles p JOIN users u ON u.id=p.user_id WHERE u.username='<the client username>';"
```

Returns `0`.

### Step 4.3 — Confirm the client is not moderated

- [x] **Verify.** The client account does not appear in the admin review queue
  from [plan 0003](./0003-admin-moderation.md) under any status tab. It has no
  profile, so there is nothing to review.

---

# Phase 5 — Backend: inquiries

### Step 5.1 — Validation

- [ ] **Action.** Create `backend/src/modules/inquiries/inquiries.schema.ts`:

```ts
export const sendInquirySchema = z.object({
  profileSlug: z.string().trim().min(1),
  subject: z.string().trim().min(3, 'Too short').max(120),
  message: z.string().trim().min(20, 'Give a little more detail').max(2000),
});

export const respondSchema = z.object({
  action: z.enum(['responded', 'declined']),
  response: z.string().trim().max(2000).optional(),
});
```

The 20-character minimum is deliberate: a one-word inquiry wastes the creative's
time and is the easiest form of spam to send.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.2 — Service

- [ ] **Action.** Create `backend/src/modules/inquiries/inquiries.service.ts`
  with:

- `send({ senderUserId, profileSlug, subject, message })`
  - Resolve the profile; it must be `published`, else `AppError.notFound`
  - **Reject self-inquiry** — if the profile belongs to the sender, 400
  - Reject a duplicate open inquiry from the same sender to the same profile
    while one is still `sent` or `read`, to stop repeat-send spam
- `listReceived(userId, { page, limit })` — inquiries for the caller's own
  profile, newest first, with sender name
- `listSent(userId, { page, limit })` — what the caller sent, with profile name
  and status
- `markRead(inquiryId, userId)` — recipient only
- `respond(inquiryId, userId, { action, response })` — recipient only; sets
  status, `respondedAt`, and the response text. **On `responded`, the creative's
  contact detail becomes visible to that sender**, chosen by
  `contactPreference`. On `declined` it does not.

Every function takes the caller's user id and checks ownership. **Never trust an
id from the request body to establish who may read an inquiry.**

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.3 — Routes and rate limiting

- [ ] **Action.** Add an `inquiryLimiter` to `backend/src/middleware/rate-limit.ts`:
  10 per user per day, `skipFailedRequests: true`.

Key it on `req.session.userId`, not IP — several creatives may share an
internet café connection.

- [ ] **Action.** Create `backend/src/modules/inquiries/inquiries.routes.ts`,
  all routes behind `requireAuth`:

```
POST   /inquiries              send (inquiryLimiter)
GET    /inquiries/received     inbox
GET    /inquiries/sent         sent list
POST   /inquiries/:id/read     mark read
POST   /inquiries/:id/respond  respond or decline
```

- [ ] **Action.** Mount at `/inquiries`.
- [ ] **Verify.** Signed out, every route returns `UNAUTHORIZED`.

### Step 5.4 — Update the API reference

- [ ] **Action.** Add `/creatives` and `/inquiries` to
  [`docs/reference/api.md`](../reference/api.md), and the new tables to
  [`docs/reference/data-model.md`](../reference/data-model.md).
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 6 — Frontend: directory and profile

### Step 6.1 — Data layer

- [ ] **Action.** Create `frontend/src/features/profiles/` with `types.ts` and
  `api.ts`, following `features/taxonomy/api.ts`.
- [ ] **Verify.** Typecheck exits 0.

### Step 6.2 — Directory page

- [ ] **Action.** Create `frontend/src/pages/DirectoryPage.tsx` at `/directory`.
  **No auth guard.**

Requirements:

- Filters: domain, sub-domain, municipality. Reflected in the URL query string
  so a filtered view is shareable
- Result cards: name, primary sub-domain, municipality, other sub-domains
- `Skeleton` while loading
- **Empty state matters more here than anywhere else.** Per
  [constraints §1](../explanation/constraints.md), many sub-domains will have no
  registrants for a long time. Use `EmptyState` with a way onward — browse the
  parent domain, clear the filter. Never a bare "no results"
- Pagination

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 6.3 — Public profile page

- [ ] **Action.** Create `frontend/src/pages/CreativeProfilePage.tsx` at
  `/creatives/:slug`. **No auth guard.**

Shows name, municipality, sub-domains with the primary marked, bio, member
since, and a prominent **Contact** button. Renders the 404 page when the API
returns 404.

**No email, phone, or birth date appears anywhere on this page** — not in the
markup, not in a data attribute.

- [ ] **Verify.** View source on a published profile and search for the
  registrant's phone number. It must not be present.

---

# Phase 7 — Frontend: the inquiry flow

This is the part that earns the plan. Keep the message alive through every step.

### Step 7.1 — Draft persistence

- [ ] **Action.** Create `frontend/src/features/inquiries/draft.ts` storing a
  draft under `bilikha:inquiry-draft:<profileSlug>` in `localStorage`, wrapped in
  `try`/`catch` like the registration draft.

- [ ] **Verify.** Typecheck exits 0.

### Step 7.2 — Compose

- [ ] **Action.** Create `frontend/src/features/inquiries/InquiryComposer.tsx`:
  subject and message fields, a character counter on message, and a Send button.

**Anonymous visitors see this form, not a login wall.** They compose first; the
account step comes after they choose to send.

- [ ] **Verify.** Lint and typecheck exit 0.

### Step 7.3 — Register in place

- [ ] **Action.** On Send, if `useCurrentUser()` returns null, show the
  lightweight client registration inline — six fields plus both consent
  checkboxes — with a "Already have an account? Sign in" toggle.

The draft is saved **before** this step renders, and restored after the account
is created or the sign-in succeeds. On success, send the inquiry immediately
without making the user press Send twice.

- [ ] **Verify.** As an anonymous visitor: compose a message, press Send,
  register, and confirm the inquiry sends with the original text and the draft is
  cleared.

### Step 7.4 — Confirmation

- [ ] **Action.** After sending, show a confirmation stating that the creative
  will see it in their inbox and that **there is no email notification** — the
  client should check back. Link to the sent list.
- [ ] **Verify.** The message is unambiguous about how a response arrives.

---

# Phase 8 — Frontend: inbox and sent

### Step 8.1 — Inbox

- [ ] **Action.** Create `frontend/src/pages/InboxPage.tsx` at `/inbox`, behind
  `RequireAuth`.

Lists received inquiries newest first, unread visually distinct, showing sender
name, subject, and age. Opening one marks it read. Respond and Decline actions;
Respond requires text, Decline does not.

Show this page only to users who have a creative profile; a client has no inbox.

- [ ] **Verify.** Lint and typecheck exit 0.

### Step 8.2 — Sent list

- [ ] **Action.** Create `frontend/src/pages/SentInquiriesPage.tsx` at
  `/inquiries`, behind `RequireAuth`. Shows each inquiry, its status, and — once
  the creative has responded — their response and revealed contact detail.
- [ ] **Verify.** Typecheck exits 0.

### Step 8.3 — Navigation

- [ ] **Action.** In `SiteHeader`: **Directory** always visible; **Inbox** only
  for users with a creative profile, with an unread count; **Inquiries** for
  signed-in users.
- [ ] **Verify.** The header differs correctly for anonymous, client, and
  creative accounts.

---

# Phase 9 — Verification

### Step 9.1 — Visibility

| Attempt | Expected |
|---|---|
| `GET /creatives` anonymously | 200, published profiles only |
| `GET /creatives/<pending-slug>` | 404 |
| `GET /creatives/<published-slug>` | 200, **no email/phone/birthDate** |
| `/directory` and `/creatives/:slug` in a private window | Both render |

### Step 9.2 — The flow, as a stranger

- [ ] **Verify** in a private window, end to end: browse the directory, open a
  profile, compose, register as a client, inquiry sends with the original text.
- [ ] **Verify** the client has no inbox link and no public profile page.

### Step 9.3 — Ownership and abuse

| Attempt | Expected |
|---|---|
| Read an inquiry addressed to someone else | 404 or 403, never the content |
| Respond to an inquiry you did not receive | Refused |
| Inquire to your own profile | 400 |
| Second inquiry to the same profile while one is unanswered | Refused |
| 11 inquiries in a day | 11th is 429 |
| Message under 20 characters | 400 |

### Step 9.4 — Contact reveal

- [ ] **Verify.** Before the creative responds, the sent list shows no contact
  detail. After **Respond**, it shows the channel named by `contactPreference`.
  After **Decline**, it still shows none.

### Step 9.5 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] All 9 phases complete
- [ ] Only published profiles are publicly reachable
- [ ] No public response or page contains an email, phone, or birth date
- [ ] An anonymous visitor can go from directory to sent inquiry without losing
      their message
- [ ] Client accounts have no profile, no inbox, and never enter moderation
- [ ] Every ownership check in Step 9.3 holds
- [ ] `docs/reference/api.md` and `docs/reference/data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Search, ranking, and the alias table | Its own plan. This one filters, it does not search |
| Notifying a creative of a new inquiry | Needs email or SMS ([ADR 0013](../decisions/0013-username-password-auth-sprint-1.md)) |
| The client trust card ([ADR 0005](../decisions/0005-organization-pages.md)) | Needs response-rate history, which this plan starts collecting |
| Organisation accounts sending inquiries as an org | Organisations do not exist yet |
| Portfolio images on profiles | Image pipeline is its own work |
| Guest inquiry without an account | Revisit when phone verification lands — see [ADR 0015](../decisions/0015-clients-register-through-the-inquiry-flow.md) |
