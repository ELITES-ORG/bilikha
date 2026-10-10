# 0057. New accounts are verified with a photo of a Biliran ID

- **Status:** Proposed
- **Date:** 2026-10-10
- **Related:** [0020](./0020-location-required-biliran-only.md) ·
  [0021](./0021-image-storage-and-upload-path.md) ·
  [0028](./0028-suspension-is-enforced-per-request.md) ·
  [0051](./0051-an-admin-reset-issues-a-one-time-password.md) ·
  [0008](./0008-publish-immediately-with-tiers.md) ·
  [plan 0053](../plans/0053-id-verification-for-new-accounts.md) ·
  [issue #51](https://github.com/ELITES-ORG/bilikha/issues/51)

## Context

Bilikha is for Biliranons ([0020](./0020-location-required-biliran-only.md)),
but registration takes people at their word: the municipality and barangay they
pick, and the birth date they type. Nothing proves either. Issue #51 (decided by
reyxdz) asks every **new** account for a photo of a Biliran ID, checked by an
administrator, with accounts that already exist left exactly as they are.

A government ID is *sensitive personal information* under RA 10173. Holding one
is a liability in itself, so how it is stored, who can see it and when it goes
matter as much as the check.

## Decision

**Accounts registered after this ships upload an accepted Biliran ID — front and
back for a card, the front only for a single-page document — and stay
browse-only until an administrator verifies it.** The accepted IDs are the
issue's list: government IDs showing a Biliran address, IDs and certificates
issued by a Biliran barangay or municipality, and Biliran school IDs (holder
still 18 or older).

1. **One row per submission** in `id_verifications`. An account's state is its
   latest row; **no row means not required**, which is every existing account.
   Registration writes the first row in the same transaction as the user, so a
   new account can never exist without one. Statuses: `pending`, `verified`,
   `declined_retry`, `declined_final`.
2. **Browse-only is enforced in `requireAuth`**, beside the forced password
   change ([0051](./0051-an-admin-reset-issues-a-one-time-password.md)): while
   the latest row is `pending` or `declined_retry`, every request that is not
   GET/HEAD/OPTIONS answers `403 VERIFICATION_PENDING`, except an exact
   allowlist (the ID routes, setting a password). The state is read from the
   database on every request, as suspension is
   ([0028](./0028-suspension-is-enforced-per-request.md)).
3. **A decline revokes every session at the decision and still tells that
   browser why.** The account's session rows are rewritten in place: the user is
   removed and a `declineNotice` added. The session authenticates nothing from
   that moment; its next request answers `401 ID_DECLINED` with the reason and
   the session is destroyed. *Not from Biliran* ends the account unless an
   appeal succeeds (point 6) — sign-in is refused with the reason, checked only
   after the right password. *Try again* signs in to resubmit the ID only.
4. **IDs live in a separate private bucket**, never the public media bucket.
   Uploads use signed upload URLs scoped to `ids/<userId>/`; size and type are
   enforced by the bucket. The API refuses ID uploads unless the bucket exists,
   is private and has limits. An administrator reads an ID only through an
   admin-only endpoint returning signed URLs valid for 5 minutes, and every view
   and decision writes a `moderation_actions` row naming them. No other response
   carries a key or URL — including to the account itself.
5. **Images are deleted 7 days after the latest decision** — the moment the
   person is told. **There is no deadline for the review itself:** a pending
   submission waits in the queue as long as it takes, and its images are kept
   while it waits. The 7 days are decided when an ID is read, not by the sweep:
   no signed URL is issued for a row decided more than 7 days ago, whether or
   not its images have been deleted yet. A sweep in the API process deletes
   them hourly and on start, and also removes ID objects no row references
   (abandoned uploads, deleted accounts). It needs an always-on instance;
   production moves to one before this is switched on. What stays is the
   outcome, the ID type, who decided and when.
6. **A decision can be reversed or appealed within those 7 days**, while the
   same ID can still be looked at. An administrator may change any decision in
   the window. A person whose ID was declined as *not from Biliran* may appeal
   once, with a short message: they cannot sign in, so the appeal re-checks
   their username and password as sign-in does. An open appeal pauses the
   deletion; whoever decides it, the 7 days start again from that decision.
   Granting an appeal verifies the account; upholding it is final.

## Alternatives considered

- **Delete the sessions outright, as the password reset does.** Revokes them,
  but the open tab then gets a bare 401 and the person never learns why — the
  issue requires the reason on the sign-in screen when the session ends.
- **Store IDs in the media bucket under an unlisted path.** That bucket is
  public: every object has a stable URL. One leaked key would publish an ID.
- **Keep IDs for later disputes.** Indefinite storage of government IDs is the
  liability this design exists to avoid; 7 days covers a second look.
- **An external scheduler for deletion.** One more service and one more
  credential, and GitHub's scheduled workflows run hours late. The sweep runs
  in the API process on an always-on instance, and reads refuse an expired ID
  whatever the sweep has done.
- **No appeal: a final decline is final.** A mistaken *not from Biliran* would
  lock a real Biliranon out for good, with no way to say so.
- **Appeals by email or Messenger.** Outside the record: no audit row, and an
  ID could end up in an inbox.
- **Verify by phone call or in person.** Does not scale beyond a handful of
  registrants and leaves no record.

## Consequences

**Good.** The registry can stand behind "from Biliran, 18 or older" for every
new account, and existing accounts feel nothing. The ID itself is held for
days, seen only by named administrators, and every look is on the record.

**Bad.** Registration gains a step that can fail on a budget phone or a weak
signal, and a new registrant can do nothing but browse until an administrator
gets to them — the queue becomes daily work, and appeals add to it. Deleting
the images depends on the API being awake: on a sleeping free instance the
sweep could run hours late, which is why production must be always-on before
switch-on (an expired ID is unreadable either way). A *not from Biliran*
decline belongs to an account, not a person: someone declined can register
again with other details, and once the images are gone nothing recognises the
same ID (plan 0053, open question 5). Audit rows about an account cascade away
if the account is ever deleted. A request already in flight at the moment of a
decline can, narrowly, re-save its session — the same window the password
reset has; the per-request check still refuses a final decline. Local
development needs a private `ids` bucket, or new registrations stop at the ID
step.

**Decided by reyxdz (2026-10-10):** reyxdz creates the private `ids` bucket on
staging and production, with a 3 MB limit and WebP and JPEG only; the 7 days
start when the decision is made, which is when the person is told; decisions
can be reversed, and appealed, within the 7 days; `CONSENT_VERSION` is bumped
with the privacy notice's ID section.
