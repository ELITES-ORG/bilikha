# 0003. Admin panel — creative registration moderation

- **Status:** Ready
- **Depends on:** [plan 0001](./0001-registration-and-auth.md) — there must be
  registrations before there is anything to moderate
- **Related:** [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) ·
  [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md) ·
  [ADR 0014](../decisions/0014-modular-monolith-architecture.md)

---

## Goal

An administrator can see every creative profile awaiting review, approve or
reject it with a reason, and every registrant sees their own status — pending,
rejected with the reason, or published — whenever they open the app.

This is what makes [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md)
workable. Sprint 1 profiles enter at `pending_review` because there is no phone
verification to act as a spam floor; without a tool to move them out of that
state, registrations pile up invisible and the registry stays empty.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. In particular: `.js` on relative backend imports, no
interpolated Tailwind class names, tokens only, no AI attribution in commits.

Two more specific to this plan:

1. **Every state change is recorded.** Approve and reject both write a
   `moderation_actions` row. Never update a profile's status without one — "who
   approved this" is unanswerable afterwards otherwise.
2. **Admin endpoints are default-deny.** Every route in the admin module sits
   behind `requireAdmin`. Do not add a route to that router and rely on
   remembering to guard it.

---

## Scope

**In scope**
- `role` on users, with a bootstrap script to create the first admin
- Review fields and an audit table
- Admin endpoints: list, read, approve, reject
- Admin UI: a review queue and a profile detail view
- Registrant-facing status: pending, rejected with reason, published

**Out of scope**
- Moderating anything other than creative profiles — no organisations, portfolio
  items, or inquiries
- Editing a profile as an admin. Reject with a reason instead
- User-side resubmission after rejection — see Known dead end
- Email or SMS notification of the decision. Status is shown in-app only
- Role management UI. Promotion is the CLI script
- The `Verified` tier from [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md).
  This plan handles publish/reject only

---

## Known dead end

**A rejected registrant cannot fix and resubmit.** Profile editing does not
exist, so there is nothing for them to change. This plan gives the admin a
"return to pending" action so a mistaken rejection is recoverable, but the
registrant has no self-service path.

That is acceptable at sprint-1 volumes and unacceptable at scale. Resolve it
when profile editing ships.

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Schema | 4 / 4 | Complete |
| 2. Migration | 0 / 3 | Not started |
| 3. Admin bootstrap | 0 / 2 | Not started |
| 4. Backend — guard and service | 0 / 3 | Not started |
| 5. Backend — routes | 0 / 3 | Not started |
| 6. Frontend — data layer | 0 / 2 | Not started |
| 7. Frontend — review queue | 0 / 3 | Not started |
| 8. Frontend — registrant status | 0 / 3 | Not started |
| 9. Verification | 0 / 4 | Not started |

---

# Phase 1 — Schema

### Step 1.1 — Add a role to users

- [x] **Action.** In `backend/src/db/schema/users.ts`, add the enum beside the
  existing ones:

```ts
/** Deliberately coarse. A finer permission model can come later; two roles is
 *  what sprint 1 needs and anything more is speculative. */
export const userRoleEnum = pgEnum('user_role', ['member', 'admin']);
```

- [x] **Action.** Add the column to the `users` table, after `status`:

```ts
    role: userRoleEnum('role').notNull().default('member'),
```

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.2 — Add review fields to profiles

- [x] **Action.** In `backend/src/db/schema/profiles.ts`, add to
  `creativeProfiles`, after `status`:

```ts
    // Shown to the registrant verbatim, so write it as something a person can
    // act on rather than an internal note.
    rejectionReason: text('rejection_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
```

`onDelete: 'set null'` rather than cascade: deleting an administrator's account
must not delete the profiles they reviewed.

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.3 — Add the audit table

- [x] **Action.** Append to `backend/src/db/schema/profiles.ts`:

```ts
export const moderationActionEnum = pgEnum('moderation_action', [
  'approved',
  'rejected',
  'returned_to_pending',
]);

/**
 * Append-only record of every moderation decision. Rows are never updated or
 * deleted — the profile's current status is the state, this is the history.
 * Without it, "who published this profile and when" has no answer.
 */
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    // Nullable so the history survives an administrator's account being deleted.
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: moderationActionEnum('action').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('moderation_actions_profile_idx').on(table.profileId),
    index('moderation_actions_created_idx').on(table.createdAt),
  ],
);

export type ModerationAction = typeof moderationActions.$inferSelect;
```

- [x] **Verify.** `npm run typecheck` exits 0.

### Step 1.4 — Index the review queue

The queue always filters on status and orders by age. Without an index this is a
sequential scan on every page load.

- [x] **Action.** In `creativeProfiles`, replace the existing status index with:

```ts
    index('creative_profiles_status_created_idx').on(table.status, table.createdAt),
```

- [x] **Verify.** `npm run typecheck` exits 0.

---

# Phase 2 — Migration

### Step 2.1 — Generate

- [ ] **Action.** `npm --prefix backend run db:generate`
- [ ] **Verify.** A new file appears in `backend/drizzle/`.

### Step 2.2 — Read the SQL

- [ ] **Action.** Open the generated file and read every line.
- [ ] **Verify.** It contains `CREATE TYPE` for `user_role` and
  `moderation_action`, `CREATE TABLE moderation_actions`, `ALTER TABLE users ADD
  COLUMN role`, and three added columns on `creative_profiles`. **If any
  `DROP TABLE` or `DROP COLUMN` appears, stop.**

### Step 2.3 — Apply

- [ ] **Action.** `npm run db:migrate`
- [ ] **Verify.**

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "\d creative_profiles" | grep -E "rejection_reason|reviewed_at|reviewed_by"
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "\dt" | grep moderation_actions
```

Both must return rows.

---

# Phase 3 — Admin bootstrap

There is no admin, and only an admin can make one. Break the cycle from the CLI.

### Step 3.1 — Promotion script

- [ ] **Action.** Create `backend/src/scripts/grant-admin.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { normalizeUsername } from '../lib/username.js';

/**
 * Promotes an existing account to administrator. The only way to create the
 * first one — there is no admin to grant it through the UI.
 *
 *   npm --prefix backend run admin:grant -- <username>
 *
 * Run it deliberately. An admin can publish and reject any profile.
 */
const [username] = process.argv.slice(2);

if (!username) {
  console.error('Usage: npm run admin:grant -- <username>');
  process.exit(1);
}

const result = await db
  .update(users)
  .set({ role: 'admin', updatedAt: new Date() })
  .where(eq(users.usernameNormalized, normalizeUsername(username)))
  .returning({ username: users.username, role: users.role });

if (result.length === 0) {
  console.error(`No user with username "${username}". Register the account first.`);
  await closeDatabase();
  process.exit(1);
}

console.log(`${result[0]!.username} is now ${result[0]!.role}.`);
await closeDatabase();
process.exit(0);
```

- [ ] **Action.** Add to `backend/package.json` scripts:

```json
"admin:grant": "tsx src/scripts/grant-admin.ts"
```

- [ ] **Verify.** Register a test account through the app, then:

```bash
npm --prefix backend run admin:grant -- yourtestusername
```

Expected: `yourtestusername is now admin.`

### Step 3.2 — Document it

- [ ] **Action.** Add `admin:grant` to the backend table in
  [`docs/reference/commands.md`](../reference/commands.md), noting that it is
  the only way to create the first administrator.
- [ ] **Verify.** `npm run docs:check` exits 0.

---

# Phase 4 — Backend guard and service

### Step 4.1 — requireAdmin

- [ ] **Action.** Create `backend/src/middleware/require-admin.ts`:

```ts
import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { AppError } from '../lib/http-error.js';

/**
 * Reads the role from the database on every request rather than caching it in
 * the session. Revoking an admin must take effect immediately, not whenever
 * their session happens to expire.
 *
 * Returns 404, not 403: the existence of an admin surface is not something an
 * ordinary user needs confirmed.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  void (async () => {
    if (!req.session.userId) {
      next(AppError.notFound('Not found'));
      return;
    }

    try {
      const [user] = await db
        .select({ role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, req.session.userId))
        .limit(1);

      if (!user || user.role !== 'admin' || user.status === 'suspended') {
        next(AppError.notFound('Not found'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  })();
};
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.2 — Moderation service

- [ ] **Action.** Create `backend/src/modules/admin/admin.service.ts`:

```ts
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';

type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';

export async function listProfiles(options: {
  status: ProfileStatus;
  page: number;
  limit: number;
}) {
  const offset = (options.page - 1) * options.limit;

  const rows = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      status: creativeProfiles.status,
      createdAt: creativeProfiles.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      municipality: municipalities.name,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(eq(creativeProfiles.status, options.status))
    // Oldest first: a review queue is a queue. Newest-first silently starves
    // the people who have waited longest.
    .orderBy(creativeProfiles.createdAt)
    .limit(options.limit)
    .offset(offset);

  const [totals] = await db
    .select({ total: count() })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.status, options.status));

  return { rows, total: totals?.total ?? 0 };
}

/** Counts for the queue tabs, in one round trip rather than three. */
export async function statusCounts() {
  const rows = await db
    .select({ status: creativeProfiles.status, total: count() })
    .from(creativeProfiles)
    .groupBy(creativeProfiles.status);

  return Object.fromEntries(rows.map((r) => [r.status, r.total])) as Record<string, number>;
}

export async function getProfile(id: string) {
  const [profile] = await db
    .select({
      id: creativeProfiles.id,
      slug: creativeProfiles.slug,
      status: creativeProfiles.status,
      rejectionReason: creativeProfiles.rejectionReason,
      reviewedAt: creativeProfiles.reviewedAt,
      createdAt: creativeProfiles.createdAt,
      userId: users.id,
      firstName: users.firstName,
      middleName: users.middleName,
      lastName: users.lastName,
      suffix: users.suffix,
      username: users.username,
      email: users.email,
      phone: users.phone,
      birthDate: users.birthDate,
      municipality: municipalities.name,
    })
    .from(creativeProfiles)
    .innerJoin(users, eq(creativeProfiles.userId, users.id))
    .innerJoin(municipalities, eq(users.municipalityId, municipalities.id))
    .where(eq(creativeProfiles.id, id))
    .limit(1);

  if (!profile) throw AppError.notFound('No such profile.');

  const subdomains = await db
    .select({
      name: creativeSubdomains.name,
      slug: creativeSubdomains.slug,
      isPrimary: creativeProfileSubdomains.isPrimary,
    })
    .from(creativeProfileSubdomains)
    .innerJoin(
      creativeSubdomains,
      eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id),
    )
    .where(eq(creativeProfileSubdomains.profileId, id));

  const history = await db
    .select({
      action: moderationActions.action,
      reason: moderationActions.reason,
      createdAt: moderationActions.createdAt,
      adminUsername: users.username,
    })
    .from(moderationActions)
    .leftJoin(users, eq(moderationActions.adminId, users.id))
    .where(eq(moderationActions.profileId, id))
    .orderBy(desc(moderationActions.createdAt));

  return { ...profile, subdomains, history };
}

/**
 * All three transitions go through one function so it is impossible to change a
 * status without writing the audit row — they happen in the same transaction.
 */
export async function moderate(input: {
  profileId: string;
  adminId: string;
  action: 'approved' | 'rejected' | 'returned_to_pending';
  reason?: string;
}) {
  if (input.action === 'rejected' && !input.reason?.trim()) {
    throw AppError.badRequest('A reason is required when rejecting.', { field: 'reason' });
  }

  const nextStatus: ProfileStatus =
    input.action === 'approved'
      ? 'published'
      : input.action === 'rejected'
        ? 'suspended'
        : 'pending_review';

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(creativeProfiles)
      .set({
        status: nextStatus,
        rejectionReason: input.action === 'rejected' ? input.reason!.trim() : null,
        reviewedAt: new Date(),
        reviewedBy: input.adminId,
        updatedAt: new Date(),
      })
      .where(eq(creativeProfiles.id, input.profileId))
      .returning({ id: creativeProfiles.id, status: creativeProfiles.status });

    if (!updated) throw AppError.notFound('No such profile.');

    await tx.insert(moderationActions).values({
      profileId: input.profileId,
      adminId: input.adminId,
      action: input.action,
      reason: input.reason?.trim() ?? null,
    });

    return updated;
  });
}
```

> **Note on `rejected`.** There is no `rejected` value in `profileStatusEnum`;
> a rejection sets `suspended` and stores the reason. If you prefer an explicit
> `rejected` status, add it to the enum in Phase 1 and change `nextStatus` —
> but do not introduce a status the enum does not contain.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.3 — Request schemas

- [ ] **Action.** Create `backend/src/modules/admin/admin.schema.ts`:

```ts
import { z } from 'zod';

export const listQuerySchema = z.object({
  status: z
    .enum(['draft', 'pending_review', 'published', 'suspended'])
    .default('pending_review'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const moderateSchema = z.object({
  action: z.enum(['approved', 'rejected', 'returned_to_pending']),
  reason: z.string().trim().max(500).optional(),
});
```

- [ ] **Verify.** `npm run typecheck` exits 0.

---

# Phase 5 — Backend routes

### Step 5.1 — Admin router

- [ ] **Action.** Create `backend/src/modules/admin/admin.routes.ts`:

```ts
import { Router } from 'express';
import { requireAdmin } from '../../middleware/require-admin.js';
import { listQuerySchema, moderateSchema } from './admin.schema.js';
import { getProfile, listProfiles, moderate, statusCounts } from './admin.service.js';

export const adminRouter: Router = Router();

// Guards the whole router. Every route below is admin-only by construction,
// rather than by remembering to add a guard per route.
adminRouter.use(requireAdmin);

adminRouter.get('/profiles', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { rows, total } = await listProfiles(query);

  res.json({
    data: rows,
    meta: { page: query.page, limit: query.limit, total, status: query.status },
  });
});

adminRouter.get('/profiles/counts', async (_req, res) => {
  res.json({ data: await statusCounts() });
});

adminRouter.get('/profiles/:id', async (req, res) => {
  res.json({ data: await getProfile(req.params.id) });
});

adminRouter.post('/profiles/:id/moderate', async (req, res) => {
  const input = moderateSchema.parse(req.body);

  const updated = await moderate({
    profileId: req.params.id,
    adminId: req.session.userId!,
    action: input.action,
    reason: input.reason,
  });

  res.json({ data: updated });
});
```

Route order matters: `/profiles/counts` must be declared before
`/profiles/:id`, or `counts` is captured as an id.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.2 — Mount it

- [ ] **Action.** In `backend/src/routes/index.ts`:

```ts
apiRouter.use('/admin', adminRouter);
```

- [ ] **Verify.** Signed out, `curl -s http://localhost:4000/api/v1/admin/profiles`
  returns a `NOT_FOUND` error — not `UNAUTHORIZED`, and not a list.

### Step 5.3 — Expose status on /auth/me

The registrant's own status has to reach the frontend.

- [ ] **Action.** In `backend/src/modules/auth/auth.service.ts`, extend
  `PublicUser` with `role`, `profileStatus`, and `rejectionReason`, and populate
  them in `toPublicUser` from the user row and profile row.
- [ ] **Verify.** Log in and `curl` `/auth/me` with the session cookie. The
  response contains `"role":"member"` and `"profileStatus":"pending_review"`.

---

# Phase 6 — Frontend data layer

### Step 6.1 — Types and hooks

- [ ] **Action.** Create `frontend/src/features/admin/types.ts` and
  `frontend/src/features/admin/api.ts`, following the pattern in
  `features/taxonomy/api.ts`: a key factory, fetchers wrapping errors in
  `toApiError`, `useQuery` for the list, counts, and detail, and a `useMutation`
  for moderate.

The moderate mutation must invalidate the list, the counts, **and** the detail
query on success, or the queue shows stale rows after a decision.

- [ ] **Verify.** `npm --prefix frontend run typecheck` exits 0.

### Step 6.2 — Admin route guard

- [ ] **Action.** Create `frontend/src/features/auth/RequireAdmin.tsx`,
  following `RequireAuth`: render nothing while `useCurrentUser()` is pending,
  redirect to `/` if there is no user or `user.role !== 'admin'`.

This is convenience, not security. The API returns 404 regardless.

- [ ] **Verify.** Typecheck exits 0.

---

# Phase 7 — Review queue

### Step 7.1 — Queue page

- [ ] **Action.** Create `frontend/src/pages/admin/AdminQueuePage.tsx` at
  `/admin`, wrapped in `RequireAdmin`.

Requirements:

- Tabs for Pending, Published, Suspended, each showing its count from the counts
  endpoint
- Default tab: **Pending**
- A table or list of rows: name, username, municipality, sub-domain count, and
  how long it has been waiting
- Oldest first
- Each row links to the detail view
- Pagination when total exceeds the page size
- Empty state via `EmptyState` — "Nothing waiting for review" is a **good**
  outcome here, so word it that way rather than as an absence
- `Skeleton` rows while loading

- [ ] **Verify.** Typecheck and `npx oxlint src` both exit 0.

### Step 7.2 — Detail and decision

- [ ] **Action.** Create `frontend/src/pages/admin/AdminProfilePage.tsx` at
  `/admin/profiles/:id`.

Requirements:

- Full name with suffix, username, municipality, sub-domains with the primary
  marked, registration date
- Contact details (email, phone) — visible to admins, and **never** rendered on
  any public page
- Moderation history, newest first, with each action, reason, admin, and date
- **Approve** — primary button, immediate
- **Reject** — opens a reason field; submit disabled until non-empty; the reason
  text states plainly that the registrant will see it
- **Return to pending** — shown only for an already-decided profile
- Buttons disabled while the mutation is pending, using `loading`
- On success, return to the queue

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 7.3 — Routes and entry point

- [ ] **Action.** Add both routes in `App.tsx`, wrapped in `RequireAdmin`.
- [ ] **Action.** In `SiteHeader`, show an **Admin** link only when
  `user?.role === 'admin'`.
- [ ] **Verify.** The link is absent for a normal account and present for an
  admin.

---

# Phase 8 — Registrant status

Every registrant sees their own status whenever they open the app.

### Step 8.1 — Status banner

- [ ] **Action.** Create
  `frontend/src/features/auth/RegistrationStatusBanner.tsx`.

Reads `useCurrentUser()` and renders nothing when signed out or when
`profileStatus === 'published'`. Otherwise:

| Status | Tone | Message |
|---|---|---|
| `pending_review` | `warning` | Your registration is being reviewed. Your profile is not visible in the directory yet. |
| `suspended` with a reason | `danger` | Your registration was not approved, followed by the reason verbatim |
| `draft` | `neutral` | Your registration is incomplete. |

Use `Badge` tones and existing tokens. Status is never colour alone — pair each
with an icon.

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 8.2 — Show it on every screen

- [ ] **Action.** Render the banner directly below `SiteHeader`, so it appears
  on every page rather than only after login.
- [ ] **Verify.** Sign in as a pending account. The banner shows on `/` and
  stays after navigating and after a reload.

### Step 8.3 — Show it after login

- [ ] **Action.** On `LoginPage`, after a successful sign-in, route to `/` where
  the banner is visible. Do not swallow the status in a toast — it must persist.
- [ ] **Verify.** Log in as a rejected account. The rejection reason is visible
  without any further clicks.

---

# Phase 9 — Verification

### Step 9.1 — Access control

- [ ] **Verify** each row:

| Attempt | Expected |
|---|---|
| `GET /api/v1/admin/profiles` signed out | 404 `NOT_FOUND` |
| Same as a normal member | 404 `NOT_FOUND` |
| Same as an admin | 200 with a list |
| Visit `/admin` in the browser as a member | Redirected away |
| Suspend an admin's user row, then retry | 404 — role is read per request, not cached |

### Step 9.2 — The moderation flow

- [ ] **Verify.** Register a new account → it appears in Pending → approve it →
  it moves to Published, and the registrant's banner disappears.
- [ ] **Verify.** Register another → reject with a reason → the registrant sees
  the reason verbatim on next load.
- [ ] **Verify.** Return that profile to pending → it reappears in the Pending
  queue and the banner changes back.

### Step 9.3 — The audit trail

- [ ] **Verify.**

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c \
  "SELECT action, reason, admin_id IS NOT NULL AS has_admin, created_at FROM moderation_actions ORDER BY created_at;"
```

One row per decision, in order, each with an admin. Rejections have a reason.

- [ ] **Verify** rejection without a reason is refused:

```bash
curl -s -b cookies.txt -X POST http://localhost:4000/api/v1/admin/profiles/<id>/moderate \
  -H "Content-Type: application/json" -d '{"action":"rejected"}'
```

Expected: 400, message about a reason being required.

### Step 9.4 — Full pass

- [ ] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run docs:check` all exit 0.

---

## Acceptance

- [ ] All 9 phases complete
- [ ] Admin endpoints return 404 to everyone who is not an admin
- [ ] No status change exists without a `moderation_actions` row
- [ ] Rejection requires a reason, and the registrant sees it
- [ ] The status banner appears on every page until the profile is published
- [ ] `docs/reference/api.md` and `docs/reference/data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| Profile editing and resubmission after rejection | The dead end noted above. Needs the profile editor |
| The `Verified` tier | This plan handles publish/reject only |
| Notifying a registrant of a decision | Needs email or SMS, both out of scope in sprint 1 |
| Moderating organisations, portfolios, inquiries | Those features do not exist yet |
| Role management UI | CLI is enough for one or two admins |
| Bulk approve | Only worth building once a queue is genuinely long |
