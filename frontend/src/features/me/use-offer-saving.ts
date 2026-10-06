import { useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { useSaveOffer, useSavedOffers, useUnsaveOffer } from './saved-offers';

/**
 * Save and unsave for a list of offer cards. One cached `GET /me/saved-offers`
 * answers every card, rather than a request per card; the toasts and the
 * mutations are the ones the offer page already uses.
 *
 * Pass `enabled` false for anyone who cannot save — signed out, or browsing as
 * a creative — and the hook fetches nothing.
 */
export function useOfferSaving(enabled: boolean) {
  const toast = useToast();
  const saved = useSavedOffers(enabled);
  const saveOffer = useSaveOffer();
  const unsaveOffer = useUnsaveOffer();

  const savedIds = new Set(saved.data?.map((row) => row.offer.id) ?? []);
  const pendingId = saveOffer.isPending
    ? saveOffer.variables
    : unsaveOffer.isPending
      ? unsaveOffer.variables
      : undefined;

  async function toggle(offerId: string) {
    if (savedIds.has(offerId)) {
      await toast.run('Removing…', () => unsaveOffer.mutateAsync(offerId), {
        success: 'Removed from saved',
        error: (err) => toApiError(err).message,
      });
    } else {
      await toast.run('Saving…', () => saveOffer.mutateAsync(offerId), {
        success: 'Saved',
        error: (err) => toApiError(err).message,
      });
    }
  }

  return {
    enabled,
    isSaved: (offerId: string) => savedIds.has(offerId),
    isPending: (offerId: string) => pendingId === offerId,
    toggle: (offerId: string) => void toggle(offerId).catch(() => undefined),
  };
}

export type OfferSaving = ReturnType<typeof useOfferSaving>;
