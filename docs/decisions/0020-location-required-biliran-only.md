# 0020. Location is required at registration, and Biliran only

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** the optional-municipality row and the demand-side scoping in
  [0015](./0015-clients-register-through-the-inquiry-flow.md)
- **Amends:** [0019](./0019-one-account-creative-as-attachable-role.md), which
  specified a registration form with no municipality

## Context

The product owner wants the directory to surface creatives in the viewer's own
municipality first. That needs a municipality on every account, and the account
that browses is the client's.

[0015](./0015-clients-register-through-the-inquiry-flow.md) made municipality
optional for clients, arguing that *the supply side is geographically scoped;
the demand side must not be* — a Manila producer or Cebu resort commissioning a
Biliran creative was demand the registry wanted.

[0019](./0019-one-account-creative-as-attachable-role.md) then kept municipality
off the registration form entirely, since creatives supplied it during profile
setup and clients did not need it at all.

Both are now wrong. The product owner has decided Bilikha is **for Biliranons**,
on both sides.

The other blocker is gone: the `barangays` table was empty from plan 0001 until
now, so barangay could not be required even in principle. All 132 are seeded.

## Decision

**Municipality and barangay are required at registration, for everyone.** They
move onto the base account form rather than being asked later or per-role.

**The options are the eight Biliran municipalities. There is no "elsewhere".**
An out-of-province client cannot register. This is deliberate scoping, not an
oversight.

**Creative profile setup no longer asks for location.** It is already known from
registration, so setup collects only the creative-specific fields. Location stays
editable afterwards in the profile editor.

**The directory orders same-municipality profiles first**, then by the existing
recency order. Anonymous visitors have no municipality and see the unchanged
order.

**The 33 existing clients with a null municipality are left alone** — not
backfilled, not prompted, not blocked. They get default ordering until they
happen to set one.

## Alternatives considered

**Add an "Outside Biliran" option**, so out-of-province clients can register
honestly and simply get no proximity boost. Recommended, and declined: the
product is for Biliranons. Recorded because it is the obvious first thing to
reach for if remote demand ever turns out to matter.

**Ask location on the intent step** rather than the registration form, keeping
registration at ten fields. Recommended, and declined in favour of collecting it
with the rest of the account details. The practical difference is small now that
it applies to everyone rather than only clients.

**Infer municipality from behaviour or IP.** Rejected: unreliable on mobile
networks, invisible to the user, and impossible to correct.

**Leave it optional and sort only for those who supplied it.** Rejected: it
produces a directory that behaves differently for different people with no
visible reason, which reads as a bug rather than a feature.

## Consequences

**Good.** Every account has a location, so the proximity feature works for
everyone rather than for a subset. Municipality is collected once instead of in
two places. Barangay becomes usable for the first time.

**Bad.** Nobody outside Biliran can create an account, including the
institutional buyers [0005](./0005-organization-pages.md) identifies as the real
repeat demand if any of them are based elsewhere — a Manila production company
hiring a Biliran cameraman, for instance. That demand is now turned away at
registration with no path in.

Registration also grows by two required fields, one of them a dependent
dropdown, on the form that
[0019](./0019-one-account-creative-as-attachable-role.md) had just shortened.
Supply is still the bottleneck and this is friction on the way in.

**The barangay list is community-sourced.** It reconciles across two independent
sources at 132 and matches on all eight municipality counts, but it is not the
PSA publication and PSGC codes are blank. Slugs become permanent as soon as
someone registers against one, so corrections are free now and a migration
later.

**Revisit** if remote demand appears — an out-of-province client asking how to
sign up is the signal, and the fix is the rejected "elsewhere" option rather
than anything structural.
