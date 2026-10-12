import type { UploadTicket } from '@contracts/media';
import { mimeTypeOf } from './checks';
import type { TransferOptions } from './put-upload';
import { watchForStall, type StallWatchdog } from './stall-watchdog';

export type TusTarget = Extract<UploadTicket, { transport: 'tus' }>['tus'];

/** Supabase accepts resumable uploads only in chunks of exactly 6 MiB. */
const CHUNK_SIZE = 6 * 1024 * 1024;

/** No progress for this long means a request is stuck. Longer than every retry delay added up (38 s). */
const STALL_TIMEOUT_MS = 45_000;

function abortError(): DOMException {
  return new DOMException('The upload was cancelled.', 'AbortError');
}

/**
 * A resumable upload to storage, authorised by the ticket's token. A dropped
 * connection retries and carries on from the last accepted chunk instead of
 * starting again. The library loads only when the first such upload starts.
 */
export async function tusUpload(file: File, tus: TusTarget, { onProgress, signal }: TransferOptions = {}): Promise<void> {
  if (signal?.aborted) throw abortError();
  const { Upload } = await import('tus-js-client');
  if (signal?.aborted) throw abortError();

  await new Promise<void>((resolve, reject) => {
    let watchdog: StallWatchdog | null = null;
    const upload = new Upload(file, {
      endpoint: tus.endpoint,
      headers: { 'x-signature': tus.token },
      metadata: {
        bucketName: tus.bucket,
        objectName: tus.objectKey,
        contentType: mimeTypeOf(file),
        cacheControl: '3600',
      },
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => {
        watchdog?.progress();
        onProgress?.(sent, total);
      },
      onSuccess: () => {
        settle();
        resolve();
      },
      onError: (error) => {
        settle();
        reject(error);
      },
    });

    function settle() {
      watchdog?.stop();
      signal?.removeEventListener('abort', onAbort);
    }

    function onAbort() {
      watchdog?.stop();
      void upload.abort(true).catch(() => undefined);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    void upload
      .findPreviousUploads()
      .then((previous) => {
        if (signal?.aborted) return;
        // Only an earlier attempt at this ticket's object: another ticket's upload would land on the wrong key.
        const resumable = previous.find((entry) => entry.metadata.objectName === tus.objectKey);
        if (resumable) upload.resumeFromPreviousUpload(resumable);
        // A request that stops moving without failing is dropped and started again, which asks the server for its offset.
        watchdog = watchForStall(STALL_TIMEOUT_MS, () => {
          void upload.abort(false);
          upload.start();
        });
        upload.start();
      })
      .catch((error: unknown) => {
        settle();
        reject(error instanceof Error ? error : new Error('Upload failed.'));
      });
  });
}
