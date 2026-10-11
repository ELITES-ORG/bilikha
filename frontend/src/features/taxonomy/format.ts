/**
 * The label for ONE offer, posting or creative's sub-domain: the curated
 * singular ("Mobile App Developer") when the API sent one, otherwise the official
 * plural name. Lists of categories — filters, pickers, domain listings — use
 * `name` directly, never this (issue #17).
 */
export function subdomainLabel(sub: { name: string; singularName?: string | null }): string {
  const singular = sub.singularName?.trim();
  return singular ? singular : sub.name;
}
