# 0024. An offer attaches to a message, not to a conversation

- **Status:** Accepted
- **Date:** 2026-09-17
- **Supersedes:** `conversations.offer_id` and `conversations.subject`, added in
  [plan 0011](../plans/0011-bottom-navigation-and-history.md) and
  [plan 0006](../plans/0006-conversations-and-login-gated-messaging.md)
- **Amends:** [0018](./0018-conversations-replace-one-shot-inquiries.md), which
  gave a conversation a subject
- **Related:** [0022](./0022-offers-replace-portfolio.md) ·
  [0023](./0023-bottom-navigation-on-phones.md)

## Context

[Plan 0011](../plans/0011-bottom-navigation-and-history.md) recorded which offer
an inquiry was about as `conversations.offer_id`. That is the wrong grain.

A conversation is **one per creative per client** — that is what
[0018](./0018-conversations-replace-one-shot-inquiries.md) decided, and it is
right: a person you have dealt with before should be one thread, not a pile of
them. But an offer attached to that thread can only ever name one offer. A
client who asks about Full Stack Package and later about Wedding Coverage
overwrites the first, and History shows only the most recent. The earlier
inquiry is gone with no trace.

Subject has a related problem. It exists because the old inquiry was a one-shot
form that needed a title. In a chat it is a field asking someone to name
something that names itself, before they are allowed to type the actual
question.

## Decision

**The offer attaches to the message.** `messages.offer_id`, nullable. Asking
about two offers leaves two cards in one thread, and nothing overwrites
anything.

**`conversations.offer_id` and `conversations.subject` are both removed.** The
offer reference migrates onto the first client message of each conversation that
has one. Subjects are not migrated; the thread is identified by who it is with
and the offer card inside it.

**An offer page carries two actions: Save and Inquire.** Inquire is primary.

**Inquire opens the thread with the offer card attached to the composer.** The
client types once and sends once; the creative receives a single message
carrying both the offer and the question. Posting the card immediately as its
own message was rejected — it produces threads whose first message is a card
with nothing asked.

**Saved offers are a new `saved_offers` table**, and live inside the History tab
as two segments, *Inquired* and *Saved*. Both answer "offers I am interested
in", so they belong in one place, and the bottom bar has no room for a fifth tab
([0023](./0023-bottom-navigation-on-phones.md)).

**A deleted offer nulls the reference**, as before. The message survives and
says the offer is no longer listed.

## Alternatives considered

**Keep the offer on the conversation.** What plan 0011 shipped. Rejected: it
cannot represent a second inquiry to the same creative, and it fails silently —
the column is simply overwritten, so nothing looks broken.

**One conversation per offer.** Would also preserve every inquiry, and reads
naturally as "a thread about this job". Rejected: it fragments a working
relationship into parallel threads with the same person and re-opens what
[0018](./0018-conversations-replace-one-shot-inquiries.md) settled. A creative
with a repeat client would be juggling four threads to hold one relationship.

**Keep subject and add the offer card.** Least disruptive. Rejected: it makes
the client name a thread the card already names, on the form they are least
motivated to finish.

**Saved as its own bottom tab.** Recommended and declined — four tabs are
already the budget, and inquired and saved are two views of the same question.

## Consequences

**Good.** Every inquiry is preserved, because messages are append-only and a
message is never rewritten. The thread reads like a chat rather than a form. One
less field between a client and asking their question, on the side of the market
that is easiest to lose. History becomes derivable rather than stored.

**Bad.** Existing subjects are lost — the product owner's call, and they are
early inquiries plus test data. The messages list has to identify a thread by
the other person and the last message instead of a title, which is how chat
apps do it but is a visible change to a page people already use.

**Bad.** `saved_offers` is a new table with no reason to change once written,
and nothing tells anyone when a saved offer's price changes or it is taken down.
A saved offer that has been removed is a dead row the client discovers by
tapping it.

**Watch for.** History's *Inquired* list is derived from messages, so a client
who asks about the same offer three times would appear three times unless it is
grouped by offer. Group it, and show the most recent.

**This is the second time the offer-to-conversation relationship has moved.** It
was a follow-up in 0010, a column in 0011, and a message reference here. The
grain is now the same as the thing it describes — an inquiry is an event, and
events belong on messages — so there should be no third move.
