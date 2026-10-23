import { describe, expect, it } from 'vitest';
import { coverSize, resizeCover } from './image';

/**
 * A cover is stored at two widths, fitted to width and never upscaled
 * (ADR 0061). The drawing itself needs a browser; the sizes are plain logic.
 */
describe('cover sizes', () => {
  it('refuses a photo too small to fill the band', () => {
    expect(coverSize(1000, 800)).toBeNull();
    expect(coverSize(1200, 399)).toBeNull();
    expect(coverSize(1199, 400)).toBeNull();
  });

  it('accepts the smallest photo that fills it', () => {
    expect(coverSize(1200, 400)).toEqual({
      full: { width: 1200, height: 400 },
      small: { width: 768, height: 256 },
    });
  });

  it('fits a large photo to 1920 and 768 wide, keeping its proportions', () => {
    expect(coverSize(4000, 3000)).toEqual({
      full: { width: 1920, height: 1440 },
      small: { width: 768, height: 576 },
    });
  });

  it('never upscales a photo narrower than 1920', () => {
    expect(coverSize(1300, 500)).toEqual({
      full: { width: 1300, height: 500 },
      small: { width: 768, height: 295 },
    });
  });

  it('refuses a file over 20 MB before trying to read it', async () => {
    const file = new File([new Uint8Array(21 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    await expect(resizeCover(file)).rejects.toThrow('That photo is too large — try one under 20 MB');
  });
});
