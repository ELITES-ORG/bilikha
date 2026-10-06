import { m, type useAnimationControls, type Variants } from 'motion/react';

// Adapted from lucide-animated (MIT) — see ./LICENSE.

export type IconControls = ReturnType<typeof useAnimationControls>;

export interface AnimatedIconProps {
  controls: IconControls;
  className?: string;
}

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/* ---------------------------------------------------------------- palette */

const PALETTE_DASH = 70;
const PALETTE_DRAW = 0.45;

const paletteOutline: Variants = {
  normal: { strokeDashoffset: 0 },
  animate: {
    strokeDashoffset: [PALETTE_DASH, 0],
    transition: { duration: PALETTE_DRAW, ease: [0.65, 0, 0.35, 1] },
  },
};

const paletteDots: Variants = {
  normal: {},
  animate: { transition: { delayChildren: PALETTE_DRAW, staggerChildren: 0.08 } },
};

const paletteDot: Variants = {
  normal: { scale: 1, transition: { duration: 0.2 } },
  animate: { scale: [0, 1], transition: { type: 'spring', damping: 10, stiffness: 300 } },
};

const PALETTE_DOT_CENTRES = [
  { cx: 6.5, cy: 12.5 },
  { cx: 8.5, cy: 7.5 },
  { cx: 13.5, cy: 6.5 },
  { cx: 17.5, cy: 10.5 },
];

export function PaletteIcon({ controls, className }: AnimatedIconProps) {
  return (
    <svg {...svgProps} className={className}>
      <m.path
        d="M12 2a1 1 0 0 0 0 20l.25 0a1.75 1.75 0 0 0 1.4-2.8l-.3-.4a1.75 1.75 0 0 1 1.4-2.8h2.25a5 5 0 0 0 5-5 10 9 0 0 0-10-9z"
        strokeDasharray={PALETTE_DASH}
        initial="normal"
        animate={controls}
        variants={paletteOutline}
      />
      <m.g initial="normal" animate={controls} variants={paletteDots}>
        {PALETTE_DOT_CENTRES.map((dot) => (
          <m.circle
            key={`${dot.cx}-${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r=".5"
            fill="currentColor"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            variants={paletteDot}
          />
        ))}
      </m.g>
    </svg>
  );
}

/* ----------------------------------------------------------------- blocks */

const blocksPiece: Variants = {
  normal: { translateX: 0, translateY: 0 },
  animate: { translateX: -4, translateY: 4 },
};

export function BlocksIcon({ controls, className }: AnimatedIconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
      <m.path d="M14 3h7v7h-7z" initial="normal" animate={controls} variants={blocksPiece} />
    </svg>
  );
}

/* ---------------------------------------------------------------- map pin */

const pinBody: Variants = {
  normal: { y: 0 },
  animate: { y: [0, -5, -3], transition: { duration: 0.5, times: [0, 0.6, 1] } },
};

const pinDot: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [0.5, 0],
    transition: { delay: 0.3, duration: 0.5, opacity: { duration: 0.1, delay: 0.3 } },
  },
};

export function MapPinIcon({ controls, className }: AnimatedIconProps) {
  return (
    <m.svg {...svgProps} className={className} initial="normal" animate={controls} variants={pinBody}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <m.circle cx="12" cy="10" r="3" initial="normal" animate={controls} variants={pinDot} />
    </m.svg>
  );
}
