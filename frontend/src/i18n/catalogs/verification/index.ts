import { registerSection } from '../../sections';
import { enVerification } from './en';

/**
 * Registers the ID step's strings. Imported by `pages/onboarding/IdStepPage.tsx`,
 * so the strings ship in that page's chunk and are registered before it
 * renders. Registering twice is a no-op.
 */
registerSection({
  name: 'verification',
  en: enVerification,
  loaders: {
    fil: () => import('./fil').then((m) => m.filVerification),
    war: () => import('./war').then((m) => m.warVerification),
  },
});
