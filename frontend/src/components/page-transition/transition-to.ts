import type { FormEvent, MouseEvent } from 'react';
import { routeLabel } from '@/lib/route-labels';

/** Which branded overlay a link plays. See `PageTransition.tsx`. */
export type PageTransitionKind = 'wave' | 'bloom' | 'panel';

export interface PageTransitionRun {
  kind: PageTransitionKind;
  to: string;
  label: string;
  phase: 'cover' | 'reveal';
  origin: { x: number; y: number };
  /** Replace the current history entry rather than push a new one. */
  replace?: boolean;
  /** Run once the screen is covered, in place of navigating to `to`; it must navigate there. */
  go?: () => void;
}

/** What signing in and signing out show: the name, as on the opening curtain. */
export const SESSION_LABEL = 'Bilikha';

/**
 * `start` is filled while `PageTransitions` is mounted; without it, links
 * navigate as usual. `hold` is set while a back or forward press is behind the
 * curtain: `key` is the history entry being travelled to, and the page for it
 * waits on `until`.
 *
 * `signedIn` turns the links' and the back button's overlays off. The signed-in
 * app is moved around constantly, and there the tide and the loading dots are
 * the loader; only the change of session itself, through `playTransition`,
 * still plays one.
 */
export const overlay: {
  start: ((run: PageTransitionRun) => void) | null;
  hold: { key: string; until: Promise<void>; release: () => void } | null;
  signedIn: boolean;
} = { start: null, hold: null, signedIn: false };

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
 * at once. Under reduced motion, or for someone signed in, the click is left
 * alone, so the link behaves exactly as it would without this.
 */
export function transitionTo(kind: PageTransitionKind) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    const { start } = overlay;
    if (!start || overlay.signedIn || !isPlainClick(event) || prefersReducedMotion()) return;
    const anchor = event.currentTarget;
    const to = anchor.getAttribute('href');
    if (!to || (anchor.target && anchor.target !== '_self')) return;
    // Already here: a curtain that lands back on the same page is just a delay.
    if (to === `${window.location.pathname}${window.location.search}`) return;

    event.preventDefault();
    start({ kind, to, label: routeLabel(to), phase: 'cover', origin: tapOrigin(event) });
  };
}

/** Where a click landed, for the bloom to open from. */
export function tapOrigin(event: MouseEvent<HTMLElement>): { x: number; y: number } {
  // A keyboard "click" has no pointer position; open from the element instead.
  if (event.detail === 0) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  return { x: event.clientX, y: event.clientY };
}

/** Where a form was submitted from: its submit button, or the screen's centre. */
export function submitOrigin(event: FormEvent<HTMLFormElement>): { x: number; y: number } | undefined {
  const { submitter } = event.nativeEvent as SubmitEvent;
  if (!submitter) return undefined;
  const box = submitter.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * The same transitions for a navigation made in code, after a form or a button
 * has done its work. Returns false when there is no overlay to play, under
 * reduced motion or outside `PageTransitions`; the caller navigates itself.
 */
export function playTransition(
  kind: PageTransitionKind,
  to: string,
  options: Partial<Pick<PageTransitionRun, 'label' | 'origin' | 'replace' | 'go'>> = {},
): boolean {
  const { start } = overlay;
  if (!start || prefersReducedMotion()) return false;
  start({
    kind,
    to,
    label: options.label ?? routeLabel(to),
    phase: 'cover',
    origin: options.origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    replace: options.replace,
    go: options.go,
  });
  return true;
}
