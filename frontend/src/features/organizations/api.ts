import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  AdminOrganizationRow,
  FoundOrganizationPayload,
  InvitePayload,
  ManagedOrganization,
  MyOrganization,
  MyOrganizationInvitation,
  OrganizationCard,
  OrganizationListParams,
  OrganizationStatus,
  PublicOrganization,
  UpdateOrganizationPayload,
} from './types';
import type { ListMeta } from '@contracts/pagination';

interface ApiResponse<T> {
  data: T;
}

/** A 404 from either organisation view — missing, unpublished, or not yours. */
export class OrganizationNotFoundError extends Error {
  constructor() {
    super('Organisation not found.');
    this.name = 'OrganizationNotFoundError';
  }
}

export const organizationKeys = {
  all: ['organizations'] as const,
  directory: (params: OrganizationListParams) => [...organizationKeys.all, 'directory', params] as const,
  public: (slug: string) => [...organizationKeys.all, 'public', slug] as const,
  managed: (slug: string) => [...organizationKeys.all, 'managed', slug] as const,
  mine: () => [...organizationKeys.all, 'mine'] as const,
  invitations: () => [...organizationKeys.all, 'invitations'] as const,
  adminQueue: (status: string, page: number) => [...organizationKeys.all, 'admin', status, page] as const,
  adminCounts: () => [...organizationKeys.all, 'admin', 'counts'] as const,
};

async function getData<T>(url: string, params?: object): Promise<T> {
  try {
    const { data } = await apiClient.get<ApiResponse<T>>(url, { params });
    return data.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      throw new OrganizationNotFoundError();
    }
    throw toApiError(error);
  }
}

async function send<T>(method: 'post' | 'patch' | 'delete', url: string, body?: object): Promise<T> {
  try {
    const { data } =
      method === 'delete'
        ? await apiClient.delete<ApiResponse<T>>(url)
        : await apiClient[method]<ApiResponse<T>>(url, body ?? {});
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * For the forms: keeps the Axios error so `toFieldErrors` can put each message
 * under its own field, as `features/me/api.ts` does. The form shows
 * `toApiError(error).message` for anything not tied to a field.
 */
async function submit<T>(method: 'post' | 'patch', url: string, body: object): Promise<T> {
  try {
    const { data } = await apiClient[method]<ApiResponse<T>>(url, body);
    return data.data;
  } catch (error) {
    if (error instanceof AxiosError) throw error;
    throw toApiError(error);
  }
}

export function useOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.public(slug ?? ''),
    queryFn: () => getData<PublicOrganization>(`/organizations/${slug}`),
    enabled: Boolean(slug),
    retry: (count, error) => !(error instanceof OrganizationNotFoundError) && count < 2,
  });
}

export function useManagedOrganization(slug: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.managed(slug ?? ''),
    queryFn: () => getData<ManagedOrganization>(`/organizations/${slug}/manage`),
    enabled: Boolean(slug),
    retry: (count, error) => !(error instanceof OrganizationNotFoundError) && count < 2,
  });
}

export function useMyOrganizations(enabled = true) {
  return useQuery({
    queryKey: organizationKeys.mine(),
    queryFn: () => getData<MyOrganization[]>('/organizations/mine'),
    enabled,
  });
}

export function useMyOrganizationInvitations(enabled = true) {
  return useQuery({
    queryKey: organizationKeys.invitations(),
    queryFn: () => getData<MyOrganizationInvitation[]>('/organizations/invitations'),
    enabled,
  });
}

export function useOrganizationDirectory(params: OrganizationListParams) {
  return useQuery({
    queryKey: organizationKeys.directory(params),
    queryFn: () => getData<OrganizationCard[]>('/organizations', params),
  });
}

/** Every organisation view can change after any write, so all of it refetches. */
function useInvalidateOrganizations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: organizationKeys.all });
}

export function useFoundOrganization() {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: (payload: FoundOrganizationPayload) =>
      submit<{ slug: string; status: OrganizationStatus }>('post', '/organizations', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateOrganization(slug: string) {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: (payload: UpdateOrganizationPayload) =>
      submit<{ slug: string; status: OrganizationStatus }>('patch', `/organizations/${slug}`, payload),
    onSuccess: invalidate,
  });
}

/** Not retried: a retry could send a second notification to the same person. */
export function useInvite(slug: string) {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    retry: false,
    mutationFn: (payload: InvitePayload) =>
      submit<{ id: string; expiresAt: string; refreshed: boolean }>(
        'post',
        `/organizations/${slug}/invitations`,
        payload,
      ),
    onSuccess: invalidate,
  });
}

export function useAnswerInvitation() {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: 'accept' | 'decline' }) =>
      send<{ slug?: string }>('post', `/organizations/invitations/${id}/${answer}`),
    onSuccess: invalidate,
  });
}

export function useLeaveOrganization(slug: string) {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: () => send<{ closed: boolean }>('post', `/organizations/${slug}/leave`),
    onSuccess: invalidate,
  });
}

export function useRemoveMember(slug: string) {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: (userId: string) =>
      send<{ removed: true }>('delete', `/organizations/${slug}/members/${userId}`),
    onSuccess: invalidate,
  });
}

export function useHandOver(slug: string) {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: (userId: string) =>
      send<{ handedOver: true }>('post', `/organizations/${slug}/founder`, { userId }),
    onSuccess: invalidate,
  });
}

export function useAdminOrganizations(status: string, page: number) {
  return useQuery({
    queryKey: organizationKeys.adminQueue(status, page),
    queryFn: async (): Promise<{ data: AdminOrganizationRow[]; meta: ListMeta }> => {
      try {
        const { data } = await apiClient.get<{ data: AdminOrganizationRow[]; meta: ListMeta }>(
          '/admin/organizations',
          { params: { status, page, limit: 20 } },
        );
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useAdminOrganizationCounts() {
  return useQuery({
    queryKey: organizationKeys.adminCounts(),
    queryFn: () => getData<Record<string, number>>('/admin/organizations/counts'),
  });
}

export function useModerateOrganization() {
  const invalidate = useInvalidateOrganizations();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: 'approved' | 'rejected' | 'acknowledged_edit';
      reason?: string;
    }) => send<{ status: OrganizationStatus }>('post', `/admin/organizations/${id}/moderate`, { action, reason }),
    onSuccess: invalidate,
  });
}
