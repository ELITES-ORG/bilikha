/**
 * One upload's life, as a pure reducer: checking the file, sending it,
 * confirming it with the API, then done. It can fail or be cancelled on the
 * way. Once it is done, failed or cancelled, nothing moves it again.
 */

export type UploadState =
  | { status: 'checking' }
  | { status: 'uploading'; sent: number; total: number }
  | { status: 'confirming' }
  | { status: 'done' }
  | { status: 'failed'; reason: string }
  | { status: 'cancelled' };

export type UploadEvent =
  /** The file passed its checks and has a ticket; `total` bytes are to be sent. */
  | { type: 'checked'; total: number }
  | { type: 'progress'; sent: number }
  /** Every byte is in storage. */
  | { type: 'transferred' }
  /** The API attached it. */
  | { type: 'confirmed' }
  /** A refusal reason or an API error code. */
  | { type: 'failed'; reason: string }
  | { type: 'cancel' };

export const initialUploadState: UploadState = { status: 'checking' };

export function isFinished(state: UploadState): boolean {
  return state.status === 'done' || state.status === 'failed' || state.status === 'cancelled';
}

export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  if (isFinished(state)) return state;

  switch (event.type) {
    case 'checked':
      return state.status === 'checking' ? { status: 'uploading', sent: 0, total: event.total } : state;
    case 'progress':
      if (state.status !== 'uploading') return state;
      return { ...state, sent: Math.min(Math.max(event.sent, state.sent), state.total) };
    case 'transferred':
      return state.status === 'uploading' ? { status: 'confirming' } : state;
    case 'confirmed':
      return state.status === 'confirming' ? { status: 'done' } : state;
    case 'failed':
      return { status: 'failed', reason: event.reason };
    case 'cancel':
      return { status: 'cancelled' };
  }
}
