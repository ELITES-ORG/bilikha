import { createContext } from 'react';

/**
 * Where a loading fallback sits, so its skeleton draws only what is missing:
 *
 * - app:  the top of the routes; nothing is on screen, so the page's own
 *         chrome is drawn too
 * - site: inside `SiteLayout`, whose header is already up
 * - pane: inside the messages split view, standing in for one thread
 */
export type FallbackScope = 'app' | 'site' | 'pane';

export const FallbackScopeContext = createContext<FallbackScope>('app');
