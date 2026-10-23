/**
 * Browser-side image sizing. Originals are never uploaded — ADR 0021.
 * Fixed edges for the life of the product; do not write these numbers inline.
 */
export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;
/** An ID photo must stay legible: a larger edge than any other image (issue #51). */
export const ID_EDGE = 2000;
/** A profile cover, fitted to width rather than the long edge (ADR 0061). */
export const COVER_WIDTH = 1920;
export const COVER_SMALL_WIDTH = 768;
/** Smaller than this and the band would show a blurred, stretched photo. */
export const COVER_MIN_WIDTH = 1200;
export const COVER_MIN_HEIGHT = 400;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/** Decode a picked file, refusing one too large to handle. Orientation is read from EXIF so phone portraits stay upright. */
async function decodeImage(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That photo is too large — try one under 20 MB');
  }

  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const name = file.name.toLowerCase();
    if (name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      throw new Error(
        'This iPhone photo format (HEIC) cannot be read in this browser. Open it in your Photos app and export a JPEG, then try again.',
      );
    }
    throw new Error('That file could not be read as an image. Try a JPEG or PNG instead.');
  }
}

/** Draw the bitmap at this size and encode it as WebP, with JPEG fallback. */
async function encodeImage(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare that photo for upload. Try a different image.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Only reach for JPEG when WebP is unavailable. Encoding both to compare
  // sizes doubles the work on the budget Android this is written for, and
  // WebP wins on photographic content essentially always.
  const webp = await encodeCanvas(canvas, 'image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;

  const jpeg = await encodeCanvas(canvas, 'image/jpeg', 0.82);
  if (jpeg) return jpeg;

  throw new Error('Could not encode that photo. Try a different image.');
}

/**
 * Decode, fit the long edge to `maxEdge` (never upscale), encode as WebP with
 * JPEG fallback. Orientation is read from EXIF so phone portraits stay upright.
 */
export async function resizeImage(file: File, maxEdge: number): Promise<Blob> {
  const bitmap = await decodeImage(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    return await encodeImage(bitmap, width, height);
  } finally {
    bitmap.close();
  }
}

interface Size {
  width: number;
  height: number;
}

/** Fit the width to `maxWidth`, never upscaling, keeping the photo's proportions. */
function fitWidth(width: number, height: number, maxWidth: number): Size {
  const scale = width > maxWidth ? maxWidth / width : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A cover's two stored sizes, fitted to width (ADR 0061), or null when the
 * photo is too small to fill the band.
 */
export function coverSize(width: number, height: number): { full: Size; small: Size } | null {
  if (width < COVER_MIN_WIDTH || height < COVER_MIN_HEIGHT) return null;
  return { full: fitWidth(width, height, COVER_WIDTH), small: fitWidth(width, height, COVER_SMALL_WIDTH) };
}

/** Decode once, and encode a cover at both widths. */
export async function resizeCover(file: File): Promise<{ full: Blob; small: Blob }> {
  const bitmap = await decodeImage(file);
  try {
    const size = coverSize(bitmap.width, bitmap.height);
    if (!size) {
      throw new Error(
        `That photo is too small for a cover — use one at least ${COVER_MIN_WIDTH} × ${COVER_MIN_HEIGHT} pixels`,
      );
    }
    const full = await encodeImage(bitmap, size.full.width, size.full.height);
    const small = await encodeImage(bitmap, size.small.width, size.small.height);
    return { full, small };
  } finally {
    bitmap.close();
  }
}
