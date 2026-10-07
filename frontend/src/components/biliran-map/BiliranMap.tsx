import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Coastline } from './Coastline';

/** The coastline's box, in its own units. */
const VIEW_W = 1000;
const VIEW_H = 992;

type LabelSide = 'right' | 'left' | 'top';

/**
 * Town centres, keyed by municipality slug. OpenStreetMap maps only one of the
 * eight municipal boundaries, so the map pins towns rather than shading
 * regions. Labels sit inland, so none runs off the box. `turn` is the town's
 * place clockwise round the coast, the order the pulse visits them in.
 */
const TOWNS: Record<string, { x: number; y: number; label: LabelSide; turn: number }> = {
  maripipi: { x: 273, y: 138, label: 'right', turn: 0 },
  kawayan: { x: 294, y: 391, label: 'right', turn: 1 },
  culaba: { x: 766, y: 455, label: 'left', turn: 2 },
  caibiran: { x: 870, y: 674, label: 'left', turn: 3 },
  cabucgayan: { x: 854, y: 934, label: 'top', turn: 4 },
  biliran: { x: 595, y: 951, label: 'left', turn: 5 },
  naval: { x: 396, y: 701, label: 'right', turn: 6 },
  almeria: { x: 358, y: 548, label: 'right', turn: 7 },
};

/** Marks the map `data-map-live` while it is on screen, so the pulse never runs unseen. */
function useLiveWhileVisible(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) element.toggleAttribute('data-map-live', entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}

const LABEL_SIDE: Record<LabelSide, string> = {
  right: 'top-1/2 left-full -ml-2 -translate-y-1/2',
  left: 'top-1/2 right-full -mr-2 -translate-y-1/2',
  top: 'bottom-full left-1/2 -mb-1.5 -translate-x-1/2',
};

interface BiliranMapProps {
  municipalities: ReadonlyArray<{ slug: string; name: string }>;
  className?: string;
}

/**
 * A second way into the same filtered directory the municipality chips lead
 * to. The chips are the accessible route, so the map is hidden from assistive
 * tech and kept out of the tab order rather than announcing every town twice.
 *
 * Default export so the home page can load it lazily: it sits below the fold,
 * and the coastline coordinates barely compress.
 */
export default function BiliranMap({ municipalities, className }: BiliranMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  useLiveWhileVisible(mapRef);

  return (
    <div
      ref={mapRef}
      data-reveal
      aria-hidden="true"
      className={cn('relative w-full', className)}
      style={
        { aspectRatio: `${VIEW_W} / ${VIEW_H}`, '--map-pins': municipalities.length } as CSSProperties
      }
    >
      <Coastline />

      {municipalities.map((municipality, index) => {
        const town = TOWNS[municipality.slug];
        if (!town) return null;
        return (
          <Link
            key={municipality.slug}
            to={`/directory?municipality=${municipality.slug}`}
            tabIndex={-1}
            className="group map-pin absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={
              {
                left: `${(town.x / VIEW_W) * 100}%`,
                top: `${(town.y / VIEW_H) * 100}%`,
                '--i': index,
                '--turn': town.turn,
              } as CSSProperties
            }
          >
            <span className="map-pin-pulse absolute size-3 rounded-full bg-primary" />
            <span className="relative size-3 rounded-full bg-primary ring-4 ring-primary/20 transition-transform group-hover:scale-125" />
            <span
              className={cn(
                'absolute text-xs font-medium whitespace-nowrap text-ink-muted transition-colors group-hover:text-lawa-700',
                LABEL_SIDE[town.label],
              )}
            >
              {municipality.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
