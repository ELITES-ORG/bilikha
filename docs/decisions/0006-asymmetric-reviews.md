# 0006. Asymmetric, restrained reputation

- **Status:** Proposed
- **Date:** 2026-09-15

## Context

Marketplaces conventionally run symmetric public reviews: the client rates the
freelancer, the freelancer rates the client, both visible.

That design assumes social distance between the parties. Biliran has roughly
180,000 residents across eight municipalities; most people in a given craft are
one or two degrees apart. A public negative review here is not an abstract
signal — it is a real-world reputational event in a community where the two
parties will meet again, at a fiesta, at church, at the next LGU event.

The predictable result is that nobody leaves honest criticism. Every rating
drifts to five stars and the system carries no information — while still
creating the capacity for a public feud.

## Decision

Asymmetric and restrained.

**For creatives:** public reviews, but structured so they cannot become a
pillory. Ratings are withheld from display until a minimum count accumulates, so
no single review defines someone. Prefer structured signals — completed hires,
response rate, repeat clients — over free-text criticism.

**For clients:** no public reviews. Reliability signals stay **private to
creatives who received that client's inquiry**, as structured data rather than
prose: response rate, inquiries sent, hires completed, whether they ghost.

## Alternatives considered

**Full symmetric public reviews.** The standard pattern. Rejected for the reason
above: in a small community it produces no signal and real social harm.

**No reputation at all.** Honest to the constraint, and the safest launch
position. Rejected because creatives genuinely need to distinguish a serious
inquirer from a time-waster, and clients need some basis for choosing between
two photographers.

**Positive-only reviews.** Avoids the feud risk entirely. Rejected as not quite
honest — it presents as a review system while suppressing half the information.
The withheld-below-threshold approach gets most of the protection without the
pretence.

## Consequences

**Good.** No mechanism for a public dispute between neighbours. Structured
signals resist both inflation and retaliation better than free text. Client
reliability information reaches exactly the people who need it.

**Bad.** Weaker signal than a conventional review system, and slower to become
useful — a threshold means early profiles show nothing. Clients have less
visible differentiation between similar creatives, which pushes more weight onto
portfolio quality and verification tier.

**This is reversible in one direction only.** Loosening later is easy; the first
published review that starts a feud in Almeria cannot be un-published. Start
restrained.

**Revisit when** there is enough volume for thresholds to clear routinely, and
enough operating history to know whether disputes actually occur.
