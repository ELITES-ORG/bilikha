import { registerSection } from '../../sections';
import { enOffers } from './en';

/**
 * Registers the offer editor's strings. Imported by
 * `features/offers/OfferReviewNotice.tsx`, so the strings ship in the editor's
 * chunk and are registered before it renders. Registering twice is a no-op.
 */
registerSection({
  name: 'offers',
  en: enOffers,
  loaders: {
    fil: () => import('./fil').then((m) => m.filOffers),
    war: () => import('./war').then((m) => m.warOffers),
  },
});
