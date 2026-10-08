# 0053. Errors are reported to Sentry, without personal data

- **Status:** Proposed
- **Date:** 2026-10-08
- **Related:** [0040](./0040-a-deploy-must-not-break-an-open-tab.md) ·
  [0042](./0042-main-is-staging-production-is-a-branch.md) ·
  [constraint 3](../explanation/constraints.md) (metered data) ·
  [constraint 7](../explanation/constraints.md) (a public registry of named individuals) ·
  [issue #20](https://github.com/ELITES-ORG/bilikha/issues/20)

## Context

Nothing reported the errors people hit. A white screen on a phone in Naval, or
a 500 from the API, was invisible unless someone told us — and in a province
where everyone knows everyone, most people will not; they will stop using it.

Three pressures shaped what could be added:

- **Metered data.** An error-tracking browser SDK is 20–30 kB gzip. Loaded on
  first paint, every visitor pays for it on every new build, to report errors
  almost none of them will hit.
- **Personal data.** Bilikha holds names, phone numbers, emails and private
  messages, under RA 10173. A tracker sees whatever its SDK collects, and SDKs
  collect generously by default: Sentry 11 turns on user info, cookies,
  headers, request bodies and query strings unless told otherwise, and records
  breadcrumbs — every click, request URL and console line — before an error.
- **The free tier.** Render's free instance has little memory to spare, and the
  tracker's own free plan has a monthly event quota that staging noise could
  spend.

## Decision

**Sentry, on its free plan, with the SDK reduced to what sending a stack trace
needs.**

### Frontend: the SDK loads on the first error, not on first paint

`lib/error-reporting.ts` is in the first-page bundle and only listens: an
`error` listener, an `unhandledrejection` listener, and a call from
`AppErrorBoundary`. The first time there is something to report it imports
`lib/error-reporting-client.ts` — a separate chunk holding `@sentry/browser` —
and sends. Measured: the first page load grows by 0.55 kB gzip; the chunk is
21.6 kB gzip and is fetched only by someone who has just hit an error.

The client is a bare `BrowserClient` with three integrations (event filters,
dedupe, linked errors), not `Sentry.init`. That leaves out breadcrumbs,
sessions, tracing and replay. At most five reports per page load.

Not reported: API failures (the API reports its own, with the server stack, and
a dropped connection is not a bug), the `null` left by cross-origin script
errors, errors from scripts on other origins, and failed chunks outside the
error boundary (a tab open across a deploy — ADR 0040). A chunk that still fails
after the boundary's one reload *is* reported: that is a broken deploy.

### Browser reports go through Bilikha's own domain

Brave blocks requests to `sentry.io` by default, and so do uBlock Origin and
most ad-blockers. Seen on staging: the report was built and sent, then refused
by the browser (`ERR_BLOCKED_BY_CLIENT`). So on a deployment the browser posts
to `/e/<project id>` on its own origin, and a rewrite in `frontend/vercel.json`
forwards it to Sentry's ingest for the `elites-jh` organisation. To a blocker
it is a first-party request.

No code runs for it: the SDK's `tunnel` option puts the DSN inside the report,
and Sentry authenticates from that (checked: accepted with it, `401` without).
The rewrite takes numeric project ids only and has one fixed destination, so it
cannot be used to reach anything but Sentry's ingest for this organisation —
which the public DSN already allows anyone to post to.

Locally, and for a DSN from another Sentry organisation, the browser posts
straight to Sentry instead: there is no rewrite locally, and the rewrite would
forward a foreign DSN to the wrong organisation. A test keeps the organisation
in `vercel.json` and in the code the same.

### Backend: `@sentry/core` alone, reporting from the error path

`@sentry/node` is ~50 MB installed — OpenTelemetry, a bundler CLI and a native
parser — and works by instrumenting modules at load. None of that is needed:
the error handler already sees every failed request. `lib/error-reporting.ts`
builds a `ServerRuntimeClient` (the construction Sentry uses for its own edge
runtimes) with Node's built-in `fetch` as transport.

Reported: every response with a 5xx status, once it has been sent — with the
thrown error and its stack when one reached the error handler, as a message
when a handler answered 5xx itself — and a crash of the process
(`uncaughtException`, `unhandledRejection`), flushed for up to two seconds
before exit.

### Staging and production are separate environments

Every report carries an environment of `production`, `staging` or `local`,
decided by something that cannot be misconfigured: the hostname in the
browser (the same rule as the staging banner), and Render's own
`RENDER_GIT_BRANCH` on the API (`production` → production, any other branch →
staging, no branch → local). Previews file as staging. Alerts and the issue
list are filtered to `production`.

The release is the first 12 characters of the commit — Vercel's build id in the
browser, `RENDER_GIT_COMMIT` on the API — so both halves of one deploy line up.

### What is never sent

| Never | How |
|---|---|
| Request bodies, form contents, message text | Body collection off; `request` dropped from every event |
| Cookies, the session cookie included | Cookie collection off; `request` dropped |
| Headers | Off; the browser sends back only `User-Agent`, to tell Facebook's in-app browser from Chrome |
| User, email, phone, IP | User collection off; `user` replaced. Each Sentry project is set to *Prevent storing of IP addresses* when it is created ([deployments](../reference/deployments.md#sentry--error-reports)) |
| The person's city | Sentry works out a city from the connection's IP even with `infer_ip: never` (which the browser SDK sends) and IP storage off — a report from Taguig was filed as Taguig. It keeps a location a report already carries, so `user` is replaced by `{ geo: { region: 'Not collected' } }` on every report, and Sentry shows *Not collected*. Checked against Sentry: setting `user.ip_address` to null did not stop it |
| The URL, query string or referrer | The route **pattern** is sent instead: `/api/v1/creatives/:slug`, `/creatives/:param` |
| Breadcrumbs, local variables, source lines | Not installed; stripped anyway |
| An email or phone number quoted in an error message | Blanked to `[email]` / `[phone]` before sending. The message itself is kept — it is what identifies the bug — but libraries quote input: Postgres echoes a malformed value, V8's `JSON.parse` error quotes a short input whole |

The message rule recognises shapes, not meaning: an email address and a
Philippine mobile number in any common spelling. A name quoted in a message
would still be sent. Nothing here builds a message from a person's data, and
ids are validated before they reach a query, so that is a residual risk, not
an expected one.

Two layers, deliberately. Every `dataCollection` switch is off, **and** each
event passes through `scrubEvent`, which keeps only an allowlist of fields. A
future SDK release that starts collecting something new still cannot send it.
Tests send cookies, a phone number, an email and message text through the
real SDK and assert none of them leave.

Usernames are not sent. Nothing so far has needed them.

### Optional, like storage

`SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (frontend) are optional. Without them
nothing is loaded, nothing is sent, and the app behaves exactly as before. A
DSN is designed to be public — it can submit events, not read them — so the
frontend's being in the bundle is expected.

## Alternatives considered

- **`@sentry/node` and `Sentry.init` in the browser, as documented.** The
  shortest path, and the one the docs describe. It costs ~50 MB and a native
  dependency on the API, 20–30 kB on every first page load, and breadcrumbs
  that record exactly the data constraint 7 says not to send.
- **Sentry's hosted loader script** (fetches the SDK on first error). The same
  laziness, but configured in Sentry's dashboard rather than in the repository,
  and a third-party script on every page.
- **Relay browser errors through our API.** Keeps the DSN out of the bundle,
  but adds a public endpoint that must be rate-limited, and on Render's free
  tier the API is often asleep exactly when a report is sent. The `/e` rewrite
  gets past blockers the same way, on Vercel's edge, which never sleeps.
- **Post straight to `sentry.io` and accept the loss.** Simplest, and it was
  the first version. It silently drops every report from Brave and from anyone
  with an ad-blocker.
- **A self-hosted tracker (GlitchTip, self-hosted Sentry).** Another service to
  run, on a budget that cannot keep one Render instance awake.
- **Logs only.** Render keeps them briefly, nobody watches them, and the
  frontend has none.

## Consequences

- A white screen and a 500 now surface without anyone reporting them.
- Stack traces from the browser are minified: no source maps are uploaded.
  Uploading them needs an auth token in the Vercel build and a plugin; it is
  worth doing if minified traces turn out to be unreadable in practice.
- The report says what broke and where, not who it happened to or what they
  were doing. Reproducing a bug may need the person's help. That is the price
  of not sending personal data, and it is the right price here.
- Breadcrumbs are gone, so "what led up to it" is not in the report.
- `ROUTE_WORDS` in the frontend lists the literal words of routes. A new route
  not added there reports its words as `:param` — less precise, never leakier.
- The free plan's event quota is shared by staging and production. Dedupe and
  the per-page cap limit a loop; if staging noise ever threatens it, staging
  gets its own Sentry project and DSN — no code change.
