/**
 * The decisions `AdminTaxonomyPage` makes before it renders anything, kept
 * apart from the JSX so they can be tested without a DOM.
 *
 * Two of them are safety rules rather than presentation: whether deletion is
 * offered at all, and which sibling a reorder swaps with. Getting the first
 * wrong offers an administrator a button the server will refuse with a 409;
 * getting it very wrong offers one it would accept (ADR 0049).
 */

/** The item fields these rules read — any shape carrying them will do. */
export interface TaxonomyItemLike {
  slug: string;
  displayOrder: number;
  referenceCount: number;
}

/**
 * "nothing references it" / "1 reference" / "13 references".
 *
 * The singular matters: this string sits under every craft name, so "1
 * references" is on screen more often than any other copy on the page.
 */
export function referencesLabel(count: number): string {
  if (count === 0) return 'nothing references it';
  return count === 1 ? '1 reference' : `${count} references`;
}

/**
 * Deletion is offered only when nothing points at the item. Archiving is the
 * action for everything else, and the server refuses the rest with a 409 — this
 * keeps the control from being drawn in the first place, rather than drawing it
 * disabled, so there is nothing to reach by keyboard either.
 */
export function canDelete(item: Pick<TaxonomyItemLike, 'referenceCount'>): boolean {
  return item.referenceCount === 0;
}

/**
 * The sibling a reorder swaps `displayOrder` with, or `undefined` at either
 * end of the list. Returning `undefined` rather than clamping is deliberate:
 * the caller disables the arrow, and a clamp would make the top item's "up"
 * swap with itself and write a pointless audit row.
 */
export function swapTarget<T extends TaxonomyItemLike>(
  siblings: readonly T[],
  index: number,
  direction: -1 | 1,
): T | undefined {
  return siblings[index + direction];
}

/**
 * The writes a reorder makes: the list renumbered 1…n with the item moved one
 * place, keeping only the items whose number changes.
 *
 * Swapping the two items' stored `displayOrder` looked equivalent and is not.
 * Two items can share a value — a reorder whose second request failed, or two
 * administrators creating at once — and swapping equal values moves nothing,
 * so the arrows stop working for that pair for good. Renumbering from the
 * list's own order repairs a tie or a gap on the first press. On a list that
 * is already 1…n, which is the seed's and the server's numbering, it is the
 * same two writes as a swap.
 */
export function reorderWrites<T extends TaxonomyItemLike>(
  siblings: readonly T[],
  index: number,
  direction: -1 | 1,
): { slug: string; displayOrder: number }[] {
  if (!swapTarget(siblings, index, direction)) return [];
  const order = [...siblings];
  const [moved] = order.splice(index, 1);
  order.splice(index + direction, 0, moved!);
  return order
    .map((item, position) => ({ slug: item.slug, displayOrder: position + 1, was: item.displayOrder }))
    .filter((entry) => entry.displayOrder !== entry.was)
    .map(({ slug, displayOrder }) => ({ slug, displayOrder }));
}
