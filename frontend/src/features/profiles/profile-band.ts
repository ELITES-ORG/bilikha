/**
 * The band at the top of a creative's profile, and the cover uploader's
 * preview of it (ADR 0061). Its height follows its own width, so it scales
 * smoothly from a phone to a desktop rather than stepping at breakpoints:
 * about 126px tall on a 375px phone, 177px at 640px and 249px at 1024px, and
 * capped at 300px (4:1) on a wide screen, where a cover keeps most of its
 * photo. A short screen, a phone on its side, keeps a low band.
 *
 * The height reads the width through container units, so the band sits inside
 * a size container: `profileBandFrameClass` on the element around it.
 */
export const profileBandFrameClass = '@container';

export const profileBandClass =
  'relative h-[clamp(6rem,3.7rem+20cqw,18.75rem)] overflow-hidden rounded-lg bg-primary short:h-24';

/** The band's height alone, for the profile's loading skeleton, so nothing moves when it loads. */
export const profileBandHeightClass = 'h-[clamp(6rem,3.7rem+20cqw,18.75rem)] short:h-24';
