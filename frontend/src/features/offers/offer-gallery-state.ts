export type GalleryDirection = 'previous' | 'next';

export function adjacentImageId(
  imageIds: readonly string[],
  currentId: string,
  direction: GalleryDirection,
): string | null {
  if (imageIds.length === 0) return null;

  const currentIndex = imageIds.indexOf(currentId);
  if (currentIndex === -1) return imageIds[0]!;

  const step = direction === 'next' ? 1 : -1;
  const adjacentIndex = (currentIndex + step + imageIds.length) % imageIds.length;
  return imageIds[adjacentIndex]!;
}
