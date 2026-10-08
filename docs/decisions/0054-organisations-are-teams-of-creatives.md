# 0054. Organisations are teams of creatives, founded by one of them

- **Status:** Proposed
- **Date:** 2026-10-08
- **Amends:** [0005](./0005-organization-pages.md), which framed organisations
  mainly as client institutions and forked registration on "yourself, or a
  group/business?"
- **Related:** [0013](./0013-username-password-auth-sprint-1.md) ·
  [0019](./0019-one-account-creative-as-attachable-role.md) ·
  [0049](./0049-the-database-is-the-taxonomy-source-of-truth.md) ·
  issue [#25](https://github.com/ELITES-ORG/bilikha/issues/25)

## Context

[0005](./0005-organization-pages.md) settled that organisations are their own
entity — `organizations` with public pages, `organization_members` for staff —
and not a flag on `users`. It left open who creates one, how it is verified,
what members can do, and whether creative organisations (studios, cooperatives)
and client organisations (LGUs, schools) are the same thing.

Two things it assumed no longer hold. Registration no longer forks: since
[0019](./0019-one-account-creative-as-attachable-role.md) there is one account,
and a creative profile is a role added later. And 0005 wrote for "inquiries",
which conversations replaced in
[0018](./0018-conversations-replace-one-shot-inquiries.md).

The first organisations people actually want are creative teams — a developer
who founds a studio and brings in a QA tester, a filmmaker and an editor working
as one production company. Roughly a fifth of the RA 11904 sub-domains name
exactly this kind of group.

## Decision

**An organisation is a team of creatives.** A creative founds it; other
creatives join it by invitation. It is not an account type: nobody signs in *as*
an organisation, and `users.account_type = 'organization'` is not used for it.

**Founding.** Any account with a published creative profile can found an
organisation and becomes its founder. The page enters review before it is public,
as a creative profile does ([0013](./0013-username-password-auth-sprint-1.md)),
because an organisation name is easier to impersonate than a person's.

**Forte.** The founder picks **one or two** of the nine domains, and within them
**up to five** sub-domains that name the organisation — Gaming Studios, Film
Production Companies, Crafts Cooperatives — the same cap a creative profile has.
They describe what the organisation does — they
drive its page and where it appears in the directory. They do **not** restrict
membership.

**Membership.** A founder invites creatives by username; any creative with a
published profile can be invited, whatever their domains. Nobody is listed until
they accept — an organisation page publishes its members, and RA 10173 needs
their consent for that. An invitation lasts **seven days**; once it expires the
founder can send it again. Each member carries a free-text role title
("Full-stack developer", "QA") shown on the page, because job titles are not
taxonomy and the nine domains are not ours to extend. A person may belong to
**up to five** organisations, counting the ones they founded.

**Roles.** Three, and an organisation has exactly one founder:

- **Founder** — edits the page, picks the domains and sub-domains, invites and
  removes members, and is the only one who can invite or remove **co-founders**.
- **Co-founder** — runs the team alongside the founder: edits the page, invites
  and removes members. Cannot invite co-founders or change the domains and
  sub-domains. There is no limit on how many an organisation has.
- **Member** — listed on the page, and can leave at any time.

**The founder cannot walk away from a team.** A founder who leaves, or deletes
their account, must first hand the founder role to one of the organisation's
co-founders or members. Only an organisation with nobody else in it can lose its
founder without a handover, and it closes with them. An organisation therefore
never exists without a founder.

**Scope of the first release.** A public page and a team: name, logo, bio,
domains, municipality, members with their titles and profile links. A client who
contacts the organisation reaches the founder alone, in an ordinary
conversation; co-founders do not see it.
Messaging, posting offers or signing agreements *as* the organisation come later
and get their own decision.

**Client organisations are deferred.** An LGU or school sharing one account
across its staff is a different problem with a different verification bar —
impersonating "Municipality of Naval" is worse than impersonating a studio. It
is not built on this model by default.

## Alternatives considered

**Organisation as an account type** — sign in as the studio. Rejected for the
reason 0005 gives: a person belongs to several organisations, and an
organisation has several people. It would also mean shared passwords.

**Invite only creatives within the organisation's domains.** Considered and
rejected. The taxonomy has no "QA" or "full-stack developer", so the second
person in the motivating example would have nothing to match. A team's members
legitimately span domains; the domains say what the team sells, not who is on it.

**Exactly two domains.** Rejected: a theatre company or a crafts cooperative has
one, and a forced second makes the page less true.

**Finer roles from the start** (admin, editor, billing). Rejected until acting
on behalf of an organisation exists; until then the founder and co-founder
split covers every privileged action.

**Several equal founders, each able to add more.** Rejected: whoever can add
founders controls the organisation, so that power stays with one person.
Co-founders share the day-to-day work without it, and a team still is not
blocked when the founder is away.

**An admin reassigns an organisation whose founder deleted their account.**
Rejected: it leaves a page in limbo and puts a judgement call on admins. Making
the founder hand over first keeps the decision with the team.

## Consequences

**Good.** Builds on what exists — published profiles, review, conversations —
rather than a second registration path. Creative groups that already work
together can be found as one. Members control their own listing.

**Bad.** One more public surface to moderate, and one more review queue for
admins. Account deletion gains a precondition: the founder of an organisation
with anyone else in it is stopped and sent to hand over first, which the
deletion flow must explain rather than just refuse. Three roles mean three sets
of permission checks. A client's message reaching only the founder makes the
founder a bottleneck for a busy team; sharing it with co-founders is the likely
next step once acting on behalf of an organisation is decided.
`users.account_type` becomes a dead column to remove.
