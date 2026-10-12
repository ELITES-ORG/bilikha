import { describe, expect, it } from 'vitest';
import { initialUploadState, uploadReducer, type UploadEvent, type UploadState } from './upload-machine';

const run = (...events: UploadEvent[]): UploadState => events.reduce(uploadReducer, initialUploadState);

describe('uploadReducer', () => {
  it('goes checking, uploading, confirming, done', () => {
    expect(initialUploadState).toEqual({ status: 'checking' });
    expect(run({ type: 'checked', total: 100 })).toEqual({ status: 'uploading', sent: 0, total: 100 });
    expect(run({ type: 'checked', total: 100 }, { type: 'progress', sent: 40 })).toEqual({
      status: 'uploading',
      sent: 40,
      total: 100,
    });
    expect(run({ type: 'checked', total: 100 }, { type: 'transferred' })).toEqual({ status: 'confirming' });
    expect(run({ type: 'checked', total: 100 }, { type: 'transferred' }, { type: 'confirmed' })).toEqual({
      status: 'done',
    });
  });

  it('never reports more sent than the total, or fewer than before', () => {
    expect(run({ type: 'checked', total: 100 }, { type: 'progress', sent: 150 })).toMatchObject({ sent: 100 });
    expect(run({ type: 'checked', total: 100 }, { type: 'progress', sent: 60 }, { type: 'progress', sent: 30 })).toMatchObject({
      sent: 60,
    });
  });

  it('fails from any running state, keeping the reason', () => {
    expect(run({ type: 'failed', reason: 'size' })).toEqual({ status: 'failed', reason: 'size' });
    expect(run({ type: 'checked', total: 1 }, { type: 'failed', reason: 'MEDIA_QUOTA_EXCEEDED' })).toEqual({
      status: 'failed',
      reason: 'MEDIA_QUOTA_EXCEEDED',
    });
    expect(run({ type: 'checked', total: 1 }, { type: 'transferred' }, { type: 'failed', reason: 'x' })).toMatchObject({
      status: 'failed',
    });
  });

  it('cancels from any running state', () => {
    expect(run({ type: 'cancel' })).toEqual({ status: 'cancelled' });
    expect(run({ type: 'checked', total: 1 }, { type: 'cancel' })).toEqual({ status: 'cancelled' });
  });

  it('ignores a cancel once done or failed', () => {
    const done = run({ type: 'checked', total: 1 }, { type: 'transferred' }, { type: 'confirmed' });
    expect(uploadReducer(done, { type: 'cancel' })).toEqual({ status: 'done' });
    const failed = run({ type: 'failed', reason: 'type' });
    expect(uploadReducer(failed, { type: 'cancel' })).toEqual({ status: 'failed', reason: 'type' });
  });

  it('ignores progress, and everything else, after a cancel', () => {
    const cancelled = run({ type: 'checked', total: 100 }, { type: 'cancel' });
    expect(uploadReducer(cancelled, { type: 'progress', sent: 50 })).toEqual({ status: 'cancelled' });
    expect(uploadReducer(cancelled, { type: 'transferred' })).toEqual({ status: 'cancelled' });
    expect(uploadReducer(cancelled, { type: 'failed', reason: 'x' })).toEqual({ status: 'cancelled' });
  });

  it('ignores events out of order', () => {
    expect(run({ type: 'progress', sent: 5 })).toEqual({ status: 'checking' });
    expect(run({ type: 'confirmed' })).toEqual({ status: 'checking' });
    expect(run({ type: 'checked', total: 10 }, { type: 'checked', total: 99 })).toMatchObject({ total: 10 });
  });
});
