import { registerSection } from '../../sections';
import { enMessages } from './en';

/**
 * Registers the strings for files in a conversation. Imported by
 * `features/conversations/attachments/`, so the strings ship in the
 * conversation page's chunk and are registered before it renders. Registering
 * twice is a no-op.
 */
registerSection({
  name: 'messages',
  en: enMessages,
  loaders: {
    fil: () => import('./fil').then((m) => m.filMessages),
    war: () => import('./war').then((m) => m.warMessages),
  },
});
