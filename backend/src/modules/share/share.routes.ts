import { Router, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import {
  cardForOffer,
  cardForProfile,
  genericCard,
  offerUrl,
  profileUrl,
  renderCardHtml,
  siteOrigin,
  type ShareCard,
} from './share.service.js';

/**
 * Link-preview HTML for crawlers (ADR 0056). Only `frontend/vercel.json`'s
 * user-agent rewrites send traffic here; a person never sees these pages.
 *
 * A preview must never fail outright — a broken card is worse than a plain
 * one — so anything that goes wrong answers with the generic Bilikha card,
 * uncached, and is logged rather than thrown.
 */
export const shareRouter: Router = Router();

/** Long enough that a link going round a group chat is one API call, not hundreds. */
const CACHE = 'public, max-age=600';

const offerIdSchema = z.string().uuid();

function send(res: Response, card: ShareCard, cache: string) {
  res
    .status(200)
    .type('html')
    .set('Cache-Control', cache)
    // The same path is the SPA for a person and this page for a crawler.
    .set('Vary', 'User-Agent')
    .send(renderCardHtml(card));
}

/** `sharedUrl` is the page the link names, kept even when the card falls back. */
async function respond(res: Response, sharedUrl: string, load: () => Promise<ShareCard>) {
  try {
    send(res, await load(), CACHE);
  } catch (error) {
    logger.warn({ err: error }, 'Link preview fell back to the generic card');
    send(res, genericCard(siteOrigin(), sharedUrl), 'no-store');
  }
}

shareRouter.get('/creatives/:slug', async (req, res) => {
  const slug = req.params.slug!;
  await respond(res, profileUrl(siteOrigin(), slug), () => cardForProfile(slug));
});

shareRouter.get('/offers/:id', async (req, res) => {
  const sharedUrl = offerUrl(siteOrigin(), req.params.id!);
  const id = offerIdSchema.safeParse(req.params.id);
  // A malformed id is a link that never pointed at anything, not an error.
  await respond(res, sharedUrl, async () =>
    id.success ? cardForOffer(id.data) : genericCard(siteOrigin(), sharedUrl),
  );
});
