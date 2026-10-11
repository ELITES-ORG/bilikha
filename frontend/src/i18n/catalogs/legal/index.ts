import { registerSection } from '../../sections';
import { enLegal } from './en';

/**
 * Registers the legal pages' strings. Imported by `pages/legal/LegalLayout.tsx`,
 * which both legal pages render through, so the strings ship in those pages'
 * chunk and are registered before either page renders.
 */
registerSection({
  name: 'legal',
  en: enLegal,
  loaders: {
    fil: () => import('./fil').then((m) => m.filLegal),
    war: () => import('./war').then((m) => m.warLegal),
  },
});
