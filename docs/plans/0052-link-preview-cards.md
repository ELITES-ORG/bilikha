# 0052. Link preview cards for shared profiles and offers

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [ADR 0056](../decisions/0056-link-previews-come-from-a-crawler-only-html-endpoint.md) ·
  [ADR 0002](../decisions/0002-pern-with-client-rendered-spa.md) · issue #18

## Goal

A shared `/creatives/:slug` or `/offers/:id` link shows that creative or offer
on Facebook, Messenger and other apps — name, details and photo — instead of
the same generic card for every link. Link-preview crawlers get a small HTML
page carrying the item's own Open Graph tags; people keep the SPA unchanged.

## Scope

**In scope**
- `backend/src/modules/share/`: the two HTML endpoints, built on the public
  profile and offer queries.
- `frontend/vercel.json`: user-agent rewrites on both hosts.
- `frontend/public/og-default.png`, and the site-wide `og:image` in
  `index.html`.

**Out of scope**
- Server-side rendering and search-engine indexing (ADR 0002's other half).
- Previews for postings, which are signed-in only.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Share endpoints | 1 / 1 | Done |
| 2. Routing and default image | 1 / 1 | Done |
| 3. Records | 1 / 1 | Done |
| 4. Check on staging | 0 / 1 | Not started — needs the merge to `main` |

---

## Phase 1 — Share endpoints

### Step 1.1 — Build the cards from the public queries

- [x] **Action.** `GET /api/v1/share/creatives/:slug` and `/offers/:id`, built
  from `getPublishedBySlug` and `getPublishedOfferById`; anything those would
  404 gets the generic card. Every value HTML-escaped; `max-age=600`,
  `Vary: User-Agent`; a failure answers the generic card, uncached.
- [x] **Verify.** `share.test.ts`: published vs suspended, unpublished and
  unknown; the default image; escaping; a malformed offer id; price wording
  matching the frontend.

## Phase 2 — Routing and default image

### Step 2.1 — Send crawlers to the cards

- [x] **Action.** Four rewrites in `frontend/vercel.json`, before the SPA
  catch-all, matched on the crawler's `User-Agent`, split by host like `/api`.
  The 1200×630 default image, also the site-wide `og:image`.
- [x] **Verify.** `vercel.json` parses, the new rules sit before the
  catch-all, and nothing else in the file changed.

### How the default image was made

The light theme's navy, `#032b61`, with the wordmark's red star and "Bilikha"
in Fraunces Semibold, then "Biliran Creative Industries Registry" and the
site's one-line description in Plus Jakarta Sans. Rendered from the real fonts
(`@fontsource-variable`) in headless Chrome at exactly 1200×630, scale 1, so
it stays true to the type; 39 kB. To change it, rebuild it the same way
rather than editing pixels.

## Phase 3 — Records

### Step 3.1 — Record the decision

- [x] **Action.** ADR 0056; an amendment on ADR 0002; the README's launch
  blocker; `api.md` and `deployments.md`.
- [x] **Verify.** `npm run docs:check` passes.

## Phase 4 — Check on staging

### Step 4.1 — Ask the crawlers

- [ ] **Action.** After the merge, run a staging profile URL and an offer URL
  through Facebook's Sharing Debugger, and share one in Messenger.
- [ ] **Verify.** The profile shows its name, craft, municipality and photo;
  the offer its title, price and image; a suspended profile the generic card;
  a normal browser on the same URLs still gets the app.
