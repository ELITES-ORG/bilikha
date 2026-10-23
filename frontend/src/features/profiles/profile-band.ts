/**
 * The band at the top of a creative's profile, and the cover uploader's
 * preview of it (ADR 0061). Its height follows its own width, so it scales
 * smoothly from a phone to a desktop rather than stepping at breakpoints:
 * about 134px tall on a 375px phone, about 190px on a tablet, and capped at
 * 300px (4:1) on a wide screen, where a cover keeps most of its photo. A short
 * screen, a phone on its side, keeps a low band.
 *
 * The height reads the width through container units, so the band sits inside
 * a size container: `profileBandFrameClass` on the element around it.
 */
export const profileBandFrameClass = '@container';

export const profileBandClass =
  'relative h-[clamp(6rem,3.7rem+20cqw,18.75rem)] overflow-hidden rounded-lg bg-primary short:h-24';
