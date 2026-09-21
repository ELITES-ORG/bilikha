# 0033. Layout and grouping review

- **Status:** Draft — collecting findings screen by screen. **Do not execute
  yet**; the registrant is reviewing further screens so the changes can land as
  one pass rather than a trickle of small diffs.
- **Owner:** unassigned
- **Related:** [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md) ·
  [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md) ·
  `frontend/DESIGN.md`

## Goal

Structure, grouping and layout across the app's screens, reviewed together and
changed once. Copy and behaviour are out of scope unless a grouping decision
forces them.

## How this document works

One section per screen. Each records **what is there now**, **what is wrong**,
and **what to do** — the last being a recommendation, not yet an instruction.
The plan stays in Draft until the review is finished, at which point the
sections become phases and the recommendations become steps.

Reviewing several screens before changing any is the point: a grouping rule that
only fits one page is not a rule, and the value here is consistency.

---

## Screen 1 — `/account` (reviewed 2026-09-22)

### What is there now

Seven rows in one flat, hairline-separated list:

| Row | Kind | Summary shown |
|---|---|---|
| Profile | link | `1 sub-domain · Published` — a state |
| Offers | link | `1 of 6 used` — a quota |
| How your work is doing | link | `Reply to an inquiry` — **an action** |
| Your postings | link | `None yet` — an absence |
| Security | link | `Password and sign out` — its contents |
| Appearance | **inline control** | radio group |
| Mode | **inline control** | radio group + three lines of explanation |

### What is wrong

**Two interaction models, one undifferentiated list.** Five rows navigate and
carry a chevron; two change something in place. They get identical visual
treatment, so nothing tells you which is which until you read it.

**No categorisation.** The seven are three species: what other people see
(Profile, Offers, Postings), a report (How your work is doing), and settings
(Security, Mode, Appearance). Seven undifferentiated rows is at the edge of
scannable; 3 + 1 + 3 under headings is not.

**Mode is last and wordiest.** The control the creatives have now flagged twice
sits at the bottom with a three-line explanation, longer than any other row's
summary. `ModeNotice` and the empty-state button already explain mode in
context, where it is needed.

**The page description is no longer true.** *"Keep your public details and
sign-in security up to date"* predates the work report, the mode switch and the
theme choice.

**The summary column has no consistent grammar** — a state, a quota, an action,
an absence, a description of contents. The action is the odd one and is
[ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md)
working as intended; grouping fixes the scanning problem for free by putting it
alone under its own heading.

### What to do

Three headed groups, with the inline controls under *Settings* where switches
are expected:

```
WHAT PEOPLE SEE
  Profile          1 sub-domain · Published   >
  Offers           1 of 6 used                >
  Your postings    None yet                   >

HOW IT'S GOING
  How your work is doing   Reply to an inquiry >

SETTINGS
  Mode         ( Client mode )( Creative mode )
  Appearance   ( System )( Light )( Dark )
  Security     Password and sign out          >
```

Then: move Mode above Appearance and cut its explanation; rewrite the page
description to match what the page holds.

### Already done

[ADR 0027](../decisions/0027-account-is-a-hub.md)'s test for what may sit on the
hub was worded as *"loads nothing and saves nothing"*, which Mode fails — it
saves. The reasoning underneath is about what the page has to **load**, and Mode
adds no query and no form. The test was corrected in place on 2026-09-22 so that
nobody "fixes" Mode by moving it off the hub.

---

## Screen 2 — `/account/profile` (reviewed 2026-09-22)

### What is there now

One form, 3.2 screens tall at 390x800, with a single `Save profile` at the
bottom (y=2439) disabled until the form is dirty. Five headed sections:

| Section | Fields | Actually published? |
|---|---|---|
| Photo | avatar | **yes** |
| Name | first, middle, last, suffix | **yes — all four** |
| Public profile | display name, bio, what you do (9-domain accordion), primary craft | **yes** |
| Location | municipality, barangay | municipality **yes**, barangay **no** |
| Contact preference | phone / email choice | **no** — governs what is revealed inside a conversation |

Verified against the contracts: `PublicProfile` returns `displayName`,
`fullName`, `bio`, `avatarUrl`, `municipality`, `subdomains`, `memberSince`, and
`formatFullName` joins first + middle + last + suffix. `barangaySlug` appears
only in `contracts/me.ts` and the taxonomy — never in a public shape.

### What is wrong

**The headings misrepresent what is public, and that is the serious one.** Only
one of five sections is labelled *Public profile*, while four of them contain
published fields. A creative reading this page can reasonably conclude that
their middle name and suffix are private. They are not — both are joined into
the `fullName` every directory card and profile page shows.

[Constraint 7](../explanation/constraints.md) names **per-field visibility** as
an RA 10173 obligation, not a nicety. Grouping that implies the wrong answer to
*"what will people see?"* is the one structural problem on this page that is not
merely cosmetic.

**Two save models, undifferentiated.** The photo uploads immediately; everything
else waits for `Save profile`. Nothing on the page marks the difference, so a
creative who changes their photo and leaves without saving has changed their
photo, and one who edits their bio and leaves has not.

**Save is never on screen while you edit.** It sits at the bottom of a 3.2-screen
form. Correctly disabled until dirty, but a person cannot see whether their edit
registered without scrolling to the end.

**The review notice is only at the bottom.** *"Your profile stays visible while
public changes are reviewed"* sits directly above Save — the right place for
whoever reaches it, and invisible to whoever edits their name and stops.

**Three levels of grouping.** *Primary craft* is a fieldset inside the *What you
do* accordion inside the *Public profile* section. The accordion is also the
heaviest interaction on the page and sits beside plain text inputs under one
heading.

**Contact preference is a privacy control, not a profile field.** It decides
what is revealed inside a conversation. It is the same species as Security, not
the same species as Bio.

### What to do

**Group by visibility, because that is both the user's question and the legal
requirement:**

```
SHOWN ON YOUR PUBLIC PROFILE
  Photo
  Name            first · middle · last · suffix   (all four appear)
  Display name
  Bio
  What you do     + primary craft
  Municipality

NOT SHOWN PUBLICLY
  Barangay        used for nearby-first ordering only
  Contact preference   which detail you share inside a conversation
```

Where a former section splits across the line — Location does — say so per
field rather than moving the fields apart from each other.

Then: mark the photo as saved immediately, or fold it into `Save profile`; put
the review notice where an editor sees it before reaching the end; and give the
form a save affordance that is reachable without scrolling to the bottom.

---

## Screens still to review

The registrant is working through the app. Add a section per screen in the same
shape, then convert the whole document into phases.

- [ ] *(awaiting review)*

---

## Out of scope for this review

- What any screen *does*. This is arrangement, not behaviour.
- Copy, except where a grouping decision makes a sentence wrong — the account
  page description is the one example so far.
- [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md)'s
  decision that the hub row carries a next action. That is deliberate and the
  grouping accommodates it rather than removing it.

## Follow-ups

| Item | Why deferred |
|---|---|
| Asking the creatives about mode a third time | Two rounds of changes have come from their feedback. If the grouping lands, that is the moment to check whether it finally reads clearly |
