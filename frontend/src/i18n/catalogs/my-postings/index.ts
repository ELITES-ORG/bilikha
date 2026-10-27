import { registerSection } from '../../sections';
import { enMyPostings } from './en';

/**
 * Registers the strings of a client's own postings. Imported by
 * `pages/MyPostingsPage.tsx`, so they ship in that chunk and are registered
 * before it renders. Registering twice is a no-op.
 */
registerSection({
  name: 'my-postings',
  en: enMyPostings,
  loaders: {
    fil: () => import('./fil').then((m) => m.filMyPostings),
    war: () => import('./war').then((m) => m.warMyPostings),
  },
});
