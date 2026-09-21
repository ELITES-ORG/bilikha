# 0039. A creative's dashboard answers what to do next

- **Status:** Accepted
- **Date:** 2026-09-22
- **Related:** [0029](./0029-work-agreements-not-invoices.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0027](./0027-account-is-a-hub.md) ·
  [0025](./0025-client-postings-and-mirrored-home.md) ·
  [0019](./0019-one-account-creative-as-attachable-role.md) ·
  [constraints 1, 6, 7](../explanation/constraints.md)

## Context

Creatives want a place to see how their work is doing on the platform. The
request was for a dashboard showing everything.

**What "everything" currently amounts to.** Across the 23 published profiles, at
the time of writing: two offers exist on the whole platform, no postings, no
ratings, no saved offers, and three agreements — all three belonging to test
fixtures. Every real creative has zero offers, zero agreements and zero ratings.

So a straight metrics grid, shipped today, tells a real creative:

> Offers 0 · Inquiries 0 · Agreements 0 · Completed 0 · Agreed ₱0 · Rating —

That is a scoreboard of failure delivered to the people the platform most needs
to keep. [Constraint 1](../explanation/constraints.md) says the thin market is
permanent, that empty is a normal state rather than an error, and that
*liquidity is the product risk, not features*. A dashboard measuring a creative
against an empty market makes the thinness the first thing they see, on the page
they opened hoping for good news.

**The metric they actually want does not exist.** *Is anyone looking at my
profile?* is the question asked, and nothing in the schema records a view, an
impression or a search appearance.

## Decision

**The surface leads with the next action. Numbers are the evidence, not the
headline.** *"Add an offer — clients cannot hire what they cannot see priced"*
is useful to a creative with nothing. *"Offers: 0"* is the same fact, and
useless. The page answers *what should I do*, and reports counts underneath
where a count helps.

**It is designed for the zero case first**, because that is the overwhelming
majority case and will be for a long time. A state with no data is the default
layout, not a fallback. Every count that can be zero has a sentence ready for
when it is.

**Everything is derived on read.** No counter columns, no denormalised totals,
no aggregate table. [ADR 0029](./0029-work-agreements-not-invoices.md) already
settled this for agreement totals — the sum is computed from the line items
because *a stored total that disagrees with its line items* is worse than no
total — and [0028](./0028-suspension-is-enforced-per-request.md) derives
visibility the same way rather than flagging rows. A dashboard of stored
counters is the same mistake at a larger surface. At this scale the queries cost
nothing. `summaryForProfile` already derives the rating average
this way and is reused rather than duplicated.

**It lives at `/account/work`, reached from a row on the account hub, and the
row's summary carries the next action.** [ADR 0027](./0027-account-is-a-hub.md)
makes Account a hub of labelled rows with summaries, and `HubRow` already takes
one. So the single most useful sentence is visible without opening anything, and
the detail is one tap away. **No new bottom-navigation entry** — that bar holds
four destinations and [0023](./0023-bottom-navigation-on-phones.md) already
settled what earns a place there.

**The money figure is what was agreed, never what was earned.** Bilikha does not
handle payment and says so on every agreement record. A dashboard reporting
"earned" would assert something the platform cannot know, and would be wrong the
first time a client did not pay.

**Only a creative sees it.** The row and the page require a creative profile,
the same `profileSlug` guard every other creative-only surface uses. A client has
no work to report on.

**Profile views are not tracked, and this decision does not add them.** It is
the number creatives ask for, and it is a separate decision with its own costs: a
write on every public profile read, a table that would grow faster than every
other table combined, and — under [constraint 7](../explanation/constraints.md),
a public registry of named individuals, and
[constraint 6](../explanation/constraints.md), a province where everyone knows
everyone — a real question about whether a creative is shown *who* looked.
Ship the surface from data that already exists; revisit views when there is
enough traffic for the number to mean something.

## Alternatives considered

**The metrics grid that was asked for.** Honest, complete, and mostly zeros. It
would be the right build with a liquid market and is the wrong one now. Worth
revisiting when a typical creative has non-zero rows, which is a thing to check
rather than assume.

**Both: guidance on top, full metrics below.** Tempting, and rejected for now on
the same ground — the metrics half would be a block of zeros under the guidance,
and building it twice over to reach the same answer. The numbers this decision
does show are already the ones worth showing; more can be added when they have
values.

**Put the dashboard on `/account` itself.** It is where a creative already goes,
but 0027 makes that page a hub of rows and turning its top into a panel would
undo the thing that makes it scannable. The `HubRow` summary gets the headline
across without that cost.

**A fifth bottom-nav entry.** Rejected by 0023 and 0036: the bar holds four
destinations, and a page opened occasionally does not displace one used
constantly.

**Track views now and show a count.** The strongest single number, deferred
rather than refused — see the last decision above. It needs its own ADR because
the write path and the privacy question are both real.

## Consequences

**A creative with nothing sees advice, not an indictment.** That is the whole
point, and it is also the case that will be true for nearly everyone at launch.

**The page gets better on its own as the market fills.** Every number is derived,
so nothing needs backfilling when activity starts — the same query returns a
larger number.

**It will look thin to anyone expecting an analytics product.** That is correct
for now and worth saying out loud, because the instinct to add charts to a
dashboard is strong and there is nothing here to chart yet.

**The question "is anyone looking?" stays unanswered.** The most likely
follow-up request, and the reason the view-tracking ADR will be written. Until
then the page should not imply an answer it does not have — no "impressions"
column sitting at zero because nothing fills it.
