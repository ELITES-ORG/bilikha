import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAdminProfile, useModerateProfile } from '@/features/admin/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { RequireAdmin } from '@/features/auth/RequireAdmin';
import { Badge, Button, ButtonLink, Container, EmptyState, Input, Skeleton } from '@/components/ui';
import { TriangleAlert } from 'lucide-react';

export function AdminProfilePage() {
  return (
    <RequireAdmin>
      <AdminProfileInner />
    </RequireAdmin>
  );
}

function AdminProfileInner() {
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
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="wide" className="flex h-16 items-center justify-between">
          <Link to="/admin" className="u-display text-xl font-semibold text-ink">
            Bilikha Admin
          </Link>
          <ButtonLink to="/admin" variant="ghost" size="sm">
            Back to queue
          </ButtonLink>
        </Container>
      </header>
      <RegistrationStatusBanner />

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          {profile.isPending && (
            <div className="space-y-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {profile.isError && (
            <EmptyState
              icon={<TriangleAlert className="size-5" />}
              title="Could not load this profile"
              description={profile.error.message}
            />
          )}

          {profile.data && (
            <>
              <p className="u-eyebrow">Registration</p>
              <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
                {profile.data.firstName}
                {profile.data.middleName ? ` ${profile.data.middleName}` : ''}{' '}
                {profile.data.lastName}
                {profile.data.suffix ? ` ${profile.data.suffix}` : ''}
              </h1>
              <p className="mt-2 text-md text-ink-muted">@{profile.data.username}</p>

              <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                <Field label="Municipality" value={profile.data.municipality} />
                <Field
                  label="Registered"
                  value={new Date(profile.data.createdAt).toLocaleString()}
                />
                <Field label="Email" value={profile.data.email} />
                <Field label="Phone" value={profile.data.phone} />
                <Field
                  label="Date of birth"
                  value={profile.data.birthDate}
                />
                <Field label="Status" value={profile.data.status.replaceAll('_', ' ')} />
              </dl>

              <section className="mt-10">
                <h2 className="text-lg font-medium text-ink">Crafts</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {profile.data.subdomains.map((sub) => (
                    <li key={sub.slug}>
                      <Badge tone={sub.isPrimary ? 'accent' : 'neutral'}>
                        {sub.name}
                        {sub.isPrimary ? ' · primary' : ''}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-10">
                <h2 className="text-lg font-medium text-ink">Moderation history</h2>
                {profile.data.history.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-subtle">No decisions yet.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {profile.data.history.map((entry, index) => (
                      <li key={`${entry.createdAt}-${index}`} className="border-b border-hairline pb-3">
                        <p className="text-sm font-medium text-ink">
                          {entry.action.replaceAll('_', ' ')}
                          {entry.adminUsername ? ` · ${entry.adminUsername}` : ''}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {new Date(entry.createdAt).toLocaleString()}
                        </p>
                        {entry.reason && (
                          <p className="mt-1 text-sm text-ink-muted">{entry.reason}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-10 space-y-4">
                <h2 className="text-lg font-medium text-ink">Decision</h2>
                {error && (
                  <p className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    loading={moderate.isPending}
                    disabled={moderate.isPending}
                    onClick={() => void decide('approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    disabled={moderate.isPending}
                    onClick={() => setRejectOpen((open) => !open)}
                  >
                    Reject
                  </Button>
                  {profile.data.status !== 'pending_review' && (
                    <Button
                      variant="secondary"
                      loading={moderate.isPending}
                      disabled={moderate.isPending}
                      onClick={() => void decide('returned_to_pending')}
                    >
                      Return to pending
                    </Button>
                  )}
                  {profile.data.status === 'published' && profile.data.editedSinceReviewAt && (
                    <Button
                      variant="secondary"
                      loading={moderate.isPending}
                      disabled={moderate.isPending}
                      onClick={() => void decide('acknowledged_edit')}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>

                {rejectOpen && (
                  <div className="space-y-3 rounded-md border border-hairline p-4">
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
              </section>
            </>
          )}
        </Container>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}
