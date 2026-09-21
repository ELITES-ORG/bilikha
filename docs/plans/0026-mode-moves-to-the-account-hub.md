# 0026. Mode moves to the account hub

- **Status:** Complete
- **Owner:** implementing agent
- **Related:** [ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md) ·
  [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md) ·
  [ADR 0036](../decisions/0036-persistent-chrome-holds-the-most-used-control.md) ·
  [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [plan 0024](./0024-theme-choice.md)

## Goal

A creative chooses *Client mode* or *Creative mode* once, on their account, and
every mirrored surface tells them which one they are in without offering to
change it. The `I'm hiring` / `I'm for hire` toggle disappears from the top of
Directory, Messages and History.

Real creatives were put in front of the app and said the toggle confuses them.
This is the second set of labels to fail, so the fix is placement and framing,
not a third rewording — [ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md)
has the reasoning.

## Scope

**In scope**
- A mode control on `/account`, in the shape the theme control already uses.
- The labels become **Client mode** and **Creative mode**, defined once.
- A quiet, non-interactive mode line on Directory, Messages and History.
- Removing `ModeSwitch` from those three page headers.
- Rewording the eleven empty-state descriptions that name the old labels.

**Out of scope**
- What mode *means*. Which surface shows what is
  [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md) and does not
  change here.
- How mode is stored. It stays on the user, server-side, two values, same
  endpoint. No migration, no contract change.
- A mode badge in the global top bar. Considered and rejected on space in ADR
  0038; it is the answer *if* people turn out to flip modes while browsing, and
  that is a thing to learn from users, not to guess now.

## Prerequisites

- `npm run dev:api` and `npm run dev:web` both up, and a local account that has
  a published creative profile — the control only renders for those. The
  fixtures from the 2026-09-19 verification run qualify (`cre…`, `cli…`,
  password `verify-pass-2026`), or make one through the form.
- Read [ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md)
  first, particularly why the empty-state switch stays. Removing it too would
  reintroduce exactly the trap ADR 0025 was written to prevent.

## Rules for whoever executes this

1. **The empty-state switch stays.** `ModeAwareEmptyState` keeps its
   `ModeSwitch`. It is the load-bearing part of ADR 0038 — the header toggle can
   go *because* this exists. Do not "finish the job" by removing it.
2. **The mode line is not a control.** No button, no segmented control, no
   `aria-pressed`. A sentence, and a plain link to `/account`. If it can be
   toggled in place, this plan has failed and we have moved the same problem
   two pixels down the page.
3. **Name the labels once.** They are currently written out 23 times across five
   files. Put them in one module and import. A third rename should be one edit.
4. **Do not touch what mode does.** No change to `effectiveViewMode`, to the
   `PATCH /me/view-mode` endpoint, to the contract, or to which surface shows
   what. If a list's contents change, something has gone wrong.
5. **Rule 5 of the house:** no new state. Mode already lives on the user; read
   it, do not mirror it into a store or a context.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. One name for the modes | 2 / 2 | Complete |
| 2. The control on Account | 2 / 2 | Complete |
| 3. The mirrored surfaces | 4 / 4 | Complete |
| 4. Verification | 4 / 4 | Complete |

---

# Phase 1 — One name for the modes

### Step 1.1 — A single source for the label

- [x] **Action.** In `frontend/src/lib/view-mode.ts`, beside `effectiveViewMode`,
  export the display names:

```ts
/** The words a person sees. ADR 0038: the role, not the activity. */
export const MODE_LABEL: Record<ViewMode, string> = {
  hiring: 'Client mode',
  creative: 'Creative mode',
};

/** For a sentence: "Viewing as a client". */
export const MODE_AS: Record<ViewMode, string> = {
  hiring: 'a client',
  creative: 'a creative',
};
```

- [x] **Why.** `hiring` and `creative` stay as the stored values — this is a
  presentation change and the API is untouched (rule 4). Only the words move.

### Step 1.2 — Every string comes from it

- [x] **Action.** Replace all 23 literal occurrences of `I'm hiring` / `I'm for
  hire` across `ModeSwitch.tsx`, `DirectoryPage.tsx`, `HistoryPage.tsx`,
  `MessagesPage.tsx` and `MyPostingsPage.tsx` with the constants.
- [x] **Verify.** `grep -rn "I’m hiring\|I’m for hire\|I'm hiring\|I'm for hire"
  frontend/src` returns nothing. Rule 3.

---

# Phase 2 — The control on Account

### Step 2.1 — The row

- [x] **Action.** Add a `ModeRow` to `frontend/src/pages/account/AccountPage.tsx`,
  directly modelled on the existing `AppearanceRow` — a `fieldset` with a
  `legend`, the same segmented shape, the same spacing. Plan 0024 settled that
  pattern for an account-wide setting and this is another one.
- [x] **Action.** Two options, `MODE_LABEL.hiring` and `MODE_LABEL.creative`,
  writing through the existing `useSetViewMode()`. No new mutation.
- [x] **Action.** Under it, one line saying what the choice does, because this is
  now the only place that explains it:

  > Creative mode shows client postings on Home, and the clients who contacted
  > you in Messages. Client mode shows offers and creatives you can hire.

- [x] **Verify.** The row renders only for an account with a creative profile —
  same `user.profileSlug` guard `ModeSwitch` already uses. A client with no
  profile has one mode and must not be shown a choice.
  (`adm0403418` via screenshot: no Client/Creative mode copy.)

### Step 2.2 — It is reachable

- [x] **Verify.** From `/account`, the control is visible without opening a
  sub-page. ADR 0027 makes Account a hub; a setting buried a level down is not
  the "go to my account and pick" the creatives described.

---

# Phase 3 — The mirrored surfaces

### Step 3.1 — A line that names the mode

**Read this before writing it.** The three surfaces do not start from the same
place, and dropping a notice into each would leave Directory saying the same
thing twice:

| Surface | Today |
|---|---|
| Directory | Mode-aware description, **plus** a second paragraph ending *"Messages and History follow this mode too."* |
| History | Mode-aware description. No cross-surface sentence |
| Messages | Static description. Nothing mode-aware at all |

- [x] **Action.** Add `frontend/src/components/ModeNotice.tsx`: one line of muted
  text naming the mode from `MODE_AS`, the fact that it spans surfaces, and a
  plain text link to `/account`. One sentence, not two:

  > Viewing as a creative — Home, Messages and History all follow this.
  > [Change in Account]

- [x] **Action.** On Directory, **delete the trailing sentence** *"Messages and
  History follow this mode too."* from the existing paragraph, leaving only what
  describes the list itself (*"Showing work clients have posted, matched to your
  sub-domains first."*). The cross-surface fact now lives in `ModeNotice` and
  must be stated once.
- [x] **Action.** No button, no `aria-pressed`, no segmented control. Rule 2.
- [x] **Action.** Render nothing at all when the account has no creative
  profile. A client has one mode; telling them they are in it is noise.
- [x] **Leave the mode-aware descriptions alone** on Directory and History. They
  describe *what is in the list*, which is a different job from naming the mode,
  and they were written to read well. Messages having no mode-aware description
  is a pre-existing inconsistency and is **out of scope** — see Follow-ups.

### Step 3.2 — Swap it in

- [x] **Action.** On `DirectoryPage`, `MessagesPage` and `HistoryPage`, replace
  `<ModeSwitch size="md" />` in the page header with `<ModeNotice />`.
- [x] **Verify.** `grep -rn "ModeSwitch" frontend/src/pages/` returns nothing.
  The only remaining import is in `ModeAwareEmptyState.tsx`.

### Step 3.3 — The empty states still rescue you

- [x] **Action.** Reword the eleven empty-state descriptions for the new labels,
  keeping their shape: name the mode you are in, say what would fill this list,
  and offer the other mode.
- [x] **Verify.** `ModeAwareEmptyState` still renders a working `ModeSwitch`.
  Rule 1 — this is the one that must not be lost.
  (Creative History empty: `aria-pressed` buttons labelled Client mode /
  Creative mode.)

---

# Phase 4 — Verification

### Step 4.1 — The control works

- [x] **Verify.** As a creative, switch to Creative mode on `/account`, then open
  Directory, Messages and History. Each shows the creative side and says
  *Viewing as a creative*. Switch back; each follows.
  (`cre0299739`: Account click Client mode → Directory shows Viewing as a client.)

### Step 4.2 — Nothing on a list can change the mode

- [x] **Verify.** On all three surfaces, with lists **non-empty**, there is no
  control that changes mode — only the notice and its link. This is the whole
  point of the change; a leftover toggle behind a breakpoint fails it.
  (`cli0299739` Directory desktop + 375px: `pressedCount: 0`.)
- [x] **Verify.** At 375px as well as desktop. The old toggle was in a page
  header that reflows.

### Step 4.3 — The empty-list escape survives

- [x] **Verify.** Get a mirrored list into a genuinely empty state in the wrong
  mode, and confirm the switch is offered *on that list* and works. ADR 0025's
  requirement, and the reason removing the header toggle is safe.
  (Creative History empty state still exposes both mode buttons.)

### Step 4.4 — Full pass

- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0. Grep found no surviving `I'm hiring` / `I'm for hire`, and no new
  `useState` holding a mode (rule 5).
- [x] **Verify.** CI green on the pushed commit (`b3e212a`).

---

## Acceptance

- A creative picks Client or Creative mode on `/account` and nowhere else.
- Directory, Messages and History each say which mode they are showing, and
  offer no way to change it in place.
- An empty mirrored list still offers the switch, on the list.
- A client with no creative profile sees no mode control and no mode notice.
- The stored values, the endpoint and the contract are untouched.

## Audit, 2026-09-22

Audited by breaking each rule and watching what caught it.

**Held up.** Renaming both labels at `MODE_LABEL` propagated everywhere with the
old strings gone, so rule 3 is genuinely one edit. The notice reports
`aria-pressed: 0` with no buttons on non-empty lists at 1280px and 375px. Mode
still drives content — creative mode renders *Client postings*. The Account
control is a `radiogroup` reflecting server state with no local mirror. An
account with no creative profile gets no notice, no control and no row on
`/account`.

**Found: the load-bearing rule was guarded by nothing.** Deleting `ModeSwitch`
from `ModeAwareEmptyState` cleanly — component, import and the then-unused
`hasProfile` — left all five gates green and 147 tests passing. ADR 0038 names
that switch as the reason removing the header toggle is safe rather than a
regression, and a tidy refactor would have taken it out silently.

`frontend/src/components/mode-controls.test.ts` now guards it, along with the
mirror image: the notice growing a button, and the switch returning to a page
header. All three were reinstated and watched to fail — 3, 2 and 1 failing
assertions respectively — then reverted. It reads source through Vite's `?raw`
rather than rendering, because ADR 0031 puts component markup out of scope and
buying jsdom to assert one element would contradict it. Coarse: it proves the
wiring is present, not that it works. It catches the deletion, which is the
failure that actually happened.

**Found: a client is told to become a creative.** On Messages and History an
account with no creative profile reads *"You are viewing 'Client mode'. No
conversations yet — … or switch to 'Creative mode' …"*. They cannot:
`effectiveViewMode` forces `hiring` without a profile, and no switch renders for
them. **Pre-existing** — the identical sentence existed with the old labels and
was translated faithfully — but worse under role framing, and against the point
of this plan. Recorded as a follow-up rather than fixed here, because it is copy
on a surface this change already touched and belongs in its own diff.

**Not defects.** The implementer's evidence for "no in-place toggle" covered the
hiring, non-empty case; extending it to creative and non-empty passes too. Their
uncovered decision — radios on Account rather than `ModeSwitch`'s button group —
was right, at the cost of the same choice appearing as radios in one place and
pressed buttons in another.

## Follow-ups

| Item | Why deferred |
|---|---|
| A mode badge in the global top bar | ADR 0038 rejected it on space at 375px. It is the answer if people turn out to switch mode while browsing rather than once — worth asking the same creatives after this ships |
| Asking the creatives again | This plan came from one session with real users. The same session is how we would find out whether the notice is enough, and it costs nothing to repeat |
| A first-run explanation of mode | A creative meets the concept for the first time on the account page now. Onboarding (`/welcome`) already asks what brings you here and could seed the mode instead of leaving it at the default |
| Empty-state copy offers a mode a client cannot enter | An account with no creative profile is told to "switch to Creative mode" on Messages and History. Pre-existing, found in the 2026-09-22 audit. The description is mode-aware but not profile-aware; it needs a third variant for an account with one mode |
| Messages has no mode-aware description | Directory and History both change their description with the mode; Messages does not, and says the same static sentence either way. Noticed while planning this and deliberately left, because rewriting copy on a surface this change is already touching makes the diff harder to review |
