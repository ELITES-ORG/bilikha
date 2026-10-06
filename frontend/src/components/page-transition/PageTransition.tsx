import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { routeLabel } from '@/lib/route-labels';
import { boot, bootFadeDelayMs, useBootPhase } from './boot';
import {
  overlay,
  prefersReducedMotion,
  type PageTransitionKind,
  type PageTransitionRun,
} from './transition-to';

/*
 * Page transitions, amending ADR 0034. Three branded overlays carry the
 * destination's name, so they cannot be view transitions: a view transition
 * snapshots pages and has nowhere to put a label. Each overlay covers, the
 * route changes underneath it, then it reveals — plain CSS, transform and
 * opacity only (styles in motion.css). Links opt in with `transitionTo`.
 *
 * - wave:  between the public pages
 * - bloom: the main calls to action, opening from where the tap landed
 * - panel: the header's section links; slides under the header, which stays
 *
 * The browser's back and forward buttons get one too: the overlay that brought
 * you to the page you are leaving, run in reverse, or the wave. No click
 * handler sees those presses and the URL has already changed when they arrive,
 * so `PageTransitionGate` holds the page back until the curtain is down.
 *
 * Every other change of page gets the tide, a red line across the top, and the
 * new `main` sliding in, inside the 200ms rule. That stands in for ADR 0034's
 * view transition, which the declarative <BrowserRouter> never starts.
 */
type Run = Omit<PageTransitionRun, 'phase'> & {
  /**
   * `hold` sits behind the drawn curtain until the new page has rendered. A
   * lazy page renders only once its chunk arrives, and lifting the curtain
   * before then would reveal the old page and cut to the new one after.
   */
  phase: 'cover' | 'hold' | 'reveal';
  /** Travelling back through history: wave and panel run the other way. */
  back: boolean;
  /** A back or forward press, already in the URL, held by the gate. */
  traversal: boolean;
  /** The history entry on screen when the run began; the hold ends once it is not. */
  fromKey: string;
};

/** What the overlays draw: a hold looks like a finished cover. */
type ShownRun = Omit<Run, 'phase'> & { phase: 'cover' | 'reveal' };

/**
 * How long a phase may run before it is moved on regardless. A hidden tab
 * pauses CSS animations, and a missed `animationend` must never leave someone
 * stuck behind the curtain.
 */
const PHASE_TIMEOUT_MS = 900;

/** The hold's own limit: long enough for a page chunk on a slow connection. */
const HOLD_TIMEOUT_MS = 5000;

/** React Router's record on the current history entry: a key, and a number that is lower further back. */
function historyEntry(): { key: string; index: number } {
  const state: unknown = window.history.state;
  const record = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return {
    key: typeof record.key === 'string' ? record.key : 'default',
    index: typeof record.idx === 'number' ? record.idx : 0,
  };
}

function restart(element: Element | null, className: string) {
  if (!(element instanceof HTMLElement)) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/** Mounted once, beside the routes. Renders the overlays and the tide line. */
export function PageTransitions() {
  const navigate = useNavigate();
  const { pathname, key } = useLocation();
  const [run, setRun] = useState<Run | null>(null);

  const runActive = useRef(false);
  const committed = useRef({ pathname, key, index: historyEntry().index });
  // Which overlay brought each history entry on screen, so leaving it by the
  // back button can play the same one in reverse.
  const arrivedBy = useRef(new Map<string, PageTransitionKind>());
  const arriving = useRef<PageTransitionKind | null>(null);

  useEffect(() => {
    runActive.current = run !== null;
  }, [run]);

  useEffect(() => {
    overlay.start = (next) => {
      const fromKey = committed.current.key;
      setRun((current) => current ?? { ...next, back: false, traversal: false, fromKey });
    };
    return () => {
      overlay.start = null;
    };
  }, []);

  // A layout effect, so the listener is in place before the router's own.
  useLayoutEffect(() => {
    const onPopState = () => {
      const entry = historyEntry();
      if (overlay.hold) {
        overlay.hold.key = entry.key;
        return;
      }
      const from = committed.current;
      if (runActive.current || prefersReducedMotion()) return;
      if (window.location.pathname === from.pathname) return;

      let release = () => {};
      const until = new Promise<void>((resolve) => {
        release = resolve;
      });
      overlay.hold = { key: entry.key, until, release };

      const back = entry.index < from.index;
      const to = `${window.location.pathname}${window.location.search}`;
      setRun({
        kind: arrivedBy.current.get(back ? from.key : entry.key) ?? 'wave',
        to,
        label: routeLabel(to),
        phase: 'cover',
        origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        back,
        traversal: true,
        fromKey: from.key,
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      overlay.hold?.release();
      overlay.hold = null;
    };
  }, []);

  const arrived = run !== null && key !== run.fromKey;
  const shown: ShownRun | null = run && {
    ...run,
    phase: run.phase === 'reveal' || (run.phase === 'hold' && arrived) ? 'reveal' : 'cover',
  };

  const advance = useCallback(() => {
    if (!run) return;
    if (run.phase === 'cover') {
      if (run.traversal) {
        overlay.hold?.release();
        overlay.hold = null;
      } else {
        arriving.current = run.kind;
        void navigate(run.to);
      }
      setRun({ ...run, phase: 'hold' });
    } else if (run.phase === 'reveal' || arrived) {
      setRun(null);
    } else {
      // The page never arrived in time: lift the curtain on what is there.
      setRun({ ...run, phase: 'reveal' });
    }
  }, [run, arrived, navigate]);

  useEffect(() => {
    if (!run) return;
    const waiting = run.phase === 'hold' && !arrived;
    const timer = window.setTimeout(advance, waiting ? HOLD_TIMEOUT_MS : PHASE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [run, arrived, advance]);

  const onAnimationEnd = (event: AnimationEvent) => {
    const name = event.animationName;
    if (shown && name.startsWith(`bk-${shown.kind}-`) && name.endsWith(`-${shown.phase}`)) {
      advance();
    }
  };

  // Restarted imperatively, so a change of page costs no extra render; a
  // layout effect, so the new page never paints a frame unanimated.
  const tideRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = committed.current;
    committed.current = { pathname, key, index: historyEntry().index };
    if (arriving.current) {
      arrivedBy.current.set(key, arriving.current);
      arriving.current = null;
    }
    if (previous.pathname === pathname) return;
    if (runActive.current || prefersReducedMotion()) return;
    restart(tideRef.current, 'nav-tide-run');
    restart(document.querySelector('main'), 'page-enter');
  }, [pathname, key]);

  return (
    <>
      <div
        ref={tideRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-(--staging-banner-h) z-50 h-0.5 origin-left bg-palayok-500 opacity-0"
      />

      {shown && (
        <div aria-hidden="true" onAnimationEnd={onAnimationEnd}>
          {shown.kind === 'wave' && <Wave run={shown} />}
          {shown.kind === 'bloom' && <Bloom run={shown} />}
          {shown.kind === 'panel' && <Panel run={shown} />}
        </div>
      )}
    </>
  );
}

/**
 * Rendered inside the routes' Suspense boundary. While a back or forward press
 * is behind the curtain it suspends the render of the page being travelled to;
 * the router applies history changes as a transition, so React keeps the old
 * page on screen until the hold is released, instead of showing a fallback.
 */
export function PageTransitionGate() {
  const { key } = useLocation();
  const { hold } = overlay;
  if (hold && hold.key === key) use(hold.until);
  return null;
}

/** When the opening curtain admits the wait has stopped looking like loading. */
const BOOT_SLOW_AFTER_MS = 8000;

/**
 * The opening curtain, taken over from `index.html` (see `boot.ts`). Mounted
 * once, outside the routes' Suspense, so it is in the very first commit and
 * the boot mark is replaced by an identical one rather than by a blank frame.
 */
export function BootCurtain() {
  const phase = useBootPhase();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    boot.settleSoon();
  }, []);

  useEffect(() => {
    if (phase === 'done') return;
    const timer =
      phase === 'covering'
        ? window.setTimeout(() => setSlow(true), BOOT_SLOW_AFTER_MS)
        : window.setTimeout(boot.finish, PHASE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      role="status"
      className="boot-curtain pointer-events-auto fixed inset-0 z-70 overflow-hidden"
      style={{ animationDelay: `${bootFadeDelayMs}ms` }}
      onAnimationEnd={(event) => {
        if (event.animationName === 'bk-wave-reveal') boot.finish();
      }}
    >
      <div className={cn('absolute inset-0 bg-primary', phase === 'revealing' && 'page-wave-reveal')}>
        <WaveEdge className="absolute top-full left-0 h-12 w-full rotate-180" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-(--gutter)">
          <p className="u-serif text-4xl text-on-primary sm:text-5xl">
            <span aria-hidden="true" className="boot-spark mr-3 inline-block text-palayok-500">
              ✦
            </span>
            Bilikha
          </p>
          {slow && (
            <p className="max-w-xs text-center text-sm text-on-primary-muted">
              Still loading. The server may be waking up — this can take a minute.
            </p>
          )}
          <span className="sr-only">Loading Bilikha</span>
        </div>
      </div>
    </div>
  );
}

function phaseClass(
  run: ShownRun,
  classes: { cover: string; reveal: string; backCover: string; backReveal: string },
) {
  if (run.back) return run.phase === 'cover' ? classes.backCover : classes.backReveal;
  return run.phase === 'cover' ? classes.cover : classes.reveal;
}

function Destination({ label }: { label: string }) {
  return (
    <div className="page-label absolute inset-0 flex items-center justify-center px-(--gutter)">
      <p className="u-serif text-center text-4xl text-on-primary sm:text-5xl">
        <span className="mr-3 text-palayok-500">✦</span>
        {label}
      </p>
    </div>
  );
}

/** The hero's navy-and-red wave, as the leading and trailing edge of the sheet. */
function WaveEdge({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 400 48" preserveAspectRatio="none" focusable="false" className={className}>
      <path className="fill-palayok-500" d="M0 48V18C70 0 130 2 200 14s130 24 200 4v30Z" />
      <path className="fill-primary" d="M0 48V28C60 12 120 12 200 26s140 26 200 6v16Z" />
    </svg>
  );
}

function Wave({ run }: { run: ShownRun }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-60 overflow-hidden">
      <div
        className={cn(
          'absolute inset-0 bg-primary',
          phaseClass(run, {
            cover: 'page-wave-cover',
            reveal: 'page-wave-reveal',
            backCover: 'page-wave-back-cover',
            backReveal: 'page-wave-back-reveal',
          }),
        )}
      >
        <WaveEdge className="absolute bottom-full left-0 h-12 w-full" />
        <WaveEdge className="absolute top-full left-0 h-12 w-full rotate-180" />
        <Destination label={run.label} />
      </div>
    </div>
  );
}

function Bloom({ run }: { run: ShownRun }) {
  const { x, y } = run.origin;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  return (
    <div
      className={cn(
        'pointer-events-auto fixed inset-0 z-60 overflow-hidden',
        run.phase === 'reveal' && 'page-bloom-reveal',
      )}
    >
      <div
        className="page-bloom-cover absolute rounded-full bg-primary ring-4 ring-palayok-500"
        style={{ left: x - radius, top: y - radius, width: radius * 2, height: radius * 2 }}
      />
      <Destination label={run.label} />
    </div>
  );
}

function Panel({ run }: { run: ShownRun }) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 top-[calc(var(--staging-banner-h)+4rem)] bottom-0 z-35 overflow-hidden">
      <div
        className={cn(
          'absolute inset-0 bg-primary',
          phaseClass(run, {
            cover: 'page-panel-cover',
            reveal: 'page-panel-reveal',
            backCover: 'page-panel-back-cover',
            backReveal: 'page-panel-back-reveal',
          }),
        )}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-palayok-500" />
        <Destination label={run.label} />
      </div>
    </div>
  );
}
