# Decision records

Short records of decisions with consequences, and the reasoning behind them.

They exist so nobody re-litigates a settled question from scratch — and so that
when a decision *should* be revisited, the reasoning that produced it is visible
rather than guessed at.

---

## Status

| Status | Means |
|---|---|
| **Accepted** | Decided and reflected in the code today |
| **Proposed** | Decided in principle, not yet built. Still open to change |
| **Superseded** | Replaced. Links to what replaced it. **Never deleted** |

A superseded record keeps its reasoning. "We tried X and moved to Y because Z"
is more valuable than a record that only shows Y.

---

## Writing one

Copy `_template.md`. Keep it under a page.

Write a record when a choice would be expensive to reverse, when you rejected a
reasonable alternative, or when the decision will look wrong to someone without
the context. Do not write one for choices with an obvious default.

Number sequentially. Never renumber.

---

## Log

| # | Decision | Status |
|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-pern-with-client-rendered-spa.md) | PERN with a client-rendered SPA | Accepted |
| [0003](./0003-postgres-native-search.md) | Postgres-native search, no PostGIS | Accepted |
| [0004](./0004-unified-account-model.md) | Unified account, creative profile as a role | Accepted (refined by 0015) |
| [0005](./0005-organization-pages.md) | Public pages for organisations only | Proposed |
| [0006](./0006-asymmetric-reviews.md) | Asymmetric, restrained reputation | Proposed |
| [0007](./0007-phone-as-primary-identity.md) | Phone number as primary identity | Superseded by 0013 |
| [0008](./0008-publish-immediately-with-tiers.md) | Publish immediately with verification tiers | Proposed (narrowed by 0013) |
| [0009](./0009-migrations-over-db-push.md) | Generated migrations over `db:push` | Accepted |
| [0010](./0010-theme-static-tokens.md) | `@theme static` for design tokens | Accepted |
| [0011](./0011-self-hosted-variable-fonts.md) | Self-hosted variable fonts | Accepted |
| [0012](./0012-versioned-api-prefix.md) | Versioned API prefix from day one | Accepted |
| [0013](./0013-username-password-auth-sprint-1.md) | Username and password auth for sprint 1 | Accepted |
| [0014](./0014-modular-monolith-architecture.md) | Modular monolith with feature slices | Accepted |
| [0015](./0015-clients-register-through-the-inquiry-flow.md) | Clients register through the inquiry flow | Partly superseded by 0017, 0020 |
| [0016](./0016-edits-never-unpublish.md) | Edits never un-publish; public edits flag for re-review | Accepted |
| [0017](./0017-sign-in-before-contacting.md) | Sign in before contacting a creative | Accepted |
| [0018](./0018-conversations-replace-one-shot-inquiries.md) | Conversations replace one-shot inquiries, in-app only | Accepted (amended by 0024) |
| [0019](./0019-one-account-creative-as-attachable-role.md) | One account; creative is a role you add | Accepted (amended by 0020) |
| [0020](./0020-location-required-biliran-only.md) | Location required at registration, Biliran only | Accepted |
| [0021](./0021-image-storage-and-upload-path.md) | Image storage, sized in the browser, uploaded directly | Accepted |
| [0022](./0022-offers-replace-portfolio.md) | Offers replace the portfolio; the directory indexes offers | Accepted |
| [0023](./0023-bottom-navigation-on-phones.md) | Bottom navigation on phones | Accepted |
| [0024](./0024-offers-attach-to-messages.md) | An offer attaches to a message, not a conversation | Accepted |
| [0025](./0025-client-postings-and-mirrored-home.md) | Client postings; Home shows the other side of the market | Accepted |
| [0026](./0026-dark-mode-follows-the-device.md) | Dark mode, following the device | Accepted |
| [0027](./0027-account-is-a-hub.md) | The account page is a hub, not a page | Accepted |
