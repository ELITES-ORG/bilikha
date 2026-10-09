import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, KeyRound, Search, TriangleAlert, UserSearch } from 'lucide-react';
import {
  Avatar,
  Button,
  Container,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  AdminPageHeader,
  AdminStatusBadge,
  AdminToolbar,
  adminListClass,
} from './admin-ui';
import { formatAdminDate } from './admin-format';
import { useAccountSearch, useResetAccountPassword, useSetAccountStatus } from '@/features/admin/api';
import type { AdminAccount } from '@/features/admin/types';
import { toApiError } from '@/lib/api-client';

/**
 * The one moment the temporary password is readable (ADR 0051).
 *
 * It is rendered from mutation state and never refetched, because there is
 * nowhere to refetch it from — the server kept only the hash. Leaving the
 * screen loses it, which the copy explains, and the way out of that is another
 * reset rather than a lookup.
 */
function TemporaryPassword({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // No clipboard permission, or an insecure origin. The password is on
      // screen to be read either way, so this needs no error of its own.
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-hairline bg-surface-sunken p-4">
      <p className="text-sm font-medium text-ink">
        Temporary password for {username}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-sm bg-paper px-3 py-2 font-mono text-md text-ink select-all">
          {password}
        </code>
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden /> Copy
            </>
          )}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">
        Read it to them now — it is not shown again and cannot be looked up. They are signed
        out everywhere, and this password does nothing except let them set a new one.
      </p>
    </div>
  );
}

function AccountRow({ account }: { account: AdminAccount }) {
  const toast = useToast();
  const setStatus = useSetAccountStatus();
  const resetPassword = useResetAccountPassword();
  const [reason, setReason] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [issued, setIssued] = useState<{ username: string; temporaryPassword: string } | null>(
    null,
  );
  const suspended = account.status === 'suspended';

  async function resetTheirPassword() {
    setConfirmingReset(false);
    try {
      const result = await toast.run(
        'Resetting password…',
        () => resetPassword.mutateAsync({ userId: account.id }),
        { success: 'Password reset', error: (error) => toApiError(error).message },
      );
      setIssued(result);
    } catch {
      // Already reported in the toast.
    }
  }

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
    <li className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-10">
      <div className="flex min-w-0 gap-4">
        <Avatar src={null} name={account.fullName} size="md" />
        <div className="min-w-0">
          <p className="font-semibold break-words text-ink">{account.fullName}</p>
          <p className="text-sm break-words text-ink-muted">
            @{account.username} · {account.email}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AdminStatusBadge status={suspended ? 'suspended' : 'active'} />
            {account.role === 'admin' && <AdminStatusBadge status="admin" />}
            <span className="text-xs text-ink-subtle">
              Joined <time dateTime={account.createdAt}>{formatAdminDate(account.createdAt)}</time>
            </span>
          </div>
          {account.profileSlug && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Link
                to={`/creatives/${account.profileSlug}`}
                className="u-tap inline-flex items-center gap-1 font-semibold text-ink underline-offset-4 hover:underline"
              >
                Creative profile
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              {account.profileStatus && <AdminStatusBadge status={account.profileStatus} />}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5 lg:border-l lg:border-hairline lg:pl-10">
        {account.role === 'admin' ? (
          <p className="text-sm text-ink-subtle">Administrator accounts are not moderated here.</p>
        ) : suspended ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
              label="Reason for suspending"
              hint="Required, and recorded in the moderation history. Suspending ends their session and hides their profile, offers and postings."
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              size="sm"
              variant="danger"
              disabled={!reason.trim() || setStatus.isPending}
              loading={setStatus.isPending}
              onClick={() => void apply('suspend')}
            >
              Suspend
            </Button>
          </div>
        )}

        {account.role !== 'admin' && (
          <div className="space-y-3 border-t border-hairline pt-5">
            {issued ? (
              <TemporaryPassword username={issued.username} password={issued.temporaryPassword} />
            ) : confirmingReset ? (
              <div className="space-y-3">
                <p className="text-sm text-ink">
                  Reset the password for <strong>{account.username}</strong>? They will be
                  signed out everywhere and must set a new password before they can do
                  anything. Verify who you are talking to first.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={resetPassword.isPending}
                    onClick={() => void resetTheirPassword()}
                  >
                    Reset password
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmingReset(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<KeyRound className="size-4" aria-hidden="true" />}
                  onClick={() => setConfirmingReset(true)}
                >
                  Reset password
                </Button>
                <p className="text-sm text-ink-muted">
                  For someone locked out. Shown once, so have them on the phone.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
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
      <AdminPageHeader
        title="Accounts"
        description="Find an account to suspend, reinstate, or reset its password. Suspending ends its session and takes its profile, offers and postings off every public surface; reinstating puts them all back."
      />

      <AdminToolbar>
        <form onSubmit={onSearch} className="flex w-full flex-col gap-3 sm:flex-row sm:items-start" noValidate>
          <div className="min-w-0 sm:flex-1 xl:max-w-xl">
            <Input
              type="search"
              aria-label="Find an account"
              placeholder="Username, email, or name"
              hint="At least two characters."
              iconLeft={<Search className="size-4" />}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={term.trim().length < 2}>
            Search
          </Button>
        </form>
      </AdminToolbar>

      <div className="mt-8">
        {!query && (
          <EmptyState
            icon={<UserSearch className="size-5" />}
            title="Search for an account"
            description="Search by username, email or name to see an account and what you can do with it."
          />
        )}

        {results.isPending && query && (
          <ul className={adminListClass} aria-label="Searching">
            {[0, 1].map((i) => (
              <li key={i} className="flex gap-4 py-6" aria-hidden="true">
                <Skeleton radius="full" className="size-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {results.isError && (
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not search accounts"
            description={results.error.message}
          />
        )}

        {results.data && results.data.length === 0 && (
          <EmptyState
            title="No accounts match"
            description="Try the username exactly, or part of an email address."
          />
        )}

        {results.data && results.data.length > 0 && (
          <>
            <p className="mb-3 text-sm text-ink-muted" data-numeric>
              {results.data.length} {results.data.length === 1 ? 'account' : 'accounts'}
            </p>
            <ul className={adminListClass}>
              {results.data.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}
