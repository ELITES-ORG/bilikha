import { encodeCanvas } from '@/lib/image';

/**
 * Reading a picked audio or video file in the browser: its length, its video
 * codec and a poster frame. None of it uploads anything, and every function
 * answers null (or 'unknown') rather than throwing, so a file the browser
 * cannot read is refused with a message instead of an error.
 */

export type VideoCodec = 'avc1' | 'avc3' | 'hvc1' | 'hev1' | 'webm' | 'unknown';

const PROBE_TIMEOUT_MS = 10_000;
const POSTER_EDGE = 960;

/** Loads a media element on an object URL, runs `work`, and always cleans up. */
function withMediaElement<T>(
  file: File,
  tag: 'audio' | 'video',
  work: (element: HTMLMediaElement, settle: (value: T) => void) => void,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(tag);
    let settled = false;
    const settle = (value: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => settle(fallback), PROBE_TIMEOUT_MS);
    element.muted = true;
    element.preload = 'metadata';
    element.addEventListener('error', () => settle(fallback));
    work(element, settle);
    element.src = url;
  });
}

/** Seconds, or null when the browser cannot read the file's length within 10 s. */
export function readDuration(file: File): Promise<number | null> {
  const tag = file.type.startsWith('video/') ? 'video' : 'audio';
  return withMediaElement<number | null>(
    file,
    tag,
    (element, settle) => {
      element.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(element.duration)) {
          settle(element.duration);
          return;
        }
        // Recorded WebM often reports Infinity until asked to seek past the end.
        element.addEventListener('durationchange', () => {
          if (Number.isFinite(element.duration)) settle(element.duration);
        });
        element.currentTime = Number.MAX_SAFE_INTEGER;
      });
    },
    null,
  );
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
}

/** A box's size and header length at `offset`, or null when it is cut off or malformed. */
function boxAt(bytes: Uint8Array, offset: number, end: number): { size: number; header: number } | null {
  if (offset + 8 > end) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(offset);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > end) return null;
    size = Number(view.getBigUint64(offset + 8));
    header = 16;
  } else if (size === 0) {
    size = end - offset;
  }
  if (size < header || offset + size > end) return null;
  return { size, header };
}

/** The children of type `type` among the boxes in `[start, end)`. */
function childBoxes(bytes: Uint8Array, start: number, end: number, type: string): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  let offset = start;
  while (offset < end) {
    const box = boxAt(bytes, offset, end);
    if (!box) break;
    if (boxType(bytes, offset) === type) found.push([offset + box.header, offset + box.size]);
    offset += box.size;
  }
  return found;
}

const VIDEO_CODECS: ReadonlySet<string> = new Set(['avc1', 'avc3', 'hvc1', 'hev1']);

/**
 * The video codec named in an MP4's sample descriptions, from bytes holding
 * its top-level boxes (at least the whole `moov`). Walks
 * `moov › trak › mdia › minf › stbl › stsd` and returns the first track whose
 * first sample entry is a video codec. A WebM (EBML header) answers 'webm'.
 */
export function codecFromMp4Bytes(bytes: Uint8Array): VideoCodec {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'webm';
  }
  for (const [moovStart, moovEnd] of childBoxes(bytes, 0, bytes.length, 'moov')) {
    for (const [trakStart, trakEnd] of childBoxes(bytes, moovStart, moovEnd, 'trak')) {
      let ranges: Array<[number, number]> = [[trakStart, trakEnd]];
      for (const type of ['mdia', 'minf', 'stbl', 'stsd']) {
        ranges = ranges.flatMap(([start, end]) => childBoxes(bytes, start, end, type));
      }
      for (const [stsdStart, stsdEnd] of ranges) {
        // A full box: version and flags (4 bytes), then the entry count (4 bytes).
        const entry = stsdStart + 8;
        if (!boxAt(bytes, entry, stsdEnd)) continue;
        const codec = boxType(bytes, entry);
        if (VIDEO_CODECS.has(codec)) return codec as VideoCodec;
      }
    }
  }
  return 'unknown';
}

/** The `moov` of a large file can be several megabytes; past this it is not read. */
const MAX_MOOV_BYTES = 32 * 1024 * 1024;

async function readBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/**
 * The file's video codec. Reads only box headers until it finds `moov`, then
 * that box alone, so a 300 MB video costs a few kilobytes to megabytes.
 */
export async function videoCodec(file: File): Promise<VideoCodec> {
  try {
    const head = await readBytes(file, 0, 16);
    if (codecFromMp4Bytes(head) === 'webm') return 'webm';

    let offset = 0;
    while (offset + 8 <= file.size) {
      const header = await readBytes(file, offset, Math.min(offset + 16, file.size));
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      let size = view.getUint32(0);
      if (size === 1) {
        if (header.length < 16) return 'unknown';
        size = Number(view.getBigUint64(8));
      } else if (size === 0) {
        size = file.size - offset;
      }
      if (size < 8) return 'unknown';

      if (boxType(header, 0) === 'moov') {
        if (size > MAX_MOOV_BYTES || offset + size > file.size) return 'unknown';
        return codecFromMp4Bytes(await readBytes(file, offset, offset + size));
      }
      offset += size;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * A still from the video, at one second or halfway through a shorter one,
 * with its long edge at most 960 px. Null on any failure: a video without a
 * poster still uploads.
 */
export function capturePoster(file: File): Promise<Blob | null> {
  return withMediaElement<Blob | null>(
    file,
    'video',
    (element, settle) => {
      const video = element as HTMLVideoElement;
      video.preload = 'auto';
      video.playsInline = true;
      video.addEventListener('loadedmetadata', () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.min(1, duration / 2);
      });
      video.addEventListener('seeked', () => {
        void (async () => {
          try {
            const longEdge = Math.max(video.videoWidth, video.videoHeight);
            if (longEdge === 0) {
              settle(null);
              return;
            }
            const scale = longEdge > POSTER_EDGE ? POSTER_EDGE / longEdge : 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) {
              settle(null);
              return;
            }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const webp = await encodeCanvas(canvas, 'image/webp', 0.82);
            if (webp && webp.type === 'image/webp') {
              settle(webp);
              return;
            }
            settle(await encodeCanvas(canvas, 'image/jpeg', 0.82));
          } catch {
            settle(null);
          }
        })();
      }, { once: true });
    },
    null,
  );
}
