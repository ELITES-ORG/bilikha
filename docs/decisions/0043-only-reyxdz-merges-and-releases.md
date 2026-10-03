# 0043. Only reyxdz merges and releases, and a pull request must be ready first

- **Status:** Accepted
- **Date:** 2026-10-03
- **Related:** [0041](./0041-ai-attribution-is-blocked-by-a-hook-not-a-rule.md) ·
  [0042](./0042-main-is-staging-production-is-a-branch.md) ·
  [Open a pull request](../guides/open-a-pull-request.md)

## Context

With staging on `main` and production on its own branch
([ADR 0042](./0042-main-is-staging-production-is-a-branch.md)), more than one
developer can now work on Bilikha. Every change is to be audited before it
merges, and only the repository owner, reyxdz, approves, declines, merges and
releases.

Until now nothing enforced any of that. `main` had no protection at all; the
`production` ruleset blocked force-pushes and deletion but not an ordinary push
by anyone with write access. And a pull request could arrive with an empty
description, no tests and an unexplained lockfile change, leaving the audit to
reconstruct what the author should have said.

Three facts constrain the answer:

- **GitHub cannot stop a pull request being opened.** There is no server-side
  check before one exists, and anything on the author's machine is skippable
  with `--no-verify`. The enforceable point is the merge.
- **Nobody can approve their own pull request.** A rule requiring reyxdz's
  approval, applied to everyone, makes reyxdz's own pull requests unmergeable.
- **A ruleset's bypass list names roles, not people.** reyxdz is the only
  organisation owner and the only repository admin, so "organisation admin"
  means reyxdz — for as long as that stays true.

## Decision

**Two rulesets on `main`.**

| Ruleset | Rules | Bypass |
|---|---|---|
| `main` | Pull request required, review threads resolved; the `check` (CI) and `pr-audit` checks must pass on an up-to-date branch; no force-push, no deletion | **Nobody** |
| `main — reyxdz approves and merges` | Only bypass actors may update the branch; one approval, from the code owner; a push after approval dismisses it | Organisation admin |

So another developer's pull request needs reyxdz's approval as code owner
(`.github/CODEOWNERS` is `* @reyxdz`), and still only reyxdz can merge it.
reyxdz's own pull requests skip the approval they cannot give — but not CI, and
not `pr-audit`, which live in the ruleset nobody bypasses.

**Two rulesets on `production`.** The existing one, which nobody bypasses,
blocks force-pushes and deletion and now also requires `check` to have passed
on the commit being released. A second lets only the organisation admin update
the branch at all.

Neither can require the released commit to be on `main` already — rulesets have
no such rule — so a commit from another branch could be released without ever
being audited. A **Release guard** workflow checks it after every push to
`production` and fails loudly when it is not. It runs after the push, so it
alerts rather than blocks; only reyxdz can release, so what it catches is a
slip, not a bypass.

**A `pr-audit` check.** `scripts/check-pr.mjs` fails a pull request whose
description leaves a template section empty or a box unticked, and whose diff
contains what a ticked box cannot vouch for: a schema change with no migration,
routes changed with no API reference, `env.ts` changed without
`.env.example` and the environment reference, a lockfile changed without its
`package.json`, application code with no test, or a `.env`, scratch or cookie
file. It re-runs when the description is edited.

Each diff rule has a written escape — `No tests: <why>` and the like. Without
one, a strict rule is satisfied with an empty test, which is worse than an
honest exception. The audit judges the reason.

`pr-audit` runs on `pull_request_target`, so it always uses `main`'s copy of
the workflow and of `check-pr.mjs`. Under `pull_request` a pull request runs its
own copy and could edit either to pass itself. The job never executes the pull
request's code — it fetches its commits as objects to list the changed files —
which is what makes `pull_request_target` safe here. A change to the check
therefore takes effect only once merged. CI (`check`) cannot be hardened the
same way, because testing a pull request means running it; a pull request that
touches `.github/` or `scripts/` gets a closer look in the audit.

**A `pre-push` hook** runs typecheck, lint and the docs checks locally. It is
the same answer sooner, not a gate.

## Alternatives considered

**Classic branch protection.** It can restrict pushes to named users, but its
admin enforcement is all-or-nothing: either reyxdz bypasses everything,
including CI, or nothing, and reyxdz's own pull requests need an approval they cannot
give. Splitting the rules across two rulesets with different bypass lists is
what separates "skip the approval" from "skip the checks".

**One ruleset, admin bypass.** Simpler, and it would let reyxdz merge a red
pull request with one checkbox. The checks are only worth having if they bind
the person most likely to be in a hurry.

**Required approval with no bypass.** reyxdz's own pull requests — and any
opened from that account — could never merge without a second maintainer.

**A required review from a bot or AI reviewer.** The audit is a judgement
reyxdz owns; a bot approval would turn it into a formality.

## Consequences

- Nothing merges into `main` or reaches `production` without reyxdz. That is
  the point, and also a single point of failure: while reyxdz is unavailable,
  nothing ships.
- **The bypass follows the role.** Making anyone else an organisation owner
  hands them the same powers. Grant other developers **Write** on the
  repository — enough to push feature branches and open pull requests, and
  nothing on `main` or `production`.
- Other developers currently have Read, which cannot push a branch. They need
  Write, or must open pull requests from forks.
- When reyxdz merges their own pull request, GitHub offers "merge without waiting
  for requirements". It skips only the approval; a failing check still blocks.
- A release now needs CI to have passed on the exact commit: `production`
  accepts only commits `check` has already passed, which every merge commit on
  `main` has.
- `pr-audit` checks completeness, not quality. A description can be complete
  and wrong; the audit is still where that is caught.
