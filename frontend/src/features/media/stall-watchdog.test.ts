import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchForStall } from './stall-watchdog';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchForStall', () => {
  it('reports a stall once no progress has come for the whole wait', () => {
    const onStall = vi.fn();
    watchForStall(45_000, onStall);
    vi.advanceTimersByTime(44_999);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('starts the wait again on every progress event', () => {
    const onStall = vi.fn();
    const watchdog = watchForStall(45_000, onStall);
    vi.advanceTimersByTime(40_000);
    watchdog.progress();
    vi.advanceTimersByTime(40_000);
    watchdog.progress();
    vi.advanceTimersByTime(44_999);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('keeps watching after a stall, so a second stall is caught too', () => {
    const onStall = vi.fn();
    watchForStall(45_000, onStall);
    vi.advanceTimersByTime(90_000);
    expect(onStall).toHaveBeenCalledTimes(2);
  });

  it('never reports once stopped, even if progress arrives afterwards', () => {
    const onStall = vi.fn();
    const watchdog = watchForStall(45_000, onStall);
    vi.advanceTimersByTime(30_000);
    watchdog.stop();
    watchdog.progress();
    vi.advanceTimersByTime(200_000);
    expect(onStall).not.toHaveBeenCalled();
  });

  it('stops for good when stopped from inside a stall', () => {
    let watchdog: ReturnType<typeof watchForStall> | null = null;
    const onStall = vi.fn(() => watchdog?.stop());
    watchdog = watchForStall(45_000, onStall);
    vi.advanceTimersByTime(200_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });
});
