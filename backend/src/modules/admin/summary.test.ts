import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { offerImages, offerRevisions, organizations, ratingReports } from '../../db/schema/index.js';
import {
  makeCompletedAgreement,
  makeConversation,
  makeCreative,
  makeIdVerification,
  makeOffer,
  makeRating,
  makeUser,
  municipalityIdAt,
} from '../../test/factories.js';
import { listContentQueue } from './content-review.service.js';
import { adminSummary } from './summary.service.js';

/**
 * The admin area by subject (ADR 0059): one count per sidebar section, and the
 * content queue split the way those sections show it.
 */

async function waitingOfEveryKind() {
  const live = await makeCreative({ profile: { status: 'published' } });

  // Creatives: one new, one published edit; a plain published one waits for nothing.
  await makeCreative({ profile: { status: 'pending_review' } });
  await makeCreative({ profile: { status: 'published', editedSinceReviewAt: new Date() } });

  // Offers: one new, two changes (text, and a photo), one that waits for nothing.
  const fresh = await makeOffer(live.profile.id, { status: 'pending_review', title: 'ZZ New offer' });
  const edited = await makeOffer(live.profile.id, { title: 'ZZ Edited offer' });
  await db
    .insert(offerRevisions)
    .values({ offerId: edited.id, subdomainId: edited.subdomainId, title: 'ZZ Edited offer, changed' });
  const photographed = await makeOffer(live.profile.id, { title: 'ZZ Photographed offer' });
  await db.insert(offerImages).values({
    offerId: photographed.id,
    objectKey: `offers/${live.profile.id}/a.webp`,
    thumbKey: `offers/${live.profile.id}/a-thumb.webp`,
    state: 'pending_add',
  });
  await makeOffer(live.profile.id, { title: 'ZZ Settled offer' });

  // People: one new photo, one submitted ID and one appeal. An ID step not yet
  // submitted, and an ID already decided, wait for nothing.
  const person = await makeUser({ avatarPendingKey: 'avatars/someone/new.webp' });
  await makeIdVerification((await makeUser()).id, {
    idType: 'drivers_license',
    frontKey: 'ids/a/front.webp',
    backKey: 'ids/a/back.webp',
    submittedAt: new Date(),
  });
  await makeIdVerification((await makeUser()).id);
  await makeIdVerification((await makeUser()).id, {
    status: 'verified',
    submittedAt: new Date(),
    decidedAt: new Date(),
  });
  // And one open appeal, waiting for an answer.
  await makeIdVerification((await makeUser()).id, {
    status: 'appealed',
    submittedAt: new Date(),
    decidedAt: new Date(),
    decisionReason: 'Outside Biliran.',
    appealMessage: 'I moved to Naval last year.',
    appealedAt: new Date(),
  });

  // Organisations: a new page, an edited one, and a logo waiting on a third.
  const municipalityId = await municipalityIdAt(0);
  await db.insert(organizations).values([
    { slug: 'zz-new-org', name: 'ZZ New', municipalityId },
    { slug: 'zz-edited-org', name: 'ZZ Edited', municipalityId, status: 'published', editedSinceReviewAt: new Date() },
  ]);
  const [withLogo] = await db
    .insert(organizations)
    .values({
      slug: 'zz-logo-org',
      name: 'ZZ Logo',
      municipalityId,
      status: 'published',
      logoPendingKey: 'organizations/x/logo.webp',
    })
    .returning();

  // Reports: one open, one already answered.
  const client = await makeUser();
  const conversation = await makeConversation(client.id, live.profile);
  const first = await makeCompletedAgreement(conversation);
  const second = await makeCompletedAgreement(conversation);
  const rating = await makeRating(first.agreement.id, client.id);
  const answered = await makeRating(second.agreement.id, client.id);
  await db.insert(ratingReports).values([
    { ratingId: rating.id, reporterUserId: live.user.id, reason: 'Never happened.' },
    { ratingId: answered.id, reporterUserId: live.user.id, reason: 'Old.', status: 'dismissed' },
  ]);

  return { fresh, edited, photographed, person, withLogo: withLogo! };
}

describe('the admin summary', () => {
  it('counts what waits for a decision under each subject, and nothing that does not', async () => {
    await waitingOfEveryKind();

    expect(await adminSummary()).toEqual({
      creatives: { pending: 1, edited: 1 },
      offers: { new: 1, changes: 2 },
      organizations: { pending: 1, edited: 1, logos: 1 },
      people: { photos: 1, ids: 1, appeals: 1 },
      reports: { open: 1 },
    });
  });

  it('is all zeros when nothing waits', async () => {
    expect(await adminSummary()).toEqual({
      creatives: { pending: 0, edited: 0 },
      offers: { new: 0, changes: 0 },
      organizations: { pending: 0, edited: 0, logos: 0 },
      people: { photos: 0, ids: 0, appeals: 0 },
      reports: { open: 0 },
    });
  });
});

describe('the content queue by subject', () => {
  const ids = async (options: Omit<Parameters<typeof listContentQueue>[0], 'page' | 'limit'>) =>
    (await listContentQueue({ page: 1, limit: 50, ...options })).data.map((row) => `${row.kind}:${row.id}`).sort();

  it('shows one kind, or new offers apart from changes, and agrees with the counts', async () => {
    const waiting = await waitingOfEveryKind();

    expect(await ids({ kind: 'avatar' })).toEqual([`avatar:${waiting.person.id}`]);
    expect(await ids({ kind: 'logo' })).toEqual([`logo:${waiting.withLogo.id}`]);
    expect(await ids({ change: 'new' })).toEqual([`offer:${waiting.fresh.id}`]);
    expect(await ids({ change: 'edit' })).toEqual(
      [`offer:${waiting.edited.id}`, `offer:${waiting.photographed.id}`].sort(),
    );
    // A change filter means offers, whatever kind is asked for.
    expect(await ids({ kind: 'avatar', change: 'new' })).toEqual([`offer:${waiting.fresh.id}`]);

    // Unfiltered, it is still the whole queue.
    const all = await listContentQueue({ page: 1, limit: 50 });
    expect(all.total).toBe(5);
  });
});
