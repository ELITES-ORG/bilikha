import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Container,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useAccountSearch, useSetAccountStatus } from '@/features/admin/api';
import type { AdminAccount } from '@/features/admin/types';
import { toApiError } from '@/lib/api-client';

function AccountRow({ account }: { account: AdminAccount }) {
  const toast = useToast();
  const setStatus = useSetAccountStatus();
  const [reason, setReason] = useState('');
  const suspended = account.status === 'suspended';

  async function apply(action: 'suspend' | 'reinstate') {
    try {
      await toast.run(
        action === 'suspend' ? 'Suspending account…' : 'Reinstating account…',
        () => setStatus.mutateAsync({ userId: account.id, action, reason: reason.trim() || undefined }),
        {
          success: action === 'suspend' ? 'Account suspended' : 'Account reinstated',
          error: (error) => toApiError(error).message,
        },
      );
      setReason('');
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <Card elevation="flat">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              {account.username}
              {suspended && <Badge tone="danger">Suspended</Badge>}
              {account.role === 'admin' && <Badge tone="neutral">Administrator</Badge>}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {account.fullName} · {account.email}
            </p>
            {account.profileSlug && (
              <p className="mt-1 text-sm text-ink-muted">
                Creative profile:{' '}
                <Link to={`/creatives/${account.profileSlug}`} className="link-underline text-lawa-700">
                  {account.profileSlug}
                </Link>{' '}
                · {account.profileStatus}
              </p>
            )}
          </div>
        </div>

        {account.role === 'admin' ? (
          <p className="text-sm text-ink-subtle">
            Administrator accounts are not moderated here.
          </p>
        ) : suspended ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              loading={setStatus.isPending}
              onClick={() => void apply('reinstate')}
            >
              Reinstate
            </Button>
            <p className="text-sm text-ink-muted">
              Their profile, offers and postings return to the directory.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              label="Reason"
              hint="Recorded in the moderation history. Required."
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="danger"
                disabled={!reason.trim() || setStatus.isPending}
                loading={setStatus.isPending}
                onClick={() => void apply('suspend')}
              >
                Suspend
              </Button>
              <p className="text-sm text-ink-muted">
                Ends their session and hides their profile, offers and postings.
              </p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function AdminAccountsPage() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const results = useAccountSearch(query);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(term.trim());
  }

  return (
    <Container width="wide" className="py-(--section-gap)">
      <p className="u-eyebrow">Administration</p>
      <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Accounts</h1>
      <p className="mt-3 max-w-xl text-md text-ink-muted">
        Suspending an account ends its session and takes its profile, offers and
        postings off every public surface. Reinstating puts them all back.
      </p>

      <form onSubmit={onSearch} className="mt-8 flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-56 flex-1">
          <Input
            label="Find an account"
            hint="Username, email, or name."
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={term.trim().length < 2}>
          Search
        </Button>
      </form>

      {results.isPending && query && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {results.isError && (
        <div className="mt-8">
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not search accounts"
            description={results.error.message}
          />
        </div>
      )}

      {results.data && results.data.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="No accounts match"
            description="Try the username exactly, or part of an email address."
          />
        </div>
      )}

      {results.data && results.data.length > 0 && (
        <div className="mt-8 space-y-4">
          {results.data.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </div>
      )}
    </Container>
  );
}
