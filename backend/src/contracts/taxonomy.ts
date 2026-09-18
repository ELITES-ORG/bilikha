/**
 * Reference taxonomy responses — domains, municipalities, barangays (ADR 0037).
 */

export interface CreativeSubdomain {
  id: string;
  domainId: string;
  slug: string;
  name: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeDomain {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  subdomains: CreativeSubdomain[];
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
