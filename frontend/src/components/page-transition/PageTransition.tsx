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
import { arrivedByKey, readArrivedBy, writeArrivedBy } from '@/lib/arrived-by';
import { cn } from '@/lib/cn';
import { routeLabel } from '@/lib/route-labels';
import { boot, bootFadeDelayMs, useBootPhase } from './boot';
import { usePageLoading } from './loading';
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
  /** A new number for each run, so a replaced overlay restarts its animations. */
  id: number;
  /**
   * `hold` sits behind the drawn curtain until the new page has rendered. A
   * lazy page renders only once its chunk arrives, and lifting the curtain
   * before then would reveal the old page, or the loading dots, and cut to
   * the new one after.
   */
  phase: 'cover' | 'hold' | 'reveal';
  /** Travelling back through history: wave and panel run the other way. */
  back: boolean;
  /** A back or forward press, already in the URL, held by the gate. */
  traversal: boolean;
  /** The history entry on screen when the run began; the hold ends once it is not. */
  fromKey: string;
  /** When the screen was last fully covered, for `MIN_COVERED_MS`. */
  coveredAt: number | null;
};

/** What the overlays draw: a hold looks like a finished cover. */
type ShownRun = Omit<Run, 'phase'> & { phase: 'cover' | 'reveal' };

/**
 * How long a phase may run before it is moved on regardless. A hidden tab
 * pauses CSS animations, and a missed `animationend` must never leave someone
 * stuck behind the curtain.
 */
const PHASE_TIMEOUT_MS = 900;

/**
 * The hold's own limit: long enough for a page chunk on a slow connection. A
 * longer wait, an API still waking, lifts onto the loading dots instead.
 */
const HOLD_TIMEOUT_MS = 5000;

/**
 * How long an overlay stays fully drawn before it may lift. The bloom only
 * runs between public pages, and lifted as soon as the page was ready it
 * flickered past before its label could be read.
 */
const MIN_COVERED_MS: Record<PageTransitionKind, number> = { wave: 0, bloom: 2000, panel: 0 };

/** React Router's record on the current history entry: a key, and a number that is lower further back. */
function historyEntry(): { key: string; index: number } {
  const state: unknown = window.history.state;
  const record = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return {
    key: typeof record.key === 'string' ? record.key : 'default',
    index: typeof record.idx === 'number' ? record.idx : 0,
  };
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
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
  // The `coveredAt` whose minimum has passed.
  const [coveredLongEnough, setCoveredLongEnough] = useState<number | null>(null);

  const runPhase = useRef<Run['phase'] | null>(null);
  const runIds = useRef(0);
  const committed = useRef({ pathname, key, index: historyEntry().index });
  // Which overlay brought each history entry on screen, so leaving it by the
  // back button can play the same one in reverse (`lib/arrived-by.ts`).
  const arrivedBy = useRef<Map<string, PageTransitionKind> | null>(null);
  arrivedBy.current ??= readArrivedBy(sessionStore());
  const arriving = useRef<PageTransitionKind | null>(null);

  useEffect(() => {
    runPhase.current = run?.phase ?? null;
  }, [run]);

  useEffect(() => {
    // The newest navigation wins: a link tapped while an overlay is still up
    // replaces it, rather than being swallowed with its click already cancelled.
    overlay.start = (next) => {
      overlay.hold?.release();
      overlay.hold = null;
      setRun({
        ...next,
        id: ++runIds.current,
        back: false,
        traversal: false,
        fromKey: committed.current.key,
        coveredAt: null,
      });
    };
    return () => {
      overlay.start = null;
    };
  }, []);

  // A layout effect, so the listener is in place before the router's own.
  useLayoutEffect(() => {
    const holdUntilReleased = (key: string) => {
      let release = () => {};
      const until = new Promise<void>((resolve) => {
        release = resolve;
      });
      overlay.hold = { key, until, release };
    };

    const onPopState = () => {
      const entry = historyEntry();
      const to = `${window.location.pathname}${window.location.search}`;
      const label = routeLabel(to);

      // An overlay is already up: keep it, but it now names where this press
      // goes, and it stays down until that page has rendered.
      if (runPhase.current !== null) {
        if (overlay.hold) {
          overlay.hold.key = entry.key;
        } else if (runPhase.current === 'cover') {
          holdUntilReleased(entry.key);
        }
        const fromKey = committed.current.key;
        const now = performance.now();
        setRun((current) =>
          current && {
            ...current,
            to,
            label,
            traversal: true,
            fromKey,
            phase: current.phase === 'cover' ? 'cover' : 'hold',
            coveredAt: current.phase === 'cover' ? null : now,
          },
        );
        return;
      }

      const from = committed.current;
      if (prefersReducedMotion()) return;
      if (window.location.pathname === from.pathname) return;

      holdUntilReleased(entry.key);
      const back = entry.index < from.index;
      const replayed = back
        ? arrivedByKey(from.key, from.pathname)
        : arrivedByKey(entry.key, window.location.pathname);
      setRun({
        id: ++runIds.current,
        kind: arrivedBy.current!.get(replayed) ?? 'wave',
        to,
        label,
        phase: 'cover',
        origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        back,
        traversal: true,
        fromKey: from.key,
        coveredAt: null,
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      overlay.hold?.release();
      overlay.hold = null;
    };
  }, []);

  const loading = usePageLoading();
  // The new entry is committed and no loading fallback stands in for its page.
  const arrived = run !== null && key !== run.fromKey && !loading;
  const ready =
    arrived &&
    (MIN_COVERED_MS[run.kind] === 0 ||
      (run.coveredAt !== null && coveredLongEnough === run.coveredAt));
  const shown: ShownRun | null = run && {
    ...run,
    phase: run.phase === 'reveal' || (run.phase === 'hold' && ready) ? 'reveal' : 'cover',
  };

  const advance = useCallback(() => {
    if (!run) return;
    if (run.phase === 'cover') {
      if (run.traversal) {
        overlay.hold?.release();
        overlay.hold = null;
      } else {
        arriving.current = run.kind;
        if (run.go) run.go();
        else void navigate(run.to, { replace: run.replace });
      }
      setRun({ ...run, phase: 'hold', coveredAt: performance.now() });
    } else if (run.phase === 'reveal' || ready) {
      setRun(null);
    } else {
      // The page never arrived in time: lift the curtain on what is there.
      setRun({ ...run, phase: 'reveal' });
    }
  }, [run, ready, navigate]);

  useEffect(() => {
    if (!run) return;
    const waiting = run.phase === 'hold' && !ready;
    const timer = window.setTimeout(advance, waiting ? HOLD_TIMEOUT_MS : PHASE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [run, ready, advance]);

  const coveredAt = run?.coveredAt ?? null;
  const minCovered = run ? MIN_COVERED_MS[run.kind] : 0;
  useEffect(() => {
    if (coveredAt === null || minCovered === 0) return;
    const timer = window.setTimeout(
      () => setCoveredLongEnough(coveredAt),
      Math.max(0, coveredAt + minCovered - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [coveredAt, minCovered]);

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
      const record = arrivedBy.current!;
      const entry = arrivedByKey(key, pathname);
      // Re-inserted, so the most recently used entries are the ones kept.
      record.delete(entry);
      record.set(entry, arriving.current);
      writeArrivedBy(sessionStore(), record);
      arriving.current = null;
    }
    if (previous.pathname === pathname) return;
    if (runPhase.current !== null || prefersReducedMotion()) return;
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
        <div key={shown.id} aria-hidden="true" onAnimationEnd={onAnimationEnd}>
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
