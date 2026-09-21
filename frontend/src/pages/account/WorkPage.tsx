import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { ButtonLink, Container, EmptyState, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useCurrentUser } from '@/features/auth/api';
import { useWorkSummary, WorkNotFoundError } from '@/features/work/api';
import { nextAction } from '@/features/work/next-action';
import type { WorkSummary } from '@contracts/work';
import { formatPesos } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AccountPageHeading } from './AccountPageHeading';

function WorkGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-hairline pt-8">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <div className="mt-3 text-md text-ink-muted">{children}</div>
    </section>
  );
}

/**
 * Profile state, said plainly. `nextAction` ranks anything actionable above
 * these, so this is where a creative learns their profile is under review or
 * their edit is queued — it must not depend on being the next action.
 */
function profileCopy(summary: WorkSummary): string | null {
  if (summary.profile.status === 'pending_review') {
    return 'Your profile is with the team for review. It is not public yet.';
  }
  if (summary.profile.status === 'suspended') {
    return 'Your profile is suspended and is not public.';
  }
  if (summary.profile.editedSinceReviewAt) {
    return 'Your profile is live. An edit is queued and goes public after review.';
  }
  return 'Your profile is live in the directory.';
}

function offersCopy(summary: WorkSummary): string {
  if (summary.offers.total === 0) {
    return 'No offers yet — clients cannot hire what they cannot see priced.';
  }
  const saved =
    summary.offers.savedByOthers === 0
      ? 'none saved by others yet'
      : summary.offers.savedByOthers === 1
        ? '1 saved by someone else'
        : `${summary.offers.savedByOthers} saved by others`;
  return summary.offers.total === 1
    ? `1 offer · ${saved}`
    : `${summary.offers.total} offers · ${saved}`;
}

function inquiriesCopy(summary: WorkSummary): string {
  if (summary.inquiries.total === 0) {
    return 'No inquiries yet — when a client contacts you, the thread lands in Messages.';
  }
  if (summary.inquiries.awaitingYourReply > 0) {
    const waiting =
      summary.inquiries.awaitingYourReply === 1
        ? '1 waiting on your reply'
        : `${summary.inquiries.awaitingYourReply} waiting on your reply`;
    return summary.inquiries.total === 1
      ? `1 inquiry · ${waiting}`
      : `${summary.inquiries.total} inquiries · ${waiting}`;
  }
  return summary.inquiries.total === 1
    ? '1 inquiry · you are caught up'
    : `${summary.inquiries.total} inquiries · you are caught up`;
}

function agreementsCopy(summary: WorkSummary): string {
  const { agreements } = summary;
  if (agreements.total === 0) {
    return 'No work agreements yet — they appear here once you issue one from a conversation.';
  }

  const parts: string[] = [];
  if (agreements.awaitingClientAcceptance > 0) {
    parts.push(
      agreements.awaitingClientAcceptance === 1
        ? '1 awaiting acceptance'
        : `${agreements.awaitingClientAcceptance} awaiting acceptance`,
    );
  }
  if (agreements.inProgress > 0) {
    parts.push(
      agreements.inProgress === 1 ? '1 in progress' : `${agreements.inProgress} in progress`,
    );
  }
  if (agreements.awaitingClientConfirmation > 0) {
    parts.push(
      agreements.awaitingClientConfirmation === 1
        ? '1 awaiting confirmation'
        : `${agreements.awaitingClientConfirmation} awaiting confirmation`,
    );
  }
  if (agreements.completed > 0) {
    parts.push(agreements.completed === 1 ? '1 completed' : `${agreements.completed} completed`);
  }
  if (agreements.cancelled > 0) {
    parts.push(agreements.cancelled === 1 ? '1 cancelled' : `${agreements.cancelled} cancelled`);
  }

  const head = agreements.total === 1 ? '1 agreement' : `${agreements.total} agreements`;
  return parts.length > 0 ? `${head} · ${parts.join(' · ')}` : head;
}

function moneyCopy(summary: WorkSummary): string {
  if (summary.money.agreedCentavos === 0 && summary.money.completedCentavos === 0) {
    return 'Nothing agreed yet — the figure here is what you and a client put in writing, not what changed hands.';
  }
  const agreed = formatPesos(summary.money.agreedCentavos);
  const completed = formatPesos(summary.money.completedCentavos);
  return `Agreed ${agreed} · completed ${completed}. Bilikha does not handle payment.`;
}

function ratingsCopy(summary: WorkSummary): string {
  if (summary.ratings.count === 0 || summary.ratings.average == null) {
    return 'No ratings yet — they appear after a completed engagement.';
  }
  const score = summary.ratings.average.toFixed(1);
  return summary.ratings.count === 1
    ? `${score} from 1 rating`
    : `${score} from ${summary.ratings.count} ratings`;
}

export function WorkPage() {
  const { data: user, isPending: userPending } = useCurrentUser();
  const hasProfile = Boolean(user?.profileSlug);
  const work = useWorkSummary(!userPending && hasProfile);

  if (userPending) {
    return (
      <div className="min-h-dvh bg-paper">
        <SiteHeader />
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="narrow" className="py-(--section-gap)">
            <AccountPageHeading title="How your work is doing" />
            <div className="mt-10 space-y-4">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </Container>
        </main>
      </div>
    );
  }

  if (!hasProfile) {
    return <NotFoundPage />;
  }

  if (work.isError) {
    if (work.error instanceof WorkNotFoundError) {
      return <NotFoundPage />;
    }

    return (
      <div className="min-h-dvh bg-paper">
        <SiteHeader />
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="narrow" className="py-(--section-gap)">
            <AccountPageHeading title="How your work is doing" />
            <div className="mt-10">
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load how your work is doing"
                description={work.error.message}
              />
            </div>
          </Container>
        </main>
      </div>
    );
  }

  if (work.isPending || !work.data) {
    return (
      <div className="min-h-dvh bg-paper">
        <SiteHeader />
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="narrow" className="py-(--section-gap)">
            <AccountPageHeading title="How your work is doing" />
            <div className="mt-10 space-y-4">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </Container>
        </main>
      </div>
    );
  }

  const action = nextAction(work.data);

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <AccountPageHeading title="How your work is doing" />

          <section className="mt-10" aria-labelledby="next-action-heading">
            <p className="u-eyebrow">Next</p>
            <h2 id="next-action-heading" className="u-display mt-2 text-2xl text-ink">
              {action.headline}
            </h2>
            <p className="mt-2 max-w-xl text-md text-ink-muted">{action.body}</p>
            {action.to && (
              <ButtonLink to={action.to} className="mt-5">
                {action.to === '/account/offers'
                  ? 'Open offers'
                  : action.to === '/messages'
                    ? 'Open messages'
                    : action.to === '/history'
                      ? 'Open history'
                      : 'Continue'}
              </ButtonLink>
            )}
          </section>

          <div className="mt-12 space-y-0">
            <WorkGroup title="Your profile">{profileCopy(work.data)}</WorkGroup>
            <WorkGroup title="Your offers">{offersCopy(work.data)}</WorkGroup>
            <WorkGroup title="Your inquiries">{inquiriesCopy(work.data)}</WorkGroup>
            <WorkGroup title="Your agreements">
              {agreementsCopy(work.data)}
              {work.data.agreements.total > 0 && (
                <p className="mt-2">
                  <Link to="/history?segment=agreements" className="link-underline text-lawa-700">
                    See agreements in History
                  </Link>
                </p>
              )}
            </WorkGroup>
            <WorkGroup title="What was agreed">{moneyCopy(work.data)}</WorkGroup>
            <WorkGroup title="Your rating">{ratingsCopy(work.data)}</WorkGroup>
          </div>
        </Container>
      </main>
    </div>
  );
}
