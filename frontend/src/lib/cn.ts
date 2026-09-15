import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities beating earlier ones of the
 * same kind. Lets a caller pass `className="px-6"` to a component that already
 * sets `px-4` without fighting specificity.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
