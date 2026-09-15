# 0001. Registration and authentication

- **Status:** Ready
- **Related:** [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md) ·
  [ADR 0014](../decisions/0014-modular-monolith-architecture.md) ·
  [ADR 0004](../decisions/0004-unified-account-model.md) ·
  [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md)

---

## Goal

An individual creative can register an account and log in with a username and
password. Registration creates a user, a creative profile in `pending_review`,
and the sub-domain links describing what they do. No external services.

---

## Rules for whoever executes this

Read these before step 1. Violating any of them produces bugs that do not show
up as build errors.

1. **Execute steps in order.** Later steps assume earlier ones.
2. **Run the Verify action of every step before moving on.** If output does not
   match, stop and fix. Do not continue and hope.
3. **Relative imports in backend TypeScript end in `.js`** — `./auth.service.js`
   even though the file is `.ts`. The build is ESM with `NodeNext`. Omitting it
   compiles fine and fails at runtime.
4. **Never interpolate a Tailwind class name.** `` `bg-${x}-500` `` generates no
   CSS, silently. Use a lookup map of complete literals, or
   `style={{ … : 'var(--color-…)' }}`.
5. **Never use a raw colour, shadow, or font size** in the frontend. Tokens
   only. See [`frontend/DESIGN.md`](../../frontend/DESIGN.md).
6. **Do not invent data.** If a step needs data you do not have, stop and say so.
7. **Do not add dependencies** beyond those in Phase 1.
8. **Tick the checkbox** for each step as you complete it, and update the
   Progress table.

---

## Scope

**In scope**
- `users`, `barangays`, `creative_profiles`, `creative_profile_subdomains`,
  `sessions` tables
- Register, login, logout, current-user endpoints
- Password hashing (argon2id) and Postgres-backed sessions
- Rate limiting on auth endpoints
- Registration and login pages, plus a route guard
- An admin password-reset script

**Out of scope** — do not build these
- Organisation registration. The `account_type` column exists and defaults to
  `individual`; the UI does not offer the choice. Later plan.
- Email or SMS verification. [ADR 0013](../decisions/0013-username-password-auth-sprint-1.md).
- Self-service password reset. Admin script only, same ADR.
- Portfolio upload, profile editing, public profile pages, search.
- Alias-based sub-domain search. Sprint 1 uses a browse picker.
- An admin UI. Publishing a profile is a documented SQL statement.

---

## Prerequisites

Run each and confirm before starting.

```bash
node -v                    # v20 or higher
docker info                # must not error
cd <repo root>
npm run db:up
docker compose ps          # bilikha-postgres ... Up (healthy)
npm run db:migrate
npm run db:seed            # domains: 9  subdomains: 81
npm run typecheck          # exit 0
```

---

## Known gap: barangay data

**Nobody has the list of Biliran barangays in this repository, and it must not
be invented.** There are roughly 130 across the 8 municipalities. The authoritative
source is the PSA's PSGC publication.

This plan therefore makes `barangay_id` **nullable**. Phase 3 builds the table
and a CSV loader. If the CSV is absent, the loader is a no-op, the API returns
an empty list, and the form renders the barangay field disabled with explanatory
text. **The plan is not blocked by this** — but obtain the data before launch.

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Dependencies | 0 / 2 | Not started |
| 2. Database schema | 0 / 5 | Not started |
| 3. Migration and barangay seed | 0 / 4 | Not started |
| 4. Password and session infrastructure | 0 / 5 | Not started |
| 5. Auth module | 0 / 5 | Not started |
| 6. Supporting endpoints | 0 / 2 | Not started |
| 7. Security hardening | 0 / 3 | Not started |
| 8. Frontend auth plumbing | 0 / 4 | Not started |
| 9. Registration page | 0 / 4 | Not started |
| 10. Login page and guard | 0 / 3 | Not started |
| 11. Admin tooling | 0 / 2 | Not started |
| 12. End-to-end verification | 0 / 4 | Not started |

---

# Phase 1 — Dependencies

### Step 1.1 — Install backend dependencies

- [ ] **Action.** From the repo root:

```bash
npm --prefix backend install @node-rs/argon2 express-session express-rate-limit
npm --prefix backend install -D @types/express-session
```

`@node-rs/argon2` ships prebuilt binaries — no compiler needed. We are **not**
installing `connect-pg-simple`: it depends on the `pg` driver, which would add a
second Postgres driver and connection pool alongside `postgres.js`. Phase 4
builds a small Drizzle-backed session store instead.

- [ ] **Verify.**

```bash
node -e "require('@node-rs/argon2');console.log('argon2 ok')"
```

Expected: `argon2 ok`

### Step 1.2 — Confirm nothing broke

- [ ] **Action.** `npm run typecheck`
- [ ] **Verify.** Exit code 0, no output beyond the script banners.

---

# Phase 2 — Database schema

Follows the conventions in
[change the database schema](../guides/change-the-database-schema.md).

### Step 2.1 — Add `barangays` to the geography schema

- [ ] **Action.** Append to `backend/src/db/schema/geography.ts`:

```ts
import { index } from 'drizzle-orm/pg-core';

/**
 * Roughly 130 barangays across the eight municipalities. Sourced from the PSA
 * PSGC listing — never invented. Nullable on `users` because the list may not
 * be loaded yet; see docs/plans/0001-registration-and-auth.md.
 */
export const barangays = pgTable(
  'barangays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    municipalityId: uuid('municipality_id')
      .notNull()
      .references(() => municipalities.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    psgcCode: text('psgc_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Slugs are unique per municipality, not globally — "Poblacion" exists in
    // several towns.
    uniqueIndex('barangays_municipality_slug_idx').on(table.municipalityId, table.slug),
    index('barangays_municipality_idx').on(table.municipalityId),
  ],
);

export type Barangay = typeof barangays.$inferSelect;
```

Add `index` to the existing `drizzle-orm/pg-core` import rather than writing a
second import statement.

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 2.2 — Create the users schema

- [ ] **Action.** Create `backend/src/db/schema/users.ts`:

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { municipalities, barangays } from './geography.js';

/** Organisations are out of scope for sprint 1; the column exists so adding
 *  them later is not a migration of every existing row. */
export const accountTypeEnum = pgEnum('account_type', ['individual', 'organization']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // `username` preserves the case the user typed, for display.
    // `usernameNormalized` is lowercase and carries the unique index, so
    // "JuanCruz" and "juancruz" collide. Login matches on the normalized column.
    username: text('username').notNull(),
    usernameNormalized: text('username_normalized').notNull(),

    // Unverified in sprint 1 (ADR 0013). Contact details only — never use these
    // for password reset or identity matching until a verification flow exists.
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    phone: text('phone').notNull(),

    passwordHash: text('password_hash').notNull(),

    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    // "Jr.", "Sr.", "III" — common in Filipino names and corrupting to sorting
    // and dedup if folded into the surname.
    suffix: text('suffix'),

    // Needed to identify minors, who require parental consent under RA 10173.
    birthDate: date('birth_date').notNull(),

    accountType: accountTypeEnum('account_type').notNull().default('individual'),
    status: userStatusEnum('status').notNull().default('active'),

    municipalityId: uuid('municipality_id')
      .notNull()
      .references(() => municipalities.id, { onDelete: 'restrict' }),
    barangayId: uuid('barangay_id').references(() => barangays.id, { onDelete: 'set null' }),

    // RA 10173 requires demonstrable consent. Store when, and to which version
    // of the policy, so a later policy change can be re-consented.
    privacyConsentAt: timestamp('privacy_consent_at', { withTimezone: true }).notNull(),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    consentVersion: text('consent_version').notNull(),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_normalized_idx').on(table.usernameNormalized),
    uniqueIndex('users_email_normalized_idx').on(table.emailNormalized),
    uniqueIndex('users_phone_idx').on(table.phone),
    index('users_municipality_idx').on(table.municipalityId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 2.3 — Create the profiles schema

- [ ] **Action.** Create `backend/src/db/schema/profiles.ts`:

```ts
import { pgTable, pgEnum, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { creativeSubdomains } from './taxonomy.js';

/** Sprint 1 profiles enter at `pending_review` — without phone verification
 *  there is no spam floor, so nothing auto-publishes. See ADR 0013. */
export const profileStatusEnum = pgEnum('profile_status', [
  'draft',
  'pending_review',
  'published',
  'suspended',
]);

export const creativeProfiles = pgTable(
  'creative_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Public URL segment. Seeded from the normalized username at registration,
    // kept separate so a username change need not break shared links.
    slug: text('slug').notNull(),
    displayName: text('display_name'),
    bio: text('bio'),
    status: profileStatusEnum('status').notNull().default('pending_review'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_profiles_user_idx').on(table.userId),
    uniqueIndex('creative_profiles_slug_idx').on(table.slug),
    index('creative_profiles_status_idx').on(table.status),
  ],
);

export const creativeProfileSubdomains = pgTable(
  'creative_profile_subdomains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cps_profile_subdomain_idx').on(table.profileId, table.subdomainId),
    // Partial unique index: at most one primary per profile, enforced by the
    // database rather than by application code that can be bypassed.
    uniqueIndex('cps_one_primary_per_profile_idx')
      .on(table.profileId)
      .where(sql`is_primary`),
    index('cps_subdomain_idx').on(table.subdomainId),
  ],
);

export const creativeProfilesRelations = relations(creativeProfiles, ({ one, many }) => ({
  user: one(users, { fields: [creativeProfiles.userId], references: [users.id] }),
  subdomains: many(creativeProfileSubdomains),
}));

export const creativeProfileSubdomainsRelations = relations(
  creativeProfileSubdomains,
  ({ one }) => ({
    profile: one(creativeProfiles, {
      fields: [creativeProfileSubdomains.profileId],
      references: [creativeProfiles.id],
    }),
    subdomain: one(creativeSubdomains, {
      fields: [creativeProfileSubdomains.subdomainId],
      references: [creativeSubdomains.id],
    }),
  }),
);

export type CreativeProfile = typeof creativeProfiles.$inferSelect;
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 2.4 — Create the sessions schema

- [ ] **Action.** Create `backend/src/db/schema/sessions.ts`:

```ts
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Backing store for express-session. Lives in our schema and migrations rather
 * than being created by a session-store library, so it is visible, indexed, and
 * versioned like every other table.
 */
export const sessions = pgTable(
  'sessions',
  {
    sid: text('sid').primaryKey(),
    data: text('data').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 2.5 — Export the new schemas

- [ ] **Action.** Replace `backend/src/db/schema/index.ts` with:

```ts
export * from './taxonomy.js';
export * from './geography.js';
export * from './users.js';
export * from './profiles.js';
export * from './sessions.js';
```

- [ ] **Verify.** `npm run typecheck` exits 0.

---

# Phase 3 — Migration and barangay seed

### Step 3.1 — Generate the migration

- [ ] **Action.** `npm --prefix backend run db:generate`
- [ ] **Verify.** Output names a new file in `backend/drizzle/`. It should report
  5 new tables: `barangays`, `users`, `creative_profiles`,
  `creative_profile_subdomains`, `sessions`.

### Step 3.2 — Read the generated SQL

- [ ] **Action.** Open the new `backend/drizzle/NNNN_*.sql` and read every line.
- [ ] **Verify.** Confirm all of the following. **If any `DROP TABLE` or
  `DROP COLUMN` appears, stop** — something is wrong.
  - `CREATE TYPE` for `account_type`, `user_status`, `profile_status`
  - `CREATE TABLE` for the five tables
  - A partial unique index ending `WHERE is_primary` (or `WHERE "is_primary"`)
  - Foreign keys with the `ON DELETE` actions specified in Phase 2

### Step 3.3 — Apply the migration

- [ ] **Action.** `npm run db:migrate`
- [ ] **Verify.**

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c "\dt"
```

Expected: `barangays`, `creative_domains`, `creative_profile_subdomains`,
`creative_profiles`, `creative_subdomains`, `municipalities`, `sessions`, `users`.

Postgres `NOTICE` lines about the `drizzle` schema already existing are normal.

### Step 3.4 — Add the barangay seed loader

- [ ] **Action.** Create `backend/src/db/seed/barangays.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { Database } from '../index.js';
import { barangays, municipalities } from '../schema/index.js';
import { logger } from '../../lib/logger.js';

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'data', 'barangays.csv');

/**
 * Expects a CSV with a header row: municipality_slug,name,psgc_code
 * Sourced from the PSA PSGC publication. Absent by design — the list is not
 * invented. When the file is missing this is a no-op and the barangay field
 * degrades to disabled in the UI.
 */
export async function seedBarangays(tx: Database): Promise<number> {
  if (!existsSync(DATA_PATH)) {
    logger.warn(
      { path: DATA_PATH },
      'barangays.csv not found — skipping. Obtain the list from the PSA PSGC publication.',
    );
    return 0;
  }

  const lines = readFileSync(DATA_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [header, ...rows] = lines;
  if (!header?.startsWith('municipality_slug')) {
    throw new Error('barangays.csv must start with header: municipality_slug,name,psgc_code');
  }

  const townIds = new Map<string, string>();
  for (const town of await tx.select().from(municipalities)) {
    townIds.set(town.slug, town.id);
  }

  let count = 0;

  for (const row of rows) {
    const [municipalitySlug, name, psgcCode] = row.split(',').map((cell) => cell.trim());
    if (!municipalitySlug || !name) continue;

    const municipalityId = townIds.get(municipalitySlug);
    if (!municipalityId) {
      throw new Error(`Unknown municipality slug "${municipalitySlug}" in barangays.csv`);
    }

    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    await tx
      .insert(barangays)
      .values({ municipalityId, slug, name, psgcCode: psgcCode || null })
      .onConflictDoUpdate({
        target: [barangays.municipalityId, barangays.slug],
        set: { name, psgcCode: psgcCode || null },
      });

    count += 1;
  }

  return count;
}

export { eq };
```

- [ ] **Action.** In `backend/src/db/seed/index.ts`, import `seedBarangays` and
  call it inside the existing transaction, after municipalities are seeded:

```ts
const barangayCount = await seedBarangays(tx as unknown as Database);
logger.info({ count: barangayCount }, 'Barangays seeded');
```

- [ ] **Verify.** `npm run db:seed` — expect the existing counts plus either
  `Barangays seeded count: 0` with the warning, or a real count if the CSV
  exists. Exit code 0 either way.

---

# Phase 4 — Password and session infrastructure

### Step 4.1 — Password hashing

- [ ] **Action.** Create `backend/src/lib/password.ts`:

```ts
import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id at OWASP's recommended second-choice parameters (19 MiB, t=2, p=1).
 * Verification reads parameters from the stored hash, so raising these later
 * does not invalidate existing passwords.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    // A malformed hash must read as a failed login, never as a crash.
    return false;
  }
}
```

- [ ] **Verify.**

```bash
cd backend && npx tsx -e "import {hashPassword,verifyPassword} from './src/lib/password.ts';const h=await hashPassword('correct horse');console.log(h.startsWith('\$argon2id\$'));console.log(await verifyPassword(h,'correct horse'));console.log(await verifyPassword(h,'wrong'))"
```

Expected three lines: `true`, `true`, `false`.

### Step 4.2 — Username normalisation and reserved words

- [ ] **Action.** Create `backend/src/lib/username.ts`:

```ts
/**
 * Route names and role words that must never become a username — the username
 * is the public profile segment, so `/creatives/admin` would otherwise be
 * claimable.
 */
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'superuser', 'staff', 'moderator', 'support',
  'help', 'api', 'auth', 'login', 'logout', 'register', 'signup', 'signin',
  'settings', 'account', 'profile', 'profiles', 'creatives', 'creative',
  'directory', 'domains', 'municipalities', 'barangays', 'search', 'about',
  'contact', 'privacy', 'terms', 'styleguide', 'dti', 'bilikha', 'official',
  'null', 'undefined', 'me', 'you', 'system',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isReservedUsername(raw: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(raw));
}
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.3 — Phone and email normalisation

- [ ] **Action.** Create `backend/src/lib/contact.ts`:

```ts
import { AppError } from './http-error.js';

/**
 * Accepts 09171234567, +639171234567, 639171234567, and any of those with
 * spaces or dashes. Stores one canonical form, without which dedup and lookup
 * both silently fail.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');

  if (/^\+639\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;

  throw AppError.badRequest(
    'Enter a valid Philippine mobile number, for example 09171234567.',
  );
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
```

- [ ] **Verify.**

```bash
cd backend && npx tsx -e "import {normalizePhone} from './src/lib/contact.ts';for(const n of ['09171234567','+63 917 123 4567','639171234567'])console.log(normalizePhone(n))"
```

Expected: `+639171234567` three times.

### Step 4.4 — Session store

- [ ] **Action.** Create `backend/src/lib/session-store.ts`:

```ts
import { Store, type SessionData } from 'express-session';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions } from '../db/schema/index.js';
import { logger } from './logger.js';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * express-session store backed by Drizzle. Written rather than pulled in so the
 * project keeps one Postgres driver and one connection pool — connect-pg-simple
 * would add the `pg` driver alongside postgres.js.
 */
export class DrizzleSessionStore extends Store {
  constructor() {
    super();
    const timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    // Do not hold the event loop open on shutdown.
    timer.unref();
  }

  private async prune(): Promise<void> {
    try {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    } catch (error) {
      logger.warn({ err: error }, 'Session prune failed');
    }
  }

  private expiryFor(session: SessionData): Date {
    const expires = session.cookie?.expires;
    if (expires) return new Date(expires);
    return new Date(Date.now() + (session.cookie?.maxAge ?? DEFAULT_TTL_MS));
  }

  override get(
    sid: string,
    callback: (err?: unknown, session?: SessionData | null) => void,
  ): void {
    void (async () => {
      try {
        const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid)).limit(1);

        if (!row) return callback(null, null);

        if (row.expiresAt.getTime() < Date.now()) {
          await db.delete(sessions).where(eq(sessions.sid, sid));
          return callback(null, null);
        }

        callback(null, JSON.parse(row.data) as SessionData);
      } catch (error) {
        callback(error);
      }
    })();
  }

  override set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        const values = {
          sid,
          data: JSON.stringify(session),
          expiresAt: this.expiryFor(session),
        };

        await db
          .insert(sessions)
          .values(values)
          .onConflictDoUpdate({
            target: sessions.sid,
            set: { data: values.data, expiresAt: values.expiresAt },
          });

        callback?.();
      } catch (error) {
        callback?.(error);
      }
    })();
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        await db.delete(sessions).where(eq(sessions.sid, sid));
        callback?.();
      } catch (error) {
        callback?.(error);
      }
    })();
  }

  override touch(sid: string, session: SessionData, callback?: () => void): void {
    void (async () => {
      try {
        await db
          .update(sessions)
          .set({ expiresAt: this.expiryFor(session) })
          .where(eq(sessions.sid, sid));
      } catch (error) {
        logger.warn({ err: error }, 'Session touch failed');
      }
      callback?.();
    })();
  }
}
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 4.5 — Session typing and wiring

- [ ] **Action.** Create `backend/src/types/session.d.ts`:

```ts
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
```

- [ ] **Action.** Add to the zod schema in `backend/src/config/env.ts`, inside
  `envSchema`:

```ts
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
```

- [ ] **Action.** Append to **both** `backend/.env.example` and `backend/.env`:

```bash
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=replace-me-with-64-hex-characters-minimum-32-chars
SESSION_TTL_DAYS=30
```

For `.env`, generate a real value with the command in the comment.

- [ ] **Action.** In `backend/src/app.ts`, add the imports and register the
  session middleware **after** `express.urlencoded` and **before**
  `pinoHttp`:

```ts
import session from 'express-session';
import { DrizzleSessionStore } from './lib/session-store.js';
import { isProduction } from './config/env.js';

  app.use(
    session({
      name: 'bilikha.sid',
      secret: env.SESSION_SECRET,
      store: new DrizzleSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        // Lax keeps the session on normal top-level navigation while blocking
        // it on cross-site POSTs — the CSRF surface that matters here.
        sameSite: 'lax',
        secure: isProduction,
        maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
        path: '/',
      },
    }),
  );
```

- [ ] **Verify.** `npm run typecheck` exits 0, then `npm run dev:api` starts
  without error and logs `Bilikha API listening`. Stop it afterwards.

---

# Phase 5 — Auth module

Per [ADR 0014](../decisions/0014-modular-monolith-architecture.md): routes do
HTTP, services do logic.

### Step 5.1 — Validation schemas

- [ ] **Action.** Create `backend/src/modules/auth/auth.schema.ts`:

```ts
import { z } from 'zod';

/** Filipino names carry ñ, accents, hyphens, apostrophes and spaces — dela Cruz,
 *  Peña, D'Souza. An ASCII-only rule rejects real people. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'\-. ]*$/u;

const nameField = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(80, 'Must be 80 characters or fewer')
  .regex(NAME_PATTERN, 'Use letters, spaces, hyphens and apostrophes only');

const optionalNameField = z
  .string()
  .trim()
  .max(80)
  .regex(NAME_PATTERN, 'Use letters, spaces, hyphens and apostrophes only')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const usernameField = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(30, 'At most 30 characters')
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._]*[a-zA-Z0-9])?$/,
    'Letters, numbers, dots and underscores only; must start and end with a letter or number',
  )
  .refine((value) => !value.includes('..') && !value.includes('__'), {
    message: 'No repeated dots or underscores',
  });

/** Length beats composition rules — NIST SP 800-63B. No forced symbol classes. */
export const passwordField = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128, 'At most 128 characters');

export const registerSchema = z
  .object({
    firstName: nameField,
    middleName: optionalNameField,
    lastName: nameField,
    suffix: z.string().trim().max(12).optional().or(z.literal('').transform(() => undefined)),

    username: usernameField,
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    phone: z.string().trim().min(1, 'Required'),

    birthDate: z.coerce.date({ message: 'Enter a valid date' }),

    municipalitySlug: z.string().trim().min(1, 'Select a municipality'),
    barangaySlug: z.string().trim().optional().or(z.literal('').transform(() => undefined)),

    password: passwordField,
    confirmPassword: z.string(),

    subdomainSlugs: z
      .array(z.string().trim().min(1))
      .min(1, 'Choose at least one')
      .max(5, 'Choose at most 5'),
    primarySubdomainSlug: z.string().trim().min(1, 'Choose a primary'),

    privacyConsent: z.literal(true, { message: 'You must accept the privacy notice' }),
    termsAccepted: z.literal(true, { message: 'You must accept the terms' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((data) => !data.password.toLowerCase().includes(data.username.toLowerCase()), {
    path: ['password'],
    message: 'Password must not contain your username',
  })
  .refine((data) => data.subdomainSlugs.includes(data.primarySubdomainSlug), {
    path: ['primarySubdomainSlug'],
    message: 'The primary must be one of your selected sub-domains',
  })
  .refine(
    (data) => {
      const age = (Date.now() - data.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 18 && age < 120;
    },
    { path: ['birthDate'], message: 'You must be at least 18 years old to register' },
  );

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.2 — Auth service

- [ ] **Action.** Create `backend/src/modules/auth/auth.service.ts`:

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  barangays,
  creativeProfiles,
  creativeProfileSubdomains,
  creativeSubdomains,
  municipalities,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { isReservedUsername, normalizeUsername } from '../../lib/username.js';
import { normalizeEmail, normalizePhone } from '../../lib/contact.js';
import type { RegisterInput } from './auth.schema.js';

/** Bump when the privacy notice or terms change; existing users then need
 *  re-consent. */
export const CONSENT_VERSION = '2026-09-15';

export interface PublicUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  profileSlug: string | null;
  profileStatus: string | null;
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const usernameNormalized = normalizeUsername(input.username);

  if (isReservedUsername(usernameNormalized)) {
    throw AppError.conflict('That username is not available.', {
      field: 'username',
    });
  }

  const emailNormalized = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  const [municipality] = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.slug, input.municipalitySlug))
    .limit(1);

  if (!municipality) {
    throw AppError.badRequest('Unknown municipality.', { field: 'municipalitySlug' });
  }

  let barangayId: string | null = null;
  if (input.barangaySlug) {
    const [barangay] = await db
      .select()
      .from(barangays)
      .where(
        and(eq(barangays.slug, input.barangaySlug), eq(barangays.municipalityId, municipality.id)),
      )
      .limit(1);

    if (!barangay) {
      throw AppError.badRequest('Unknown barangay for that municipality.', {
        field: 'barangaySlug',
      });
    }
    barangayId = barangay.id;
  }

  // Resolve every sub-domain slug up front so a bad slug fails before any write.
  const subdomainRows = await db
    .select()
    .from(creativeSubdomains)
    .where(inArray(creativeSubdomains.slug, input.subdomainSlugs));

  if (subdomainRows.length !== input.subdomainSlugs.length) {
    throw AppError.badRequest('One or more sub-domains are unknown.', {
      field: 'subdomainSlugs',
    });
  }

  const primary = subdomainRows.find((row) => row.slug === input.primarySubdomainSlug);
  if (!primary) {
    throw AppError.badRequest('Primary sub-domain is not among the selected.', {
      field: 'primarySubdomainSlug',
    });
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username.trim(),
          usernameNormalized,
          email: input.email.trim(),
          emailNormalized,
          phone,
          passwordHash,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName,
          suffix: input.suffix ?? null,
          birthDate: input.birthDate.toISOString().slice(0, 10),
          municipalityId: municipality.id,
          barangayId,
          privacyConsentAt: now,
          termsAcceptedAt: now,
          consentVersion: CONSENT_VERSION,
        })
        .returning();

      if (!user) throw new Error('User insert returned no row');

      const [profile] = await tx
        .insert(creativeProfiles)
        .values({ userId: user.id, slug: usernameNormalized })
        .returning();

      if (!profile) throw new Error('Profile insert returned no row');

      await tx.insert(creativeProfileSubdomains).values(
        subdomainRows.map((row) => ({
          profileId: profile.id,
          subdomainId: row.id,
          isPrimary: row.id === primary.id,
        })),
      );

      return toPublicUser(user, profile.slug, profile.status);
    });
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

export async function authenticate(username: string, password: string): Promise<PublicUser> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.usernameNormalized, normalizeUsername(username)))
    .limit(1);

  // Always run a verification, even with no user, so response time does not
  // reveal whether a username exists.
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ok = await verifyPassword(hash, password);

  if (!user || !ok) {
    throw AppError.unauthorized('Incorrect username or password.');
  }

  if (user.status === 'suspended') {
    throw AppError.forbidden('This account has been suspended.');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const [profile] = await db
    .select()
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, user.id))
    .limit(1);

  return toPublicUser(user, profile?.slug ?? null, profile?.status ?? null);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(creativeProfiles)
    .where(eq(creativeProfiles.userId, user.id))
    .limit(1);

  return toPublicUser(user, profile?.slug ?? null, profile?.status ?? null);
}

function toPublicUser(
  user: typeof users.$inferSelect,
  profileSlug: string | null,
  profileStatus: string | null,
): PublicUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profileSlug,
    profileStatus,
  };
}

/** Postgres 23505 = unique_violation. Map it to a field-specific message rather
 *  than leaking a constraint name to the client. */
function translateUniqueViolation(error: unknown): unknown {
  const code = (error as { code?: string }).code;
  if (code !== '23505') return error;

  const detail = String((error as { detail?: string }).detail ?? '');

  if (detail.includes('username_normalized')) {
    return AppError.conflict('That username is already taken.', { field: 'username' });
  }
  if (detail.includes('email_normalized')) {
    return AppError.conflict('An account already uses that email address.', { field: 'email' });
  }
  if (detail.includes('phone')) {
    return AppError.conflict('An account already uses that phone number.', { field: 'phone' });
  }
  return AppError.conflict('That account already exists.');
}
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.3 — Require-auth middleware

- [ ] **Action.** Create `backend/src/middleware/require-auth.ts`:

```ts
import type { RequestHandler } from 'express';
import { AppError } from '../lib/http-error.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) {
    next(AppError.unauthorized('You must be signed in.'));
    return;
  }
  next();
};
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.4 — Auth routes

- [ ] **Action.** Create `backend/src/modules/auth/auth.routes.ts`:

```ts
import { Router } from 'express';
import { AppError } from '../../lib/http-error.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { authenticate, getUserById, registerUser } from './auth.service.js';

export const authRouter: Router = Router();

authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);

  // Log the new user straight in. Regenerate first so the pre-login session id
  // cannot be reused — session fixation.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;
  res.status(201).json({ data: user });
});

authRouter.post('/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authenticate(input.username, input.password);

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;
  res.json({ data: user });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('bilikha.sid', { path: '/' });
    res.status(204).send();
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.session.userId!);
  if (!user) {
    // Session points at a deleted user. Clear it rather than 500.
    req.session.destroy(() => undefined);
    throw AppError.unauthorized('Session is no longer valid.');
  }
  res.json({ data: user });
});
```

- [ ] **Verify.** `npm run typecheck` exits 0.

### Step 5.5 — Mount the router

- [ ] **Action.** In `backend/src/routes/index.ts`, import `authRouter` and add:

```ts
apiRouter.use('/auth', authRouter);
```

- [ ] **Verify.** Start the API, then:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"username":"nobody","password":"whatever"}'
```

Expected: `{"error":{"code":"UNAUTHORIZED","message":"Incorrect username or password."}}`

---

# Phase 6 — Supporting endpoints

The registration form needs barangays and the sub-domain list.

### Step 6.1 — Barangays by municipality

- [ ] **Action.** Add to `backend/src/modules/taxonomy/taxonomy.routes.ts`:

```ts
taxonomyRouter.get('/municipalities/:slug/barangays', async (req, res) => {
  const [municipality] = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.slug, req.params.slug))
    .limit(1);

  if (!municipality) {
    throw AppError.notFound(`No municipality with slug "${req.params.slug}"`);
  }

  const rows = await db
    .select({ id: barangays.id, slug: barangays.slug, name: barangays.name })
    .from(barangays)
    .where(eq(barangays.municipalityId, municipality.id))
    .orderBy(asc(barangays.name));

  res.json({ data: rows });
});
```

Add `barangays` to the schema import at the top of the file.

- [ ] **Verify.**

```bash
curl -s http://localhost:4000/api/v1/taxonomy/municipalities/naval/barangays
```

Expected: `{"data":[]}` while the CSV is absent — an empty array, not an error.

### Step 6.2 — Update the API reference

- [ ] **Action.** Add all four `/auth` endpoints and the barangays endpoint to
  [`docs/reference/api.md`](../reference/api.md), matching the existing format.
- [ ] **Verify.** Every implemented endpoint appears in that file.

---

# Phase 7 — Security hardening

### Step 7.1 — Rate limiting

- [ ] **Action.** Create `backend/src/middleware/rate-limit.ts`:

```ts
import rateLimit from 'express-rate-limit';

/** Without phone verification there is no cost ceiling on account creation
 *  (ADR 0013), so these limits are the only brake. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many registration attempts. Try again in an hour.',
    },
  },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Try again in 15 minutes.',
    },
  },
});
```

- [ ] **Action.** Apply them in `auth.routes.ts`:

```ts
authRouter.post('/register', registerLimiter, async (req, res) => {
authRouter.post('/login', loginLimiter, async (req, res) => {
```

- [ ] **Verify.** Send 11 bad logins in a row; the 11th returns HTTP 429.

```bash
for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code} " -X POST \
  http://localhost:4000/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"username":"nobody","password":"wrong"}'; done; echo
```

Expected: ten `401` then `429`.

### Step 7.2 — Confirm CORS carries credentials

- [ ] **Action.** Confirm `backend/src/app.ts` already sets
  `cors({ origin: env.CORS_ORIGINS, credentials: true })`. It does — change
  nothing.
- [ ] **Verify.** Read the file and confirm `credentials: true` is present.

### Step 7.3 — Confirm the frontend sends credentials

- [ ] **Action.** Confirm `frontend/src/lib/api-client.ts` sets
  `withCredentials: true`. It does — change nothing.
- [ ] **Verify.** Read the file and confirm it is present.

---

# Phase 8 — Frontend auth plumbing

### Step 8.1 — Types

- [ ] **Action.** Create `frontend/src/features/auth/types.ts`:

```ts
export interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  profileSlug: string | null;
  profileStatus: string | null;
}

export interface RegisterPayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  municipalitySlug: string;
  barangaySlug?: string;
  password: string;
  confirmPassword: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  privacyConsent: true;
  termsAccepted: true;
}
```

- [ ] **Verify.** `npm --prefix frontend run typecheck` exits 0.

### Step 8.2 — Auth API hooks

- [ ] **Action.** Create `frontend/src/features/auth/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import type { AuthUser, RegisterPayload } from './types';

interface ApiResponse<T> {
  data: T;
}

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** 401 is the normal signed-out state, not an error worth retrying or showing. */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
        return data.data;
      } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 401) {
          return null;
        }
        throw toApiError(error);
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload): Promise<AuthUser> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AuthUser>>('/auth/register', payload);
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { username: string; password: string }): Promise<AuthUser> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AuthUser>>('/auth/login', input);
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      try {
        await apiClient.post('/auth/logout');
      } catch (error) {
        throw toApiError(error);
      }
    },
    // Clear everything — cached data may be scoped to the signed-out user.
    onSuccess: () => queryClient.clear(),
  });
}
```

- [ ] **Verify.** `npm --prefix frontend run typecheck` exits 0.

### Step 8.3 — Barangay hook

- [ ] **Action.** Add to `frontend/src/features/taxonomy/api.ts`:

```ts
export interface Barangay {
  id: string;
  slug: string;
  name: string;
}

export function useBarangays(municipalitySlug: string | undefined) {
  return useQuery({
    queryKey: [...taxonomyKeys.all, 'barangays', municipalitySlug],
    queryFn: async (): Promise<Barangay[]> => {
      const { data } = await apiClient.get<{ data: Barangay[] }>(
        `/taxonomy/municipalities/${municipalitySlug}/barangays`,
      );
      return data.data;
    },
    enabled: Boolean(municipalitySlug),
    staleTime: Infinity,
  });
}
```

- [ ] **Verify.** `npm --prefix frontend run typecheck` exits 0.

### Step 8.4 — Field-error helper

- [ ] **Action.** Create `frontend/src/features/auth/field-errors.ts`:

```ts
import { AxiosError } from 'axios';

/**
 * Turns the API's validation envelope into a map keyed by field name, so each
 * input can render its own message instead of one banner listing everything.
 */
export function toFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof AxiosError) || !error.response) return {};

  const body = error.response.data as {
    error?: { details?: unknown; message?: string };
  };
  const details = body.error?.details;

  if (Array.isArray(details)) {
    const map: Record<string, string> = {};
    for (const item of details as { path?: string; message?: string }[]) {
      if (item.path && item.message && !map[item.path]) map[item.path] = item.message;
    }
    return map;
  }

  if (details && typeof details === 'object' && 'field' in details) {
    const field = String((details as { field: unknown }).field);
    return { [field]: body.error?.message ?? 'Invalid value' };
  }

  return {};
}
```

- [ ] **Verify.** `npm --prefix frontend run typecheck` exits 0.

---

# Phase 9 — Registration page

Single page with sections, not a wizard. Simpler to implement correctly, and a
localStorage draft covers the dropped-connection case that a wizard's step state
would otherwise handle.

### Step 9.1 — Sub-domain picker

- [ ] **Action.** Create
  `frontend/src/features/taxonomy/components/SubdomainPicker.tsx`.

Requirements — implement exactly these:

- Props: `selected: string[]`, `primary: string | null`,
  `onChange(selected, primary)`, `error?: string`
- Render each of the 9 domains as a collapsible section, using
  `useCreativeDomains()`
- Each sub-domain is a checkbox. Selecting more than 5 is prevented: once 5 are
  selected, unselected checkboxes render `disabled`
- Show a live count, `N of 5 selected`
- When 1 or more are selected, show a radio group to choose the primary among
  **only the selected**
- Selecting the first sub-domain sets it as primary automatically
- Deselecting the current primary moves primary to the first remaining, or
  `null` if none remain
- Use `Badge` for counts and existing tokens for all styling
- Collapsed sections must be keyboard reachable; use `<button aria-expanded>`

- [ ] **Verify.** `npm --prefix frontend run typecheck` and
  `npx oxlint src` both exit 0.

### Step 9.2 — Registration form

- [ ] **Action.** Create `frontend/src/pages/RegisterPage.tsx`.

Sections and fields, in this order:

| Section | Fields |
|---|---|
| Your name | First name\*, Middle name, Last name\*, Suffix |
| Account | Username\*, Password\*, Confirm password\* |
| Contact | Email\*, Phone number\* |
| Location | Municipality\* (select), Barangay (select) |
| About you | Date of birth\*, What you do\* (SubdomainPicker) |
| Consent | Privacy notice checkbox\*, Terms checkbox\* |

Rules:

- Use `Input` from `@/components/ui` for every text field
- Municipality options come from `useMunicipalities()`
- Barangay options come from `useBarangays(selectedMunicipalitySlug)`. When the
  list is empty, render the select **disabled** with helper text
  *"Barangay list is not yet available."* Do not block submission
- Username field shows the rules as `hint`: *"3–30 characters. Letters, numbers,
  dots and underscores."*
- Password field `hint`: *"At least 10 characters."*
- `autoComplete`: `given-name`, `family-name`, `username`, `new-password`,
  `email`, `tel`, `bday`
- Phone `inputMode="tel"`, email `inputMode="email"`
- Both consent checkboxes are separate and independently required
- On submit: call `useRegister()`, and on error call `toFieldErrors(error)` and
  pass each message to the matching `Input`'s `error` prop
- On success: navigate to `/register/success`
- The submit button uses `loading={mutation.isPending}`
- Disable the submit button while pending; do not disable it otherwise

- [ ] **Verify.** Typecheck and lint both exit 0.

### Step 9.3 — Draft autosave

- [ ] **Action.** In `RegisterPage.tsx`, persist the form state, **excluding
  `password` and `confirmPassword`**, to `localStorage` under
  `bilikha:register-draft` on every change. Restore it on mount. Clear it on
  successful registration.

Wrap every `localStorage` read and write in `try`/`catch` — it throws in private
browsing modes.

- [ ] **Verify.** Fill in half the form, reload the page, confirm the values
  return and **both password fields are empty**.

### Step 9.4 — Success page and routes

- [ ] **Action.** Create `frontend/src/pages/RegisterSuccessPage.tsx`, stating
  that the account is created and the profile is awaiting review before it
  appears in the directory.
- [ ] **Action.** Add to `frontend/src/App.tsx`:

```tsx
<Route path="/register" element={<RegisterPage />} />
<Route path="/register/success" element={<RegisterSuccessPage />} />
<Route path="/login" element={<LoginPage />} />
```

- [ ] **Verify.** All three routes render in the browser.

---

# Phase 10 — Login page and guard

### Step 10.1 — Login page

- [ ] **Action.** Create `frontend/src/pages/LoginPage.tsx`: username and
  password fields, `useLogin()`, error rendered above the form, submit button
  with `loading`. `autoComplete="username"` and `"current-password"`.

Include a line stating that a forgotten password must be reset by an
administrator — there is no self-service reset in this sprint.

- [ ] **Verify.** Typecheck and lint exit 0.

### Step 10.2 — Route guard

- [ ] **Action.** Create `frontend/src/features/auth/RequireAuth.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCurrentUser } from './api';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  // Render nothing while resolving — redirecting first would bounce a signed-in
  // user to /login on every refresh.
  if (isPending) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Verify.** Typecheck exits 0.

### Step 10.3 — Header reflects auth state

- [ ] **Action.** In `HomePage.tsx`'s `SiteHeader`, use `useCurrentUser()`.
  When signed out, show the existing Register button plus a Sign in link. When
  signed in, show the username and a Sign out button calling `useLogout()`.
- [ ] **Verify.** Header changes after login and after logout.

---

# Phase 11 — Admin tooling

### Step 11.1 — Password reset script

- [ ] **Action.** Create `backend/src/scripts/reset-password.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { hashPassword } from '../lib/password.js';
import { normalizeUsername } from '../lib/username.js';

/**
 * Sprint 1 has no self-service password reset (ADR 0013). This is the only
 * recovery path. Verify the person's identity out of band before running it.
 *
 *   npm --prefix backend run admin:reset-password -- <username> <new-password>
 */
const [username, newPassword] = process.argv.slice(2);

if (!username || !newPassword) {
  console.error('Usage: npm run admin:reset-password -- <username> <new-password>');
  process.exit(1);
}

if (newPassword.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const result = await db
  .update(users)
  .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
  .where(eq(users.usernameNormalized, normalizeUsername(username)))
  .returning({ id: users.id, username: users.username });

if (result.length === 0) {
  console.error(`No user with username "${username}".`);
  await closeDatabase();
  process.exit(1);
}

console.log(`Password reset for ${result[0]!.username}.`);
await closeDatabase();
process.exit(0);
```

- [ ] **Action.** Add to `backend/package.json` scripts:

```json
"admin:reset-password": "tsx src/scripts/reset-password.ts"
```

- [ ] **Verify.** Run it against a test account and log in with the new password.

### Step 11.2 — Document publishing a profile

- [ ] **Action.** Add a short section to
  [`docs/reference/commands.md`](../reference/commands.md) under a new "Admin"
  heading, giving the SQL to publish a profile:

```sql
UPDATE creative_profiles SET status = 'published', updated_at = now()
WHERE slug = '<username>';
```

and noting that a proper admin UI is a follow-up.

- [ ] **Verify.** The section exists and the SQL runs successfully.

---

# Phase 12 — End-to-end verification

### Step 12.1 — Register through the API

- [ ] **Action.**

```bash
curl -s -c /tmp/bk-cookies.txt -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" -d '{
    "firstName":"Juan","lastName":"dela Cruz","username":"juantest",
    "email":"juan@example.com","phone":"09171234567","birthDate":"1995-04-12",
    "municipalitySlug":"naval","password":"correct horse battery",
    "confirmPassword":"correct horse battery",
    "subdomainSlugs":["photographers","filmmakers"],
    "primarySubdomainSlug":"photographers",
    "privacyConsent":true,"termsAccepted":true
  }'
```

- [ ] **Verify.** HTTP 201, body contains `"username":"juantest"` and
  `"profileStatus":"pending_review"`.

### Step 12.2 — Session works

- [ ] **Action.** `curl -s -b /tmp/bk-cookies.txt http://localhost:4000/api/v1/auth/me`
- [ ] **Verify.** Returns the same user. Without the cookie, returns 401.

### Step 12.3 — Constraints hold

- [ ] **Verify** each of the following returns the stated result:

| Attempt | Expected |
|---|---|
| Register again with username `JUANTEST` | 409, message about the username being taken |
| Register with the same email | 409, message about the email |
| Register with `"username":"admin"` | 409, username not available |
| Register with 6 sub-domain slugs | 400, `subdomainSlugs` at most 5 |
| Register with a `primarySubdomainSlug` not in the list | 400 |
| Register with `birthDate` 10 years ago | 400, must be 18 |
| Register with `"privacyConsent":false` | 400 |
| Login with correct credentials | 200 |
| Login with wrong password | 401 |

- [ ] **Verify** the primary-sub-domain constraint is enforced by the database:

```bash
docker exec bilikha-postgres psql -U bilikha -d bilikha -c \
  "UPDATE creative_profile_subdomains SET is_primary = true WHERE profile_id = (SELECT id FROM creative_profiles LIMIT 1);"
```

Expected: **fails** with a unique-violation on
`cps_one_primary_per_profile_idx`. If it succeeds, the partial index is missing
— return to Step 3.2.

### Step 12.4 — Browser flow

- [ ] **Verify** end to end in a browser, at 400px width as well as desktop:
  - Register a new account through the form
  - Land on the success page
  - Sign out, sign back in
  - Reload while signed in — session persists
  - A field error from the server renders on the correct input
  - Half-fill the form, reload, values return and passwords do not

---

## Acceptance

- [ ] All 12 phases complete, every step checked
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all exit 0
- [ ] Every row in Step 12.3 behaves as stated
- [ ] Passwords and session cookies are never logged. `pino-http` is configured
      in `app.ts` to drop `cookie`, `authorization` and `set-cookie`; confirm by
      grepping the API log for a test password and for the session cookie value,
      and finding neither
- [ ] `docs/reference/api.md` and `docs/reference/data-model.md` updated
- [ ] This plan's status set to **Complete**

---

## Follow-ups

Not in this plan. Track separately.

| Item | Why deferred |
|---|---|
| Obtain the PSGC barangay list | Data we do not have; must not be invented |
| Privacy notice and terms copy, Filipino and English | Legally required before public launch; needs review |
| Organisation registration | Own plan |
| Phone verification, self-service reset, publish-on-registration | Needs an SMS gateway; restores [ADR 0008](../decisions/0008-publish-immediately-with-tiers.md) |
| Admin UI for review and publishing | SQL is the sprint 1 mechanism |
| Alias table for sub-domain search | Sprint 1 uses browse; see [extend the taxonomy](../guides/extend-the-taxonomy.md) |
| Automated tests | No test runner configured yet |
| CSRF tokens | `sameSite=lax` plus a JSON-only API covers the common case; revisit before launch |
