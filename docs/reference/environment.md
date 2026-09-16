# Environment variables

Both services read `.env` from their own directory. `npm run setup:env` creates
them from the committed `.env.example` files.

`.env` is gitignored; `.env.example` is committed. **Add every new variable to
`.env.example`** with a safe placeholder in the same PR, or the next person's
setup breaks.

---

## Backend — `backend/.env`

Validated at boot by `src/config/env.ts`. A missing or malformed value exits the
process immediately with a message naming the field — it never surfaces as a
confusing runtime error inside a request handler.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production`. Controls log formatting and error verbosity |
| `PORT` | no | `4000` | Positive integer |
| `DATABASE_URL` | **yes** | — | Full `postgresql://` connection string. No default on purpose — a silent fallback to localhost in production is worse than a crash |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated. Parsed into an array. **Add the deployed frontend origin before going live** |
| `LOG_LEVEL` | no | `info` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `SESSION_SECRET` | **yes** | — | Min 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SESSION_TTL_DAYS` | no | `30` | Session cookie and store TTL in days |
| `SUPABASE_URL` | **yes** | — | Project URL, e.g. `https://abc.supabase.co`. Used only by the backend storage client |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | Service role secret from Settings → API. **Never** put this in `frontend/` or a `VITE_` variable |
| `SUPABASE_STORAGE_BUCKET` | no | `media` | Public bucket for avatars and portfolio images |

Local default:

```bash
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://bilikha:bilikha@localhost:5432/bilikha
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=debug
SESSION_SECRET=replace-me-with-64-hex-characters-minimum-32-chars
SESSION_TTL_DAYS=30
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me-with-service-role-key
SUPABASE_STORAGE_BUCKET=media
```

### Production notes

- `DATABASE_URL` on a managed host usually needs `?sslmode=require`.
- `CORS_ORIGINS` must list every origin that will call the API — the web app,
  and later any mobile wrapper's origin. A missing entry fails as a CORS error
  in the browser, not as a server error, which is easy to misdiagnose.
- `LOG_LEVEL=info` in production. `debug` will log request bodies at volume.
- Connection pool size is set in code (`src/db/index.ts`), not by environment:
  10 in production, 5 otherwise. Managed Postgres tiers cap total connections
  well below what a naive default opens.
- `SUPABASE_SERVICE_ROLE_KEY` is a full read-write bypass of every storage
  policy. It must exist only in the backend environment — never in the frontend
  bundle, never in a response body.

---

## Frontend — `frontend/.env`

Vite exposes only variables prefixed `VITE_`, and **inlines them into the bundle
at build time**. Anything here is public. Never put a secret in this file.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | no | `/api/v1` | Relative by default so the Vite dev proxy and same-origin production both work |

Local default:

```bash
VITE_API_BASE_URL=/api/v1
```

### When to change it

Leave it relative if the frontend and API are served from the same origin —
this keeps cookies first-party, which matters for session auth.

Set an absolute URL only if they are deployed to different origins:

```bash
VITE_API_BASE_URL=https://api.bilikha.ph/api/v1
```

Doing that also requires the frontend origin in the backend's `CORS_ORIGINS`,
and makes session cookies cross-site — which Safari and mobile browsers
increasingly restrict. Prefer same-origin.

---

## Adding a variable

1. Add it to the service's `.env.example` with a safe placeholder
2. Backend only: add it to the zod schema in `src/config/env.ts` with a sensible
   default, or make it required if there is no safe default
3. Add a row to the table above
4. Tell the team — existing `.env` files are never overwritten, so everyone
   re-runs `npm run setup:env` or adds it by hand
