# 0040. A deploy must not break an open tab

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related:** [0031](./0031-testing-strategy.md) ·
  [plan 0031](../plans/0031-stop-shipping-every-page-to-every-visitor.md) (which
  introduced the split this is about) ·
  [constraint 3](../explanation/constraints.md) (budget Android, metered data)

## Context

The registrant expects to revise Bilikha repeatedly over the coming months. The
question was how to harden the PWA for that. There is no PWA — no manifest, no
service worker, no dependency — but the concern underneath it was correct, and
worse than expected: **the app already breaks on every deploy, for anyone who
had it open.**

Plan 0031 split the app into 23 lazily-loaded routes and 40 chunks with
content-hashed filenames. A phone in a pocket holds the previous `index.html` in
memory. Deploy, then tap Messages, and the browser asks for a chunk filename
that the new build does not have.

Asked for a chunk hash that does not exist, production answered:

```
GET /assets/index-DEADBEEF.js
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: public, max-age=31536000, immutable
```

Three faults in one response. The SPA fallback in `vercel.json` matched
`/(.*)`, so a missing asset returned **`index.html`** — status **200**, type
**text/html** — and the `/assets/(.*)` header rule then marked that HTML
**immutable for a year**. The browser rejects it as a module, the dynamic import
fails, and because there was no error boundary anywhere in the codebase, React
unmounted the tree. A white screen, no message.

## Decision

**Three mechanisms, in the order they fire.**

### 1. A missing asset is a 404

The SPA fallback excludes the asset directory:

```json
{ "source": "/((?!assets/).*)", "destination": "/index.html" }
```

Everything else still falls through to `index.html`, which is what a client-side
router needs. `/assets/` does not, because nothing under it is a route — it is
build output, and a request for build output that is gone is a genuine 404. This
also stops the year-long `immutable` header from ever being stamped on a shell.

### 2. A failed chunk reloads once

`AppErrorBoundary` wraps the app in `main.tsx`, outside `App` itself so that an
error in `App`'s own body is still caught. A chunk failure is recognised by
shape rather than by any one browser's wording, and handled **silently**: one
reload fetches the current `index.html` and with it the current hashes. The
person never learns anything happened, which is the correct amount for them to
learn.

Once per build, recorded in `sessionStorage`. A reload loop against a genuinely
broken deploy is worse than a blank page: it hammers the origin and never
settles. When the guard is already set, or storage is unavailable, the boundary
shows a plain message and a Reload button instead. No stack trace — nobody
reading this on a phone in Naval can act on one.

### 3. A long-open tab is told there is a newer build

Each build writes `build-id.txt` beside `index.html` and bakes the same value
into the bundle. When the tab returns to the foreground, at most once an hour,
the app compares the two. If they differ it offers a reload; it does not take
one.

**Offer, never act.** Somebody halfway through writing a message does not want
the page reloaded under them. An app that reloads while you are typing is worse
than one running last week's code.

## Why not a service worker

That was the obvious reading of the request, and it is the wrong thing to do
first. A service worker caching the HTML-that-claims-to-be-JavaScript above
would have made a recoverable blank screen into a permanent one: today a reload
fixes it, because `index.html` is `max-age=0, must-revalidate`. Hardening the
update path is a prerequisite for a service worker, not an alternative to one.

The PWA is worth having — [constraint 3](../explanation/constraints.md) is
budget Android on metered data, and repeat visits costing nothing is exactly
what that constraint wants. It is
[plan 0036](../plans/0036-the-pwa.md), to be done deliberately and after this.

## Consequences

- A deploy during someone's session costs them one reload instead of a dead app.
- A bad chunk cannot loop, and cannot be cached for a year.
- One extra request per hour per foregrounded tab, of about fourteen bytes.
- `build-id.txt` must stay out of `/assets/`. Under that path it would be
  immutable for a year and excluded from the fallback — unreadable and
  uncacheable in exactly the wrong directions. The comment in `vite.config.ts`
  says so at the emit site.
- The error boundary is a genuine safety net for every other render error too,
  not only this one. It was the only part of the app with no floor under it.

## What was verified

Against the built app, served with the production rules:

- A missing `/assets/*` returns 404 `text/plain`, not the shell.
- Removing a route chunk mid-session and navigating to it produced
  `nav type=reload`, the guard set to the build id, and — because the same build
  still lacked the chunk — the message rather than a second reload.
- Restoring the chunk, as a real new build would, rendered the page and cleared
  the guard.
