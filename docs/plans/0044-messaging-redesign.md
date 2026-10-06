# 0044. Messaging redesign

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [ADR 0018](../decisions/0018-conversations-replace-one-shot-inquiries.md) ·
  [ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Goal

Messaging reads like the rest of the redesign: an inbox with avatars, bold
unread names and red counts, and threads with day separators, grouped
bubbles and a single composer field. From `lg` it is a split view — the inbox
on the left, the open thread on the right — on the same two URLs.

Presentation and layout only. The thread, send, mark-read, report and block
requests, drafts, offer and posting attachments and the agreement composer
are unchanged; the conversation page's state and handlers are byte-identical
(checksummed before and after).

## Scope

**In scope**
- `pages/MessagesLayout.tsx`: one frame for `/messages` and `/messages/:id`;
  the child route keeps its absolute path.
- `features/conversations/ConversationList.tsx`: the inbox, moved out of the
  removed `MessagesPage.tsx`, with the open thread marked from `lg`.
- `pages/ConversationPage.tsx`: render tree only.
- `components/mode-controls.test.ts`: the ADR 0038 rule (no page mounts the
  mode action) now checks `MessagesLayout.tsx` and `ConversationList.tsx`,
  because the inbox moved.

**Out of scope**
- Messages and Notifications tabs — notifications stay in the header bell.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Routes and layout | 1 / 1 | Done |
| 2. Inbox | 1 / 1 | Done |
| 3. Conversation | 1 / 1 | Done |
| 4. Browser check | 0 / 1 | Not started — needs a signed-in session |

---

## Phase 1 — Routes and layout

### Step 1.1 — Nest the message routes

- [x] **Action.** `App.tsx`: `/messages` → `MessagesLayout` (index:
  `MessagesEmptyPane`, child `/messages/:id` → `ConversationPage`).
- [x] **Verify.** `site-layout.test.ts` passes.

## Phase 2 — Inbox

### Step 2.1 — Move and restyle the list

- [x] **Action.** `ConversationList` with the same query, pagination and empty
  states; active row marked with `aria-current="page"`.
- [x] **Verify.** `mode-controls.test.ts` passes.

## Phase 3 — Conversation

### Step 3.1 — Restyle the thread

- [x] **Action.** Pane header, scrolling body, day separators, grouped
  bubbles, one-field composer with an icon send button.
- [x] **Verify.** The logic block's checksum is unchanged.

## Phase 4 — Browser check

### Step 4.1 — Look at it signed in

- [ ] **Action.** `/messages` and a thread at 360–1920px, light and dark.
- [ ] **Verify.** One pane below 1024px, two from it; the composer is visible
  without scrolling; sending, drafts, attachments, report and block work.

---

## Acceptance

- [x] `npm run typecheck`, `npm run lint`, `npm run docs:check`, tests pass.
- [ ] Checked signed in, at every listed width, in both themes.

## Bundle

First-load CSS measured 17.50 kB gzip against 17.20: the split view and the
new bubble styles live in the one shared stylesheet, which route splitting
cannot shrink. Raised `initialCssGzipBytes` to 17800 in
`frontend/bundle-budget.json`, in its own commit. JS (158.70 / 159.10) fits.

## Follow-ups

None.
