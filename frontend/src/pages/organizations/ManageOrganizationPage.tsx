import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, UserPlus } from 'lucide-react';
import { AccountSkeleton } from '@/components/page-skeleton/parts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Container,
  Eyebrow,
  Input,
  Select,
  useToast,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import {
  OrganizationNotFoundError,
  useHandOver,
  useInvite,
  useLeaveOrganization,
  useManagedOrganization,
  useRemoveMember,
  useUpdateOrganization,
} from '@/features/organizations/api';
import { ROLE_LABEL, canManage } from '@/features/organizations/labels';
import {
  OrganizationFields,
  type OrganizationFormState,
} from './OrganizationFields';
import { OrganizationStatusBadge } from '@/features/organizations/OrganizationStatusBadge';
import type {
  ManagedOrganization,
  ManagedOrganizationMember,
  OrganizationRole,
  UpdateOrganizationPayload,
} from '@/features/organizations/types';
import type { MessageKey } from '@/i18n/catalogs/en';
import { useT } from '@/i18n/i18n-context';
import '@/i18n/catalogs/organizations';
import { Message } from '@/i18n/Message';
import { toApiError } from '@/lib/api-client';
import { pbBottomNav } from '@/lib/bottom-nav';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * The team's own view of its organisation (ADR 0054, plan 0051 phase 4).
 *
 * Every member can open it. What each person can do here mirrors the server's
 * rules exactly — the buttons are hidden, not just refused, so nobody is
 * offered an action that would fail — but the server is still the authority.
 * A plain member sees the team and the way out, and nothing else.
 */
export function ManageOrganizationPage() {
  const { slug } = useParams<{ slug: string }>();
  const organization = useManagedOrganization(slug);
  const { data: user } = useCurrentUser();

  if (organization.isError && organization.error instanceof OrganizationNotFoundError) {
    return <NotFoundPage />;
  }

  const data = organization.data;

  return (
    <main className={pbBottomNav}>
      <Container width="narrow" className="py-(--section-gap)">
        {organization.isPending && <AccountSkeleton />}
        {organization.isError && <p className="text-danger-700">{organization.error.message}</p>}
        {data && user && <ManageBody organization={data} myUserId={user.id} />}
      </Container>
    </main>
  );
}

const formErrorClass =
  'rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700';

function ManageBody({ organization, myUserId }: { organization: ManagedOrganization; myUserId: string }) {
  const manages = canManage(organization.myRole);

  return (
    <>
      <Eyebrow>
        <Message k="organizations.manage.eyebrow" />
      </Eyebrow>
      <h1 className="u-display mt-3 text-3xl break-words text-ink md:text-4xl">
        {organization.name}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <OrganizationStatusBadge status={organization.status} />
        <span className="text-sm text-ink-muted">
          <Message k="organizations.manage.yourRole" /> <Message k={ROLE_LABEL[organization.myRole]} />
        </span>
        {organization.status === 'published' && (
          <Link
            to={`/organizations/${organization.slug}`}
            className="link-underline u-tap inline-flex items-center gap-1 text-sm font-medium text-ink"
          >
            <Message k="organizations.manage.viewPublic" />
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      <StatusNotice organization={organization} />

      {manages && <EditSection organization={organization} />}
      <TeamSection organization={organization} myUserId={myUserId} />
      {manages && organization.status !== 'suspended' && <InviteSection organization={organization} />}
      <LeaveSection organization={organization} />
    </>
  );
}

const NOTICE: Record<ManagedOrganization['status'], { key: MessageKey; danger: boolean } | null> = {
  pending_review: { key: 'organizations.manage.notice.pending', danger: false },
  rejected: { key: 'organizations.manage.notice.rejected', danger: true },
  suspended: { key: 'organizations.manage.notice.suspended', danger: true },
  published: null,
};

function StatusNotice({ organization }: { organization: ManagedOrganization }) {
  const notice = NOTICE[organization.status];
  if (!notice) return null;

  return (
    <div
      role="status"
      className={
        notice.danger
          ? `mt-6 ${formErrorClass}`
          : 'mt-6 rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-muted'
      }
    >
      <p>
        <Message k={notice.key} />
      </p>
      {/* The administrator's words, in the language they wrote them in. */}
      {organization.status === 'rejected' && organization.rejectionReason && (
        <p className="mt-2 font-medium">“{organization.rejectionReason}”</p>
      )}
    </div>
  );
}

function toForm(organization: ManagedOrganization): OrganizationFormState {
  return {
    name: organization.name,
    bio: organization.bio ?? '',
    municipalitySlug: organization.municipality.slug,
    subdomainSlugs: organization.crafts.map((c) => c.slug),
    primarySubdomainSlug: organization.crafts.find((c) => c.isPrimary)?.slug ?? '',
  };
}

/** Only what changed is sent, so an unchanged save is not flagged for review. */
function changes(before: OrganizationFormState, after: OrganizationFormState, withCrafts: boolean) {
  const payload: UpdateOrganizationPayload = {};
  if (after.name !== before.name) payload.name = after.name;
  if (after.bio !== before.bio) payload.bio = after.bio.trim() ? after.bio : null;
  if (after.municipalitySlug !== before.municipalitySlug) payload.municipalitySlug = after.municipalitySlug;
  const craftsChanged =
    after.primarySubdomainSlug !== before.primarySubdomainSlug ||
    after.subdomainSlugs.join() !== before.subdomainSlugs.join();
  if (withCrafts && craftsChanged) {
    payload.subdomainSlugs = after.subdomainSlugs;
    payload.primarySubdomainSlug = after.primarySubdomainSlug;
  }
  return payload;
}

function EditSection({ organization }: { organization: ManagedOrganization }) {
  const t = useT();
  const toast = useToast();
  const update = useUpdateOrganization(organization.slug);
  const isFounder = organization.myRole === 'founder';
  const rejected = organization.status === 'rejected';
  const suspended = organization.status === 'suspended';
  const [form, setForm] = useState(() => toForm(organization));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onUpdate<K extends keyof OrganizationFormState>(key: K, value: OrganizationFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const payload = changes(toForm(organization), form, isFounder);
    if (Object.keys(payload).length === 0) {
      setFormError(t('organizations.manage.edit.nothingChanged'));
      return;
    }
    if (isFounder && !form.primarySubdomainSlug) {
      setFieldErrors({ subdomainSlugs: t('organizations.fields.craftsRequired') });
      return;
    }

    try {
      await update.mutateAsync(payload);
      toast.success(t(rejected ? 'organizations.manage.edit.resubmitted' : 'organizations.manage.edit.saved'));
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      else setFormError(toApiError(error).message);
    }
  }

  return (
    <section className="mt-(--section-gap)" aria-labelledby="edit-heading">
      <h2 id="edit-heading" className="u-display text-2xl text-ink">
        <Message k="organizations.manage.edit.heading" />
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        <Message
          k={
            organization.status === 'published'
              ? 'organizations.manage.edit.publishedNote'
              : 'organizations.manage.edit.draftNote'
          }
        />
      </p>
      <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-6" noValidate>
        {formError && (
          <p className={formErrorClass} role="alert">
            {formError}
          </p>
        )}
        <fieldset disabled={suspended} className="space-y-6">
          <OrganizationFields
            form={form}
            fieldErrors={fieldErrors}
            canEditCrafts={isFounder}
            craftNames={organization.crafts.map((c) => c.name)}
            onUpdate={onUpdate}
          />
        </fieldset>
        <Button type="submit" loading={update.isPending} disabled={suspended || update.isPending}>
          <Message k={rejected ? 'organizations.manage.edit.resubmit' : 'organizations.manage.edit.save'} />
        </Button>
      </form>
    </section>
  );
}

/** Mirrors `removeMember` in the membership service. */
function canRemove(myRole: OrganizationRole, myUserId: string, member: ManagedOrganizationMember) {
  if (member.userId === myUserId || member.role === 'founder') return false;
  if (myRole === 'founder') return true;
  return myRole === 'co_founder' && member.role === 'member';
}

function TeamSection({ organization, myUserId }: { organization: ManagedOrganization; myUserId: string }) {
  const showInvitations = canManage(organization.myRole) && organization.invitations.length > 0;

  return (
    <section className="mt-(--section-gap)" aria-labelledby="team-heading">
      <h2 id="team-heading" className="u-display text-2xl text-ink">
        <Message k="organizations.page.team" />
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        <Message k="organizations.manage.team.note" />
      </p>
      <ul className="mt-6 space-y-3">
        {organization.members.map((member) => (
          <li key={member.userId}>
            <MemberRow organization={organization} member={member} myUserId={myUserId} />
          </li>
        ))}
      </ul>

      {showInvitations && (
        <>
          <h3 className="mt-8 text-sm font-semibold text-ink">
            <Message k="organizations.manage.team.invited" />
          </h3>
          <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
            {organization.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 font-medium break-words text-ink">{invitation.displayName}</span>
                <span className="text-sm break-all text-ink-muted">@{invitation.username}</span>
                <span className="text-sm text-ink-muted">
                  <Message k={ROLE_LABEL[invitation.role]} />
                </span>
                {invitation.expired ? (
                  <Badge tone="neutral">
                    <Message k="organizations.manage.team.expired" />
                  </Badge>
                ) : (
                  <span className="text-sm text-ink-subtle" data-numeric>
                    <Message k="organizations.manage.team.until" />{' '}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MemberRow({
  organization,
  member,
  myUserId,
}: {
  organization: ManagedOrganization;
  member: ManagedOrganizationMember;
  myUserId: string;
}) {
  const t = useT();
  const toast = useToast();
  const remove = useRemoveMember(organization.slug);
  const handOver = useHandOver(organization.slug);
  const [confirming, setConfirming] = useState<'remove' | 'hand-over' | null>(null);
  const removable = organization.status !== 'suspended' && canRemove(organization.myRole, myUserId, member);
  const canHandOver = organization.myRole === 'founder' && member.userId !== myUserId;

  async function act() {
    const action = confirming;
    setConfirming(null);
    try {
      if (action === 'remove') {
        await toast.run(t('organizations.manage.member.removing'), () => remove.mutateAsync(member.userId), {
          success: t('organizations.manage.member.removed'),
        });
      } else if (action === 'hand-over') {
        await toast.run(t('organizations.manage.member.handingOver'), () => handOver.mutateAsync(member.userId), {
          success: t('organizations.manage.member.handedOver'),
        });
      }
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <Card elevation="flat">
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar src={null} name={member.displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-medium break-words text-ink">
              {member.displayName}
              {member.userId === myUserId && (
                <span className="font-normal text-ink-muted">
                  {' '}
                  <Message k="organizations.manage.member.you" />
                </span>
              )}
            </p>
            <p className="text-sm break-words text-ink-muted">
              <Message k={ROLE_LABEL[member.role]} />
              {member.title && ` · ${member.title}`}
            </p>
            {!member.profileSlug && (
              <p className="text-sm text-ink-subtle">
                <Message k="organizations.manage.member.profileHidden" />
              </p>
            )}
          </div>
        </div>

        {confirming ? (
          <div className="space-y-3 border-t border-hairline pt-3">
            <p className="text-sm text-ink">
              <Message
                k={
                  confirming === 'remove'
                    ? 'organizations.manage.member.confirmRemove'
                    : 'organizations.manage.member.confirmHandOver'
                }
              />
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant={confirming === 'remove' ? 'danger' : 'primary'}
                onClick={() => void act()}
              >
                <Message
                  k={confirming === 'remove' ? 'organizations.manage.member.remove' : 'organizations.manage.member.handOver'}
                />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirming(null)}>
                <Message k="organizations.manage.cancel" />
              </Button>
            </div>
          </div>
        ) : (
          (removable || canHandOver) && (
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
              {canHandOver && (
                <Button size="sm" variant="ghost" onClick={() => setConfirming('hand-over')}>
                  <Message k="organizations.manage.member.makeFounder" />
                </Button>
              )}
              {removable && (
                <Button size="sm" variant="ghost" onClick={() => setConfirming('remove')}>
                  <Message k="organizations.manage.member.remove" />
                </Button>
              )}
            </div>
          )
        )}
      </CardBody>
    </Card>
  );
}

function InviteSection({ organization }: { organization: ManagedOrganization }) {
  const t = useT();
  const toast = useToast();
  const invite = useInvite(organization.slug);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'member' | 'co_founder'>('member');
  const [title, setTitle] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    try {
      const result = await invite.mutateAsync({ username, role, title: title || undefined });
      toast.success(t(result.refreshed ? 'organizations.manage.invite.resent' : 'organizations.manage.invite.sent'));
      setUsername('');
      setTitle('');
      setRole('member');
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      else setFormError(toApiError(error).message);
    }
  }

  return (
    <section className="mt-(--section-gap)" aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="u-display text-2xl text-ink">
        <Message k="organizations.manage.invite.heading" />
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        <Message k="organizations.manage.invite.intro" />
      </p>
      <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-5" noValidate>
        {formError && (
          <p className={formErrorClass} role="alert">
            {formError}
          </p>
        )}
        <Input
          label={<Message k="organizations.manage.invite.username" />}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={fieldErrors.username}
        />
        {/* Only the founder may make someone a co-founder (ADR 0054). */}
        {organization.myRole === 'founder' && (
          <Select
            id="invite-role"
            label={t('organizations.manage.invite.role')}
            hint={t('organizations.manage.invite.roleHint')}
            value={role}
            onValueChange={(next) => setRole(next === 'co_founder' ? 'co_founder' : 'member')}
            options={[
              { value: 'member', label: t(ROLE_LABEL.member) },
              { value: 'co_founder', label: t(ROLE_LABEL.co_founder) },
            ]}
          />
        )}
        <Input
          label={<Message k="organizations.manage.invite.title" />}
          hint={t('organizations.manage.invite.titleHint')}
          maxLength={60}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={fieldErrors.title}
        />
        <Button
          type="submit"
          loading={invite.isPending}
          disabled={invite.isPending || !username.trim()}
          iconLeft={<UserPlus className="size-4" aria-hidden="true" />}
        >
          <Message k="organizations.manage.invite.submit" />
        </Button>
      </form>
    </section>
  );
}

function LeaveSection({ organization }: { organization: ManagedOrganization }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const leave = useLeaveOrganization(organization.slug);
  const [confirming, setConfirming] = useState(false);
  const isFounder = organization.myRole === 'founder';
  const alone = organization.members.length === 1;
  // The founder of a team with others in it cannot leave; they hand over first.
  const blocked = isFounder && !alone;
  const closes = isFounder && alone;

  async function onLeave() {
    setConfirming(false);
    try {
      await toast.run(t('organizations.manage.leave.leaving'), () => leave.mutateAsync(), {
        success: t(closes ? 'organizations.manage.leave.closed' : 'organizations.manage.leave.left'),
      });
      void navigate('/account', { replace: true });
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <section className="mt-(--section-gap) border-t border-hairline pt-8" aria-labelledby="leave-heading">
      <h2 id="leave-heading" className="text-sm font-semibold text-ink">
        <Message k={closes ? 'organizations.manage.leave.closeHeading' : 'organizations.manage.leave.heading'} />
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        <Message
          k={
            blocked
              ? 'organizations.manage.leave.founderBlocked'
              : closes
                ? 'organizations.manage.leave.founderAlone'
                : 'organizations.manage.leave.member'
          }
        />
      </p>
      {!blocked &&
        (confirming ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button size="sm" variant="danger" loading={leave.isPending} onClick={() => void onLeave()}>
              <Message k={closes ? 'organizations.manage.leave.confirmClose' : 'organizations.manage.leave.confirm'} />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              <Message k="organizations.manage.cancel" />
            </Button>
          </div>
        ) : (
          <Button className="mt-4" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            <Message k={closes ? 'organizations.manage.leave.closeHeading' : 'organizations.manage.leave.confirm'} />
          </Button>
        ))}
    </section>
  );
}
