/**
 * Browser-side image sizing. Originals are never uploaded — ADR 0021.
 * Fixed edges for the life of the product; do not write these numbers inline.
 */
export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Decode, fit the long edge to `maxEdge` (never upscale), encode as WebP with
 * JPEG fallback. Orientation is read from EXIF so phone portraits stay upright.
 */
export async function resizeImage(file: File, maxEdge: number): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That photo is too large — try one under 20 MB');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const name = file.name.toLowerCase();
    if (name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      throw new Error(
        'This iPhone photo format (HEIC) cannot be read in this browser. Open it in your Photos app and export a JPEG, then try again.',
      );
    }
    throw new Error('That file could not be read as an image. Try a JPEG or PNG instead.');
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not prepare that photo for upload. Try a different image.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webp = await encodeCanvas(canvas, 'image/webp', 0.82);
    const jpeg = await encodeCanvas(canvas, 'image/jpeg', 0.82);

    if (webp && jpeg) {
      return webp.size <= jpeg.size ? webp : jpeg;
    }
    if (webp) return webp;
    if (jpeg) return jpeg;

    throw new Error('Could not encode that photo. Try a different image.');
  } finally {
    bitmap.close();
  }
}
