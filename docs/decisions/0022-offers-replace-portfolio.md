# 0022. Offers replace the portfolio, and the directory indexes offers

- **Status:** Accepted
- **Date:** 2026-09-17
- **Supersedes:** the portfolio model built in
  [plan 0009](../plans/0009-bio-avatars-and-portfolio-images.md)
- **Related:** [0021](./0021-image-storage-and-upload-path.md) ·
  [0008](./0008-publish-immediately-with-tiers.md) ·
  [0018](./0018-conversations-replace-one-shot-inquiries.md) ·
  [0003](./0003-postgres-native-search.md)

## Context

[Plan 0009](../plans/0009-bio-avatars-and-portfolio-images.md) gave creatives a
portfolio: images with captions, in an order they choose. It answers "has this
person done work before". It does not answer "what can I hire them for".

The two are not the same question, and the second is the one a client arrives
with. A photographer's gallery of twelve images does not say whether they shoot
weddings, do product work, or both, or what either involves.

The taxonomy has the same problem. There are nine domains and eighty-one
sub-domains from RA 11904, and a creative picks up to five at registration. They
render as tags on a profile and filter which *people* appear. Nothing is
attached to them. They are labels, not an index.

The product owner's model is that a creative publishes **offers** — a named
service or package, under one of the sub-domains they registered, with a
description and its own images:

> Offer: Full Stack Package · Mobile App Developers · description · images

And that filtering the directory by a sub-domain shows **those offers**, not the
people who happen to carry the tag.

## Decision

**An offer is the unit a creative publishes and a client browses.** It has a
title, exactly one sub-domain, a description, an optional price, and its own
images.

**`offers` replace `portfolio_items`.** There is one image concept, not two.
Existing portfolio rows migrate into an offer rather than being discarded; the
stored objects keep their keys, so nothing is re-uploaded.

**An offer's sub-domain must be one the creative registered.** A mobile app
developer cannot post an offer under Weaving. The sub-domains chosen at
registration become the creative's permitted vocabulary.

**Price is optional, as a minimum, a maximum, or both.** Pesos, stored as
integer centavos. A minimum alone renders "from ₱15,000", both render a range,
neither renders "Price on request". Absence is a first-class state, not an
empty string.

**The filtered directory lists offers.** A creative with three matching offers
appears three times, because three things are on sale. This is the change that
makes the taxonomy load-bearing.

**Offers do not gate discoverability.** The existing creative listing stays
reachable and a profile with no offers is still browsable. ADRs
[0004](./0004-unified-account-model.md) and
[0019](./0019-one-account-creative-as-attachable-role.md) both record that
supply is the bottleneck; requiring three composed offers before anyone can find
you is exactly the friction they warn about.

**Limits: six offers per profile, four images per offer.** Both are storage
decisions as much as product ones — see Consequences.

**Moderation follows [0008](./0008-publish-immediately-with-tiers.md).** Offers
are live on publish and reviewed after. A description matching a contact-details
pattern — a phone number, a URL, a social handle — is flagged for review but not
blocked.

## Alternatives considered

**Keep the portfolio and add offers alongside it.** Rejected. Two image
pipelines to build and moderate, two places an image could belong, and a
creative forced to decide which — against a 1 GB storage budget that does not
support both.

**List creatives, matched via their offers.** A creative appears once, with
their matching offers summarised on the card. Recommended and declined by the
product owner. It would have kept the directory populated during the transition,
and that protection is what we are giving up.

**Require a price on every offer.** Strongest signal to clients. Rejected as the
heaviest commitment to ask of creatives and the hardest to keep honest as prices
drift.

**No price anywhere**, negotiated in conversation. Rejected: a client cannot
self-filter, and every mismatch costs both sides a conversation.

**Enforce the sub-domain rule with a composite foreign key** to
`creative_profile_subdomains (profile_id, subdomain_id)`, which already carries
the right unique index. Elegant, and rejected: `updateOwnProfile` deletes every
sub-domain row and reinserts them on each save, so a `RESTRICT` foreign key
would reject every profile edit and a `CASCADE` one would silently delete the
creative's offers. The rule is enforced in the service instead, and removing a
sub-domain that still has offers is refused with a message naming them.

**Full-text search over offer descriptions.** Out of scope here, but note that
this decision is what makes [0003](./0003-postgres-native-search.md) worth
acting on — until now there was no prose to search.

## Consequences

**Good.** The client's actual question is answered. The taxonomy stops being
decoration and becomes the index. One image concept instead of two. An offer
gives a conversation something specific to be about, which
[0018](./0018-conversations-replace-one-shot-inquiries.md) currently lacks.

**Bad, and this is the real cost.** The filtered directory is **empty until
creatives post offers**, and there are two published profiles today. The
declined alternative was the mitigation. Keeping the creative listing reachable
is the partial substitute, and it is weaker.

**Bad.** More work per creative, on the side of the market that is already the
constraint.

**Storage tightens.** Six offers × four images × two sizes ≈ 7 MB per fully
populated profile, so 1 GB holds roughly 140 of them — against about 340 under
the portfolio model. Typical use will be far lower, but the ceiling in
[0021](./0021-image-storage-and-upload-path.md) arrives sooner, and Cloudflare
R2 moves from "eventually" to "plan for it".

**One creative can dominate a filtered page.** With few offers in a sub-domain,
whoever posted six of them fills the results. No fairness rule ships with this;
it is a real hazard of listing offers rather than people.

**Offer descriptions are the first public free prose in the product.** That is
where someone writes "message me on Facebook instead", routing around the in-app
conversations [0018](./0018-conversations-replace-one-shot-inquiries.md)
deliberately chose, and where spam and misleading pricing will appear. The
pattern flag is a tripwire, not a defence.
