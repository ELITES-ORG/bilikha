import type { MediaKind, UploadTicket, UploadTicketBody } from '@contracts/media';
import { DISPLAY_EDGE, THUMB_EDGE, resizeImage } from '@/lib/image';
import { mimeTypeOf } from './checks';
import { capturePoster } from './probe';
import { putWithProgress } from './put-upload';
import { tusUpload } from './tus-upload';

/**
 * Sending one checked file to storage, wherever it is going (ADR 0046,
 * ADR 0060): an image is resized into a display image and a thumbnail and
 * sent by two signed PUTs; audio, video and PDF go resumably, a video with a
 * poster frame beside it. The caller says where the ticket comes from and what
 * happens once every byte is in storage.
 */

/** What the ticket needs to know about the file. The caller adds where it is going. */
export type TicketFile = Omit<Extract<UploadTicketBody, { destination: 'offer' }>, 'destination' | 'offerId'>;

export type TransferEvent =
  /** An image is resized: from here a failure is the transfer's, not the file's. */
  | { type: 'prepared' }
  /** The API reserved room. Abandon it if the transfer does not finish. */
  | { type: 'ticket'; reservationId: string }
  /** `total` bytes are to be sent. */
  | { type: 'checked'; total: number }
  | { type: 'progress'; sent: number };

export interface TransferOptions {
  requestTicket: (file: TicketFile) => Promise<UploadTicket>;
  onEvent: (event: TransferEvent) => void;
  signal: AbortSignal;
}

function cancelled(): DOMException {
  return new DOMException('The upload was cancelled.', 'AbortError');
}

export const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Sends `file` as `kind` and resolves with its reservation once every byte is
 * in storage. Rejects with an AbortError when `signal` aborts.
 */
export async function transferFile(
  file: File,
  kind: MediaKind,
  durationSeconds: number | null,
  { requestTicket, onEvent, signal }: TransferOptions,
): Promise<string> {
  const ticketFor = async (body: TicketFile) => {
    const ticket = await requestTicket(body);
    onEvent({ type: 'ticket', reservationId: ticket.reservationId });
    if (signal.aborted) throw cancelled();
    return ticket;
  };

  if (kind === 'image') {
    const [display, thumb] = await Promise.all([resizeImage(file, DISPLAY_EDGE), resizeImage(file, THUMB_EDGE)]);
    onEvent({ type: 'prepared' });
    if (signal.aborted) throw cancelled();
    const ticket = await ticketFor({ kind, mimeType: display.type, sizeBytes: display.size, thumbSizeBytes: thumb.size });
    if (ticket.transport !== 'put') throw new Error('Unexpected upload ticket.');
    onEvent({ type: 'checked', total: display.size + thumb.size });
    const sent = [0, 0];
    const report = (index: 0 | 1) => (bytes: number) => {
      sent[index] = bytes;
      onEvent({ type: 'progress', sent: sent[0]! + sent[1]! });
    };
    await Promise.all([
      putWithProgress(display, ticket.file.uploadUrl, { onProgress: report(0), signal }),
      putWithProgress(thumb, ticket.thumb.uploadUrl, { onProgress: report(1), signal }),
    ]);
    return ticket.reservationId;
  }

  const poster = kind === 'video' ? await capturePoster(file) : null;
  if (signal.aborted) throw cancelled();
  const ticket = await ticketFor({
    kind,
    mimeType: mimeTypeOf(file),
    sizeBytes: file.size,
    ...(durationSeconds !== null ? { durationSeconds } : {}),
    ...(poster ? { thumbSizeBytes: poster.size } : {}),
  });
  if (ticket.transport !== 'tus') throw new Error('Unexpected upload ticket.');
  const posterBytes = poster && ticket.poster ? poster.size : 0;
  onEvent({ type: 'checked', total: file.size + posterBytes });
  if (poster && ticket.poster) {
    await putWithProgress(poster, ticket.poster.uploadUrl, {
      onProgress: (bytes) => onEvent({ type: 'progress', sent: bytes }),
      signal,
    });
  }
  await tusUpload(file, ticket.tus, {
    onProgress: (bytes) => onEvent({ type: 'progress', sent: posterBytes + bytes }),
    signal,
  });
  return ticket.reservationId;
}
