import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { offerImages } from '../../db/schema/index.js';
import { makeCreative, makeOffer, makeUser } from '../../test/factories.js';
import { startOrContinue } from '../conversations/conversations.service.js';
import { listSavedOffers, saveOffer } from '../me/me.service.js';
import { getPublishedBySlug } from '../profiles/profiles.service.js';
import {
  deleteOffer,
  deleteOfferImage,
  getPublishedOfferById,
  listMine,
  listPublishedOffers,
} from './offers.service.js';

/**
 * Audio, video and PDF share `offer_images` with photos (ADR 0046). Storage is
 * a stand-in: deletes are recorded with their full URL, which names the bucket.
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
      if (init?.method === 'DELETE') deleted.push(String(url));
      return new Response('{}', { status: 200 });
    }),
  );
});
afterEach(() => {
  env.SUPABASE_URL = storage.url;
  env.SUPABASE_SERVICE_ROLE_KEY = storage.key;
  vi.unstubAllGlobals();
});

type Kind = 'image' | 'audio' | 'video' | 'document';
type State = 'live' | 'pending_add' | 'pending_remove';

const MIME: Record<Kind, string> = {
  image: 'image/webp',
  audio: 'audio/mpeg',
  video: 'video/mp4',
  document: 'application/pdf',
};

async function insertMedia(
  offerId: string,
  {
    kind,
    state = 'live',
    objectKey,
    thumbKey = null,
    sortOrder = 0,
  }: { kind: Kind; state?: State; objectKey: string; thumbKey?: string | null; sortOrder?: number },
) {
  const [row] = await db
    .insert(offerImages)
    .values({ offerId, kind, state, objectKey, thumbKey, sortOrder, mimeType: MIME[kind], sizeBytes: 1_000 })
    .returning();
  return row!;
}

/** A published offer with an audio item first and one image after it. */
async function offerWithImageAndAudio() {
  const creative = await makeCreative();
  const offer = await makeOffer(creative.profile.id, { title: 'ZZ Mixed media' });
  const p = creative.profile.id;
  await insertMedia(offer.id, { kind: 'audio', objectKey: `offers/${p}/song.mp3`, sortOrder: 0 });
  const image = await insertMedia(offer.id, {
    kind: 'image',
    objectKey: `offers/${p}/photo.webp`,
    thumbKey: `offers/${p}/photo-thumb.webp`,
    sortOrder: 1,
  });
  return { creative, offer, image };
}

describe('image readers', () => {
  it('public image readers never return audio, video or PDF rows', async () => {
    const { creative, offer, image } = await offerWithImageAndAudio();
    const client = await makeUser();
    const onlyTheImage = { id: image.id, url: expect.stringContaining('photo.webp') };

    const card = (await listPublishedOffers({ page: 1, limit: 50 })).data.find((o) => o.id === offer.id)!;
    expect(card.image).toMatchObject(onlyTheImage);

    const detail = await getPublishedOfferById(offer.id);
    expect(detail.images).toHaveLength(1);
    expect(detail.images[0]).toMatchObject(onlyTheImage);

    const onProfile = (await getPublishedBySlug(creative.profile.slug)).offers.find((o) => o.id === offer.id)!;
    expect(onProfile.images).toHaveLength(1);
    expect(onProfile.images[0]).toMatchObject(onlyTheImage);

    await saveOffer(client.id, offer.id);
    const saved = (await listSavedOffers(client.id)).data.find((s) => s.offer.id === offer.id)!;
    expect(saved.offer.image?.url).toContain('photo.webp');

    const started = await startOrContinue(client.id, {
      profileSlug: creative.profile.slug,
      body: 'Hello, I would like to ask about this offer please.',
      offerId: offer.id,
    });
    expect(started.message.offer?.image?.url).toContain('photo.webp');
  });

  it("the owner's images list (listMine) shows images only", async () => {
    const { creative, offer, image } = await offerWithImageAndAudio();

    const mine = (await listMine(creative.user.id)).find((o) => o.id === offer.id)!;
    expect(mine.images.map((i) => i.id)).toEqual([image.id]);
  });
});

describe('non-image media', () => {
  it('the offer page lists live media and hides pending_add from the public', async () => {
    const creative = await makeCreative();
    const offer = await makeOffer(creative.profile.id);
    const p = creative.profile.id;
    const live = await insertMedia(offer.id, {
      kind: 'video',
      objectKey: `offers/${p}/clip.mp4`,
      thumbKey: `offers/${p}/clip-poster.webp`,
    });
    await insertMedia(offer.id, { kind: 'document', state: 'pending_add', objectKey: `offers/${p}/menu.pdf`, sortOrder: 1 });

    const { media } = await getPublishedOfferById(offer.id);
    expect(media).toHaveLength(1);
    expect(media![0]).toMatchObject({
      id: live.id,
      kind: 'video',
      url: `http://storage.test/storage/v1/object/public/media-video/offers/${p}/clip.mp4`,
      posterUrl: `http://storage.test/storage/v1/object/public/media/offers/${p}/clip-poster.webp`,
      mimeType: 'video/mp4',
    });
    expect(media![0]).not.toHaveProperty('state');
  });

  it('the owner sees every media item with its state, and a pending item makes pendingChanges non-null', async () => {
    const creative = await makeCreative();
    const offer = await makeOffer(creative.profile.id);
    const p = creative.profile.id;
    await insertMedia(offer.id, { kind: 'audio', objectKey: `offers/${p}/song.mp3` });

    let mine = (await listMine(creative.user.id)).find((o) => o.id === offer.id)!;
    expect(mine.media.map((m) => m.state)).toEqual(['live']);
    expect(mine.pendingChanges).toBeNull();

    await insertMedia(offer.id, { kind: 'document', state: 'pending_add', objectKey: `offers/${p}/menu.pdf`, sortOrder: 1 });

    mine = (await listMine(creative.user.id)).find((o) => o.id === offer.id)!;
    expect(mine.media.map((m) => [m.kind, m.state])).toEqual([
      ['audio', 'live'],
      ['document', 'pending_add'],
    ]);
    expect(mine.media[1]!.url).toContain('/object/public/media-documents/');
    expect(mine.pendingChanges).not.toBeNull();
  });
});

describe('deleting media', () => {
  it('removing an audio item from a published offer marks it pending_remove and keeps the file', async () => {
    const creative = await makeCreative();
    const offer = await makeOffer(creative.profile.id);
    const audio = await insertMedia(offer.id, { kind: 'audio', objectKey: `offers/${creative.profile.id}/song.mp3` });

    await deleteOfferImage(creative.user.id, audio.id);

    const [row] = await db.select().from(offerImages).where(eq(offerImages.id, audio.id));
    expect(row?.state).toBe('pending_remove');
    expect(deleted).toEqual([]);
  });

  it('deleting an offer deletes each file from its own bucket', async () => {
    const creative = await makeCreative();
    const offer = await makeOffer(creative.profile.id);
    const p = creative.profile.id;
    await insertMedia(offer.id, { kind: 'audio', objectKey: `offers/${p}/song.mp3` });
    await insertMedia(offer.id, {
      kind: 'video',
      objectKey: `offers/${p}/clip.mp4`,
      thumbKey: `offers/${p}/clip-poster.webp`,
      sortOrder: 1,
    });

    await deleteOffer(creative.user.id, offer.id);

    expect(deleted.some((url) => url.includes(`/object/media-audio/offers/${p}/song.mp3`))).toBe(true);
    expect(deleted.some((url) => url.includes(`/object/media-video/offers/${p}/clip.mp4`))).toBe(true);
    expect(deleted.some((url) => url.includes(`/object/media/offers/${p}/clip-poster.webp`))).toBe(true);
  });
});
