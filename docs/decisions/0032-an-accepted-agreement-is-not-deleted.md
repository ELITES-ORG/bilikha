# 0032. An accepted agreement is not deleted

- **Status:** Accepted
- **Date:** 2026-09-18
- **Related:** [0029](./0029-work-agreements-not-invoices.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0004](./0004-unified-account-model.md)

## Context

[0029](./0029-work-agreements-not-invoices.md) says plainly: "Nothing is ever
deleted. A cancelled engagement keeps its agreement and its whole history." The
database does not enforce that half of it.

The freeze triggers refuse every *modification* of an accepted agreement —
updating the row, and inserting, updating or deleting its line items. Auditing
plan 0016 by attacking them with direct SQL confirmed all four refusals, and one
success: `DELETE FROM agreements` on an accepted row goes through.

Nothing reaches it today. There is no delete route, no service that deletes an
agreement, and both `agreements.issued_by_user_id` and
`agreement_acceptances.accepted_by_user_id` are `ON DELETE RESTRICT`, so
removing either party is already refused.

The path that will open it is account deletion, which does not exist yet and
will. RA 10173 gives a right to erasure, and
[0004](./0004-unified-account-model.md) puts everything on one account.
`conversations.client_user_id` is `ON DELETE CASCADE` and
`agreements.conversation_id` is too, so the first implementation of "delete my
account" will walk user → conversations → agreements → acceptances and destroy
the counterparty's record without anyone writing a line of code that says
"delete an agreement".

That is the failure mode worth designing against: not a hole someone exploits,
but a reasonable future feature quietly doing the wrong thing.

## Decision

**Deleting an accepted agreement is refused by the database**, with a trigger
mirroring the freeze triggers already there.

**Only `accepted` is protected.** A `sent`, `superseded` or `withdrawn`
agreement may be deleted. Acceptance is what turns a proposal into evidence —
before it, the document is nobody's record but its author's.

**This deliberately breaks the naive account deletion.** Whoever builds erasure
will hit a refusal with a message explaining it, at development time, instead of
shipping something that removes a client's proof of what a creative agreed to.
Failing loudly is the point, and it is the same instinct as
[0028](./0028-suspension-is-enforced-per-request.md): make the wrong thing hard
rather than trusting everyone to remember.

**Erasure is not deletion, and the shape it should take is stated here so the
next person does not have to invent it.** An accepted agreement records a
commitment between two people. One of them leaving does not end the other's
interest in it. When account deletion is built, the agreement is **retained with
the departing party's identifying fields detached** — their name resolves to a
tombstone the way a suspended account's already does — rather than removed.

**A conversation carrying an accepted agreement can no longer be hard-deleted.**
That follows from the above and is intended.

**The acceptance row is immutable too, and that turned out to be the more
important half.** Auditing the work that implemented this decision found the
agreement frozen and undeletable while `agreement_acceptances` — the row naming
who accepted, when, and against which content hash — stayed freely editable and
deletable. An accepted agreement could be left standing with no acceptance at
all, or with one reassigned to somebody who never accepted it.

The document is only half the evidence. [0029](./0029-work-agreements-not-invoices.md)
puts the weight on the hash and the acceptor, so both are now refused any update
or delete. Nothing in the application ever needed to change them: the service
inserts an acceptance and afterwards only reads it.

This also closes the way around the guard above. `accepted_by_user_id` is
`RESTRICT`, so deleting a party is refused — but dropping the acceptance first
and then letting the cascade run would have worked, and would have destroyed the
evidence on the way past.

## Alternatives considered

**Leave it, and amend 0029 to permit deletion.** Honest about what the code
does. Rejected: the acceptance row and its content hash are the entire
evidential value of the feature. A record that can be deleted by the party it
would be used against is not evidence, and the whole password step exists to
make it mean something.

**`ON DELETE RESTRICT` on `agreements.conversation_id` instead of a trigger.**
Simpler, and enforced by the same mechanism as the two `RESTRICT`s already
present. Rejected: it blocks deleting a conversation that carries *any*
agreement, including an abandoned draft, and it fails with a foreign-key error
that says nothing about why. A trigger can be conditional on status and can
explain itself.

**Block deletion at every status.** Fewer rules to remember. Rejected: a
creative who drafted something and never sent it has produced nothing anyone
else has an interest in.

**Soft delete — a `deleted_at` column.** The usual answer. Rejected: it adds a
flag every read path must filter on, which is a new way to leak exactly what
[0028](./0028-suspension-is-enforced-per-request.md) works to hide, and the row
is already immutable so there is nothing to soft-delete *for*.

**Solve account deletion now.** Rejected as speculative: nobody has asked for
it, and designing erasure around a feature with no requirements produces the
wrong answer confidently. The guard costs little and buys the time to do it
properly.

## Consequences

**Good.** The thing the feature exists to produce — a record of who agreed to
what, and when — cannot be destroyed by the side it inconveniences.

**Good.** The next person to build erasure is handed the problem and the
intended shape of the answer, at the moment they need it, rather than
discovering it in a dispute.

**Bad.** Account deletion is now strictly more work than it was. That is the
trade, and it is worth naming rather than discovering.

**Bad.** Two triggers become four, all enforcing rules that also live in the
service. Storage-layer rules are invisible from the TypeScript, and the only
thing pointing at them is a comment and this record.

**Watch for.** Someone meeting the refusal while building something unrelated —
a test fixture, a cleanup script — and removing the trigger to get past it. The
migration comment should say what it is for, because the error message alone
invites deleting the obstacle.
