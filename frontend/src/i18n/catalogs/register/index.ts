import { registerSection } from '../../sections';
import { enRegister } from './en';

/**
 * Registers the registration page's strings. Imported by `pages/RegisterPage.tsx`,
 * so they ship in that page's chunk and are registered before it renders.
 */
registerSection({
  name: 'register',
  en: enRegister,
  loaders: {
    fil: () => import('./fil').then((m) => m.filRegister),
    war: () => import('./war').then((m) => m.warRegister),
  },
});
