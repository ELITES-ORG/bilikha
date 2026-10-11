import { registerSection } from '../../sections';
import { enOrganizations } from './en';

/**
 * Registers the organisation pages' strings. Imported by each page under
 * `pages/organizations/`, so the strings ship in those pages' chunks and are
 * registered before any of them renders. Registering twice is a no-op.
 */
registerSection({
  name: 'organizations',
  en: enOrganizations,
  loaders: {
    fil: () => import('./fil').then((m) => m.filOrganizations),
    war: () => import('./war').then((m) => m.warOrganizations),
  },
});
