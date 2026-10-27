import { registerSection } from '../../sections';
import { enConversation } from './en';

/**
 * Registers the strings of a conversation. Imported by
 * `pages/ConversationPage.tsx`, so they ship in that chunk and are registered
 * before it renders. Registering twice is a no-op.
 */
registerSection({
  name: 'conversation',
  en: enConversation,
  loaders: {
    fil: () => import('./fil').then((m) => m.filConversation),
    war: () => import('./war').then((m) => m.warConversation),
  },
});
