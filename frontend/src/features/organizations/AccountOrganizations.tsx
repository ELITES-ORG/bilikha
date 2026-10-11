import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { Button, ButtonLink, Card, Skeleton, useToast } from '@/components/ui';
import { useT } from '@/i18n/i18n-context';
import { Message } from '@/i18n/Message';
import { useAnswerInvitation, useMyOrganizationInvitations, useMyOrganizations } from './api';
import { ROLE_LABEL } from './labels';
import { OrganizationStatusBadge } from './OrganizationStatusBadge';
import type { MyOrganizationInvitation } from './types';

/**
 * The account hub's organisations card (plan 0051 step 4.3): invitations
 * waiting on this person first, because they expire, then the organisations
 * they belong to, then the way to found one. Shown to creatives only — nobody
 * else can found or join one (ADR 0054).
 */
export function AccountOrganizations() {
  const mine = useMyOrganizations();
  const invitations = useMyOrganizationInvitations();
  const loading = mine.isPending || invitations.isPending;
  const empty = !loading && !mine.data?.length && !invitations.data?.length;

  return (
    <Card as="section" aria-labelledby="hub-organizations" className="mt-6 overflow-hidden">
      <h2 id="hub-organizations" className="px-5 pt-5 pb-3 text-xl text-ink">
        <Message k="organizations.account.heading" />
      </h2>

      {loading && (
        <div className="space-y-2 border-t border-hairline px-5 py-4" aria-hidden="true">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      )}

      {(mine.isError || invitations.isError) && (
        <p className="border-t border-hairline px-5 py-4 text-sm text-danger-700">
          {(mine.error ?? invitations.error)?.message}
        </p>
      )}

      {empty && (
        <p className="border-t border-hairline px-5 py-4 text-sm text-ink-muted">
          <Message k="organizations.account.empty" />
        </p>
      )}

      {(invitations.data?.length ?? 0) > 0 || (mine.data?.length ?? 0) > 0 ? (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {invitations.data?.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
          {mine.data?.map((organization) => (
            <li key={organization.slug}>
              <Link
                to={`/organizations/${organization.slug}/manage`}
                className="group flex min-h-14 items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold break-words text-ink">
                    {organization.name}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <Message k={ROLE_LABEL[organization.role]} />
                    <OrganizationStatusBadge status={organization.status} />
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-ink-muted transition-transform motion-safe:group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-hairline px-5 py-4">
        <ButtonLink
          to="/organizations/new"
          variant="secondary"
          size="sm"
          iconLeft={<Plus className="size-4" aria-hidden="true" />}
        >
          <Message k="organizations.account.found" />
        </ButtonLink>
      </div>
    </Card>
  );
}

function InvitationRow({ invitation }: { invitation: MyOrganizationInvitation }) {
  const t = useT();
  const toast = useToast();
  const answer = useAnswerInvitation();

  function reply(choice: 'accept' | 'decline') {
    void toast
      .run(t('organizations.account.answering'), () => answer.mutateAsync({ id: invitation.id, answer: choice }), {
        success: t(choice === 'accept' ? 'organizations.account.accepted' : 'organizations.account.declined'),
      })
      .catch(() => {
        // Already reported in the toast.
      });
  }

  return (
    <li className="space-y-3 bg-surface-sunken px-5 py-4">
      <div>
        <p className="text-xs font-semibold tracking-wider text-ink-subtle uppercase">
          <Message k="organizations.account.invitation" />
        </p>
        <p className="mt-1 text-sm font-semibold break-words text-ink">{invitation.organization.name}</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          <Message k={ROLE_LABEL[invitation.role]} />
          {invitation.title && ` · ${invitation.title}`}
        </p>
        {invitation.invitedBy && (
          <p className="mt-0.5 text-sm text-ink-muted">
            <Message k="organizations.account.invitedBy" /> {invitation.invitedBy}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={answer.isPending} onClick={() => reply('accept')}>
          <Message k="organizations.account.accept" />
        </Button>
        <Button size="sm" variant="secondary" disabled={answer.isPending} onClick={() => reply('decline')}>
          <Message k="organizations.account.decline" />
        </Button>
      </div>
    </li>
  );
}
