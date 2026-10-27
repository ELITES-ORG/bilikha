import { registerSection } from '../../sections';
import { enAccount } from './en';

/**
 * Registers the strings of the account pages. Imported by each page that reads them, so
 * they ship in that chunk and are registered before it renders. Registering
 * twice is a no-op.
 */
registerSection({
  name: 'account',
  en: enAccount,
  loaders: {
    fil: () => import('./fil').then((m) => m.filAccount),
    war: () => import('./war').then((m) => m.warAccount),
  },
});
