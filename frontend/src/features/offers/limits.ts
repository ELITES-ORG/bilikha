import type { MediaLimitsState } from '@/features/media/limits-api';

/** Mirror of backend offers.service — import these; never scatter the numbers. */
export const OFFER_LIMIT = 6;

/** What a backend from before the upload pipeline (ADR 0046) allows, when it cannot say. */
const LEGACY_OFFER_IMAGE_LIMIT = 4;

/** How many images one offer may hold, from the API's limits. */
export function offerImageLimit(state: MediaLimitsState): number {
  return state.available ? state.limits.destinations.offer.image.perTarget : LEGACY_OFFER_IMAGE_LIMIT;
}
