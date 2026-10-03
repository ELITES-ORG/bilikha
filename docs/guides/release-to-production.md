# Release to production

Everything about getting what is on `main` (staging) onto `production` — the
check before, the command, what success and failure look like, and how to
undo it. Only reyxdz can release
([ADR 0043](../decisions/0043-only-reyxdz-merges-and-releases.md)).

---

## The flow, end to end

```
feature branch → pull request into main → main (= staging) → production
```

1. A feature branch becomes a pull request into `main`. CI and `pr-audit` must
   pass, and reyxdz approves and merges — see
   [Open a pull request](./open-a-pull-request.md).
2. Merging deploys **staging** automatically: Vercel `bilikha-staging` and
   Render `bilikha`, with migrations run against the staging database.
3. **Releasing** moves `production` to the commit `main` is on. Vercel `bilikha`
   and Render `bilikha-production` deploy it, with migrations run against the
   production database.

Releases do not have to follow every merge. Several pull requests can collect
on `main`; a release ships **everything on `main` up to that point** — never a
single pull request on its own. So do not merge a pull request into `main` you
are not prepared to ship with the next release.

There is no shortcut past staging, for urgent fixes either. A fast fix is a
small pull request, merged and checked quickly, then released.

---

## Before releasing

### 1. See what will ship

<https://github.com/ELITES-ORG/bilikha/compare/production...main>

Every commit and file that the release will take to production. "There isn't
anything to compare" means production is already up to date — there is nothing
to release.

### 2. Check it on staging

Open <https://bilikha-staging.vercel.app> and use what changed. Staging runs the
same code against its own database; if it is wrong there, it will be wrong in
production.

### 3. Check CI is green on `main`

<https://github.com/ELITES-ORG/bilikha/commits/main> — the top commit has a
green ✓. A red ✗ or a pending dot means wait: `production` accepts only a
commit CI has already passed, so the release would be refused anyway.

### 4. Check what the release needs from the hosts

Read the **Rollout** section of each pull request being released:

- **A new environment variable** must be set on Render `bilikha-production`
  *before* releasing. A required variable that is missing stops the API at
  boot. ([Environment variables](../reference/environment.md).)
- **A migration** runs automatically during Render's build, against production
  data, the moment the release deploys. It was audited as safe on live data and
  has already run on staging — confirm staging is healthy after it.
- **A one-off script** — note when it has to run relative to the release.

---

## Release

From the project folder, in Git Bash:

```bash
cd /c/client_projects/Bilikha
git fetch origin
git push origin origin/main:production
```

(PowerShell: `cd C:\client_projects\Bilikha`, then the same two commands.)

### Success looks like

```
remote: Bypassed rule violations for refs/heads/production:
remote: - Cannot update this protected ref.
To https://github.com/ELITES-ORG/bilikha.git
   4e910a7..1a2b3c4  origin/main -> production
```

The **"Bypassed rule violations"** lines are expected on every release. Only
reyxdz may update `production`, and GitHub reports that the permission was
used. The last line is the release: `production` moved forward.

### If it is refused

| Message | Meaning | Do |
|---|---|---|
| `Required status check "check" is expected` | CI has not passed on that commit yet | Wait for the green ✓ on `main`, then push again |
| `non-fast-forward` / `Cannot force-push` | `production` holds a commit `main` does not | Do **not** force it. See [The release guard failed](#the-release-guard-failed) |
| `Everything up-to-date` | Nothing new on `main` | Nothing to release |
| `Cannot update this protected ref` with **no** "Bypassed" line | The account pushing is not reyxdz | Only reyxdz releases |

---

## After releasing

1. **Release guard** — the newest run at
   <https://github.com/ELITES-ORG/bilikha/actions/workflows/release-guard.yml>
   is green: the released commit is on `main`.
2. **Frontend** — Vercel → project `bilikha` → **Deployments**: a new
   *Production* deployment on the released commit, **Ready**.
3. **API** — only if the release changed `backend/`: Render → workspace
   **Bilikha** → `bilikha-production` → **Events**: a new deploy, **Live**.
   Render skips the build when nothing under `backend/` changed.
4. **The site** — <https://bilikha.vercel.app> loads, and what you checked on
   staging works here too.

The API's health, from a terminal:

```bash
curl -s https://bilikha.vercel.app/api/v1/health/ready
# {"status":"ready","database":"connected"}
```

On the free instance the first request after idle can take a minute; that is a
cold start, not a failed release.

---

## Rolling back

**Frontend** — Vercel → project `bilikha` → **Deployments** → the previous
production deployment → **"…"** → **Promote to Production**. Takes effect in
about a minute.

**API** — Render → workspace **Bilikha** → `bilikha-production` → **Deploys**
(or Events) → the previous deploy → **Rollback**.

**Database — there is no rollback.** A migration that ran stays run; rolling the
API back puts old code on the new schema. That is why every migration must be
safe for the code before it as well as after it — see
[Open a pull request](./open-a-pull-request.md#database-changes). If a
migration itself is wrong, fix forward with a new one.

A rollback is a stopgap. The `production` branch still points at the bad
release, and the next release ships whatever is on `main` — so fix it with a
pull request into `main`, check staging, and release again.

---

## The release guard failed

The guard runs after every push to `production` and fails when the released
commit is not on `main` — it was never audited. The release command above
cannot cause this; only pushing a different ref can. The run's summary repeats
these steps:

1. Roll the frontend (and the API, if it deployed) back, as above.
2. Merge the branch holding that commit into `main` through a pull request,
   with a **merge commit** — not squash or rebase, which would leave that exact
   commit off `main`. If the change should not ship, revert it on `main`
   afterwards.
3. Release from `main` as usual. `production` only moves forward, so this works
   only once `main` contains the stray commit.

---

## Never

- **Never open a pull request from `main` into `production`.** GitHub's merge
  button always creates a new commit — a merge commit, or new copies on squash
  and rebase — that exists only on `production`. The release guard fails on it,
  and the next release is refused as non-fast-forward.
- **Never `--force`.** The ruleset refuses it anyway, for everyone.
- **Never commit to `production` directly**, and never merge *from* it into
  anything.
- **Never push a ref other than `origin/main`** to `production`.

Why a push and not a pull request, and what else was considered:
[ADR 0042](../decisions/0042-main-is-staging-production-is-a-branch.md) and
[ADR 0043](../decisions/0043-only-reyxdz-merges-and-releases.md).

---

## Releasing with Claude Code

Saying **"release"** to Claude Code in this repository runs the checks above
for you: what will ship, CI on `main`, the push, then the release guard, the
Vercel build and the site's health. Checking the change on staging (step 2) is
still yours.
