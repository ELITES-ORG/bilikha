# 0016. Edits never un-publish; public edits flag for re-review

- **Status:** Accepted
- **Date:** 2026-09-16
- **Related:** [0008](./0008-publish-immediately-with-tiers.md) ·
  [0013](./0013-username-password-auth-sprint-1.md)

## Context

Profiles are reviewed before publishing, because
[0013](./0013-username-password-auth-sprint-1.md) removed phone verification and
with it the spam floor. That works for registration, which happens once.

Editing does not happen once. A creative will fix a typo, rewrite a bio, add a
sub-domain, change how they want to be contacted. Applying the registration rule
to every edit creates an obvious failure: a published creative fixes a spelling
mistake and disappears from the directory until someone reviews them. Do that
twice and they stop editing, which leaves the directory full of the thin,
never-updated profiles that make it look abandoned.

The opposite is also real. A profile approved with clean content can be rewritten
the moment it is published. `bio` is free text on a public page, and the account
that wrote it cost nothing to create.

The awkward part is that the highest-risk field is the one we most want people to
use. A bio is what makes a profile worth reading; it is also the obvious place to
put spam.

## Decision

**No edit ever un-publishes a profile.** Instead, an edit that changes anything
publicly visible sets `edited_since_review_at`, and the profile appears in an
**Edited** tab in the admin queue while staying live.

Three cases:

| Profile state | On edit |
|---|---|
| `published` | Stays published. Flagged for re-review |
| `suspended` (rejected at registration) | Returns to `pending_review` |
| `pending_review` / `draft` | No change — already queued |

**Edits to things the public never sees do not flag anything.** Changing
`contactPreference` or a password is not a moderation event.

A rejected profile returning to `pending_review` is not an exception to the rule
— it was never published, so there is nothing to un-publish. It is also what
makes rejection recoverable, which it currently is not.

## Alternatives considered

**Every edit re-enters review.** Consistent with registration and easy to
explain. Rejected: it makes the directory flicker, punishes exactly the
behaviour we want, and generates a moderation queue that scales with edits
rather than with risk. The predictable outcome is that nobody edits and nobody
reviews.

**No review on edit at all.** Simplest, and matches what most directories
actually do. Rejected: it means approve-then-deface works, on a public page, at
zero cost to the attacker.

**A field-level taxonomy — "material" edits re-review, "cosmetic" ones do not.**
This was the first instinct and it is worse than it looks. Every new field
becomes a judgement call, the classification drifts as people add fields without
thinking about it, and the argument about which bucket a field belongs in is
unresolvable because it depends on intent rather than on the field. One rule
keyed on "is this publicly visible" needs no maintenance.

**Holding edits as a pending diff** until approved, showing the old version
publicly. Genuinely good, and how larger platforms do it. Rejected as far too
much machinery for this stage: it needs versioned profiles, a diff view, and a
merge path.

## Consequences

**Good.** The directory never loses content to moderation. One rule, keyed on a
property of the field rather than on a judgement about it. Admins keep oversight
without being on the critical path of a typo fix. Rejection stops being a dead
end.

**Bad, and this is the real cost.** A defaced bio is publicly visible until an
admin looks at the Edited tab. There is currently **no report button**, so
discovery depends entirely on an admin checking that queue. Until reporting
exists, this decision trades a guaranteed delay for an unbounded one.

The Edited queue also has no natural end. Nothing forces an admin to clear it, so
it needs an explicit acknowledge action and will grow silently if ignored — a
metric worth watching rather than a problem to solve now.

**Revisit** when either a report button exists, or the first defaced profile
appears. The second is the cheaper teacher only if someone is watching the
queue.
