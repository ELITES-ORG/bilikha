import type { MouseEvent } from 'react';
import { routeLabel } from '@/lib/route-labels';

/** Which branded overlay a link plays. See `PageTransition.tsx`. */
export type PageTransitionKind = 'wave' | 'bloom' | 'panel';

export interface PageTransitionRun {
  kind: PageTransitionKind;
  to: string;
  label: string;
  phase: 'cover' | 'reveal';
  origin: { x: number; y: number };
}

/**
 * `start` is filled while `PageTransitions` is mounted; without it, links
 * navigate as usual. `hold` is set while a back or forward press is behind the
 * curtain: `key` is the history entry being travelled to, and the page for it
 * waits on `until`.
 */
export const overlay: {
  start: ((run: PageTransitionRun) => void) | null;
  hold: { key: string; until: Promise<void>; release: () => void } | null;
} = { start: null, hold: null };

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * `onClick={transitionTo('wave')}` on a `Link`. The link keeps its href, focus
 * and middle-click; a plain click plays the transition instead of navigating
 * at once. Under reduced motion the click is left alone, so the link behaves
 * exactly as it would without this.
 */
export function transitionTo(kind: PageTransitionKind) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    const { start } = overlay;
    if (!start || !isPlainClick(event) || prefersReducedMotion()) return;
    const anchor = event.currentTarget;
    const to = anchor.getAttribute('href');
    if (!to || (anchor.target && anchor.target !== '_self')) return;
    // Already here: a curtain that lands back on the same page is just a delay.
    if (to === `${window.location.pathname}${window.location.search}`) return;

    event.preventDefault();
    // A keyboard "click" has no pointer position; open from the link instead.
    const box = anchor.getBoundingClientRect();
    const origin =
      event.detail === 0
        ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
        : { x: event.clientX, y: event.clientY };
    start({ kind, to, label: routeLabel(to), phase: 'cover', origin });
  };
}
