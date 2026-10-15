# Add an API endpoint

The backend groups routes by feature under `src/modules/`. A module owns its
router, its validation, and its data access; it does not reach into another
module's internals.

---

## 1. Create the module

```
backend/src/modules/<feature>/
├── <feature>.routes.ts      route definitions
├── <feature>.schema.ts      zod request/response schemas (once inputs exist)
└── <feature>.service.ts     data access and logic (once it outgrows the router)
```

Start with just `.routes.ts`. Split out a service when the router stops being
readable — not before.

## 2. Write the router

```ts
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeProfiles } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';

export const profileRouter: Router = Router();

profileRouter.get('/:slug', async (req, res) => {
  const profile = await db.query.creativeProfiles.findFirst({
    where: eq(creativeProfiles.slug, req.params.slug),
  });

  if (!profile) {
    throw AppError.notFound(`No profile with slug "${req.params.slug}"`);
  }

  res.json({ data: profile });
});
```

Three things to copy from this:

- **Relative imports end in `.js`.** The build is ESM with `NodeNext` resolution.
  TypeScript resolves `./foo.js` to `foo.ts` at compile time and the emitted
  import is correct at runtime. Omitting it still runs under the dev server and
  the tests, so it looks fine until `npm run typecheck` rejects it.
- **Throw, don't hand-write error responses.** `AppError` renders through the
  central handler so every error in the API has one shape.
- **`async` handlers need no wrapper.** Express 5 forwards rejected promises to
  the error handler on its own.

## 3. Mount it

In `backend/src/routes/index.ts`:

```ts
import { profileRouter } from '../modules/profiles/profile.routes.js';

apiRouter.use('/profiles', profileRouter);
```

Everything hangs off `/api/v1`, so this serves at `/api/v1/profiles/:slug`.

## 4. Validate input

Anything from the client — body, query, or params — is parsed with zod before
use. A `ZodError` reaching the error handler is rendered as a 400 with per-field
messages automatically, so you do not need to catch it.

```ts
import { z } from 'zod';

const listQuery = z.object({
  municipality: z.string().min(1).optional(),
  subdomain: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

profileRouter.get('/', async (req, res) => {
  const query = listQuery.parse(req.query);
  // query is fully typed from here
});
```

Always cap `limit`. An uncapped page size is a denial-of-service vector and an
accidental full-table scan.

## 5. Response shape

Non-negotiable, because the frontend client unwraps it generically:

```jsonc
// success
{ "data": { } }
{ "data": [ ], "meta": { "page": 1, "limit": 20, "total": 134 } }

// error — produced by the error handler, never by hand
{ "error": { "code": "NOT_FOUND", "message": "…", "details": [] } }
```

What goes inside `data` is declared once, in `backend/src/contracts/<feature>.ts`,
and the service annotates its return type with it
([ADR 0037](../decisions/0037-one-definition-of-an-api-shape.md)). The
annotation is the mechanism — a function that happens to return the right shape
proves nothing. A contract file holds types only; its rules are in
[`backend/src/contracts/README.md`](../../backend/src/contracts/README.md).
A list route annotates its `meta` as `ListMeta` from `contracts/pagination.ts`.

## 6. Mirror it on the frontend

Add a query hook under `frontend/src/features/<feature>/`. Follow
`features/taxonomy/` — a `types.ts` that re-exports the shapes from
`@contracts/<feature>` rather than redeclaring them, an `api.ts` with a key
factory, fetchers that wrap errors in `toApiError`, and a `useQuery` hook.

## 7. Update the reference

Add the endpoint to [`docs/reference/api.md`](../reference/api.md) in the same
PR. It is the only place the API surface is written down.

---

## Checklist

- [ ] Relative imports end in `.js`
- [ ] Input parsed with zod; `limit` capped on any list endpoint
- [ ] Errors thrown as `AppError`, never hand-rolled JSON
- [ ] Response wrapped in `data`
- [ ] Response shape declared in `backend/src/contracts/` and annotated on the service
- [ ] Mounted under `/api/v1`
- [ ] Frontend hook added, its types re-exported from `@contracts/`
- [ ] `docs/reference/api.md` updated
