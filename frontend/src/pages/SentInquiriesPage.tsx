import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Badge,
  Button,
  ButtonLink,
  Container,
  EmptyState,
  SectionHeading,
  Skeleton,
} from '@/components/ui';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useSentInquiries } from '@/features/inquiries/api';

function SentInner() {
  const [page, setPage] = useState(1);
  const list = useSentInquiries(page);
  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit))
    : 1;

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Your messages"
            title="Sent inquiries"
            description="Track status here. Creatives are not emailed — responses appear on this page."
          />

          <div className="mt-10">
            {list.isPending && <Skeleton className="h-40 w-full" />}

            {list.data && list.data.data.length === 0 && (
              <EmptyState
                title="Nothing sent yet"
                description="Find a creative in the directory and use Contact on their profile."
                action={
                  <ButtonLink to="/directory" size="sm">
                    Browse directory
                  </ButtonLink>
                }
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {list.data.data.map((row) => (
                  <li key={row.id} className="py-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        to={`/creatives/${row.profile.slug}`}
                        className="u-display text-xl text-ink link-underline"
                      >
                        {row.profile.name}
                      </Link>
                      <Badge tone="neutral">{row.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink">{row.subject}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{row.message}</p>

                    {row.response && (
                      <div className="mt-4 rounded-sm border border-hairline bg-clay-50/60 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                          Response
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{row.response}</p>
                      </div>
                    )}

                    {row.contact && (
                      <p className="mt-3 text-sm text-ink">
                        Contact via {row.contact.channel}:{' '}
                        <span className="font-medium">{row.contact.value}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {list.data && totalPages > 1 && (
              <div className="mt-8 flex justify-between">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}

export function SentInquiriesPage() {
  return (
    <RequireAuth>
      <SentInner />
    </RequireAuth>
  );
}
