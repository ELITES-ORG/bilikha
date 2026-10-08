import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/** Keep in step with the `bk-glitch-*` animations in motion.css. */
const BURST_MS = 420;

/**
 * An image that glitches every few seconds, as the headings on the Elites
 * site do: two copies of it, in the accent and the ink colour, slice sideways
 * for under half a second. The copies are the image used as a mask, so it
 * works on a raster wordmark that `color` cannot reach.
 *
 * Only while it is on screen and the tab is visible, and never under reduced
 * motion. `className` sizes it; give it a height, the width follows.
 */
export function GlitchImage({
  src,
  alt,
  width,
  height,
  className,
  everyMs = 3000,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  everyMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let burstTimer = 0;

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    observer.observe(el);

    const burst = (then?: () => void) => {
      el.setAttribute('data-glitch', '');
      burstTimer = window.setTimeout(() => {
        el.removeAttribute('data-glitch');
        then?.();
      }, BURST_MS);
    };

    const interval = window.setInterval(() => {
      if (!visible || document.hidden || reduce.matches) return;
      // Now and then a second burst straight after, so it reads as a fault
      // rather than a metronome.
      burst(() => {
        if (Math.random() < 0.35) burstTimer = window.setTimeout(() => burst(), 90);
      });
    }, everyMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(burstTimer);
      observer.disconnect();
      el.removeAttribute('data-glitch');
    };
  }, [everyMs]);

  return (
    <span
      ref={ref}
      className={cn('bk-glitch', className)}
      style={{ '--glitch-mask': `url("${src}")` } as CSSProperties}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="bk-glitch-base"
        draggable={false}
      />
      <span aria-hidden="true" className="bk-glitch-layer bk-glitch-layer-b" />
      <span aria-hidden="true" className="bk-glitch-layer bk-glitch-layer-a" />
    </span>
  );
}
