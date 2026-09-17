import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Badge, Button, ButtonLink, Container, Skeleton, useToast } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useEnsureConversation } from '@/features/conversations/api';
import { PostingNotFoundError, usePosting } from '@/features/postings/api';
import { formatTimeLeft } from '@/lib/posting-time';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function PostingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const posting = usePosting(id);
  const { data: user } = useCurrentUser();
  const ensure = useEnsureConversation();
  const [replying, setReplying] = useState(false);

  if (posting.isError && posting.error instanceof PostingNotFoundError) {
    return <NotFoundPage />;
  }

  const returnPath = id ? `/postings/${id}` : '/directory';
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;

  async function onReply() {
    if (!id || !posting.data) return;
    if (!user) {
      void navigate(loginHref);
      return;
    }
    setReplying(true);
    try {
      const thread = await ensure.mutateAsync({ postingId: id });
      void navigate(`/messages/${thread.id}?postingId=${encodeURIComponent(id)}`);
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setReplying(false);
    }
  }

  const clientName = posting.data?.client?.name ?? 'Client';
  const canReply = posting.data?.status === 'open' && posting.data.expiresAt > new Date().toISOString();

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          {posting.isPending && (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {posting.isError && !(posting.error instanceof PostingNotFoundError) && (
            <p className="text-danger-700">{posting.error.message}</p>
          )}

          {posting.data && (
            <>
              <p className="u-eyebrow">{posting.data.subdomain.domain}</p>
              <h1 className="u-display mt-3 text-4xl text-ink">{posting.data.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{posting.data.subdomain.name}</Badge>
                <p className="text-base font-medium text-ink">
                  {formatPriceRange(
                    posting.data.budgetMinCentavos,
                    posting.data.budgetMaxCentavos,
                  )}
                </p>
                <Badge tone="neutral">{formatTimeLeft(posting.data.expiresAt)}</Badge>
                {posting.data.status !== 'open' && (
                  <Badge tone="neutral">{posting.data.status}</Badge>
                )}
              </div>

              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
                <MapPin className="size-3.5" aria-hidden />
                {posting.data.municipality.name}
              </p>

              {posting.data.description && (
                <p className="mt-8 text-md text-ink text-pretty whitespace-pre-wrap">
                  {posting.data.description}
                </p>
              )}

              <div className="mt-10 flex items-center gap-4 border-t border-hairline pt-8">
                <Avatar
                  src={posting.data.client?.avatarUrl}
                  name={clientName}
                  size="md"
                />
                <div>
                  <p className="text-base font-medium text-ink">{clientName}</p>
                  <p className="mt-1 text-sm text-ink-muted">Posted this work</p>
                </div>
              </div>

              {posting.data.hasReplied && (
                <p className="mt-6 text-sm text-success-700">You already replied to this posting.</p>
              )}

              <div className="u-rule my-12" />

              <div className="flex flex-wrap gap-3">
                {canReply ? (
                  user ? (
                    <Button
                      size="lg"
                      loading={replying || ensure.isPending}
                      onClick={() => void onReply()}
                    >
                      Reply
                    </Button>
                  ) : (
                    <ButtonLink to={loginHref} size="lg">
                      Reply
                    </ButtonLink>
                  )
                ) : (
                  <p className="text-sm text-ink-muted">
                    This posting is closed or expired — you can still read it in your messages.
                  </p>
                )}
                <ButtonLink to="/directory" size="lg" variant="secondary">
                  Back to Home
                </ButtonLink>
              </div>
            </>
          )}
        </Container>
      </main>
    </>
  );
}
