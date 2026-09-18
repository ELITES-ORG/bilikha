/**
 * The shape every paginated list answers with (ADR 0037).
 *
 * `page` and `limit` are what was applied, not what was asked for. Today those
 * are the same — the schemas reject an out-of-range limit rather than clamping
 * it — so a route may build this from its parsed query. A service that starts
 * clamping has to return its own meta instead, or this will quietly misreport.
 */
export interface ListMeta {
  page: number;
  limit: number;
  total: number;
}

/** A page of rows plus the meta describing the page. */
export interface Paginated<T> {
  data: T[];
  meta: ListMeta;
}
