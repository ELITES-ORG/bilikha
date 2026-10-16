import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ImageOff, LoaderCircle, Lock, TriangleAlert } from 'lucide-react';
import type { AdminIdVerificationDetail, IdNumberMatch } from '@contracts/verification';
import { Button, ButtonLink, Container, EmptyState, Input, Skeleton, Textarea } from '@/components/ui';
import { useAdminIdVerification, useDecideAppeal, useDecideIdVerification } from '@/features/admin/api';
import { useCurrentUser } from '@/features/auth/api';
import { idTypeOption } from '@/features/verification/id-types';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { AdminFact, AdminPageHeader, AdminStatusBadge } from './admin-ui';
import { formatAdminDate } from './admin-format';
import {
  appealBody,
  appealProblem,
  changeBody,
  changeNeedsNumber,
  changeOptions,
  changeProblem,
  decisionBody,
  decisionProblem,
  ID_NUMBER_MAX,
  REASON_MAX,
  withNumberChange,
  type AppealDraft,
  type AppealOutcome,
  type DecidedStatus,
  type DecisionDraft,
  type IdDecision,
} from './id-review-logic';

const STATUS_LABEL = {
  verified: 'Verified',
  declined_retry: 'Declined — try again',
  declined_final: 'Declined — not from Biliran',
  appealed: 'Appealed',
} as const;

const DECLINE_LABEL = {
  retry: 'Decline — try again',
  final: 'Decline — not from Biliran',
} as const;

/** Why verify and not-from-Biliran are unavailable: they judge the ID itself. */
const NOT_SHOWN =
  'Verify and not-from-Biliran need every side of the ID on screen. Reload the page; if a side still does not load, send it back to try again.';

const CONFIRM_LABEL = {
  retry: 'Send back to try again',
  final: 'Decline as not from Biliran',
} as const;

/** A decision as a change offers it. */
const CHANGE_LABEL: Record<IdDecision, string> = {
  verify: 'Verified',
  retry: 'Try again',
  final: 'Not from Biliran',
};

/** What a change does to the person, said before it is made. */
const CHANGE_EFFECT: Record<IdDecision, string> = {
  verify: 'They can sign in and use their account, and are told their ID is verified.',
  retry: 'They are signed out, shown the reason, and can sign in to submit their ID again.',
  final: 'They are signed out and cannot sign in. They can appeal once, within 7 days.',
};

const EMPTY_DRAFT: DecisionDraft = { reason: '', idNumber: '', noIdNumber: false, acknowledgeMatch: false };

/**
 * One new account's ID (ADR 0057). The photos come as links signed for at most
 * five minutes, never past the 7 days after a decision, and opening this page
 * is recorded against the administrator. English only, like every admin screen.
 */
export function AdminIdReviewPage() {
  const { id = '' } = useParams();
  const review = useAdminIdVerification(id);

  return (
    <Container width="wide" className="py-(--section-gap)">
      {/* Return from a detail view — not section navigation. */}
      <ButtonLink
        to="/admin/people"
        variant="ghost"
        size="sm"
        className="-ml-3"
        iconLeft={<ArrowLeft className="size-4" aria-hidden="true" />}
      >
        Back to People
      </ButtonLink>

      {review.isPending && (
        <div className="mt-8 space-y-4" aria-label="Loading the ID">
          <Skeleton className="h-12 w-72" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="aspect-[3/2] w-full" />
            <Skeleton className="aspect-[3/2] w-full" />
          </div>
        </div>
      )}

      {review.isError && (
        <div className="mt-8">
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not load this ID"
            description={review.error.message}
            action={
              <Button variant="secondary" size="sm" onClick={() => void review.refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      )}

      {review.data && <Review detail={review.data} onExpired={() => void review.refetch()} />}
    </Container>
  );
}

type Side = 'Front' | 'Back';

function Review({ detail, onExpired }: { detail: AdminIdVerificationDetail; onExpired: () => void }) {
  const idType = idTypeOption(detail.idType);
  const waiting = detail.status === 'pending';
  const hasBack = idType?.hasBack !== false;
  // Sides that would not load even from a fresh link.
  const [broken, setBroken] = useState<Side[]>([]);
  const markBroken = (side: Side) =>
    setBroken((current) => (current.includes(side) ? current : [...current, side]));
  // Every side this ID has, on screen: what a verify or a not-from-Biliran
  // decline is a judgement about.
  const photosShown =
    Boolean(detail.frontUrl) &&
    !broken.includes('Front') &&
    (!hasBack || (Boolean(detail.backUrl) && !broken.includes('Back')));

  return (
    <>
      <div className="mt-8">
        <AdminPageHeader eyebrow="ID check" title={detail.fullName}>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-md text-ink-muted">@{detail.username}</span>
            <AdminStatusBadge status={detail.status === 'pending' ? 'pending_review' : detail.status} />
          </div>
        </AdminPageHeader>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="photos-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="photos-heading" className="u-display text-2xl text-ink">
                {idType?.label ?? 'The ID'}
              </h2>
              {detail.urlsExpireAt && (
                <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                  <Lock className="size-3.5" aria-hidden="true" />
                  These links stop working at{' '}
                  <time dateTime={detail.urlsExpireAt}>
                    {new Date(detail.urlsExpireAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </p>
              )}
            </div>
            {detail.frontUrl || detail.backUrl ? (
              <div className={cn('mt-5 grid gap-4', hasBack && 'sm:grid-cols-2')}>
                <IdPhoto url={detail.frontUrl} side="Front" onExpired={onExpired} onBroken={markBroken} />
                {hasBack && (
                  <IdPhoto url={detail.backUrl} side="Back" onExpired={onExpired} onBroken={markBroken} />
                )}
              </div>
            ) : (
              <p className="mt-5 flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
                <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {windowOver(detail)
                  ? 'The photos are no longer available. An ID can be looked at until 7 days after its decision; then the images are deleted.'
                  : 'The photos could not be loaded. Reload the page; if they still do not show, decline with “try again” so the person can submit new ones.'}
              </p>
            )}
          </section>

          <section aria-labelledby="registered-heading">
            <h2 id="registered-heading" className="u-display text-2xl text-ink">
              What they registered with
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-ink-muted">
              The ID must show a Biliran address or be issued in Biliran, and the person must be 18 or
              older.
            </p>
            <dl className="mt-5 grid gap-x-8 gap-y-5 border-y border-hairline py-6 sm:grid-cols-2">
              <AdminFact term="Name">{detail.fullName}</AdminFact>
              <AdminFact term="Date of birth">
                {detail.birthDate} · {detail.age} years old
              </AdminFact>
              <AdminFact term="Municipality">{detail.municipality ?? '—'}</AdminFact>
              <AdminFact term="Barangay">{detail.barangay ?? '—'}</AdminFact>
              <AdminFact term="ID type">{idType?.label ?? '—'}</AdminFact>
              <AdminFact term="Submitted">
                {detail.submittedAt ? formatAdminDate(detail.submittedAt) : '—'}
              </AdminFact>
            </dl>
          </section>
        </div>

        {waiting ? (
          <DecisionPanel key={detail.id} detail={detail} photosShown={photosShown} />
        ) : detail.status === 'appealed' ? (
          <AppealPanel key={detail.id} detail={detail} photosShown={photosShown} />
        ) : (
          <DecidedPanel key={detail.id} detail={detail} photosShown={photosShown} />
        )}
      </div>
    </>
  );
}

/**
 * A photo that fails to load has most likely outlived its link: fetch the
 * review again for fresh ones, once, rather than looping on a dead image. If
 * the fresh link fails too, the side is shown as not loaded.
 */
function IdPhoto({
  url,
  side,
  onExpired,
  onBroken,
}: {
  url: string | null;
  side: Side;
  onExpired: () => void;
  onBroken: (side: Side) => void;
}) {
  const retried = useRef(false);
  const [failed, setFailed] = useState(false);
  // The link this side has finished loading, so a fresh link after a failed
  // one shows as loading again.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  if (!url || failed) {
    return (
      <figure className="min-w-0">
        <div className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-hairline-strong bg-surface-sunken px-4 text-center text-sm text-ink-muted">
          <ImageOff className="size-5" aria-hidden="true" />
          This side could not be loaded.
        </div>
        <figcaption className="mt-2 text-xs font-semibold tracking-wider text-ink-subtle uppercase">
          {side}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="min-w-0">
      {/* An ID photo can take a while on a slow connection; an empty box
          would read as a missing photo. */}
      {loadedUrl !== url && (
        <div
          role="status"
          className="flex aspect-[3/2] w-full items-center justify-center gap-2 rounded-md border border-hairline bg-surface-sunken text-sm text-ink-muted"
        >
          <LoaderCircle className="anim-spin size-4" aria-hidden="true" />
          Loading photo…
        </div>
      )}
      <img
        src={url}
        alt={`${side} of the ID`}
        referrerPolicy="no-referrer"
        className={cn(
          'max-h-[32rem] w-full rounded-md border border-hairline bg-surface-sunken object-contain',
          loadedUrl !== url && 'hidden',
        )}
        onLoad={() => setLoadedUrl(url)}
        onError={() => {
          if (retried.current) {
            setFailed(true);
            onBroken(side);
            return;
          }
          retried.current = true;
          onExpired();
        }}
      />
      <figcaption className="mt-2 text-xs font-semibold tracking-wider text-ink-subtle uppercase">
        {side}
      </figcaption>
    </figure>
  );
}

/** Whether the 7 days after the decision are over, so the photos are gone for good. */
function windowOver(detail: AdminIdVerificationDetail): boolean {
  return Boolean(detail.decision && new Date(detail.decision.windowEndsAt).getTime() <= Date.now());
}

const panelClass =
  'space-y-5 rounded-md border border-hairline bg-surface p-5 lg:sticky lg:top-[calc(var(--staging-banner-h)+1.5rem)]';

/** Accounts whose ID carries the same number, before a verify or a grant. */
function MatchWarning({ matches, note }: { matches: IdNumberMatch[]; note: string }) {
  return (
    <div role="alert" className="rounded-sm border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700">
      <p className="font-semibold">This ID number is already on another account.</p>
      <ul className="mt-2 divide-y divide-warning-100 border-y border-warning-100">
        {matches.map((match) => (
          <li key={`${match.username}-${match.decidedAt ?? 'open'}`} className="py-2">
            @{match.username} · {STATUS_LABEL[match.status as keyof typeof STATUS_LABEL] ?? 'Waiting'}
            {match.decidedAt ? ` · ${formatAdminDate(match.decidedAt)}` : ''}
          </li>
        ))}
      </ul>
      <p className="mt-2">{note}</p>
    </div>
  );
}

function PhotosNotShown() {
  return (
    <p className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
      <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {NOT_SHOWN}
    </p>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
      {children}
    </p>
  );
}

/**
 * One answer to pick before sending. An option, not an action: it is outlined,
 * and picked it is tinted with a tick — never solid like the button that
 * actually sends, so the two cannot be mistaken for each other.
 */
function Choice({
  selected,
  tone = 'neutral',
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  const looks = {
    neutral: selected
      ? 'border-navy-600 bg-navy-50 text-navy-800'
      : 'border-hairline-strong bg-surface text-ink hover:border-navy-600',
    danger: selected
      ? 'border-danger-600 bg-danger-50 text-danger-700'
      : 'border-hairline-strong bg-surface text-danger-700 hover:border-danger-600',
  } as const;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-sm border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        looks[tone],
      )}
    >
      {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** The matches from a `409 ID_NUMBER_MATCH`, or null for any other error. */
function matchesIn(error: unknown): IdNumberMatch[] | null {
  if (error instanceof ApiError && error.code === 'ID_NUMBER_MATCH') {
    return (error.details as { matches?: IdNumberMatch[] } | undefined)?.matches ?? [];
  }
  return null;
}

function DecidedPanel({ detail, photosShown }: { detail: AdminIdVerificationDetail; photosShown: boolean }) {
  const decision = detail.decision;
  const [changing, setChanging] = useState(false);
  // Older APIs do not send it (ADR 0040); nothing can be changed there.
  const changeableUntil = detail.changeableUntil ?? null;
  return (
    <section aria-labelledby="decision-heading" className={panelClass}>
      <h2 id="decision-heading" className="u-display text-xl text-ink">
        Decision
      </h2>
      {decision ? (
        <dl className="grid gap-4">
          <AdminFact term="Outcome">{STATUS_LABEL[decision.status]}</AdminFact>
          <AdminFact term="Decided">
            {formatAdminDate(decision.decidedAt)}
            {decision.decidedBy ? ` by @${decision.decidedBy}` : ''}
          </AdminFact>
          {decision.reason && <AdminFact term="Reason given">{decision.reason}</AdminFact>}
          <AdminFact term="ID number">
            {detail.idNumberRecorded ? 'Recorded' : detail.idNumberAbsent ? 'The document has none' : 'Not recorded'}
          </AdminFact>
          {detail.appeal && (
            <AdminFact term="Their appeal">
              {detail.appeal.message}
              <span className="mt-1 block text-xs text-ink-subtle">
                Sent {formatAdminDate(detail.appeal.appealedAt)}
                {detail.appeal.decidedAt ? `, answered ${formatAdminDate(detail.appeal.decidedAt)}` : ''}
              </span>
            </AdminFact>
          )}
          <AdminFact term="Photos deleted after">{formatAdminDate(decision.windowEndsAt)}</AdminFact>
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">Waiting for the person to submit their ID.</p>
      )}

      {decision && changeableUntil && isDecidedStatus(detail.status) && (
        <div className="border-t border-hairline pt-4">
          {changing ? (
            <ChangeForm
              detail={detail}
              current={detail.status}
              decidedAt={decision.decidedAt}
              photosShown={photosShown}
              onCancel={() => setChanging(false)}
            />
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setChanging(true)}>
                Change decision
              </Button>
              <p className="mt-2 text-xs text-ink-subtle">Until {formatAdminDate(changeableUntil)}.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function isDecidedStatus(status: AdminIdVerificationDetail['status']): status is DecidedStatus {
  return status === 'verified' || status === 'declined_retry' || status === 'declined_final';
}

/**
 * A decision changed within its 7 days (plan 0053 Step 4.1). The same rules as
 * a first decision, with a reason always: the record says why it changed.
 */
function ChangeForm({
  detail,
  current,
  decidedAt,
  photosShown,
  onCancel,
}: {
  detail: AdminIdVerificationDetail;
  current: DecidedStatus;
  decidedAt: string;
  photosShown: boolean;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const decide = useDecideIdVerification(detail.id);
  const [target, setTarget] = useState<IdDecision | null>(null);
  const [draft, setDraft] = useState<DecisionDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<string | null>(null);
  const [matches, setMatches] = useState<IdNumberMatch[] | null>(null);

  const choose = (next: IdDecision) => {
    setTarget(next);
    setDraft((current) => ({ ...current, acknowledgeMatch: false }));
    setMatches(null);
    setProblem(null);
  };
  const update = (patch: Partial<DecisionDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
  };
  const changeNumber = (patch: Partial<Pick<DecisionDraft, 'idNumber' | 'noIdNumber'>>) => {
    setDraft((current) => withNumberChange(current, patch));
    setMatches(null);
    setProblem(null);
  };

  const judgesTheId = target === 'verify' || target === 'final';
  const needsNumber = target !== null && changeNeedsNumber(target, detail);

  async function submit() {
    if (!target) return;
    if (judgesTheId && !photosShown) {
      setProblem(NOT_SHOWN);
      return;
    }
    const found = changeProblem(target, draft, detail);
    if (found) {
      setProblem(found);
      return;
    }
    try {
      await decide.mutateAsync(changeBody(target, draft, decidedAt));
      void navigate('/admin/people');
    } catch (error) {
      const found = matchesIn(error);
      if (found) {
        setMatches(found);
        update({ acknowledgeMatch: true });
        return;
      }
      setProblem(error instanceof Error ? error.message : 'Could not change the decision.');
    }
  }

  const busy = decide.isPending;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Change it to</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {changeOptions(current).map((option) => (
            <Choice
              key={option}
              selected={target === option}
              tone={option === 'verify' ? 'neutral' : 'danger'}
              disabled={busy}
              onClick={() => choose(option)}
            >
              {CHANGE_LABEL[option]}
            </Choice>
          ))}
        </div>
      </fieldset>

      {problem && <Problem>{problem}</Problem>}
      {judgesTheId && !photosShown && <PhotosNotShown />}
      {matches && (
        <MatchWarning matches={matches} note="To change it anyway, the reason below goes on the record with the matches." />
      )}

      {target && (
        <>
          <p className="text-sm text-ink-muted">{CHANGE_EFFECT[target]}</p>

          {needsNumber && (
            <div className="space-y-3">
              <Input
                label="ID number"
                hint="Typed from the photo. Kept only as a one-way code, so a repeated ID is recognised."
                autoComplete="off"
                spellCheck={false}
                maxLength={ID_NUMBER_MAX}
                disabled={draft.noIdNumber || busy}
                value={draft.idNumber}
                onChange={(event) => changeNumber({ idNumber: event.target.value })}
              />
              <label className="flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draft.noIdNumber}
                  disabled={busy}
                  onChange={(event) => changeNumber({ noIdNumber: event.target.checked, idNumber: '' })}
                  className="mt-0.5 size-4 rounded-xs accent-primary"
                />
                This document has no ID number
              </label>
            </div>
          )}

          <Textarea
            label={target === 'verify' ? 'Why it changes' : 'Reason'}
            hint={
              target === 'verify'
                ? 'Kept on the record, not shown to the person.'
                : 'The person sees this exactly as written. It also goes on the record as why it changed.'
            }
            rows={3}
            maxLength={REASON_MAX}
            disabled={busy}
            value={draft.reason}
            onChange={(event) => update({ reason: event.target.value })}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant={target === 'verify' ? 'primary' : 'danger'}
              loading={busy}
              disabled={busy || (judgesTheId && !photosShown)}
              onClick={() => void submit()}
            >
              {`Change to ${CHANGE_LABEL[target].toLowerCase()}${matches ? ' anyway' : ''}`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A person's one appeal against a *not from Biliran* decline (plan 0053 Step
 * 4.3), answered on a fresh look at the photos with their message beside them.
 */
function AppealPanel({ detail, photosShown }: { detail: AdminIdVerificationDetail; photosShown: boolean }) {
  const navigate = useNavigate();
  const answer = useDecideAppeal(detail.id);
  const { data: me } = useCurrentUser();
  const [outcome, setOutcome] = useState<AppealOutcome | null>(null);
  const [draft, setDraft] = useState<AppealDraft>({ reason: '', acknowledgeMatch: false });
  const [problem, setProblem] = useState<string | null>(null);
  const [matches, setMatches] = useState<IdNumberMatch[] | null>(null);
  const decision = detail.decision;
  const ownDecision = Boolean(me && decision?.decidedBy && me.username === decision.decidedBy);

  const choose = (next: AppealOutcome) => {
    setOutcome(next);
    setProblem(null);
  };

  async function submit() {
    if (!outcome) return;
    if (!photosShown) {
      setProblem(NOT_SHOWN);
      return;
    }
    const found = appealProblem(draft);
    if (found) {
      setProblem(found);
      return;
    }
    try {
      await answer.mutateAsync(appealBody(outcome, draft));
      void navigate('/admin/people');
    } catch (error) {
      const found = matchesIn(error);
      if (found) {
        setMatches(found);
        setDraft((current) => ({ ...current, acknowledgeMatch: true }));
        return;
      }
      setProblem(error instanceof Error ? error.message : 'Could not answer the appeal.');
    }
  }

  const busy = answer.isPending;

  return (
    <section aria-labelledby="decision-heading" className={panelClass}>
      <h2 id="decision-heading" className="u-display text-xl text-ink">
        Appeal
      </h2>

      <dl className="grid gap-4">
        {decision && (
          <AdminFact term="Declined as not from Biliran">
            {formatAdminDate(decision.decidedAt)}
            {decision.decidedBy ? ` by @${decision.decidedBy}` : ''}
          </AdminFact>
        )}
        {decision?.reason && <AdminFact term="Reason given">{decision.reason}</AdminFact>}
        {detail.appeal && (
          <AdminFact term="Their appeal">
            {detail.appeal.message}
            <span className="mt-1 block text-xs text-ink-subtle">Sent {formatAdminDate(detail.appeal.appealedAt)}</span>
          </AdminFact>
        )}
      </dl>

      {ownDecision && (
        <p className="rounded-sm border border-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-muted">
          You made this decision. If you can, let another administrator answer the appeal.
        </p>
      )}

      {problem && <Problem>{problem}</Problem>}
      {!photosShown && <PhotosNotShown />}
      {matches && (
        <MatchWarning matches={matches} note="To grant it anyway, the reason goes on the record with the matches." />
      )}

      <div className="border-t border-hairline pt-4">
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Your answer</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Choice selected={outcome === 'grant'} disabled={busy || !photosShown} onClick={() => choose('grant')}>
              Grant — verify
            </Choice>
            <Choice
              selected={outcome === 'uphold'}
              tone="danger"
              disabled={busy || !photosShown}
              onClick={() => choose('uphold')}
            >
              Uphold — keep declined
            </Choice>
          </div>
        </fieldset>
      </div>

      {outcome && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {outcome === 'grant'
              ? 'They can sign in and use their account, and are told their ID is verified.'
              : 'The decline stands for good: there is no second appeal. They see the reason when they try to sign in.'}
          </p>
          <Textarea
            label="Reason"
            hint={
              outcome === 'grant'
                ? 'Kept on the record, not shown to the person.'
                : 'The person sees this exactly as written when they try to sign in.'
            }
            rows={3}
            maxLength={REASON_MAX}
            disabled={busy}
            value={draft.reason}
            onChange={(event) => {
              setDraft((current) => ({ ...current, reason: event.target.value }));
              setProblem(null);
            }}
          />
          <Button
            variant={outcome === 'grant' ? 'primary' : 'danger'}
            loading={busy}
            disabled={busy || !photosShown}
            onClick={() => void submit()}
          >
            {outcome === 'grant' ? (matches ? 'Grant anyway' : 'Grant the appeal') : 'Uphold the decline'}
          </Button>
        </div>
      )}
    </section>
  );
}

function DecisionPanel({ detail, photosShown }: { detail: AdminIdVerificationDetail; photosShown: boolean }) {
  const navigate = useNavigate();
  const decide = useDecideIdVerification(detail.id);
  const [draft, setDraft] = useState<DecisionDraft>(EMPTY_DRAFT);
  const [declining, setDeclining] = useState<'retry' | 'final' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [matches, setMatches] = useState<IdNumberMatch[] | null>(null);

  const update = (patch: Partial<DecisionDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
  };

  // The warning was for the number as it was. A different one is checked anew.
  const changeNumber = (patch: Partial<Pick<DecisionDraft, 'idNumber' | 'noIdNumber'>>) => {
    setDraft((current) => withNumberChange(current, patch));
    setMatches(null);
    setProblem(null);
  };

  async function submit(decision: IdDecision) {
    if (decision !== 'retry' && !photosShown) {
      setProblem(NOT_SHOWN);
      return;
    }
    const found = decisionProblem(decision, draft);
    if (found) {
      setProblem(found);
      return;
    }
    setProblem(null);
    try {
      await decide.mutateAsync(decisionBody(decision, draft));
      void navigate('/admin/people');
    } catch (error) {
      const found = matchesIn(error);
      if (found) {
        setMatches(found);
        update({ acknowledgeMatch: true });
        return;
      }
      setProblem(error instanceof Error ? error.message : 'Could not save the decision.');
    }
  }

  const busy = decide.isPending;
  const verifyLabel = matches ? 'Verify anyway' : 'Verify';

  return (
    <section aria-labelledby="decision-heading" className={panelClass}>
      <h2 id="decision-heading" className="u-display text-xl text-ink">
        Decision
      </h2>

      {problem && <Problem>{problem}</Problem>}

      {!photosShown && <PhotosNotShown />}

      {matches && (
        <MatchWarning
          matches={matches}
          note="To verify anyway, say why in the reason. A not-from-Biliran decline needs nothing extra."
        />
      )}

      <div className="space-y-3">
        <Input
          label="ID number"
          hint="Typed from the photo. Kept only as a one-way code, so a repeated ID is recognised."
          autoComplete="off"
          spellCheck={false}
          maxLength={ID_NUMBER_MAX}
          disabled={draft.noIdNumber || busy}
          value={draft.idNumber}
          onChange={(event) => changeNumber({ idNumber: event.target.value })}
        />
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={draft.noIdNumber}
            disabled={busy}
            onChange={(event) => changeNumber({ noIdNumber: event.target.checked, idNumber: '' })}
            className="mt-0.5 size-4 rounded-xs accent-primary"
          />
          This document has no ID number
        </label>
      </div>

      <Textarea
        label="Reason"
        hint={
          declining || !matches
            ? 'The person sees this exactly as written. Needed to decline.'
            : 'Why this ID is verified despite the match. Kept on the record, not shown to the person.'
        }
        rows={3}
        maxLength={REASON_MAX}
        disabled={busy}
        value={draft.reason}
        onChange={(event) => update({ reason: event.target.value })}
      />

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
        <Button loading={busy && !declining} disabled={busy || !photosShown} onClick={() => void submit('verify')}>
          {verifyLabel}
        </Button>
        {(['retry', 'final'] as const).map((kind) => (
          <Button
            key={kind}
            variant="ghost"
            className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
            aria-pressed={declining === kind}
            disabled={busy || (kind === 'final' && !photosShown)}
            onClick={() => setDeclining((current) => (current === kind ? null : kind))}
          >
            {DECLINE_LABEL[kind]}
          </Button>
        ))}
      </div>

      {declining && (
        <div className="space-y-2 border-t border-hairline pt-4">
          <p className="text-sm text-ink-muted">
            {declining === 'retry'
              ? 'They are signed out, shown the reason, and can sign in to submit their ID again.'
              : 'They are signed out and cannot sign in again. Record the ID number or tick that there is none.'}
          </p>
          <Button
            variant="danger"
            loading={busy}
            disabled={busy || (declining === 'final' && !photosShown)}
            onClick={() => void submit(declining)}
          >
            {CONFIRM_LABEL[declining]}
          </Button>
        </div>
      )}
    </section>
  );
}
