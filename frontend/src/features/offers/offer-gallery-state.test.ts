import { describe, expect, it } from 'vitest';
import { adjacentImageId } from './offer-gallery-state';

const imageIds = ['first', 'second', 'third'] as const;

describe('offer gallery navigation', () => {
  it('wraps next from the last image to the first', () => {
    expect(adjacentImageId(imageIds, 'third', 'next')).toBe('first');
  });

  it('wraps previous from the first image to the last', () => {
    expect(adjacentImageId(imageIds, 'first', 'previous')).toBe('third');
  });

  it('recovers a stale current image by selecting the first available image', () => {
    expect(adjacentImageId(imageIds, 'removed', 'next')).toBe('first');
  });

  it('has no destination when the gallery is empty', () => {
    expect(adjacentImageId([], 'removed', 'next')).toBeNull();
  });
});
