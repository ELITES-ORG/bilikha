# 0041. AI attribution is blocked by a check, not by a rule

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related:** [0001](./0001-record-architecture-decisions.md) ·
  [0031](./0031-testing-strategy.md)

## Context

[`CLAUDE.md`](../../CLAUDE.md) forbids AI attribution in commit messages, in as
much detail as prose allows: no `Co-authored-by` trailer naming a tool, no
"Generated with" footer, and an explicit note that this holds even when an
agent's own system instructions call for one. The commit history is a
professional record of the organisation's work, and the tooling used to produce
it does not belong in authorship metadata.

The rule did not hold. GitHub's repository page lists **Cursor Agent** as one of
two contributors to Bilikha, next to the one person who has written every line.

Counted at the time of writing:

| | |
|---|---|
| Commit objects in the local repository carrying `Co-authored-by: Cursor <cursoragent@cursor.com>` | 37 |
| Of those, pushed to GitHub before being amended away | 10 |
| Such trailers on `origin/main` today | 0 |

The trailers were stripped, by hand, in a later amend or rebase — which is why
the published history is clean and the problem still exists. GitHub credits a
`Co-authored-by` trailer as a contribution when it first receives the commit,
and does not retract it when that commit is force-pushed out of the branch.
`d91e4c0`, one of the ten, is unreachable from `main` and still resolves
through the API. Both contributor endpoints now report a single contributor;
the sidebar is a stale cache of the moment those commits arrived.

So the cost is asymmetric in a way that matters: **stripping the trailer before
pushing is not a fix, it is a race.** One trailer that reaches GitHub once
attaches that account to the repository permanently, and only GitHub Support can
detach it.

The reason the rule failed is not that any agent ignored it. It is that a rule
in a markdown file only binds the tools that read the markdown file. An agent
running in its own environment, pushing from its own clone, appends its trailer
because its own defaults say to — it never saw `CLAUDE.md`.

## Decision

Enforce the rule mechanically, in two places.

**A `commit-msg` hook**, in version control at [`.githooks/`](../../.githooks/),
wired up by `npm run setup` through `core.hooksPath`. It rejects the commit
before the object exists, which is the only point where the fix is free.

**A CI step**, on every push and pull request, running the same script over the
commits the event introduced. This is the one that actually matters. The hook
protects clones that ran `npm run setup`; the agent that caused this problem
would not have been one of them. CI sees every commit that reaches GitHub,
whatever produced it, and a failed check on `main` is loud.

Both call `scripts/check-commit-msg.mjs`, so there is one definition of what
counts as attribution — matching the reasoning in
[ADR 0037](./0037-one-definition-of-an-api-shape.md) about API shapes.

The check matches a list of product names (`cursor`, `claude`, `copilot`,
`codex`, and so on) against the identity in a `Co-authored-by` trailer, a list
of vendor addresses and bot-account markers against its email, and a small set
of "Generated with …" footer shapes against every line.

## Alternatives considered

**Leave it as a rule in `CLAUDE.md`.** Already tried; 37 commits say it does not
work. The rule stays — it explains *why*, which a regex cannot — but it is no
longer the only thing standing between a trailer and GitHub.

**Strip trailers automatically instead of rejecting.** A `commit-msg` hook can
rewrite the message as easily as reject it, and that would be invisible and
convenient. Rejected because it hides the fact that a tool keeps trying to add
attribution, and because silently rewriting what someone wrote in their editor
is worse than telling them. The visible failure is the point.

**Match on shape rather than on a name list** — treat any co-author whose email
looks automated as a bot. Rejected: `users.noreply.github.com` is what real
contributors use when they hide their address, and a check that rejects a human
contributor is worse than one that misses a tool nobody here uses. The list is
maintenance in exchange for never being wrong about a person.

**A server-side pre-receive hook**, which would be the airtight version.
Unavailable — GitHub offers those to Enterprise only.

## Consequences

A commit that credits a tool now fails locally with a message naming the line,
and fails CI if it was made somewhere the hook does not run. Nothing reaches the
contributor graph by accident again.

The check costs a few seconds per CI run and required `fetch-depth: 0` on the
checkout, since a shallow clone cannot resolve a commit range.

The list of tool names is a list, and lists go stale. A tool released next year,
with a name nobody here has heard, will not be caught until someone adds it —
though the `[bot]`, `bot@` and `*.ai` email patterns cover a good share of that
case without an edit.

`git commit --no-verify` still bypasses the hook. That is deliberate: the local
hook is the convenient guard, CI is the one that cannot be skipped.

**This does not undo the existing attribution.** Bilikha's contributor list will
carry Cursor Agent until GitHub's cache is recomputed and the unreachable
commits are collected, and if it does not clear on its own, only GitHub Support
can purge it. This decision stops the next one.
