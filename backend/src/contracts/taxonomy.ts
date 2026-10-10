/**
 * Reference taxonomy responses — domains, municipalities, barangays (ADR 0037).
 */

export interface CreativeSubdomain {
  id: string;
  domainId: string;
  slug: string;
  name: string;
  /** Singular label for one offer, posting or creative (issue #17). Optional only
   *  for deployment skew: an API deployed before #17 omits it. Read it through
   *  `subdomainLabel()` on the frontend, which falls back to `name`. */
  singularName?: string;
  displayOrder: number;
  /** Null means active. Public responses never carry an archived item. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeDomain {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  displayOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subdomains: CreativeSubdomain[];
}

/**
 * Admin taxonomy shapes (ADR 0049). The admin area is the only surface that
 * sees archived items, and the only one that needs to know how many rows
 * reference an item — that count is what decides whether deleting it is even
 * offered.
 */
export interface AdminTaxonomySubdomain extends CreativeSubdomain {
  referenceCount: number;
}

export interface AdminTaxonomyDomain extends Omit<CreativeDomain, 'subdomains'> {
  subdomains: AdminTaxonomySubdomain[];
  /** Rows referencing any of this domain's sub-domains. */
  referenceCount: number;
}

export type TaxonomyItemKind = 'domain' | 'subdomain';

export type TaxonomyChangeAction = 'created' | 'updated' | 'archived' | 'restored' | 'deleted';

export interface TaxonomyChangeEntry {
  id: string;
  itemKind: TaxonomyItemKind;
  itemSlug: string;
  action: TaxonomyChangeAction;
  /** Null when the administrator's account has since been deleted. */
  adminUsername: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface Municipality {
  id: string;
  slug: string;
  name: string;
  psgcCode: string | null;
  createdAt: string;
}

export interface Barangay {
  id: string;
  slug: string;
  name: string;
}
