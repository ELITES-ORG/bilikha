import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { PublishedOfferDetail } from '../../contracts/offers.js';
import type { PublicProfileDetail } from '../../contracts/profiles.js';
import { makeCreative, makeOffer, suspend } from '../../test/factories.js';
import {
  clip,
  escapeHtml,
  formatPriceRange,
  offerCard,
  profileCard,
  siteOrigin,
} from './share.service.js';

/** The value of one `<meta>` in a rendered card, or null when it is absent. */
function meta(html: string, key: string): string | null {
  const match = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return match ? match[1]! : null;
}

describe('link-preview cards, through the real app (ADR 0056)', () => {
  let server: Server;
  let base: string;
  const site = siteOrigin();

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/share`;
  });

  afterAll(() => {
    server.close();
  });

  it('describes a published profile, linking to its own page', async () => {
    const { profile } = await makeCreative({ profile: { displayName: 'Juana Reyes' } });

    const response = await fetch(`${base}/creatives/${profile.slug}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
    expect(response.headers.get('vary')).toMatch(/User-Agent/i);
    expect(meta(html, 'og:title')).toMatch(/^Juana Reyes · /);
    expect(meta(html, 'og:url')).toBe(`${site}/creatives/${profile.slug}`);
    expect(meta(html, 'og:type')).toBe('profile');
  });

  it('falls back to the default image when the creative has no photo', async () => {
    const { profile } = await makeCreative();

    const html = await (await fetch(`${base}/creatives/${profile.slug}`)).text();

    expect(meta(html, 'og:image')).toBe(`${site}/og-default.png`);
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
  });

  it('gives a suspended creative the generic card, naming nothing', async () => {
    const { user, profile } = await makeCreative({ profile: { displayName: 'Hidden Person' } });
    await suspend(user.id);

    const response = await fetch(`${base}/creatives/${profile.slug}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain('Hidden Person');
    // The shared link stays its own canonical URL, or Facebook follows og:url
    // off to the home page and never shows this card.
    expect(meta(html, 'og:url')).toBe(`${site}/creatives/${profile.slug}`);
    expect(meta(html, 'og:image')).toBe(`${site}/og-default.png`);
    expect(meta(html, 'og:title')).toBe('Bilikha — Biliran Creative Industries Registry');
  });

  it('gives an unpublished profile and an unknown slug the generic card', async () => {
    const { profile } = await makeCreative({
      profile: { status: 'pending_review', displayName: 'Not Yet Approved' },
    });

    const pending = await (await fetch(`${base}/creatives/${profile.slug}`)).text();
    const unknown = await (await fetch(`${base}/creatives/nobody-here`)).text();

    expect(pending).not.toContain('Not Yet Approved');
    expect(meta(pending, 'og:title')).toBe('Bilikha — Biliran Creative Industries Registry');
    expect(meta(pending, 'og:url')).toBe(`${site}/creatives/${profile.slug}`);
    expect(meta(unknown, 'og:url')).toBe(`${site}/creatives/nobody-here`);
  });

  it("describes a published offer with its price, and hides a suspended creative's", async () => {
    const { user, profile } = await makeCreative({ profile: { displayName: 'Ana Cruz' } });
    const offer = await makeOffer(profile.id, {
      title: 'Wedding photography',
      priceMinCentavos: 300_000,
      priceMaxCentavos: null,
    });

    const html = await (await fetch(`${base}/offers/${offer.id}`)).text();
    expect(meta(html, 'og:title')).toBe('Wedding photography');
    expect(meta(html, 'og:description')).toMatch(/^From ₱3,000 · Ana Cruz, /);
    expect(meta(html, 'og:url')).toBe(`${site}/offers/${offer.id}`);
    expect(meta(html, 'og:image')).toBe(`${site}/og-default.png`);

    await suspend(user.id);
    const hidden = await (await fetch(`${base}/offers/${offer.id}`)).text();
    expect(hidden).not.toContain('Wedding photography');
    expect(meta(hidden, 'og:title')).toBe('Bilikha — Biliran Creative Industries Registry');
    expect(meta(hidden, 'og:url')).toBe(`${site}/offers/${offer.id}`);
  });

  it('escapes a title rather than letting it write markup', async () => {
    const { profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { title: 'Tom & "Jerry" <b>bold</b>' });

    const html = await (await fetch(`${base}/offers/${offer.id}`)).text();

    expect(html).not.toContain('<b>bold</b>');
    expect(meta(html, 'og:title')).toBe('Tom &amp; &quot;Jerry&quot; &lt;b&gt;bold&lt;/b&gt;');
  });

  it('answers a malformed offer id with the generic card, not an error', async () => {
    const response = await fetch(`${base}/offers/not-a-uuid`);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(meta(html, 'og:title')).toBe('Bilikha — Biliran Creative Industries Registry');
    expect(meta(html, 'og:url')).toBe(`${site}/offers/not-a-uuid`);
  });
});

describe('link-preview card contents', () => {
  const site = 'https://bilikha.vercel.app';

  const profile: PublicProfileDetail = {
    slug: 'juan',
    displayName: null,
    fullName: 'Juan Dela Cruz',
    bio: null,
    avatarUrl: 'https://storage.example/avatars/juan.webp',
    municipality: 'Naval',
    subdomains: [
      { slug: 'photo', name: 'Photographers', domain: 'Audiovisual Media', isPrimary: false },
      { slug: 'film', name: 'Filmmakers', domain: 'Audiovisual Media', isPrimary: true },
    ],
    memberSince: '2026-10-01T00:00:00.000Z',
    offers: [],
  };

  it('names the primary craft and uses the photo as a small card', () => {
    const card = profileCard(profile, site);

    expect(card.title).toBe('Juan Dela Cruz · Filmmakers in Naval');
    expect(card.description).toBe('Photographers, Filmmakers · Naval, Biliran — on Bilikha');
    expect(card.image).toBe(profile.avatarUrl);
    expect(card.imageSize).toBeNull();
    expect(card.largeImage).toBe(false);
  });

  it('prefers the bio, clipped, when there is one', () => {
    const card = profileCard({ ...profile, bio: 'word '.repeat(80) }, site);

    expect(card.description.length).toBeLessThanOrEqual(200);
    expect(card.description.endsWith('…')).toBe(true);
  });

  it("leads an offer with its cover photo as a large card", () => {
    const offer = {
      id: '6b0d3c8e-1b2a-4c3d-9e8f-001122334455',
      title: 'Event video',
      description: 'Highlights reel within a week.',
      priceMinCentavos: 500_000,
      priceMaxCentavos: 1_000_000,
      images: [{ id: 'i1', url: 'https://storage.example/o/1.webp', thumbUrl: 'x', sortOrder: 0 }],
      creative: { slug: 'juan', displayName: null, municipality: 'Naval' },
    } as unknown as PublishedOfferDetail;

    const card = offerCard(offer, site);

    expect(card.description).toBe('₱5,000 – ₱10,000 · juan, Naval — Highlights reel within a week.');
    expect(card.image).toBe('https://storage.example/o/1.webp');
    expect(card.largeImage).toBe(true);
    expect(card.url).toBe(`${site}/offers/${offer.id}`);
  });
});

describe('link-preview helpers', () => {
  it('words prices the way the frontend does', () => {
    expect(formatPriceRange(null, null)).toBe('Price on request');
    expect(formatPriceRange(300_000, null)).toBe('From ₱3,000');
    expect(formatPriceRange(null, 250_000)).toBe('₱2,500');
    expect(formatPriceRange(500_000, 500_000)).toBe('₱5,000');
    expect(formatPriceRange(500_000, 1_000_000)).toBe('₱5,000 – ₱10,000');
  });

  it('clips on a word boundary and leaves short text alone', () => {
    expect(clip('  short   text ', 50)).toBe('short text');
    expect(clip('alpha beta gamma delta', 15)).toBe('alpha beta…');
  });

  it('escapes every character that could open markup or an attribute', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('points each deployment at its own site', () => {
    expect(siteOrigin('production')).toBe('https://bilikha.vercel.app');
    expect(siteOrigin('main')).toBe('https://bilikha-staging.vercel.app');
    expect(siteOrigin(undefined)).toBe('http://localhost:5173');
  });
});
