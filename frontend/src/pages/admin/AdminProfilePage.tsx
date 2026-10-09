import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminProfile, useModerateProfile } from '@/features/admin/api';
import { Badge, Button, ButtonLink, Container, EmptyState, Input, Skeleton } from '@/components/ui';
import { ArrowLeft, Star, TriangleAlert } from 'lucide-react';
import {
  AdminFact,
  AdminPageHeader,
  AdminStatusBadge,
  adminListClass,
} from './admin-ui';
import { formatAdminDate } from './admin-format';

export function AdminProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const profile = useAdminProfile(id);
  const moderate = useModerateProfile(id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function decide(
    action: 'approved' | 'rejected' | 'returned_to_pending' | 'acknowledged_edit',
  ) {
    setError(null);
    try {
      await moderate.mutateAsync({
        action,
        reason: action === 'rejected' ? reason : undefined,
      });
      void navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision');
    }
  }

  return (
    <Container width="wide" className="py-(--section-gap)">
      {/* Return from a detail view — not section navigation. */}
      <ButtonLink
        to="/admin"
        variant="ghost"
        size="sm"
        className="-ml-3"
        iconLeft={<ArrowLeft className="size-4" aria-hidden="true" />}
      >
        Back to the queue
      </ButtonLink>

      {profile.isPending && (
        <div className="mt-8 space-y-4" aria-label="Loading the registration">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-40 w-full max-w-2xl" />
        </div>
      )}

      {profile.isError && (
        <div className="mt-8">
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not load this profile"
            description={profile.error.message}
            action={
              <Button variant="secondary" size="sm" onClick={() => void profile.refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      )}

      {profile.data && (
        <>
          <div className="mt-8">
            <AdminPageHeader
              eyebrow="Registration"
              title={
                <>
                  {profile.data.firstName}
                  {profile.data.middleName ? ` ${profile.data.middleName}` : ''}{' '}
                  {profile.data.lastName}
                  {profile.data.suffix ? ` ${profile.data.suffix}` : ''}
                </>
              }
            >
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-md text-ink-muted">@{profile.data.username}</span>
                <AdminStatusBadge status={profile.data.status} />
                {profile.data.status === 'published' && profile.data.editedSinceReviewAt && (
                  <AdminStatusBadge status="edited" label="Edited since review" />
                )}
              </div>
            </AdminPageHeader>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="min-w-0 space-y-10">
              <section aria-labelledby="details-heading">
                <h2 id="details-heading" className="u-display text-2xl text-ink">
                  Details
                </h2>
                <dl className="mt-5 grid gap-x-8 gap-y-5 border-y border-hairline py-6 sm:grid-cols-2">
                  <AdminFact term="Municipality">{profile.data.municipality}</AdminFact>
                  <AdminFact term="Registered">
                    <time dateTime={profile.data.createdAt}>
                      {new Date(profile.data.createdAt).toLocaleString()}
                    </time>
                  </AdminFact>
                  <AdminFact term="Email">{profile.data.email}</AdminFact>
                  <AdminFact term="Phone">{profile.data.phone}</AdminFact>
                  <AdminFact term="Date of birth">{profile.data.birthDate}</AdminFact>
                  <AdminFact term="Status">{profile.data.status.replaceAll('_', ' ')}</AdminFact>
                </dl>
              </section>

              <section aria-labelledby="crafts-heading">
                <h2 id="crafts-heading" className="u-display text-2xl text-ink">
                  Crafts
                </h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {profile.data.subdomains.map((sub) => (
                    <li key={sub.slug}>
                      <Badge
                        tone={sub.isPrimary ? 'brand' : 'neutral'}
                        icon={sub.isPrimary ? <Star className="size-3.5" aria-hidden="true" /> : undefined}
                      >
                        {sub.name}
                        {sub.isPrimary ? ' · primary' : ''}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="history-heading">
                <h2 id="history-heading" className="u-display text-2xl text-ink">
                  Moderation history
                </h2>
                {profile.data.history.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-subtle">No decisions yet.</p>
                ) : (
                  <ul className={`mt-4 ${adminListClass}`}>
                    {profile.data.history.map((entry, index) => (
                      <li key={`${entry.createdAt}-${index}`} className="py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="text-sm font-semibold text-ink first-letter:uppercase">
                            {entry.action.replaceAll('_', ' ')}
                            {entry.adminUsername && (
                              <span className="font-normal text-ink-muted"> · {entry.adminUsername}</span>
                            )}
                          </p>
                          <p className="text-xs text-ink-subtle">
                            <time dateTime={entry.createdAt}>{formatAdminDate(entry.createdAt)}</time>
                          </p>
                        </div>
                        {entry.reason && (
                          <p className="mt-1 text-sm text-ink-muted">{entry.reason}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section
              aria-labelledby="decision-heading"
              className="space-y-4 rounded-md border border-hairline bg-surface p-5 lg:sticky lg:top-[calc(var(--staging-banner-h)+1.5rem)]"
            >
              <h2 id="decision-heading" className="u-display text-xl text-ink">
                Decision
              </h2>
              {error && (
                <p
                  className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  loading={moderate.isPending}
                  disabled={moderate.isPending}
                  onClick={() => void decide('approved')}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
                  aria-expanded={rejectOpen}
                  disabled={moderate.isPending}
                  onClick={() => setRejectOpen((open) => !open)}
                >
                  Reject
                </Button>
              </div>

              {rejectOpen && (
                <div className="space-y-3 border-t border-hairline pt-4">
                  <Input
                    label="Reason"
                    hint="The registrant will see this text exactly as written."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    variant="danger"
                    loading={moderate.isPending}
                    disabled={moderate.isPending || reason.trim().length === 0}
                    onClick={() => void decide('rejected')}
                  >
                    Confirm rejection
                  </Button>
                </div>
              )}

              {/* Acknowledge only exists on a published profile, so this group
                  is never empty when it shows. */}
              {profile.data.status !== 'pending_review' && (
                <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={moderate.isPending}
                    disabled={moderate.isPending}
                    onClick={() => void decide('returned_to_pending')}
                  >
                    Return to pending
                  </Button>
                  {profile.data.status === 'published' && profile.data.editedSinceReviewAt && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={moderate.isPending}
                      disabled={moderate.isPending}
                      onClick={() => void decide('acknowledged_edit')}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </Container>
  );
}
