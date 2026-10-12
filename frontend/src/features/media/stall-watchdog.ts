export interface StallWatchdog {
  /** Call on every progress event; the wait starts again from now. */
  progress(): void;
  /** Stop watching for good: on success, error or cancel. */
  stop(): void;
}

/**
 * Calls `onStall` when no progress has been reported for `timeoutMs`, then
 * keeps watching, so an upload that stalls again is caught again. A connection
 * can stop moving without ever failing, and then nothing else would notice.
 */
export function watchForStall(timeoutMs: number, onStall: () => void): StallWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function arm() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      onStall();
      if (!stopped) arm();
    }, timeoutMs);
  }

  arm();
  return {
    progress() {
      if (!stopped) arm();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
