import { useEffect, useRef, type RefObject } from 'react';
import { domAnimation, LazyMotion, useAnimationControls, useReducedMotion } from 'motion/react';
import { BlocksIcon, MapPinIcon, PaletteIcon, type IconControls } from './icons';

const ICONS = {
  palette: PaletteIcon,
  blocks: BlocksIcon,
  'map-pin': MapPinIcon,
} as const;

export type AnimatedStatIconName = keyof typeof ICONS;

/** Each icon in a row replays once a cycle at its own offset, so they take turns. */
const CYCLE_MS = 4200;
const TURN_MS = 700;
const FIRST_PLAY_MS = 240;

interface AnimatedStatIconProps {
  name: AnimatedStatIconName;
  /** Position in the row; sets this icon's turn. */
  index: number;
  className?: string;
}

/**
 * Loaded lazily (it pulls in `motion`), with the static Lucide icon of the same
 * size as its Suspense fallback, so the first page load does not carry it.
 */
export default function AnimatedStatIcon({ name, index, className }: AnimatedStatIconProps) {
  const controls = useAnimationControls();
  const anchor = useRef<HTMLSpanElement>(null);
  useTakeTurns(anchor, controls, index);
  const Icon = ICONS[name];

  // `strict` makes a stray `motion.*` element throw instead of silently pulling
  // the full feature set back into this chunk.
  return (
    <LazyMotion features={domAnimation} strict>
      <span ref={anchor} className="inline-flex">
        <Icon controls={controls} className={className} />
      </span>
    </LazyMotion>
  );
}

/**
 * Plays only while the icon is on screen and the tab is visible — a loop on a
 * budget phone should cost nothing once it is scrolled away — and never under
 * reduced motion. Hovering or tapping the stat it sits in plays it at once.
 */
function useTakeTurns(anchor: RefObject<HTMLElement | null>, controls: IconControls, index: number) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const element = anchor.current;
    if (!element || reduceMotion) return;

    let timer: number | undefined;
    let visible = false;
    let playing = false;

    const play = async () => {
      if (playing) return;
      playing = true;
      try {
        await controls.start('animate');
        await controls.start('normal');
      } finally {
        playing = false;
      }
    };

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        void play();
        schedule(CYCLE_MS);
      }, delay);
    };

    const stop = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };

    const sync = () => {
      const shouldRun = visible && document.visibilityState === 'visible';
      if (shouldRun && timer === undefined) schedule(FIRST_PLAY_MS + index * TURN_MS);
      if (!shouldRun) stop();
    };

    const intersections = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      sync();
    });
    intersections.observe(element);
    document.addEventListener('visibilitychange', sync);

    const stat = element.closest('.group');
    const playNow = () => void play();
    stat?.addEventListener('pointerenter', playNow);

    return () => {
      stop();
      intersections.disconnect();
      document.removeEventListener('visibilitychange', sync);
      stat?.removeEventListener('pointerenter', playNow);
    };
  }, [anchor, controls, index, reduceMotion]);
}
