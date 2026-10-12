export interface TransferOptions {
  /** Bytes sent so far, and the total. */
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException('The upload was cancelled.', 'AbortError');
}

/**
 * PUT a blob to a signed storage URL, reporting progress. XMLHttpRequest
 * because fetch cannot report upload progress. No credentials and none of our
 * API's headers go to the storage origin.
 */
export function putWithProgress(blob: Blob, uploadUrl: string, { onProgress, signal }: TransferOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const request = new XMLHttpRequest();
    const onAbort = () => request.abort();

    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', blob.type || 'image/webp');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(blob.size, blob.size);
        resolve();
      } else {
        reject(new Error(`Upload failed (${request.status})`));
      }
    };
    request.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Upload failed. Check your connection and try again.'));
    };
    request.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    request.send(blob);
  });
}
