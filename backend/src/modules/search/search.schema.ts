import { z } from 'zod';
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from './search-sql.js';

/**
 * The `q` field shared by the directory listings. A blank `q` — what an emptied
 * search box submits — is the same as no `q`, not an error.
 */
export const searchQueryField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH).optional(),
);
