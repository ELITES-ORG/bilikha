# 0002. PERN with a client-rendered SPA

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Bilikha needs a web application backed by a relational store. Two product facts
pull in opposite directions:

1. Discovery depends on Google indexing individual creative profiles and on
   Facebook and Messenger rendering link previews when a profile is shared.
   Facebook's scraper **does not execute JavaScript**.
2. The team's stated stack is PERN with TypeScript — Postgres, Express, React,
   Node — as two separately deployable services.

A client-rendered SPA serves an empty `<div id="root">` to crawlers. Google's
renderer will eventually execute the JavaScript; Facebook's will not, so every
shared profile link renders as a blank grey card.

## Decision

Build PERN as specified: an Express 5 API and a Vite-built React SPA, deployed
as separate services, with the SEO gap accepted as **known, tracked debt**
rather than resolved up front.

Mitigations in place now:

- Static Open Graph tags in `index.html` — a stopgap, not a solution
- A clean split between the public directory (anonymous, SEO-critical) and the
  creative dashboard (login-gated, no SEO value), so only the first needs solving

## Alternatives considered

**Next.js instead of the React SPA.** Still React, still Node, still Postgres;
SSR comes free and solves the problem completely. Rejected because the team
specified PERN with separate services and reaffirmed it after the tradeoff was
raised. It remains the strongest technical answer if the team revisits this.

**Prerender service** (Prerender.io or similar) serving cached HTML to bots.
Works, and can be added later without restructuring — but it is a permanently
maintained bolt-on, and strictly worse than real SSR.

**Accept the SPA and abandon SEO**, driving all traffic from DTI's Facebook
page directly. Rejected: it gives up the discovery mechanism the product is
built on.

## Consequences

**Good.** One familiar stack. Fast iteration with no SSR complexity. The API is
cleanly separable and already versioned, so a future mobile wrapper has a stable
contract. The login-gated dashboard is client-rendered anyway, which is exactly
what a Capacitor build would wrap.

**Bad, and this is a launch blocker.** Public profiles are not indexable and not
shareable with a preview. This must be resolved before public launch via SSR, a
prerender layer, or migrating the public directory to an SSR framework. Deferred,
not solved.

**Watch for.** The longer the SPA grows, the more expensive option three becomes.
Keep public routes thin and data-driven so that migration stays cheap.
