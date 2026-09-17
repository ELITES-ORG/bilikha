# 0033. A rating is earned by a completed agreement

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0029](./0029-work-agreements-not-invoices.md) ·
  [0032](./0032-an-accepted-agreement-is-not-deleted.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0030](./0030-notifications.md) ·
  [operating constraints §1, §6, §7](../explanation/constraints.md)

## Context

A client choosing between two creatives they have never met has nothing to go on
but a profile and a price. The engagement lifecycle
([0029](./0029-work-agreements-not-invoices.md)) now produces a reliable fact
that did not exist before: an agreement both parties accepted and the client
confirmed complete. That is a real transaction, and it is the natural anchor for
a review.

**This decision runs against
[constraints §6](../explanation/constraints.md), knowingly.** That section says:

> Public negative reviews are socially unusable. People will not leave honest
> criticism of a neighbour, so a symmetric five-star system degrades to
> all-fives and carries no signal.

That warning is well founded. It is why Uber sits at 4.8 and why old eBay ran at
99% positive, and social distance in a province of 180,000 makes it stronger,
not weaker. The alternatives were put to the registrant — private stars with
public written testimonials, everything private, or publishing only the
completion record and no opinion at all — and the decision was a public Play
Store shape: stars and a short note, visible on the profile.

The decision is the registrant's to make. This record exists so that the
trade-off is written down rather than rediscovered, and so nobody later "fixes"
the feature back to match a constraint it was deliberately weighed against.

## Decision

**One rating per completed agreement, by the client on that agreement.** Not one
per creative: a repeat client who completes a second engagement rates again. The
agreement is the thing that earns the right to speak, which is what stops the
registry filling with opinions from people who never hired anyone.

**Stars are 1–5 and the note is short** — capped, because a review box that
invites an essay invites a grievance.

**Public on the creative's profile**, with the count shown as prominently as the
score. "5.0 from 1 review" and "4.6 from 30" must never look alike, because in a
thin market ([constraints §1](../explanation/constraints.md)) they will
routinely differ by exactly that much.

**The directory is not sorted or filtered by rating.** Showing a score on a
profile someone chose to open is one thing. Ranking the whole registry by an
average built on two reviews is another, and it would decide who gets work in a
market too thin for the numbers to mean anything. If ranking is ever wanted it
is a separate decision with its own evidence.

**The average is derived at read time, never stored.** Same rule as the
agreement total and the lifecycle state. It also means a suspended client's
review leaves the average automatically
([0028](./0028-suspension-is-enforced-per-request.md)) — no recount, no cached
figure to go stale.

**The client may edit or delete their rating for 14 days, then it freezes.** A
first impression on the day of delivery is often wrong in both directions, and
two weeks is enough to settle. The freeze is the load-bearing half: a
permanently editable rating is a lever a creative can be pressured with in a
place where the parties will meet again.

**No public reply.** The registrant's call, and it keeps a bad engagement from
becoming a public argument between two named neighbours. It costs the creative
their fastest recourse, which the next point answers.

**A creative may appeal a rating to an administrator.** That is their only
recourse and it has to exist, because everything else here is public and
permanent. An administrator can remove a rating, which is recorded in
`moderation_actions` like every other moderation decision.

**A reviewer is named in public as a first name and a surname initial.** Found
auditing the implementation, which published the client's full legal name by
default — reasonably, since clients have no display name and nothing here had
decided the question.

A creative registered for a public profile. The client who hired them did not,
and [constraints §6](../explanation/constraints.md) is explicit that a private
individual who hired a photographer once should not acquire a public presence.
Publishing their full name beside their opinion, on a page any visitor and
Facebook's scraper can read, is that liability in a smaller package.

It also works against the feature. This ADR already expects scores to cluster at
five; attaching a full legal name to a review, readable by the reviewer's entire
province, removes the last reason anyone would write three. "Maricel B." is
still a person rather than "Anonymous", which is what a review needs to carry
weight. Administrators see the full name in the appeal queue, where knowing
exactly who spoke is the point.

**The prompt appears when the client confirms completion, and "later" is a real
option.** A rating nobody was nagged into is worth more than one extracted at
the moment of maximum friction. "Later" leaves the invitation on the agreement
record until it is used or the engagement scrolls out of mind.

**The creative is notified of a new rating.** [0030](./0030-notifications.md)
keeps the notification list short and admits only things a person must act on.
This qualifies narrowly: appeal is the creative's only recourse, and it is
useless if they do not know the rating exists.

## Alternatives considered

**Private stars, public written testimonials.** Recommended and not chosen.
People write positive testimonials freely and rate honestly in private, so each
channel carries what it can actually bear. Rejected by the registrant in favour
of a familiar public shape.

**Everything private, visible to the creative and administrators.** Safe, and
useful for spotting a creative with a pattern before more clients are hurt.
Rejected: it gives a client choosing between two strangers nothing.

**No stars at all — publish the completion record.** Engagements completed,
cancelled, confirmed. All facts already stored, unspammable, and nobody has to
criticise a neighbour to produce them. Rejected as too thin to choose between
people.

**Rating without an agreement.** The obvious spam surface, and rejected on
sight. Requiring a completed agreement raises the cost of a fake review from
nothing to a second account, a conversation, an issued agreement, an acceptance
with a password, and two lifecycle transitions.

**Let the creative rate the client too.** Not asked for, and
[constraints §6](../explanation/constraints.md) is explicit that client
reliability stays private to the creatives who dealt with them. Symmetric rating
also creates retaliation: a client who rates honestly gets rated back.

**A Bayesian average that shrinks small samples toward the mean.** Statistically
the right answer to the thin-market problem. Rejected for now: it produces a
number nobody can explain to the person it describes, which matters when that
person is a named individual who will ask.

## Consequences

**Good.** A client has something to go on beyond price, anchored to a
transaction that demonstrably happened.

**Good.** The agreement requirement makes spam expensive without any spam
detection, and it ties every review to a record neither party can alter
([0032](./0032-an-accepted-agreement-is-not-deleted.md)).

**Bad, and expected.** Scores will cluster at five and carry little signal.
Constraints §6 predicts this and it is the cost accepted here. The count beside
the score is what keeps the display honest.

**Bad.** The rare low rating will land hard on a named person in a small
province, and there is no public reply. The appeal route is the whole
mitigation, so it has to be answered quickly to be worth anything.

**Bad.** A creative can still manufacture reviews through a cooperative friend:
two accounts, one agreement, one completed engagement. It costs effort rather
than nothing. In a province where everyone knows everyone, being caught doing it
is its own deterrent — which is the same social fact that makes honest criticism
hard.

**Watch for.** All-fives with no variance. If after a hundred ratings the
distribution is flat, the feature is decorative, and the honest response is to
say so rather than to keep displaying it.

**Watch for.** Pressure to sort the directory by rating once scores exist. That
is where a meaningless average starts deciding who eats.
