# 0056. Link previews come from a crawler-only HTML endpoint

- **Status:** Accepted
- **Date:** 2026-10-10
- **Resolves:** the debt [ADR 0002](./0002-pern-with-client-rendered-spa.md)
  recorded as a launch blocker · issue #18

## Context

Sharing is how Bilikha is found ([constraints §4](../explanation/constraints.md)):
a creative's profile or an offer goes round Facebook and Messenger as a link.
Every one of those links showed the same generic card, because the app is a
client-rendered SPA and link-preview crawlers — `facebookexternalhit`,
`Twitterbot`, `WhatsApp` and the rest — do not run JavaScript. They read
`index.html`'s site-wide tags and stop. ADR 0002 accepted that as tracked debt
and named it a launch blocker.

A crawler needs very little: a title, a description, an image and the page's
own URL, in the `<head>`. Nothing it reads is interactive.

## Decision

**Crawlers are sent to a small HTML page; people keep the SPA.**

- **Routing.** `frontend/vercel.json` rewrites `/creatives/:slug` and
  `/offers/:id` to the API's `/api/v1/share/...` pages when the request's
  `User-Agent` names one of eight preview crawlers. The production and
  staging split follows the existing `/api` rules: `bilikha.vercel.app` goes
  to the production API, every other host to staging. Every other request —
  including Messenger's in-app browser, whose user agent says `FBAN`, not
  `facebookexternalhit` — falls through to `index.html` as before.
- **Content.** `backend/src/modules/share/` builds the card from
  `getPublishedBySlug` and `getPublishedOfferById`, the same calls the public
  pages make. Visibility is therefore borrowed, not re-derived: anything the
  public page would 404 — unpublished, suspended, missing — gets the generic
  site card, which names nothing about the item.
- **The canonical URL is fixed per deployment**, from `RENDER_GIT_BRANCH`:
  production → `bilikha.vercel.app`, any other branch →
  `bilikha-staging.vercel.app`. Behind the rewrite the request's host is the
  API's own, and trusting a forwarded header would let a caller choose the URL
  the card advertises.
- **A default image** (`frontend/public/og-default.png`, 1200×630) stands in
  for a missing photo, and is now the site-wide `og:image` too.
- **Caching.** `Cache-Control: public, max-age=600` and `Vary: User-Agent`.
  Every interpolated value is HTML-escaped. A failure answers with the generic
  card, uncached, rather than an error: a plain card beats no card.

## Alternatives considered

- **Server-side rendering, or moving the public pages to an SSR framework.**
  It fixes this and indexing together, but it means a rendering server for
  every page and rewriting the public routes, to serve a few meta tags.
  ADR 0002's "keep public routes thin" still keeps that door open.
- **A prerender service** (headless Chrome snapshots). Another paid service
  and a cache to invalidate when a profile changes, for the same tags.
- **Serve the card HTML to everyone, with a redirect into the SPA.** Every
  visitor would pay an extra round trip to the API on a slow connection
  (constraints §1), and a redirect breaks the back button.
- **Read the canonical host from `X-Forwarded-Host`.** Spoofable, as above.

## Consequences

**Good.** Shared profiles and offers say who or what they are, with a photo
when there is one. The SPA, its bundle and its first load are untouched. The
cards cannot drift from what the public pages allow, because they use the same
queries.

**Bad.** User-agent matching is a list someone has to keep: a new crawler
gets the generic card until its token is added to `vercel.json`. The site
origins are written in code, so a new production domain must be added in
`share.service.ts` as well as in `vercel.json` and `site-host.ts`. Search
engines are still not served rendered pages; this solves previews, not
indexing, which ADR 0002's debt also covered.

**Watch for.** Facebook caches a scrape for weeks. A profile that changes its
photo or name keeps the old card until someone asks the Sharing Debugger to
scrape it again.

## Amendment — 2026-10-10: the generic card keeps the shared URL

The generic card first set `og:url` to the site's home page. In Facebook's
Sharing Debugger on staging, the crawler treated that as the page to scrape:
it followed `og:url` to the home page, read the SPA's site-wide tags instead of
this card, and showed no image while production lacked `og-default.png`. The
generic card now keeps the link that was shared as its `og:url` and
`canonical`. Its title, description and image stay generic, so it still names
nothing about a hidden item; the URL holds only what the person sharing it had
already pasted.
