/**
 * Postings feature types. Response shapes live in `@contracts/postings`
 * (ADR 0037). Write inputs and query params stay here.
 */

import type {
  Posting,
  PostingClient,
  PostingMunicipality,
  PostingStatus,
  PostingSubdomain,
} from '@contracts/postings';
import type { Paginated } from '@contracts/pagination';

export type {
  Posting,
  PostingClient,
  PostingMunicipality,
  PostingStatus,
  PostingSubdomain,
};

export type PostingWriteInput = {
  title: string;
  subdomainSlug: string;
  municipalitySlug: string;
  description?: string;
  budgetMinCentavos?: number;
  budgetMaxCentavos?: number;
  expiresInDays?: number;
};

export type PostingPatchInput = {
  title?: string;
  subdomainSlug?: string;
  municipalitySlug?: string;
  description?: string | null;
  budgetMinCentavos?: number | null;
  budgetMaxCentavos?: number | null;
};

export type ListPostingsParams = {
  domain?: string;
  subdomain?: string;
  municipality?: string;
  page?: number;
  limit?: number;
};

export type ListPostingsResult = Paginated<Posting>;
