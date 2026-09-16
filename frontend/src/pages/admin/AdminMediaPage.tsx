import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { RequireAdmin } from '@/features/auth/RequireAdmin';
import { apiClient, toApiError } from '@/lib/api-client';
import { Button, ButtonLink, Container, EmptyState, Skeleton } from '@/components/ui';

type MediaRow = {
  id: string;
  kind: 'avatar' | 'portfolio';
  createdAt: string;
  url: string | null;
  thumbUrl: string | null;
  caption: string | null;
  ownerName: string;
  profileSlug: string | null;
};

interface ListResponse {
  data: MediaRow[];
  meta: { page: number; limit: number; total: number };
}

function useAdminMedia() {
  return useQuery({
    queryKey: ['admin', 'media'],
    queryFn: async (): Promise<ListResponse> => {
      try {
        const { data } = await apiClient.get<ListResponse>('/admin/media', {
          params: { page: 1, limit: 50 },
        });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function AdminMediaPage() {
  return (
    <RequireAdmin>
      <AdminMediaInner />
    </RequireAdmin>
  );
}

function AdminMediaInner() {
  const queryClient = useQueryClient();
  const list = useAdminMedia();

  const review = useMutation({
    mutationFn: async (input: {
      kind: 'avatar' | 'portfolio';
      id: string;
      action: 'approve' | 'remove';
    }) => {
      try {
        await apiClient.post(`/admin/media/${input.kind}/${input.id}/review`, {
          action: input.action,
        });
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'media'] });
    },
  });

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="wide" className="flex h-16 items-center justify-between">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
          <div className="flex gap-2">
            <ButtonLink to="/admin" variant="ghost" size="sm">
              Profiles
            </ButtonLink>
            <ButtonLink to="/" variant="ghost" size="sm">
              Back to site
            </ButtonLink>
          </div>
        </Container>
      </header>
      <RegistrationStatusBanner />

      <main>
        <Container width="wide" className="py-(--section-gap)">
          <p className="u-eyebrow">Administration</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Media review</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Images are live as soon as they are uploaded. Approve to clear the
            queue, or remove to take one down.
          </p>

          <div className="mt-10">
            {list.isPending && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full" />
                ))}
              </div>
            )}

            {list.isError && <p className="text-danger-700">{list.error.message}</p>}

            {list.data && list.data.data.length === 0 && (
              <EmptyState
                icon={<Inbox className="size-5" />}
                title="Nothing to review"
                description="New avatars and portfolio images will appear here."
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.data.data.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="space-y-3">
                    {item.thumbUrl ? (
                      <img
                        src={item.thumbUrl}
                        alt={item.caption ?? `${item.kind} by ${item.ownerName}`}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="aspect-square bg-clay-100" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-ink">{item.ownerName}</p>
                      <p className="text-xs text-ink-muted capitalize">{item.kind}</p>
                      {item.profileSlug && (
                        <Link
                          to={`/creatives/${item.profileSlug}`}
                          className="text-sm text-lawa-800 underline-offset-2 hover:underline"
                        >
                          View profile
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={review.isPending}
                        onClick={() =>
                          void review.mutateAsync({
                            kind: item.kind,
                            id: item.id,
                            action: 'approve',
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={review.isPending}
                        onClick={() =>
                          void review.mutateAsync({
                            kind: item.kind,
                            id: item.id,
                            action: 'remove',
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
}
