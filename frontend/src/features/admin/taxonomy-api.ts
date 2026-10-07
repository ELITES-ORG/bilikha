/**
 * The admin taxonomy data layer (plan 0047 phase 4, ADR 0049).
 *
 * Separate from `features/admin/api.ts` because it shares nothing with the
 * moderation queues: a different cache key, a different invalidation rule, and
 * the one query in the app that is allowed to see archived items.
 *
 * Response shapes come from `@contracts/taxonomy` (ADR 0037) — nothing here
 * redeclares them.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  AdminTaxonomyDomain,
  AdminTaxonomySubdomain,
  TaxonomyChangeEntry,
} from '@contracts/taxonomy';
import type { ListMeta } from '@contracts/pagination';

export type { AdminTaxonomyDomain, AdminTaxonomySubdomain, TaxonomyChangeEntry };

/** Which of the two tables a route addresses — the API's own path segment. */
export type TaxonomyKind = 'domains' | 'subdomains';

interface ApiResponse<T> {
  data: T;
}

interface ChangesResponse {
  data: TaxonomyChangeEntry[];
  meta: ListMeta;
}

export const adminTaxonomyKeys = {
  all: ['admin', 'taxonomy'] as const,
  tree: () => [...adminTaxonomyKeys.all, 'tree'] as const,
  changes: (page: number) => [...adminTaxonomyKeys.all, 'changes', page] as const,
};

/**
 * The whole tree in one request, archived items included. Nine domains and 81
 * sub-domains is small enough that paging it would cost more than it saves,
 * and an administrator renaming one item wants to see its siblings.
 */
export function useAdminTaxonomy() {
  return useQuery({
    queryKey: adminTaxonomyKeys.tree(),
    queryFn: async (): Promise<AdminTaxonomyDomain[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AdminTaxonomyDomain[]>>('/admin/taxonomy');
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useTaxonomyChanges(page: number) {
  return useQuery({
    queryKey: adminTaxonomyKeys.changes(page),
    queryFn: async (): Promise<ChangesResponse> => {
      try {
        const { data } = await apiClient.get<ChangesResponse>('/admin/taxonomy/changes', {
          params: { page, limit: 20 },
        });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/**
 * Every mutation invalidates the admin tree *and* the public taxonomy query.
 *
 * The public one matters: `useCreativeDomains` holds `staleTime: Infinity`
 * because reference data on a metered connection is not worth refetching
 * (constraint 3). That is right for a visitor and wrong for the administrator
 * who just archived something — without this they would keep seeing the item
 * in their own pickers until a reload. This invalidates one client, the one
 * that made the change; it is not the polling ADR 0049 §5 rejects.
 */
function useInvalidateTaxonomy() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminTaxonomyKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] }),
    ]);
}

export function useCreateDomain() {
  const invalidate = useInvalidateTaxonomy();

  return useMutation({
    mutationFn: async (input: {
      slug: string;
      name: string;
      description?: string;
    }): Promise<AdminTaxonomyDomain> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AdminTaxonomyDomain>>(
          '/admin/taxonomy/domains',
          input,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: invalidate,
  });
}

export function useCreateSubdomain() {
  const invalidate = useInvalidateTaxonomy();

  return useMutation({
    mutationFn: async (input: {
      domainSlug: string;
      slug: string;
      name: string;
    }): Promise<AdminTaxonomySubdomain> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AdminTaxonomySubdomain>>(
          '/admin/taxonomy/subdomains',
          input,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: invalidate,
  });
}

/**
 * No `slug` in the payload, and none accepted by the server either — a slug is
 * a public URL segment and changing one breaks every link that pointed at it
 * (ADR 0049). The server returns 400 for a `slug` key rather than ignoring it,
 * so this type is the first of two defences, not the only one.
 */
export function useUpdateTaxonomyItem() {
  const invalidate = useInvalidateTaxonomy();

  return useMutation({
    mutationFn: async (input: {
      kind: TaxonomyKind;
      slug: string;
      name?: string;
      description?: string | null;
      displayOrder?: number;
    }): Promise<void> => {
      const { kind, slug, ...body } = input;
      try {
        await apiClient.patch(`/admin/taxonomy/${kind}/${slug}`, body);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: invalidate,
  });
}

export function useArchiveTaxonomyItem() {
  const invalidate = useInvalidateTaxonomy();

  return useMutation({
    mutationFn: async (input: {
      kind: TaxonomyKind;
      slug: string;
      action: 'archive' | 'restore';
    }): Promise<void> => {
      try {
        await apiClient.post(`/admin/taxonomy/${input.kind}/${input.slug}/${input.action}`);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: invalidate,
  });
}

/**
 * Only ever reachable when `referenceCount` is 0 — the server returns 409 with
 * the count otherwise, and the page does not offer the control at all.
 */
export function useDeleteTaxonomyItem() {
  const invalidate = useInvalidateTaxonomy();

  return useMutation({
    mutationFn: async (input: { kind: TaxonomyKind; slug: string }): Promise<void> => {
      try {
        await apiClient.delete(`/admin/taxonomy/${input.kind}/${input.slug}`);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: invalidate,
  });
}
