import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import {
  creativeProfileSubdomains,
  creativeSubdomains,
  moderationActions,
  municipalities,
  offerImages,
  offerRevisions,
  offers,
  organizations,
  users,
} from '../../db/schema/index.js';
import { makeAdmin, makeCreative, makeOffer, makeUser } from '../../test/factories.js';
import { bucketFor } from '../media/media.limits.js';
import { clearAvatar, setAvatar } from '../media/media.service.js';
import { saveOffer, listSavedOffers } from '../me/me.service.js';
import { listNotifications } from '../notifications/notifications.service.js';
import {
  addOfferImage,
  createOffer,
  deleteOfferImage,
  getPublishedOfferById,
  listMine,
  listPublishedOffers,
  updateOffer,
} from '../offers/offers.service.js';
import type { PatchOfferBody } from '../offers/offers.schema.js';
import { getPublishedBySlug } from '../profiles/profiles.service.js';
import { startOrContinue } from '../conversations/conversations.service.js';
import { listContentQueue, reviewContent } from './content-review.service.js';

/** As the admin page does: decide on the version the queue showed. */
async function review(input: Omit<Parameters<typeof reviewContent>[0], 'version'>) {
  const queue = await listContentQueue({ page: 1, limit: 10_000 });
  const row = queue.data.find((item) => item.kind === input.kind && item.id === input.id);
  return reviewContent({ ...input, version: row?.version ?? 'not-in-the-queue' });
}

/**
 * Content review (ADR 0058): nothing new is public until approved, what is
 * public stays public while a change waits, and a rejection always has a reason
 * its owner is told.
 */

/**
 * A stand-in for image storage, so photo changes can be exercised. Deletes are
 * recorded: they show which files a decision throws away.
 */
const storage = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
let deleted: string[] = [];
beforeEach(() => {
  env.SUPABASE_URL = 'http://storage.test';
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
  deleted = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleted.push(decodeURIComponent(String(url).split('/object/media/')[1] ?? ''));
      }
      return new Response('{}', { status: 200 });
    }),
  );
});
afterEach(() => {
  env.SUPABASE_URL = storage.url;
  env.SUPABASE_SERVICE_ROLE_KEY = storage.key;
  vi.unstubAllGlobals();
});

async function creativeWithSlug() {
  const creative = await makeCreative();
  const [registered] = await db
    .select({ slug: creativeSubdomains.slug })
    .from(creativeProfileSubdomains)
    .innerJoin(creativeSubdomains, eq(creativeProfileSubdomains.subdomainId, creativeSubdomains.id))
    .where(eq(creativeProfileSubdomains.profileId, creative.profile.id))
    .limit(1);
  return { ...creative, subdomainSlug: registered!.slug };
}

async function newOffer(title = `ZZ Review ${Math.random().toString(36).slice(2, 8)}`) {
  const creative = await creativeWithSlug();
  const offer = await createOffer(creative.user.id, { title, subdomainSlug: creative.subdomainSlug });
  return { creative, offer };
}

/** An edit with only the fields given, as the API sends it. */
const edit = (userId: string, offerId: string, patch: Partial<PatchOfferBody>) =>
  updateOffer(userId, offerId, patch as PatchOfferBody);

const publicTitles = async () =>
  (await listPublishedOffers({ page: 1, limit: 50 })).data.map((offer) => offer.title);

const own = async (userId: string, offerId: string) =>
  (await listMine(userId)).find((offer) => offer.id === offerId)!;

const imageKeys = (profileId: string, n: number) => ({
  objectKey: `offers/${profileId}/img-${n}.webp`,
  thumbKey: `offers/${profileId}/img-${n}-thumb.webp`,
});

const audioMedia = (profileId: string) => ({
  kind: 'audio' as const,
  objectKey: `offers/${profileId}/song.mp3`,
  mimeType: 'audio/mpeg',
  sizeBytes: 4_000_000,
  durationSeconds: 120,
});

const videoMedia = (profileId: string) => ({
  kind: 'video' as const,
  objectKey: `offers/${profileId}/clip.mp4`,
  thumbKey: `offers/${profileId}/clip-poster.webp`,
  mimeType: 'video/mp4',
  sizeBytes: 40_000_000,
  durationSeconds: 90,
});

describe('a new offer', () => {
  it('is hidden everywhere public until approved, then appears, and its creative is told', async () => {
    const { creative, offer } = await newOffer('ZZ Brand new mural');
    const admin = await makeAdmin();

    expect(offer.status).toBe('pending_review');
    expect(await publicTitles()).not.toContain('ZZ Brand new mural');
    await expect(getPublishedOfferById(offer.id)).rejects.toMatchObject({ status: 404 });
    expect((await getPublishedBySlug(creative.profile.slug)).offers.map((o) => o.title)).not.toContain(
      'ZZ Brand new mural',
    );

    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });

    expect(await publicTitles()).toContain('ZZ Brand new mural');
    expect((await getPublishedOfferById(offer.id)).title).toBe('ZZ Brand new mural');
    const { data } = await listNotifications(creative.user.id, { page: 1, limit: 10 });
    expect(data[0]).toMatchObject({ type: 'offer_approved', link: '/account/offers', detail: 'ZZ Brand new mural' });
  });

  it('needs a reason to reject, stays hidden with that reason shown, and goes back to review when changed', async () => {
    const { creative, offer } = await newOffer('ZZ Mural with a phone');
    const admin = await makeAdmin();

    await expect(
      review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'reject', reason: '   ' }),
    ).rejects.toMatchObject({ status: 400 });
    await review({
      kind: 'offer',
      id: offer.id,
      adminId: admin.id,
      action: 'reject',
      reason: 'Remove the phone number from the title.',
    });

    expect(await own(creative.user.id, offer.id)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Remove the phone number from the title.',
    });
    expect(await publicTitles()).not.toContain('ZZ Mural with a phone');
    const { data } = await listNotifications(creative.user.id, { page: 1, limit: 10 });
    expect(data[0]).toMatchObject({ type: 'offer_rejected', detail: 'Remove the phone number from the title.' });

    await edit(creative.user.id, offer.id, { title: 'ZZ Mural' });
    expect(await own(creative.user.id, offer.id)).toMatchObject({ status: 'pending_review', rejectionReason: null });
    const [audit] = await db.select().from(moderationActions).where(eq(moderationActions.offerId, offer.id));
    expect(audit).toMatchObject({ action: 'rejected', reason: 'Remove the phone number from the title.' });
  });

  it('keeps photos added before approval as part of it, not as a pending change', async () => {
    const { creative, offer } = await newOffer();
    await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 1));

    const [image] = await db.select().from(offerImages).where(eq(offerImages.offerId, offer.id));
    expect(image!.state).toBe('live');
    expect((await own(creative.user.id, offer.id)).pendingChanges).toBeNull();
  });
});

describe('a change to a published offer', () => {
  async function published() {
    const creative = await creativeWithSlug();
    const offer = await makeOffer(creative.profile.id, { title: 'ZZ Published title', priceMinCentavos: 100_000 });
    return { creative, offer };
  }

  it('waits beside the published version, which the public keeps seeing', async () => {
    const { creative, offer } = await published();

    await edit(creative.user.id, offer.id, { title: 'ZZ Edited title' });

    expect(await publicTitles()).toContain('ZZ Published title');
    expect(await publicTitles()).not.toContain('ZZ Edited title');
    expect(await own(creative.user.id, offer.id)).toMatchObject({
      status: 'published',
      title: 'ZZ Published title',
      pendingChanges: { title: 'ZZ Edited title', priceMinCentavos: 100_000 },
    });
  });

  it('replaces the published version when approved', async () => {
    const { creative, offer } = await published();
    const admin = await makeAdmin();
    await edit(creative.user.id, offer.id, { title: 'ZZ Edited title', priceMinCentavos: 150_000 });

    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });

    expect((await getPublishedOfferById(offer.id)).title).toBe('ZZ Edited title');
    expect((await getPublishedOfferById(offer.id)).priceMinCentavos).toBe(150_000);
    expect(await db.select().from(offerRevisions).where(eq(offerRevisions.offerId, offer.id))).toEqual([]);
  });

  it('is dropped when rejected, leaving the published version exactly as it was, with the reason shown', async () => {
    const { creative, offer } = await published();
    const admin = await makeAdmin();
    await edit(creative.user.id, offer.id, { title: 'ZZ Worse title' });

    await review({
      kind: 'offer',
      id: offer.id,
      adminId: admin.id,
      action: 'reject',
      reason: 'The new title names another business.',
    });

    expect((await getPublishedOfferById(offer.id)).title).toBe('ZZ Published title');
    expect(await own(creative.user.id, offer.id)).toMatchObject({
      status: 'published',
      pendingChanges: null,
      revisionRejectionReason: 'The new title names another business.',
    });
    const { data } = await listNotifications(creative.user.id, { page: 1, limit: 10 });
    expect(data[0]).toMatchObject({ type: 'offer_rejected', detail: 'The new title names another business.' });
  });

  it('is withdrawn by an edit back to the published values', async () => {
    const { creative, offer } = await published();
    await edit(creative.user.id, offer.id, { title: 'ZZ Edited title' });
    await edit(creative.user.id, offer.id, { title: 'ZZ Published title' });

    expect((await own(creative.user.id, offer.id)).pendingChanges).toBeNull();
    expect((await listContentQueue({ page: 1, limit: 50 })).data.map((row) => row.id)).not.toContain(offer.id);
  });

  it('holds added photos back and keeps removed ones public until reviewed', async () => {
    const { creative, offer } = await published();
    const admin = await makeAdmin();
    const [kept] = await db
      .insert(offerImages)
      .values({ offerId: offer.id, ...imageKeys(creative.profile.id, 1), state: 'live' })
      .returning();

    await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 2));
    await deleteOfferImage(creative.user.id, kept!.id);

    const states = async () =>
      (await db.select().from(offerImages).where(eq(offerImages.offerId, offer.id)))
        .map((image) => `${image.objectKey.split('/').pop()}:${image.state}`)
        .sort();
    expect(await states()).toEqual(['img-1.webp:pending_remove', 'img-2.webp:pending_add']);

    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });
    expect(await states()).toEqual(['img-2.webp:live']);
    // Only the removed photo's files go.
    const removedKeys = imageKeys(creative.profile.id, 1);
    expect(deleted.sort()).toEqual([removedKeys.objectKey, removedKeys.thumbKey].sort());
  });

  it('puts removed photos back and drops added ones when rejected', async () => {
    const { creative, offer } = await published();
    const admin = await makeAdmin();
    const [kept] = await db
      .insert(offerImages)
      .values({ offerId: offer.id, ...imageKeys(creative.profile.id, 1), state: 'live' })
      .returning();
    await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 2));
    await deleteOfferImage(creative.user.id, kept!.id);

    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'reject', reason: 'Blurry photo.' });

    const rows = await db.select().from(offerImages).where(eq(offerImages.offerId, offer.id));
    expect(rows.map((row) => `${row.objectKey.split('/').pop()}:${row.state}`)).toEqual(['img-1.webp:live']);
    // Only the added photo's files go; the published photo is untouched.
    const addedKeys = imageKeys(creative.profile.id, 2);
    expect(deleted.sort()).toEqual([addedKeys.objectKey, addedKeys.thumbKey].sort());
  });

  it('withdraws a photo that was only waiting at once', async () => {
    const { creative, offer } = await published();
    const added = await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 3));

    await deleteOfferImage(creative.user.id, added.id);

    expect(await db.select().from(offerImages).where(eq(offerImages.offerId, offer.id))).toEqual([]);
    expect((await own(creative.user.id, offer.id)).pendingChanges).toBeNull();
  });

  it('an offer change that adds an audio item is waiting, and approving it makes the item live', async () => {
    const { creative, offer } = await published();
    const admin = await makeAdmin();
    const [audio] = await db
      .insert(offerImages)
      .values({ offerId: offer.id, ...audioMedia(creative.profile.id), state: 'pending_add' })
      .returning();

    expect((await own(creative.user.id, offer.id)).pendingChanges).not.toBeNull();
    expect((await listContentQueue({ page: 1, limit: 50 })).data.map((row) => row.id)).toContain(offer.id);
    expect((await getPublishedOfferById(offer.id)).media).toEqual([]);

    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });

    const [row] = await db.select().from(offerImages).where(eq(offerImages.id, audio!.id));
    expect(row?.state).toBe('live');
    expect((await getPublishedOfferById(offer.id)).media?.map((item) => item.id)).toEqual([audio!.id]);
    expect(deleted).toEqual([]);
  });

  it('rejecting an offer change that added a video discards the video and its poster from their buckets', async () => {
    const { creative, offer } = await published();
    const admin = await makeAdmin();
    const video = videoMedia(creative.profile.id);
    await db.insert(offerImages).values({ offerId: offer.id, ...video, state: 'pending_add' });

    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'reject', reason: 'The clip shows a phone number.' });

    expect(await db.select().from(offerImages).where(eq(offerImages.offerId, offer.id))).toEqual([]);
    const deletedUrls = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => String(url));
    expect(deletedUrls.sort()).toEqual(
      [
        `http://storage.test/storage/v1/object/media-video/${video.objectKey}`,
        `http://storage.test/storage/v1/object/media/${video.thumbKey}`,
      ].sort(),
    );
  });

  it('cannot be reviewed when nothing is waiting', async () => {
    const { offer } = await published();
    const admin = await makeAdmin();
    await expect(
      review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('a decision', () => {
  /** The queue row's version, as the admin page holds it. */
  const versionOf = async (kind: 'offer' | 'avatar', id: string) =>
    (await listContentQueue({ page: 1, limit: 10_000 })).data.find((row) => row.kind === kind && row.id === id)!.version;

  it('is refused when a new offer was edited after the administrator saw it', async () => {
    const { creative, offer } = await newOffer('ZZ Seen version');
    const admin = await makeAdmin();
    const seen = await versionOf('offer', offer.id);

    await edit(creative.user.id, offer.id, { title: 'ZZ Unseen version' });

    await expect(
      reviewContent({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve', version: seen }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await own(creative.user.id, offer.id)).status).toBe('pending_review');
    expect(await publicTitles()).not.toContain('ZZ Unseen version');

    // Reloaded, the administrator sees the edit and can decide on it.
    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });
    expect((await getPublishedOfferById(offer.id)).title).toBe('ZZ Unseen version');
  });

  it('is refused when a change was edited after the administrator saw it, and keeps the newer change', async () => {
    const { creative, offer } = await newOffer('ZZ Published');
    const admin = await makeAdmin();
    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });
    await edit(creative.user.id, offer.id, { title: 'ZZ First change' });
    const seen = await versionOf('offer', offer.id);

    await edit(creative.user.id, offer.id, { title: 'ZZ Second change' });

    await expect(
      reviewContent({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'reject', reason: 'No.', version: seen }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await own(creative.user.id, offer.id)).pendingChanges?.title).toBe('ZZ Second change');
    expect((await getPublishedOfferById(offer.id)).title).toBe('ZZ Published');
  });

  it('is refused when a photo was added after the administrator saw the change', async () => {
    const { creative, offer } = await newOffer();
    const admin = await makeAdmin();
    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });
    await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 1));
    const seen = await versionOf('offer', offer.id);

    await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 2));

    await expect(
      reviewContent({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve', version: seen }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getPublishedOfferById(offer.id)).images).toHaveLength(0);
  });

  it('the version changes when a media item is added, so a stale approval is refused', async () => {
    const { creative, offer } = await newOffer();
    const admin = await makeAdmin();
    await review({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve' });
    await addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 1));
    const seen = await versionOf('offer', offer.id);

    await db
      .insert(offerImages)
      .values({ offerId: offer.id, ...audioMedia(creative.profile.id), state: 'pending_add', sortOrder: 1 });

    expect(await versionOf('offer', offer.id)).not.toBe(seen);
    await expect(
      reviewContent({ kind: 'offer', id: offer.id, adminId: admin.id, action: 'approve', version: seen }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getPublishedOfferById(offer.id)).media).toEqual([]);
  });

  it('is refused when a photo was replaced after the administrator saw it, and deletes nothing', async () => {
    const user = await makeUser({ avatarKey: 'avatars/old/approved.webp' });
    const admin = await makeAdmin();
    await setAvatar(user.id, `avatars/${user.id}/seen.webp`);
    const seen = await versionOf('avatar', user.id);
    await setAvatar(user.id, `avatars/${user.id}/unseen.webp`);
    deleted = [];

    for (const action of ['approve', 'reject'] as const) {
      await expect(
        reviewContent({ kind: 'avatar', id: user.id, adminId: admin.id, action, reason: 'No.', version: seen }),
      ).rejects.toMatchObject({ status: 409 });
    }
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({
      avatarKey: 'avatars/old/approved.webp',
      avatarPendingKey: `avatars/${user.id}/unseen.webp`,
      avatarRejectionReason: null,
    });
    expect(deleted).toEqual([]);
  });
});

describe("a creative's write racing an approval", () => {
  /**
   * Holds the offer's row lock, as the review action does, publishes the offer
   * once `release` is called, and commits. A write started meanwhile must wait
   * and then see the offer as published — not apply on top of it as though it
   * were still waiting.
   */
  async function approveSlowly(offerId: string) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const done = db.transaction(async (tx) => {
      await tx.select({ id: offers.id }).from(offers).where(eq(offers.id, offerId)).for('update');
      locked();
      await held;
      await tx.update(offers).set({ status: 'published', reviewedAt: new Date() }).where(eq(offers.id, offerId));
    });
    await lockTaken;
    return { release, done };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  it('turns an edit into a change waiting for review', async () => {
    const { creative, offer } = await newOffer('ZZ Race original');
    const approval = await approveSlowly(offer.id);

    const editing = edit(creative.user.id, offer.id, { title: 'ZZ Race edit' });
    await settle();
    approval.release();
    await approval.done;
    await editing;

    expect((await getPublishedOfferById(offer.id)).title).toBe('ZZ Race original');
    expect((await own(creative.user.id, offer.id)).pendingChanges?.title).toBe('ZZ Race edit');
  });

  it('keeps a photo added meanwhile out of public view', async () => {
    const { creative, offer } = await newOffer();
    const approval = await approveSlowly(offer.id);

    const adding = addOfferImage(creative.user.id, offer.id, imageKeys(creative.profile.id, 1));
    await settle();
    approval.release();
    await approval.done;
    await adding;

    expect((await getPublishedOfferById(offer.id)).images).toHaveLength(0);
    expect((await own(creative.user.id, offer.id)).images.map((image) => image.state)).toEqual(['pending_add']);
  });
});

describe('an offer that is not approved', () => {
  it('cannot be saved, shared in a conversation, or seen in a saved list', async () => {
    const { creative, offer } = await newOffer();
    const client = await makeUser();

    await expect(saveOffer(client.id, offer.id)).rejects.toMatchObject({ status: 400 });
    await expect(
      startOrContinue(client.id, {
        profileSlug: creative.profile.slug,
        body: 'Hello, I would like to ask about this offer please.',
        offerId: offer.id,
      }),
    ).rejects.toMatchObject({ status: 400 });

    // Saved while public, then hidden: it leaves the list, and returns with it.
    await db.update(offers).set({ status: 'published' }).where(eq(offers.id, offer.id));
    await saveOffer(client.id, offer.id);
    await db.update(offers).set({ status: 'pending_review' }).where(eq(offers.id, offer.id));
    expect((await listSavedOffers(client.id)).data.map((saved) => saved.offer.id)).not.toContain(offer.id);
  });
});

describe('a new profile photo', () => {
  const key = (userId: string, n: number) => `avatars/${userId}/photo-${n}.webp`;

  it('waits in the pending slot while the approved photo stays, and replaces it when approved', async () => {
    const user = await makeUser({ avatarKey: 'avatars/old/approved.webp' });
    const admin = await makeAdmin();

    await setAvatar(user.id, key(user.id, 1));
    let [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ avatarKey: 'avatars/old/approved.webp', avatarPendingKey: key(user.id, 1) });

    await review({ kind: 'avatar', id: user.id, adminId: admin.id, action: 'approve' });
    [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ avatarKey: key(user.id, 1), avatarPendingKey: null });
  });

  it('is dropped when rejected, keeping the approved photo, and its owner is told why', async () => {
    const user = await makeUser({ avatarKey: 'avatars/old/approved.webp' });
    const admin = await makeAdmin();
    await setAvatar(user.id, key(user.id, 1));

    await review({ kind: 'avatar', id: user.id, adminId: admin.id, action: 'reject', reason: 'Not a photo of you.' });

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({
      avatarKey: 'avatars/old/approved.webp',
      avatarPendingKey: null,
      avatarRejectionReason: 'Not a photo of you.',
    });
    const { data } = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(data[0]).toMatchObject({ type: 'avatar_rejected', detail: 'Not a photo of you.', link: '/account/profile' });

    // The next upload clears the reason.
    await setAvatar(user.id, key(user.id, 2));
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after!.avatarRejectionReason).toBeNull();
  });

  it('is withdrawn first when its owner removes a photo, and the approved one after', async () => {
    const user = await makeUser({ avatarKey: 'avatars/old/approved.webp' });
    await setAvatar(user.id, key(user.id, 1));

    expect(await clearAvatar(user.id)).toMatchObject({ removed: 'pending' });
    expect(await clearAvatar(user.id)).toMatchObject({ removed: 'approved' });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ avatarKey: null, avatarPendingKey: null });
  });
});

describe('the queue', () => {
  it('holds new offers, changes, photos and logos, each saying what it is', async () => {
    const { offer: fresh } = await newOffer('ZZ Queue new');
    const creative = await creativeWithSlug();
    const live = await makeOffer(creative.profile.id, { title: 'ZZ Queue live' });
    await edit(creative.user.id, live.id, { title: 'ZZ Queue live, edited' });
    const photographer = await makeUser({ avatarPendingKey: 'avatars/p/pending.webp' });
    const [organization] = await db
      .insert(organizations)
      .values({
        slug: `zz-queue-${Date.now()}`,
        name: 'ZZ Queue Studio',
        municipalityId: (await db.select({ id: municipalities.id }).from(municipalities).limit(1))[0]!.id,
        logoPendingKey: 'organizations/x/pending.webp',
      })
      .returning();

    const { data } = await listContentQueue({ page: 1, limit: 50 });
    const byId = new Map(data.map((row) => [row.id, row]));

    expect(byId.get(fresh.id)).toMatchObject({ kind: 'offer', change: 'new', title: 'ZZ Queue new' });
    expect(byId.get(live.id)).toMatchObject({
      kind: 'offer',
      change: 'edit',
      title: 'ZZ Queue live, edited',
      published: { title: 'ZZ Queue live' },
    });
    expect(byId.get(photographer.id)).toMatchObject({ kind: 'avatar' });
    expect(byId.get(organization!.id)).toMatchObject({ kind: 'logo', ownerName: 'ZZ Queue Studio' });
  });

  it('the queue lists an added audio item with its kind, size and length', async () => {
    const creative = await creativeWithSlug();
    const offer = await makeOffer(creative.profile.id, { title: 'ZZ Queue audio' });
    const photo = imageKeys(creative.profile.id, 1);
    const audio = audioMedia(creative.profile.id);
    await db.insert(offerImages).values([
      { offerId: offer.id, ...photo, sortOrder: 1, state: 'live' },
      { offerId: offer.id, ...audio, title: 'Demo song', sortOrder: 0, state: 'pending_add' },
    ]);

    const row = (await listContentQueue({ page: 1, limit: 50 })).data.find((item) => item.id === offer.id);

    const storageUrl = (bucket: string, key: string) => `http://storage.test/storage/v1/object/public/${bucket}/${key}`;
    expect(row?.images).toEqual([
      expect.objectContaining({
        kind: 'audio',
        state: 'pending_add',
        url: storageUrl(bucketFor('audio'), audio.objectKey),
        thumbUrl: null,
        title: 'Demo song',
        mimeType: 'audio/mpeg',
        sizeBytes: 4_000_000,
        durationSeconds: 120,
      }),
      expect.objectContaining({ kind: 'image', state: 'live', thumbUrl: storageUrl(bucketFor('image'), photo.thumbKey) }),
    ]);
    // The row's own cover is still a photo, never the audio file.
    expect(row?.url).toBe(storageUrl(bucketFor('image'), photo.objectKey));
  });

  it('puts an offer with contact details first', async () => {
    const { offer: plain } = await newOffer('ZZ Plain offer');
    const creative = await creativeWithSlug();
    const flagged = await createOffer(creative.user.id, {
      title: 'ZZ Call me',
      description: 'Message me on 09171234567 for rates.',
      subdomainSlug: creative.subdomainSlug,
    });

    const ids = (await listContentQueue({ page: 1, limit: 50 })).data.map((row) => row.id);
    expect(ids.indexOf(flagged.id)).toBeLessThan(ids.indexOf(plain.id));
  });
});

describe('shipping the change', () => {
  it('hides what was never reviewed and keeps what was', async () => {
    const creative = await makeCreative();
    const reviewed = await makeOffer(creative.profile.id, { status: 'pending_review', reviewedAt: new Date() });
    const unreviewed = await makeOffer(creative.profile.id, { status: 'pending_review', reviewedAt: null });
    const neverReviewed = await makeUser({ avatarKey: 'avatars/a/unreviewed.webp', avatarReviewedAt: null });
    const approved = await makeUser({ avatarKey: 'avatars/b/approved.webp', avatarReviewedAt: new Date() });

    // The backfill itself, as it ships.
    const migration = readFileSync(
      new URL('../../../drizzle/0038_hide_unreviewed_content.sql', import.meta.url),
      'utf8',
    );
    for (const statement of migration.split('--> statement-breakpoint')) {
      const text = statement.replace(/^\s*--.*$/gm, '').trim();
      if (text) await db.execute(sql.raw(text));
    }

    const status = async (id: string) =>
      (await db.select({ status: offers.status }).from(offers).where(eq(offers.id, id)))[0]!.status;
    expect(await status(reviewed.id)).toBe('published');
    expect(await status(unreviewed.id)).toBe('pending_review');
    const [a] = await db.select().from(users).where(eq(users.id, neverReviewed.id));
    const [b] = await db.select().from(users).where(eq(users.id, approved.id));
    expect(a).toMatchObject({ avatarKey: null, avatarPendingKey: 'avatars/a/unreviewed.webp' });
    expect(b).toMatchObject({ avatarKey: 'avatars/b/approved.webp', avatarPendingKey: null });
  });
});
