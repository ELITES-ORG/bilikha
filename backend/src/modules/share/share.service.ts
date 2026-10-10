import { env } from '../../config/env.js';
import { deploymentEnvironment } from '../../lib/error-reporting.js';
import { AppError } from '../../lib/http-error.js';
import type { PublishedOfferDetail } from '../../contracts/offers.js';
import type { PublicProfileDetail } from '../../contracts/profiles.js';
import { getPublishedOfferById } from '../offers/offers.service.js';
import { getPublishedBySlug } from '../profiles/profiles.service.js';
import { formatPriceRange } from './share-price.js';

export { formatPriceRange };

/**
 * Link-preview cards (ADR 0056). A crawler asking for a shared profile or offer
 * is rewritten here by `frontend/vercel.json` and gets the `<head>` that page
 * would have — nothing else. Everyone else gets the SPA.
 *
 * Visibility is borrowed, never re-derived: the cards are built from the same
 * `getPublishedBySlug` and `getPublishedOfferById` the public pages call, so a
 * preview can never show something the page itself would not.
 */

/**
 * Where a shared link points. Fixed per deployment rather than read from the
 * request: behind Vercel's rewrite the request's host is the API's, and a
 * forwarded header would let any caller choose the canonical URL.
 */
const SITE_ORIGIN = {
  production: 'https://bilikha.vercel.app',
  staging: 'https://bilikha-staging.vercel.app',
  local: 'http://localhost:5173',
} as const;

export function siteOrigin(branch: string | undefined = env.RENDER_GIT_BRANCH): string {
  return SITE_ORIGIN[deploymentEnvironment(branch)];
}

/** `frontend/public/og-default.png` — served by both sites, 1200×630. */
export const DEFAULT_IMAGE = { path: '/og-default.png', width: 1200, height: 630 } as const;

const SITE_TITLE = 'Bilikha — Biliran Creative Industries Registry';
const SITE_DESCRIPTION = 'Find and connect with creative talent across Biliran.';

export interface ShareCard {
  title: string;
  description: string;
  /** Absolute. */
  image: string;
  /** Only the default image's size is known; a photo's is left to the crawler. */
  imageSize: { width: number; height: number } | null;
  /** A wide image gets the large card; a square avatar the small one. */
  largeImage: boolean;
  /** The canonical page URL. */
  url: string;
  type: 'website' | 'profile';
}

/** Collapses whitespace and cuts at a word boundary, so a card never ends mid-word. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

function defaultImage(site: string) {
  return {
    image: `${site}${DEFAULT_IMAGE.path}`,
    imageSize: { width: DEFAULT_IMAGE.width, height: DEFAULT_IMAGE.height },
    largeImage: true,
  };
}

export function profileUrl(site: string, slug: string): string {
  return `${site}/creatives/${encodeURIComponent(slug)}`;
}

export function offerUrl(site: string, id: string): string {
  return `${site}/offers/${encodeURIComponent(id)}`;
}

/**
 * What a hidden, missing or broken link shares: the site, never the item.
 *
 * `url` is the link that was shared, not the home page. Facebook treats
 * `og:url` as the page to scrape, so pointing it at the home page made the
 * crawler leave this card for the SPA's site-wide tags. The link names nothing
 * the person sharing it had not already pasted.
 */
export function genericCard(site: string, url = `${site}/`): ShareCard {
  return {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    ...defaultImage(site),
    url,
    type: 'website',
  };
}

export function profileCard(profile: PublicProfileDetail, site: string): ShareCard {
  const name = profile.displayName ?? profile.fullName;
  const primary = profile.subdomains.find((sub) => sub.isPrimary) ?? profile.subdomains[0];
  const crafts = profile.subdomains.map((sub) => sub.name).join(', ');
  return {
    title: primary
      ? `${name} · ${primary.name} in ${profile.municipality}`
      : `${name} · ${profile.municipality}`,
    description: profile.bio?.trim()
      ? clip(profile.bio, 200)
      : `${crafts ? `${crafts} · ` : ''}${profile.municipality}, Biliran — on Bilikha`,
    ...(profile.avatarUrl
      ? { image: profile.avatarUrl, imageSize: null, largeImage: false }
      : defaultImage(site)),
    url: profileUrl(site, profile.slug),
    type: 'profile',
  };
}

export function offerCard(offer: PublishedOfferDetail, site: string): ShareCard {
  const name = offer.creative.displayName ?? offer.creative.slug;
  const facts = `${formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)} · ${name}, ${offer.creative.municipality}`;
  const cover = offer.images[0];
  return {
    title: offer.title,
    description: offer.description?.trim() ? `${facts} — ${clip(offer.description, 160)}` : facts,
    ...(cover ? { image: cover.url, imageSize: null, largeImage: true } : defaultImage(site)),
    url: offerUrl(site, offer.id),
    type: 'website',
  };
}

/** The item's card, or the generic one when the public page would 404. */
export async function cardForProfile(slug: string, site = siteOrigin()): Promise<ShareCard> {
  try {
    return profileCard(await getPublishedBySlug(slug), site);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      return genericCard(site, profileUrl(site, slug));
    }
    throw error;
  }
}

export async function cardForOffer(id: string, site = siteOrigin()): Promise<ShareCard> {
  try {
    return offerCard(await getPublishedOfferById(id), site);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      return genericCard(site, offerUrl(site, id));
    }
    throw error;
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Every value in the page goes through this: names and titles are user-written. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

export function renderCardHtml(card: ShareCard): string {
  const e = escapeHtml;
  const meta = (attr: 'property' | 'name', key: string, value: string) =>
    `    <meta ${attr}="${key}" content="${e(value)}" />`;
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    `    <title>${e(card.title === SITE_TITLE ? SITE_TITLE : `${card.title} — Bilikha`)}</title>`,
    meta('name', 'description', card.description),
    `    <link rel="canonical" href="${e(card.url)}" />`,
    meta('property', 'og:site_name', 'Bilikha'),
    meta('property', 'og:type', card.type),
    meta('property', 'og:url', card.url),
    meta('property', 'og:title', card.title),
    meta('property', 'og:description', card.description),
    meta('property', 'og:image', card.image),
    ...(card.imageSize
      ? [
          meta('property', 'og:image:width', String(card.imageSize.width)),
          meta('property', 'og:image:height', String(card.imageSize.height)),
        ]
      : []),
    meta('name', 'twitter:card', card.largeImage ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', card.title),
    meta('name', 'twitter:description', card.description),
    meta('name', 'twitter:image', card.image),
    '  </head>',
    '  <body>',
    `    <p><a href="${e(card.url)}">Open ${e(card.title)} on Bilikha</a></p>`,
    '  </body>',
    '</html>',
    '',
  ];
  return lines.join('\n');
}
