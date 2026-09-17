import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Container, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { AgreementNotFoundError, useAgreement } from '@/features/agreements/api';
import { AgreementStateChip } from '@/features/agreements/AgreementCard';
import { AgreementLifecycleActions } from '@/features/agreements/AgreementLifecycleActions';
import { AgreementReviewActions } from '@/features/agreements/AgreementReviewActions';
import {
  durationLine,
  eventLabel,
  formatDate,
  formatMoment,
  stateLine,
} from '@/features/agreements/format';
import type { Agreement } from '@/features/agreements/types';
import { formatPesos } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { NotFoundPage } from '@/pages/NotFoundPage';

type TimelineEntry = {
  key: string;
  at: string | null;
  title: string;
  detail?: string | null;
  to?: string;
};

/**
 * Document events and lifecycle events in one list, ordered by time. "Who
 * agreed to what, and when" has to be answerable here without reading the
 * thread.
 */
function buildTimeline(agreement: Agreement): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      key: 'issued',
      at: agreement.createdAt,
      title: `Issued by ${agreement.issuedBy.name ?? 'the creative'} · version ${agreement.version}`,
    },
  ];

  if (agreement.revisionRequestedAt) {
    entries.push({
      key: 'revision',
      at: agreement.revisionRequestedAt,
      title:
        agreement.role === 'client'
          ? 'Changes you requested'
          : 'Changes requested by the client',
      detail: agreement.revisionNote,
    });
  }

  if (agreement.acceptance) {
    entries.push({
      key: 'accepted',
      at: agreement.acceptance.acceptedAt,
      title: `Accepted by ${agreement.acceptance.acceptedByName ?? 'the client'}`,
    });
  }

  for (const event of agreement.events) {
    entries.push({
      key: event.id,
      at: event.createdAt,
      title: `${eventLabel(event.type)} · ${event.actorName ?? 'a participant'}`,
      detail: event.note,
    });
  }

  entries.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());

  // Last, and without a timestamp: the response carries the successor's id and
  // version but not when it was issued.
  if (agreement.supersededById) {
    entries.push({
      key: 'superseded',
      at: null,
      title: `Superseded by version ${agreement.supersededByVersion ?? agreement.version + 1}`,
      to: `/agreements/${agreement.supersededById}`,
    });
  }

  return entries;
}

export function AgreementPage() {
  const { id } = useParams<{ id: string }>();
  const agreement = useAgreement(id);

  // A non-party gets the 404 the API returns, not a 403 — a 403 would confirm
  // that someone else's agreement exists.
  if (agreement.isError && agreement.error instanceof AgreementNotFoundError) {
    return <NotFoundPage />;
  }

  const data = agreement.data;
  const timeline = data ? buildTimeline(data) : [];

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          {agreement.isPending && (
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {agreement.isError && !(agreement.error instanceof AgreementNotFoundError) && (
            <p className="text-danger-700">{agreement.error.message}</p>
          )}

          {data && (
            <>
              <Link
                to={`/messages/${data.conversationId}`}
                className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back to the conversation
              </Link>

              <p className="u-eyebrow mt-6">Work agreement · version {data.version}</p>
              <h1 className="u-display mt-3 text-4xl text-ink text-pretty">
                {data.packageTitle}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AgreementStateChip state={data.state.state} />
                <p className="text-sm text-ink-muted">{stateLine(data.state)}</p>
              </div>

              {data.status === 'superseded' && (
                <p className="mt-6 rounded-sm border border-hairline bg-clay-50 px-3 py-2 text-sm text-ink-muted text-pretty">
                  This version was replaced.{' '}
                  {data.supersededById ? (
                    <Link to={`/agreements/${data.supersededById}`} className="underline">
                      Open version {data.supersededByVersion ?? data.version + 1}
                    </Link>
                  ) : (
                    'A newer version is in the conversation.'
                  )}
                </p>
              )}

              {data.supersedesId && (
                <p className="mt-3 text-sm text-ink-muted">
                  Replaces{' '}
                  <Link to={`/agreements/${data.supersedesId}`} className="underline">
                    version {data.version - 1}
                  </Link>
                  .
                </p>
              )}

              <section className="mt-8 rounded-md border border-hairline bg-surface p-5">
                <h2 className="text-base font-medium text-ink">What it covers</h2>
                <ul className="mt-3 divide-y divide-hairline">
                  {data.lineItems.map((item) => (
                    <li key={item.id} className="flex items-baseline justify-between gap-4 py-2">
                      <span className="min-w-0 text-base text-ink text-pretty">
                        {item.description}
                      </span>
                      <span className="shrink-0 text-base tabular-nums text-ink">
                        {formatPesos(item.priceCentavos)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* The sum of the lines, worked out on read. No column holds it. */}
                <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-hairline-strong pt-3">
                  <span className="text-base font-medium text-ink">Total</span>
                  <span className="text-base font-medium tabular-nums text-ink">
                    {formatPesos(data.totalCentavos)}
                  </span>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-ink-subtle">Starts</dt>
                    <dd className="text-base text-ink">{formatDate(data.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-subtle">Ends</dt>
                    <dd className="text-base text-ink">{formatDate(data.endDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-subtle">Duration</dt>
                    <dd className="text-base text-ink">{durationLine(data.durationDays)}</dd>
                  </div>
                </dl>

                {data.notes && (
                  <div className="mt-5 border-t border-hairline pt-4">
                    <h3 className="text-xs text-ink-subtle">Notes</h3>
                    <p className="mt-1 whitespace-pre-wrap text-base text-ink text-pretty">
                      {data.notes}
                    </p>
                  </div>
                )}
              </section>

              {data.acceptance && (
                <section className="mt-6 rounded-md border border-hairline bg-clay-50 p-5">
                  <h2 className="text-base font-medium text-ink">Accepted</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {data.acceptance.acceptedByName ?? 'The client'} accepted these terms on{' '}
                    {formatMoment(data.acceptance.acceptedAt)}.
                  </p>
                  <p className="mt-2 text-sm text-ink-muted">
                    Fingerprint of the accepted terms:{' '}
                    <span className="font-mono text-ink">{data.acceptance.fingerprint}</span>
                  </p>
                  <p className="mt-2 text-xs text-ink-subtle text-pretty">
                    This is not a legal signature, and Bilikha does not handle payment.
                  </p>
                </section>
              )}

              <div className="mt-6 space-y-4">
                <AgreementReviewActions agreement={data} />
                <AgreementLifecycleActions agreement={data} />
              </div>

              <section className="mt-10 border-t border-hairline pt-8">
                <h2 className="text-base font-medium text-ink">What happened</h2>
                <ol className="mt-4 space-y-4">
                  {timeline.map((entry) => (
                    <li key={entry.key}>
                      <p className="text-sm font-medium text-ink">
                        {entry.to ? (
                          <Link to={entry.to} className="underline">
                            {entry.title}
                          </Link>
                        ) : (
                          entry.title
                        )}
                      </p>
                      {entry.at && (
                        <p className="mt-0.5 text-xs text-ink-subtle">
                          <time dateTime={entry.at}>{formatMoment(entry.at)}</time>
                        </p>
                      )}
                      {entry.detail && (
                        <p className="mt-1 text-sm text-ink-muted text-pretty">
                          “{entry.detail}”
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </Container>
      </main>
    </>
  );
}
