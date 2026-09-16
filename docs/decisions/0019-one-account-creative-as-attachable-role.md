# 0019. One account; creative is a role you add

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** the two-registration-forms approach built in
  [plan 0001](../plans/0001-registration-and-auth.md) and
  [plan 0004](../plans/0004-client-accounts-and-inquiries.md), and the chooser
  proposed in [plan 0006](../plans/0006-conversations-and-login-gated-messaging.md)
- **Related:** [0004](./0004-unified-account-model.md) ·
  [0017](./0017-sign-in-before-contacting.md)

## Context

[0004](./0004-unified-account-model.md) decided that there is one `users` table
and that a creative profile is an **optional attachable role**. The schema
implements that faithfully: `creative_profiles` is a nullable one-to-one, and
the auth layer has always tolerated a user without one.

The interface never matched. Registration was built as two separate forms — a
fifteen-field creative form at `/register`, and a seven-field client form buried
inside the inquiry composer. [0015](./0015-clients-register-through-the-inquiry-flow.md)
moved the client form, [0017](./0017-sign-in-before-contacting.md) moved it back
out, and [plan 0006](../plans/0006-conversations-and-login-gated-messaging.md)
proposed a chooser in front of both. Three revisions, all working around the
same mismatch.

The mismatch has a concrete cost. `insert(creativeProfiles)` exists in exactly
one place — registration — so **a client can never become a creative.** Someone
who signs up to hire a photographer and later starts selling their own woodwork
needs a second account. [0004](./0004-unified-account-model.md) argued
specifically against that: in a province this size the same people appear on
both sides constantly.

## Decision

**Registration creates a base account. Nothing else.** One short form — name,
username, email, phone, date of birth, password, consent. No municipality, no
sub-domains, no branching. Every account starts here.

**Intent is asked immediately after, not before.** A single question — hire, or
offer your work — and choosing to offer work **continues straight into profile
setup in the same flow**. No dashboard in between.

**An account with no creative profile can add one at any time**, from the
account area. This is the same profile-setup step, reached later.

**Users with a creative profile get a mode switch** between their client view
and their creative dashboard.

**A creative can also hire.** They are a base account with a profile attached,
so Contact works for them like anyone else. No special-casing, and it is what
[0004](./0004-unified-account-model.md)'s reasoning requires.

Moderation is unchanged: the **profile** enters `pending_review`, not the
account. Base accounts are active immediately.

## Alternatives considered

**Keep two registration forms.** What exists. Rejected: duplicated validation and
copy, three revisions of where to put the client form, and it leaves the
client-to-creative gap permanently open.

**A chooser before registration**, as [plan 0006](../plans/0006-conversations-and-login-gated-messaging.md)
proposed. Rejected: it forces a decision before the person has any investment,
and still produces two forms behind it. Asking after registration costs nothing
and the answer is better informed.

**One long form with conditional fields.** Fewest steps. Rejected on constraint
3 — budget Android over metered data, where a fifteen-field page that loses its
state on a dropped connection is a real failure mode. Two short steps are
resumable; one long one is not.

**Store the declared intent** so a creative who drops out of profile setup can
be chased. Rejected as unnecessary: a user with no creative profile always sees
an "offer your work" path, which covers the dropout and the later-decider with
one mechanism instead of a column and a prompt.

## Consequences

**Good.** One registration form. The interface finally expresses the data model
instead of working around it. The client-to-creative path exists by construction
rather than as a feature someone has to build. A creative who abandons profile
setup still has an account and can be recovered — today they are simply gone.

**Bad, and [0004](./0004-unified-account-model.md) named this risk.** A creative
now takes two steps where they took one, and supply is the bottleneck. The
warning was explicit: *sign up → land on empty dashboard → hunt for "become a
creative" → fill twelve fields* bleeds registrants at every seam.

**That failure mode is avoided by continuation, not by intent.** If profile
setup ever stops flowing directly out of registration — if it becomes a link, a
banner, or something on a dashboard — this decision becomes the thing 0004
warned about. The plan implementing it must treat the continuous flow as the
requirement, not the two-step structure.

**Watch for.** Accounts with no creative profile and no inquiries sent are the
signal that the continuation is broken. That population should be near zero; if
it grows, people are falling through the seam.
